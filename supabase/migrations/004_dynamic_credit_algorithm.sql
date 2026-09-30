create table if not exists public.student_course_performance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  theory_score numeric,
  practical_score numeric,
  hands_on_score numeric,
  project_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_course_performance_unique unique (student_id, course_id),
  constraint performance_theory_score_range check (theory_score is null or theory_score between 0 and 100),
  constraint performance_practical_score_range check (practical_score is null or practical_score between 0 and 100),
  constraint performance_hands_on_score_range check (hands_on_score is null or hands_on_score between 0 and 100),
  constraint performance_project_score_range check (project_score is null or project_score between 0 and 100)
);

create index if not exists student_course_performance_course_idx
  on public.student_course_performance (course_id);

create index if not exists student_course_performance_student_idx
  on public.student_course_performance (student_id);

alter table public.student_course_performance enable row level security;

drop policy if exists "faculty manage performance" on public.student_course_performance;
create policy "faculty manage performance"
  on public.student_course_performance for all to authenticated
  using (public.is_faculty())
  with check (public.is_faculty());

drop policy if exists "students read own performance" on public.student_course_performance;
create policy "students read own performance"
  on public.student_course_performance for select to authenticated
  using (
    student_id = (select up.student_id from public.user_profiles up where up.user_id = auth.uid())
    or student_id in (
      select s.id from public.students s
      where lower(trim(s.student_id)) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
    )
  );

create or replace function public.calculate_dynamic_credits(
  p_student_id uuid,
  p_course_id uuid
)
returns table (
  student_id varchar,
  student_name varchar,
  course_id uuid,
  course_code varchar,
  course_name varchar,
  reference_credits numeric,
  theory_score numeric,
  practical_score numeric,
  hands_on_score numeric,
  project_score numeric,
  theory_percentage numeric,
  practical_percentage numeric,
  hands_on_percentage numeric,
  project_percentage numeric,
  competency_score numeric,
  percentile numeric,
  policy_name varchar,
  policy_version varchar,
  band_name varchar,
  credits_awarded numeric,
  min_credits numeric,
  max_credits numeric,
  credit_difference numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_student public.students%rowtype;
  v_course public.courses%rowtype;
  v_performance public.student_course_performance%rowtype;
  v_policy public.credit_policies%rowtype;
  v_band public.credit_allocation_bands%rowtype;
  v_weight_total numeric;
  v_competency_score numeric;
  v_percentile numeric;
  v_cohort_count bigint;
  v_matching_band_count bigint;
begin
  if auth.uid() is null then
    raise exception using message = 'Authentication is required to calculate dynamic credits.', errcode = '42501';
  end if;

  if p_student_id is null or p_course_id is null then
    raise exception using message = 'Student and course are required.', errcode = '22023';
  end if;

  if not public.is_faculty() and not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid() and up.student_id = p_student_id
  ) and not exists (
    select 1 from public.students s
    where s.id = p_student_id
      and lower(trim(s.student_id)) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
  ) then
    raise exception using message = 'You are not authorized to calculate credits for this student.', errcode = '42501';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception using message = 'Student does not exist.', errcode = 'P0002';
  end if;

  select * into v_course from public.courses where id = p_course_id;
  if not found then
    raise exception using message = 'Course does not exist.', errcode = 'P0002';
  end if;

  if v_course.theory_percentage is null
     or v_course.practical_percentage is null
     or v_course.hands_on_percentage is null
     or v_course.project_percentage is null then
    raise exception using message = 'Course competency weights cannot be null.', errcode = '22023';
  end if;

  v_weight_total := v_course.theory_percentage
    + v_course.practical_percentage
    + v_course.hands_on_percentage
    + v_course.project_percentage;
  if abs(v_weight_total - 100) > 0.000001 then
    raise exception using message = 'Course competency weights must total 100%.', errcode = '22023';
  end if;

  select * into v_performance
  from public.student_course_performance
  where student_id = p_student_id and course_id = p_course_id;
  if not found then
    raise exception using message = 'Student performance record does not exist for this course.', errcode = 'P0002';
  end if;

  if v_performance.theory_score is null
     or v_performance.practical_score is null
     or v_performance.hands_on_score is null
     or v_performance.project_score is null then
    raise exception using message = 'Student performance scores cannot be null.', errcode = '22023';
  end if;

  v_competency_score := round((
    v_performance.theory_score * v_course.theory_percentage
    + v_performance.practical_score * v_course.practical_percentage
    + v_performance.hands_on_score * v_course.hands_on_percentage
    + v_performance.project_score * v_course.project_percentage
  ) / 100, 2);

  with scored as (
    select p.student_id,
      round((
        p.theory_score * c.theory_percentage
        + p.practical_score * c.practical_percentage
        + p.hands_on_score * c.hands_on_percentage
        + p.project_score * c.project_percentage
      ) / 100, 2) as competency_score
    from public.student_course_performance p
    join public.courses c on c.id = p.course_id
    where p.course_id = p_course_id
      and p.theory_score is not null
      and p.practical_score is not null
      and p.hands_on_score is not null
      and p.project_score is not null
      and abs(c.theory_percentage + c.practical_percentage + c.hands_on_percentage + c.project_percentage - 100) <= 0.000001
  ), ranked as (
    select student_id, competency_score,
      percent_rank() over (order by competency_score) * 100 as percentile,
      count(*) over () as cohort_count
    from scored
  )
  select r.percentile, r.cohort_count
  into v_percentile, v_cohort_count
  from ranked r
  where r.student_id = p_student_id;

  if v_cohort_count is null or v_cohort_count = 0 then
    raise exception using message = 'No valid students exist in the course cohort.', errcode = 'P0002';
  end if;

  select * into v_policy
  from public.credit_policies
  where lower(status) = 'active'
    and (effective_from is null or effective_from <= current_date)
    and (effective_to is null or effective_to >= current_date)
  order by effective_from desc nulls last, updated_at desc nulls last
  limit 1;
  if not found then
    raise exception using message = 'No active credit policy is available.', errcode = 'P0002';
  end if;

  select count(*) into v_matching_band_count
  from public.credit_allocation_bands b
  where b.policy_id = v_policy.id
    and b.reference_credits = v_course.reference_credits
    and v_percentile >= b.percentile_min
    and v_percentile <= b.percentile_max;

  if v_matching_band_count = 0 then
    raise exception using message = 'No credit allocation band matches this course percentile.', errcode = 'P0002';
  elsif v_matching_band_count > 1 then
    raise exception using message = 'Multiple credit allocation bands match this course percentile.', errcode = '21000';
  end if;

  select * into v_band
  from public.credit_allocation_bands b
  where b.policy_id = v_policy.id
    and b.reference_credits = v_course.reference_credits
    and v_percentile >= b.percentile_min
    and v_percentile <= b.percentile_max;

  if v_band.credits_awarded < v_course.min_credits or v_band.credits_awarded > v_course.max_credits then
    raise exception using message = 'Awarded credits are outside the course credit limits.', errcode = '22023';
  end if;

  return query select
    v_student.student_id,
    v_student.student_name,
    v_course.id,
    v_course.course_code,
    v_course.course_name,
    v_course.reference_credits,
    v_performance.theory_score,
    v_performance.practical_score,
    v_performance.hands_on_score,
    v_performance.project_score,
    v_course.theory_percentage,
    v_course.practical_percentage,
    v_course.hands_on_percentage,
    v_course.project_percentage,
    v_competency_score,
    round(v_percentile, 2),
    v_policy.policy_name,
    v_policy.version,
    v_band.band_name,
    v_band.credits_awarded,
    v_course.min_credits,
    v_course.max_credits,
    v_band.credits_awarded - v_course.reference_credits;
end;
$$;

revoke all on function public.calculate_dynamic_credits(uuid, uuid) from public;
grant execute on function public.calculate_dynamic_credits(uuid, uuid) to authenticated;