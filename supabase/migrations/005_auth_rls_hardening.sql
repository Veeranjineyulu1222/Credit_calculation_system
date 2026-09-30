-- Authentication and authorization hardening. Apply after migrations 001-004.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_role_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_role_check check (role in ('student', 'faculty'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'student_profile_requires_student_id'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint student_profile_requires_student_id
      check (role = 'faculty' or student_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'faculty_profile_has_no_student_id'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint faculty_profile_has_no_student_id
      check (role = 'student' or student_id is null);
  end if;
end;
$$;

alter table public.user_profiles
  drop constraint if exists user_profiles_student_id_fkey;

alter table public.user_profiles
  add constraint user_profiles_student_id_fkey
  foreign key (student_id) references public.students(id) on delete set null;

alter table public.user_profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_records enable row level security;
alter table public.courses enable row level security;
alter table public.course_outcomes enable row level security;
alter table public.credit_policies enable row level security;
alter table public.credit_allocation_bands enable row level security;
alter table public.student_course_performance enable row level security;

create index if not exists user_profiles_user_id_idx on public.user_profiles (user_id);
create index if not exists user_profiles_student_id_idx on public.user_profiles (student_id);
create index if not exists student_records_student_id_idx on public.student_records (student_id);

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

revoke all on function public.get_current_user_role() from public;
revoke all on function public.get_current_student_id() from public;
grant execute on function public.get_current_user_role() to authenticated;
grant execute on function public.get_current_student_id() to authenticated;

-- Remove policies created by earlier project migrations before applying the final policy set.
drop policy if exists "users read own profile" on public.user_profiles;
drop policy if exists "students read own record or faculty reads all" on public.students;
drop policy if exists "students read own history or faculty reads all" on public.student_records;
drop policy if exists "students read own university email match" on public.students;
drop policy if exists "student histories read own university email match" on public.student_records;
drop policy if exists "faculty manage performance" on public.student_course_performance;
drop policy if exists "students read own performance" on public.student_course_performance;
drop policy if exists "authenticated users read courses" on public.courses;
drop policy if exists "authenticated users read course outcomes" on public.course_outcomes;
drop policy if exists "authenticated users read credit policies" on public.credit_policies;
drop policy if exists "authenticated users read credit bands" on public.credit_allocation_bands;

create policy "profile owner or faculty can read profile"
  on public.user_profiles for select to authenticated
  using (user_id = auth.uid() or public.get_current_user_role() = 'faculty');

create policy "student owner or faculty can read students"
  on public.students for select to authenticated
  using (id = public.get_current_student_id() or public.get_current_user_role() = 'faculty');

create policy "student owner or faculty can read records"
  on public.student_records for select to authenticated
  using (student_id = public.get_current_student_id() or public.get_current_user_role() = 'faculty');

create policy "student owner or faculty can read performance"
  on public.student_course_performance for select to authenticated
  using (student_id = public.get_current_student_id() or public.get_current_user_role() = 'faculty');

create policy "authenticated users can read courses"
  on public.courses for select to authenticated
  using (true);

create policy "authenticated users can read course outcomes"
  on public.course_outcomes for select to authenticated
  using (true);

create policy "authenticated users can read credit policies"
  on public.credit_policies for select to authenticated
  using (true);

create policy "authenticated users can read credit bands"
  on public.credit_allocation_bands for select to authenticated
  using (true);

-- Make academic/configuration data read-only to browser roles.
revoke insert, update, delete on public.user_profiles from anon, authenticated;
revoke insert, update, delete on public.students from anon, authenticated;
revoke insert, update, delete on public.student_records from anon, authenticated;
revoke insert, update, delete on public.student_course_performance from anon, authenticated;
revoke insert, update, delete on public.courses from anon, authenticated;
revoke insert, update, delete on public.course_outcomes from anon, authenticated;
revoke insert, update, delete on public.credit_policies from anon, authenticated;
revoke insert, update, delete on public.credit_allocation_bands from anon, authenticated;

grant select on public.user_profiles to authenticated;
grant select on public.students to authenticated;
grant select on public.student_records to authenticated;
grant select on public.student_course_performance to authenticated;
grant select on public.courses to authenticated;
grant select on public.course_outcomes to authenticated;
grant select on public.credit_policies to authenticated;
grant select on public.credit_allocation_bands to authenticated;

-- Keep the existing dynamic-credit algorithm unchanged; only reassert its ownership check.
-- calculate_dynamic_credits already verifies auth.uid() -> user_profiles -> student_id.