create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'faculty')),
  student_id uuid references public.students(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_profile_requires_student_id check (role = 'faculty' or student_id is not null),
  constraint faculty_profile_has_no_student_id check (role = 'student' or student_id is null)
);

alter table public.user_profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_records enable row level security;
alter table public.courses enable row level security;
alter table public.course_outcomes enable row level security;
alter table public.credit_policies enable row level security;
alter table public.credit_allocation_bands enable row level security;

create or replace function public.is_faculty()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role = 'faculty'
  );
$$;

revoke all on function public.is_faculty() from public;
grant execute on function public.is_faculty() to authenticated;

create policy "users read own profile"
  on public.user_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_faculty());

create policy "students read own record or faculty reads all"
  on public.students for select to authenticated
  using (
    public.is_faculty()
    or id = (select student_id from public.user_profiles where user_id = auth.uid())
  );

create policy "students read own history or faculty reads all"
  on public.student_records for select to authenticated
  using (
    public.is_faculty()
    or student_id = (select student_id from public.user_profiles where user_id = auth.uid())
  );

create policy "authenticated users read courses"
  on public.courses for select to authenticated
  using (true);

create policy "authenticated users read course outcomes"
  on public.course_outcomes for select to authenticated
  using (true);

create policy "authenticated users read credit policies"
  on public.credit_policies for select to authenticated
  using (true);

create policy "authenticated users read credit bands"
  on public.credit_allocation_bands for select to authenticated
  using (true);