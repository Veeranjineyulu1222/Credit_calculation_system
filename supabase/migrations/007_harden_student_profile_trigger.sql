-- Ensure new KLU student accounts are mapped only when a valid student record exists.
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
  matched_student_id uuid;
  register_number text;
begin
  register_number := nullif(trim(new.raw_user_meta_data ->> 'register_number'), '');
  register_number := coalesce(register_number, nullif(trim(split_part(new.email, '@', 1)), ''));

  if lower(split_part(new.email, '@', 2)) <> 'klu.ac.in' then
    return new;
  end if;

  if register_number is null or trim(register_number) = '' then
    return new;
  end if;

  select s.id into matched_student_id
  from public.students s
  where lower(trim(s.student_id)) = lower(register_number)
  limit 1;

  if matched_student_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.user_profiles up
    where up.student_id = matched_student_id
      and up.user_id <> new.id
  ) then
    return new;
  end if;

  insert into public.user_profiles (user_id, role, student_id)
  values (new.id, 'student', matched_student_id)
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