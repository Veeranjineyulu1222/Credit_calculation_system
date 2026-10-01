-- Secure student registration validation and profile mapping.
-- This keeps the existing RLS model intact while ensuring that only valid student records can be linked to auth users.

create unique index if not exists user_profiles_student_id_unique
  on public.user_profiles(student_id)
  where student_id is not null;

create or replace function public.validate_student_registration(p_register_number text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    where lower(trim(s.student_id)) = lower(trim(coalesce(p_register_number, '')))
  );
$$;

grant execute on function public.validate_student_registration(text) to anon, authenticated;

create or replace function public.handle_new_student_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_register_number text;
  v_student_id uuid;
begin
  v_register_number := nullif(trim(new.raw_user_meta_data ->> 'register_number'), '');
  v_register_number := coalesce(v_register_number, nullif(trim(split_part(new.email, '@', 1)), ''));

  if lower(split_part(new.email, '@', 2)) <> 'klu.ac.in' then
    return new;
  end if;

  if v_register_number is null or trim(v_register_number) = '' then
    return new;
  end if;

  select s.id into v_student_id
  from public.students s
  where lower(trim(s.student_id)) = lower(v_register_number)
  limit 1;

  if v_student_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.user_profiles up
    where up.student_id = v_student_id
      and up.user_id <> new.id
  ) then
    return new;
  end if;

  insert into public.user_profiles (user_id, role, student_id)
  values (new.id, 'student', v_student_id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_student_account() from public;
revoke all on function public.validate_student_registration(text) from public;

drop trigger if exists on_auth_user_created_student_profile on auth.users;
create trigger on_auth_user_created_student_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_student_account();

-- Safe one-time repair for already-created student Auth accounts.
-- Read-only preview before execution:
-- select
--   au.id as auth_user_id,
--   au.email,
--   lower(split_part(au.email, '@', 1)) as register_number,
--   s.id as student_record_id,
--   exists (select 1 from public.user_profiles up where up.user_id = au.id) as existing_profile,
--   case when exists (select 1 from public.user_profiles up where up.user_id = au.id) then 'existing' else 'student' end as proposed_role
-- from auth.users au
-- join public.students s on lower(trim(s.student_id)) = lower(split_part(au.email, '@', 1))
-- where lower(split_part(au.email, '@', 2)) = 'klu.ac.in'
--   and not exists (select 1 from public.user_profiles up where up.user_id = au.id)
--   and not exists (select 1 from public.user_profiles up where up.student_id = s.id and up.user_id <> au.id)
-- order by au.created_at desc;

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
