-- Forward-only repair for environments where migration 005 was not fully applied.
-- These functions preserve the existing user_profiles -> students ownership model.

create or replace function public.get_current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select up.role
  from public.user_profiles up
  where up.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.get_current_student_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select up.student_id
  from public.user_profiles up
  where up.user_id = auth.uid()
    and up.role = 'student'
  limit 1;
$$;

create or replace function public.is_faculty()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = auth.uid()
      and up.role = 'faculty'
  );
$$;

revoke all on function public.get_current_user_role() from public;
revoke all on function public.get_current_student_id() from public;
revoke all on function public.is_faculty() from public;
grant execute on function public.get_current_user_role() to authenticated;
grant execute on function public.get_current_student_id() to authenticated;
grant execute on function public.is_faculty() to authenticated;
