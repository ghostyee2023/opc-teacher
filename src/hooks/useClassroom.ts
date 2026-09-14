// 课堂状态仓库:加载会话 + 订阅事件流 + 折叠派生状态,并提供写操作
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBackend, type Backend } from "../lib/backend";
import { foldClassroom } from "../lib/classroom";
import { newId } from "../lib/util";
import type { ClassroomDerived, ClassroomEvent, ClassroomSession, MyStudentSession } from "../types";

/** 分发式 Omit:对联合类型逐成员去掉字段,保留每个事件自己的字段形状 */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
type EventDraft = DistributiveOmit<ClassroomEvent, "id" | "at"> & { id?: string; at?: number };

const MY_SESSION_KEY = "coground-my-session";
const MY_CLASSROOM_KEY = "coground-my-classroom";

export function getMyStudentSession(): MyStudentSession | null {
  try {
    const stored = window.localStorage.getItem(MY_SESSION_KEY);
    return stored ? (JSON.parse(stored) as MyStudentSession) : null;
  } catch { return null; }
}

export function setMyStudentSession(session: MyStudentSession) {
  try { window.localStorage.setItem(MY_SESSION_KEY, JSON.stringify(session)); } catch { /* 本地存储不可用 */ }
}

export function clearMyStudentSession() {
  try { window.localStorage.removeItem(MY_SESSION_KEY); } catch { /* 本地存储不可用 */ }
}

/** 教师端记住自己创建的课堂码,用于恢复课堂 */
export function getMyClassroomCode(): string | null {
  try { return window.localStorage.getItem(MY_CLASSROOM_KEY); } catch { return null; }
}

export function setMyClassroomCode(code: string) {
  try { window.localStorage.setItem(MY_CLASSROOM_KEY, code); } catch { /* 本地存储不可用 */ }
}

export function clearMyClassroomCode() {
  try { window.localStorage.removeItem(MY_CLASSROOM_KEY); } catch { /* 本地存储不可用 */ }
}

export type ClassroomStore = {
  mode: "local" | "supabase";
  session: ClassroomSession | null;
  /** 原始事件流(按需做个性化查询,如“我的提问”) */
  events: ClassroomEvent[];
  derived: ClassroomDerived | null;
  loading: boolean;
  error: string | null;
  /** 课堂码确认不存在(网络错误时为 false,学生端不应清理本地会话) */
  notFound: boolean;
  /** 追加课堂事件(乐观本地生效,随后持久化) */
  appendEvent: (event: EventDraft) => Promise<void>;
  /** 更新课堂会话(教师端写,乐观生效) */
  patchSession: (patch: Partial<ClassroomSession> | ((prev: ClassroomSession) => Partial<ClassroomSession>)) => Promise<void>;
  /** 替换整个会话(创建课堂用) */
  startSession: (session: ClassroomSession) => Promise<void>;
  refresh: () => Promise<void>;
};

export function useClassroomStore(code: string | null): ClassroomStore {
  const backendRef = useRef<Backend | null>(null);
  if (!backendRef.current) backendRef.current = createBackend();
  const backend = backendRef.current;

  const [session, setSession] = useState<ClassroomSession | null>(null);
  const [events, setEvents] = useState<ClassroomEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** 课堂码不存在(区别于网络错误,学生端据此决定是否清理本地会话) */
  const [notFound, setNotFound] = useState(false);
  /** 当前课堂码引用:迟到响应保护用 */
  const codeRef = useRef<string | null>(code);
  useEffect(() => { codeRef.current = code; }, [code]);
  /** 已完成初次加载的课堂码;loading 在渲染期派生,避免 setState 时序竞态 */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = code !== null && loadedFor !== code;
  /** 会话最新值引用:patchSession 串行计算,不在 setState updater 里做副作用 */
  const sessionRef = useRef<ClassroomSession | null>(null);
  /** 会话写库串行队列:排队 updateClassroom,防止并发乱序覆盖 */
  const sessionWriteQueue = useRef(Promise.resolve());

  useEffect(() => {
    if (!code) {
      setSession(null);
      setEvents([]);
      setError(null);
      setLoadedFor(null);
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    setError(null);
    setNotFound(false);

    const load = async () => {
      try {
        const [nextSession, nextEvents] = await Promise.all([backend.getClassroom(code), backend.listEvents(code)]);
        if (cancelled) return;
        setSession(nextSession);
        setEvents(nextEvents);
        sessionRef.current = nextSession;
        setNotFound(nextSession === null);
        setLoadedFor(code);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "连接课堂失败,请检查网络");
        setLoadedFor(code);
      }
    };

    void load();
    unsubscribe = backend.subscribe(
      code,
      (nextSession) => {
        if (cancelled) return;
        setSession(nextSession);
        sessionRef.current = nextSession;
      },
      (nextEvents) => { if (!cancelled) setEvents(nextEvents); },
    );

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [backend, code]);

  // 订阅/加载写入的会话同步到 ref(渲染期读取)
  useEffect(() => { sessionRef.current = session; }, [session]);

  const derived = useMemo(
    () => (session ? foldClassroom(session, events) : null),
    [session, events],
  );

  const appendEvent = useCallback(
    async (event: EventDraft) => {
      if (!code) return;
      const full = { ...event, id: event.id ?? newId(), at: event.at ?? Date.now() } as ClassroomEvent;
      setEvents((prev) => [...prev, full]);
      try {
        await backend.appendEvent(code, full);
      } catch (err) {
        setError(err instanceof Error ? err.message : "事件写入失败");
      }
    },
    [backend, code],
  );

  const patchSession = useCallback(
    async (patch: Partial<ClassroomSession> | ((prev: ClassroomSession) => Partial<ClassroomSession>)) => {
      const prev = sessionRef.current;
      if (!prev) return;
      const resolved = typeof patch === "function" ? patch(prev) : patch;
      const next = { ...prev, ...resolved };
      sessionRef.current = next;
      setSession(next);
      // 会话写库串行化:网络乱序时避免旧快照覆盖新状态
      sessionWriteQueue.current = sessionWriteQueue.current
        .then(() => backend.updateClassroom(next))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "课堂状态更新失败");
        });
    },
    [backend],
  );

  const startSession = useCallback(
    async (next: ClassroomSession) => {
      await backend.createClassroom(next);
      sessionRef.current = next;
      setSession(next);
      setEvents([]);
    },
    [backend],
  );

  const refresh = useCallback(async () => {
    const target = code;
    if (!target) return;
    try {
      const [nextSession, nextEvents] = await Promise.all([backend.getClassroom(target), backend.listEvents(target)]);
      // 迟到响应保护:期间课堂码已切换时丢弃本次结果
      if (sessionRef.current !== null && target !== codeRef.current) return;
      setSession(nextSession);
      sessionRef.current = nextSession;
      setEvents(nextEvents);
      setError(null);
      setNotFound(nextSession === null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新失败");
    }
  }, [backend, code]);

  return { mode: backend.mode, session, events, derived, loading, error, notFound, appendEvent, patchSession, startSession, refresh };
}

/** 共享倒计时:会话里的 timerEndsAt / timerRemaining 派生本地秒表 */
export function useSharedTimer(session: ClassroomSession | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => {
    if (!session) return 0;
    if (!session.published || session.timerEndsAt === null) return session.timerRemaining;
    return Math.max(0, Math.floor((session.timerEndsAt - now) / 1000));
  }, [session, now]);
}
