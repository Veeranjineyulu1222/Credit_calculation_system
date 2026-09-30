-- Ensure new KLU student accounts are mapped even when signup metadata is absent.
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

  if lower(split_part(new.email, '@', 2)) = 'klu.ac.in' then
    select s.id into matched_student_id
    from public.students s
    where lower(trim(s.student_id)) = lower(register_number)
    limit 1;
  end if;

  if matched_student_id is not null then
    insert into public.user_profiles (user_id, role, student_id)
    values (new.id, 'student', matched_student_id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_student_account() from public;

drop trigger if exists on_auth_user_created_student_profile on auth.users;
create trigger on_auth_user_created_student_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_student_account();