create policy "students read own university email match"
  on public.students for select to authenticated
  using (
    lower(trim(student_id)) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
  );

create policy "student histories read own university email match"
  on public.student_records for select to authenticated
  using (
    student_id in (
      select id from public.students
      where lower(trim(student_id)) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
    )
  );