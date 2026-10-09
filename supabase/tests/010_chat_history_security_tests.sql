-- Run with authenticated student sessions in a development database.
-- These checks verify that chat history is owned by the authenticated student.

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('chat_sessions', 'chat_messages');

select policyname, tablename
from pg_policies
where schemaname = 'public'
  and tablename in ('chat_sessions', 'chat_messages')
order by tablename, policyname;

-- Expected behavior under a student session:
-- 1. A student can select only sessions where user_id = auth.uid().
-- 2. A student cannot insert a session for another student_id.
-- 3. A student cannot read or insert messages into another user's session.
-- 4. A faculty session is not granted access by these student-only policies.
