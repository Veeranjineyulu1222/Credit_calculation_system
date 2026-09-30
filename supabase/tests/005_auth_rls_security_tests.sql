-- Run these checks in Supabase SQL Editor with an authenticated session or through
-- the Supabase client using the relevant test account. Replace the UUID placeholders.

-- Student A should return exactly one own row and zero rows for Student B.
select id, student_id, student_name from public.students
where id in ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid);

-- Student A should see only their own history and performance rows.
select student_id, completed_courses from public.student_records;
select student_id, course_id, theory_score, practical_score, hands_on_score, project_score
from public.student_course_performance;

-- Student A cannot update their role or student mapping.
update public.user_profiles
set role = 'faculty', student_id = null
where user_id = auth.uid();

-- Student and faculty browser roles cannot modify allocation bands.
update public.credit_allocation_bands
set band_name = band_name
where false;

-- A faculty session should return all students and all performance records.
select count(*) as visible_students from public.students;
select count(*) as visible_performance from public.student_course_performance;

-- The RPC must reject a student requesting another student's result.
select * from public.calculate_dynamic_credits(
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000003'::uuid
);