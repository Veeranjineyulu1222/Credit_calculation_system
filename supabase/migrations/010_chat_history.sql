-- Persistent, student-owned AI conversation history.
-- Academic tables remain the source of truth; these tables store only chat context.

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null default 'Competency conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_updated_idx
  on public.chat_sessions (user_id, updated_at desc);

create index if not exists chat_sessions_student_updated_idx
  on public.chat_sessions (student_id, updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at asc);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "students manage own chat sessions" on public.chat_sessions;
create policy "students manage own chat sessions"
  on public.chat_sessions for all to authenticated
  using (
    user_id = auth.uid()
    and student_id = (
      select up.student_id
      from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role = 'student'
      limit 1
    )
  )
  with check (
    user_id = auth.uid()
    and student_id = (
      select up.student_id
      from public.user_profiles up
      where up.user_id = auth.uid()
        and up.role = 'student'
      limit 1
    )
  );

drop policy if exists "students manage own chat messages" on public.chat_messages;
create policy "students manage own chat messages"
  on public.chat_messages for all to authenticated
  using (
    exists (
      select 1
      from public.chat_sessions s
      where s.id = chat_messages.session_id
        and s.user_id = auth.uid()
        and s.student_id = (
          select up.student_id
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'student'
          limit 1
        )
    )
  )
  with check (
    exists (
      select 1
      from public.chat_sessions s
      where s.id = chat_messages.session_id
        and s.user_id = auth.uid()
        and s.student_id = (
          select up.student_id
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'student'
          limit 1
        )
    )
  );

grant select, insert, update, delete on public.chat_sessions to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
