// 同步后端:LocalBackend(localStorage + storage 事件,同浏览器多标签)与 SupabaseBackend(跨设备实时)
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { ClassroomEvent, ClassroomSession } from "../types";

export interface Backend {
  mode: "local" | "supabase";
  createClassroom(session: ClassroomSession): Promise<void>;
  getClassroom(code: string): Promise<ClassroomSession | null>;
  updateClassroom(session: ClassroomSession): Promise<void>;
  appendEvent(code: string, event: ClassroomEvent): Promise<void>;
  listEvents(code: string): Promise<ClassroomEvent[]>;
  /** 订阅课堂与事件流变化;返回取消函数 */
  subscribe(code: string, onSession: (session: ClassroomSession | null) => void, onEvents: (events: ClassroomEvent[]) => void): () => void;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseClient: SupabaseClient | null = null;
if (supabaseUrl && supabaseAnonKey) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: { params: { eventsPerSecond: 20 } },
  });
}

export function backendMode(): "local" | "supabase" {
  return supabaseClient ? "supabase" : "local";
}

/** 创建后端实例:配置了 Supabase 环境变量时走实时,否则本地降级 */
export function createBackend(): Backend {
  return supabaseClient ? new SupabaseBackend(supabaseClient) : new LocalBackend();
}

/* ---------------- 本地后端:localStorage + 跨标签 storage 事件 ---------------- */

class LocalBackend implements Backend {
  mode = "local" as const;

  /** 事件写入串行队列:防止连续追加时读-改-写互相覆盖 */
  private writeQueue: Promise<void> = Promise.resolve();

  private sessionKey(code: string) { return `coground-classroom-${code}`; }
  private eventsKey(code: string) { return `coground-events-${code}`; }

  async createClassroom(session: ClassroomSession) {
    window.localStorage.setItem(this.sessionKey(session.code), JSON.stringify(session));
    window.localStorage.setItem(this.eventsKey(session.code), "[]");
  }

  async getClassroom(code: string) {
    try {
      const stored = window.localStorage.getItem(this.sessionKey(code));
      return stored ? (JSON.parse(stored) as ClassroomSession) : null;
    } catch { return null; }
  }

  async updateClassroom(session: ClassroomSession) {
    window.localStorage.setItem(this.sessionKey(session.code), JSON.stringify(session));
  }

  async appendEvent(code: string, event: ClassroomEvent) {
    this.writeQueue = this.writeQueue.then(() => {
      try {
        const events = JSON.parse(window.localStorage.getItem(this.eventsKey(code)) ?? "[]") as ClassroomEvent[];
        window.localStorage.setItem(this.eventsKey(code), JSON.stringify([...events, event]));
      } catch { /* 忽略损坏的本地数据 */
      }
    });
    return this.writeQueue;
  }

  async listEvents(code: string) {
    try {
      return JSON.parse(window.localStorage.getItem(this.eventsKey(code)) ?? "[]") as ClassroomEvent[];
    } catch { return []; }
  }

  subscribe(code: string, onSession: (session: ClassroomSession | null) => void, onEvents: (events: ClassroomEvent[]) => void) {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === this.sessionKey(code)) onSession(event.newValue ? safeParse<ClassroomSession>(event.newValue) : null);
      if (event.key === this.eventsKey(code)) onEvents(event.newValue ? safeParse<ClassroomEvent[]>(event.newValue) ?? [] : []);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }
}

function safeParse<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/* ---------------- Supabase 后端:classrooms(jsonb) + classroom_events(事件流) ---------------- */

class SupabaseBackend implements Backend {
  mode = "supabase" as const;

  constructor(private client: SupabaseClient) {}

  async createClassroom(session: ClassroomSession) {
    const { error } = await this.client
      .from("classrooms")
      .insert({ code: session.code, state: session });
    if (error) throw new Error(`创建课堂失败:${error.message}`);
  }

  async getClassroom(code: string) {
    const { data, error } = await this.client
      .from("classrooms")
      .select("state")
      .eq("code", code)
      .maybeSingle();
    if (error) throw new Error(`读取课堂失败:${error.message}`);
    return (data?.state as ClassroomSession | undefined) ?? null;
  }

  async updateClassroom(session: ClassroomSession) {
    const { error } = await this.client
      .from("classrooms")
      .update({ state: session, updated_at: new Date().toISOString() })
      .eq("code", session.code);
    if (error) throw new Error(`更新课堂失败:${error.message}`);
  }

  async appendEvent(code: string, event: ClassroomEvent) {
    const { error } = await this.client
      .from("classroom_events")
      .insert({ code, payload: event });
    if (error) throw new Error(`写入事件失败:${error.message}`);
  }

  async listEvents(code: string) {
    const { data, error } = await this.client
      .from("classroom_events")
      .select("payload")
      .eq("code", code)
      .order("id", { ascending: true })
      .limit(2000);
    if (error) throw new Error(`读取事件失败:${error.message}`);
    return (data ?? []).map((row) => row.payload as ClassroomEvent);
  }

  subscribe(code: string, onSession: (session: ClassroomSession | null) => void, onEvents: (events: ClassroomEvent[]) => void) {
    let channel: RealtimeChannel | null = null;
    let disposed = false;
    const mergeEvent = (event: ClassroomEvent) => {
      void this.listEvents(code).then(onEvents).catch(() => undefined);
      void event; // 事件到达后统一重拉,避免乱序与丢事件
    };

    channel = this.client
      .channel(`classroom-${code}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "classrooms", filter: `code=eq.${code}` },
        (payload) => { onSession((payload.new as { state?: ClassroomSession }).state ?? null); },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "classroom_events", filter: `code=eq.${code}` },
        (payload) => { mergeEvent(payload.new as unknown as ClassroomEvent); },
      )
      .subscribe((status) => {
        if (disposed) return;
        // 订阅成功或重连后重拉一次,自愈断线期间漏掉的数据
        if (status === "SUBSCRIBED") {
          void this.getClassroom(code).then(onSession).catch(() => undefined);
          void this.listEvents(code).then(onEvents).catch(() => undefined);
        }
      });

    return () => {
      disposed = true;
      if (channel) void this.client.removeChannel(channel);
    };
  }
}
