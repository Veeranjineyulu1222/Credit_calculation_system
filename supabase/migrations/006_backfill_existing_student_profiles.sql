-- Preview the students who can be repaired safely from existing Auth accounts.
-- This is a one-time repair that only matches KLU email local-parts to students.student_id.
-- It never overwrites an existing user_profiles row and never creates a duplicate student link.
select
  au.id as auth_user_id,
  au.email,
  lower(split_part(au.email, '@', 1)) as register_number,
  s.id as student_record_id,
  exists (
    select 1 from public.user_profiles up where up.user_id = au.id
  ) as existing_profile,
  case
    when exists (
      select 1 from public.user_profiles up where up.user_id = au.id
    ) then 'existing'
    else 'student'
  end as proposed_role
from auth.users au
join public.students s
  on lower(trim(s.student_id)) = lower(split_part(au.email, '@', 1))
where lower(split_part(au.email, '@', 2)) = 'klu.ac.in'
  and not exists (
    select 1 from public.user_profiles up
    where up.user_id = au.id
  )
  and not exists (
    select 1 from public.user_profiles up
    where up.student_id = s.id and up.user_id <> au.id
  )
order by au.created_at desc;

-- Repair any missing row for a valid student match.
insert into public.user_profiles (user_id, role, student_id)
select
  au.id,
  'student',
  s.id
from auth.users au
join public.students s
  on lower(trim(s.student_id)) = lower(split_part(au.email, '@', 1))
where lower(split_part(au.email, '@', 2)) = 'klu.ac.in'
  and not exists (
    select 1 from public.user_profiles up where up.user_id = au.id
  )
  and not exists (
    select 1 from public.user_profiles up
    where up.student_id = s.id and up.user_id <> au.id
  )
on conflict (user_id) do nothing;