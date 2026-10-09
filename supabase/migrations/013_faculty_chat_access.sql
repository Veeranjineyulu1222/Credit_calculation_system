-- Extend the existing chat history tables for faculty-owned conversations.
-- Student conversations remain bound to user_profiles.student_id.

alter table public.chat_sessions
  alter column student_id drop not null;

drop policy if exists "students manage own chat sessions" on public.chat_sessions;
create policy "authorized users manage own chat sessions"
  on public.chat_sessions for all to authenticated
  using (
    user_id = auth.uid()
    and (
      (
        (select up.role from public.user_profiles up where up.user_id = auth.uid() limit 1) = 'student'
        and student_id = (
          select up.student_id
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'student'
          limit 1
        )
      )
      or (
        (select up.role from public.user_profiles up where up.user_id = auth.uid() limit 1) = 'faculty'
        and student_id is null
      )
    )
  )
  with check (
    user_id = auth.uid()
    and (
      (
        (select up.role from public.user_profiles up where up.user_id = auth.uid() limit 1) = 'student'
        and student_id = (
          select up.student_id
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.role = 'student'
          limit 1
        )
      )
      or (
        (select up.role from public.user_profiles up where up.user_id = auth.uid() limit 1) = 'faculty'
        and student_id is null
      )
    )
  );

drop policy if exists "students manage own chat messages" on public.chat_messages;
create policy "authorized users manage own chat messages"
  on public.chat_messages for all to authenticated
  using (
    exists (
      select 1
      from public.chat_sessions s
      where s.id = chat_messages.session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.chat_sessions s
      where s.id = chat_messages.session_id
        and s.user_id = auth.uid()
    )
  );
