-- Map existing KLU Auth users that were created before the signup trigger existed.
-- This runs in Supabase SQL as a trusted database migration, never in the browser.
insert into public.user_profiles (user_id, role, student_id)
select
  au.id,
  'student',
  s.id
from auth.users au
join public.students s
  on lower(trim(s.student_id)) = lower(
    coalesce(
      nullif(trim(au.raw_user_meta_data ->> 'register_number'), ''),
      split_part(au.email, '@', 1)
    )
  )
where lower(split_part(au.email, '@', 2)) = 'klu.ac.in'
  and not exists (
    select 1
    from public.user_profiles up
    where up.user_id = au.id
  )
on conflict (user_id) do nothing;