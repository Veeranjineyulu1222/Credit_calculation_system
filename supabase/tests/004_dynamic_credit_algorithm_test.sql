-- This test is intentionally transactional and does not alter persistent academic data.
begin;

-- Seed deterministic mock performance for up to 10 existing students and 3 existing courses.
-- It uses existing rows only; run it in a development Supabase project.
with selected_students as (
  select id, row_number() over (order by student_id) as student_number
  from public.students
  limit 10
), selected_courses as (
  select id, row_number() over (order by course_code) as course_number
  from public.courses
  limit 3
), seed_rows as (
  select s.id as student_id, c.id as course_id,
    greatest(0, least(100, 55 + ((s.student_number * 7 + c.course_number * 3) % 46)))::numeric as theory_score,
    greatest(0, least(100, 58 + ((s.student_number * 5 + c.course_number * 4) % 43)))::numeric as practical_score,
    greatest(0, least(100, 60 + ((s.student_number * 9 + c.course_number * 2) % 41)))::numeric as hands_on_score,
    greatest(0, least(100, 57 + ((s.student_number * 6 + c.course_number * 5) % 44)))::numeric as project_score
  from selected_students s cross join selected_courses c
)
insert into public.student_course_performance (student_id, course_id, theory_score, practical_score, hands_on_score, project_score)
select student_id, course_id, theory_score, practical_score, hands_on_score, project_score
from seed_rows
on conflict (student_id, course_id) do update set
  theory_score = excluded.theory_score,
  practical_score = excluded.practical_score,
  hands_on_score = excluded.hands_on_score,
  project_score = excluded.project_score,
  updated_at = now();

-- Verify weighted competency scores are calculated per course using course-owned weights.
select p.student_id, p.course_id,
  round((p.theory_score * c.theory_percentage
    + p.practical_score * c.practical_percentage
    + p.hands_on_score * c.hands_on_percentage
    + p.project_score * c.project_percentage) / 100, 2) as competency_score
from public.student_course_performance p
join public.courses c on c.id = p.course_id
where c.id in (select id from public.courses order by course_code limit 3)
order by p.course_id, competency_score;

-- Verify the documented percentile method: PERCENT_RANK() within one course only.
with scored as (
  select p.student_id, p.course_id,
    round((p.theory_score * c.theory_percentage
      + p.practical_score * c.practical_percentage
      + p.hands_on_score * c.hands_on_percentage
      + p.project_score * c.project_percentage) / 100, 2) as competency_score
  from public.student_course_performance p
  join public.courses c on c.id = p.course_id
)
select student_id, course_id, competency_score,
  round(percent_rank() over (partition by course_id order by competency_score) * 100, 2) as percentile
from scored
order by course_id, percentile;

rollback;