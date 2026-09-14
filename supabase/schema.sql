-- 共场 AI 课堂互动系统 · Supabase 数据表
-- 在 Supabase 项目的 SQL Editor 中执行本文件即可。

-- 课堂会话(教师端写入,所有端订阅)
create table if not exists public.classrooms (
  code text primary key,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 课堂事件流(追加写入,所有端订阅后折叠为派生状态)
create table if not exists public.classroom_events (
  id bigint generated always as identity primary key,
  code text not null references public.classrooms(code) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists classroom_events_code_idx on public.classroom_events (code, id);

-- 原型阶段开放匿名读写(无登录体系);生产化时请改为按课堂码 + 角色鉴权
alter table public.classrooms enable row level security;
alter table public.classroom_events enable row level security;

drop policy if exists "classrooms read" on public.classrooms;
drop policy if exists "classrooms write" on public.classrooms;
drop policy if exists "classrooms update" on public.classrooms;
drop policy if exists "events read" on public.classroom_events;
drop policy if exists "events write" on public.classroom_events;

create policy "classrooms read" on public.classrooms for select using (true);
create policy "classrooms write" on public.classrooms for insert with check (true);
create policy "classrooms update" on public.classrooms for update using (true);

create policy "events read" on public.classroom_events for select using (true);
create policy "events write" on public.classroom_events for insert with check (true);

-- 开启实时订阅
alter publication supabase_realtime add table public.classrooms;
alter publication supabase_realtime add table public.classroom_events;
