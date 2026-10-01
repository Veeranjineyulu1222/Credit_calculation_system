create table if not exists public.course_component_configs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  theory_percentage numeric not null check (theory_percentage between 0 and 100),
  practical_percentage numeric not null check (practical_percentage between 0 and 100),
  hands_on_percentage numeric not null check (hands_on_percentage between 0 and 100),
  project_percentage numeric not null check (project_percentage between 0 and 100),
  reference_credits numeric not null check (reference_credits > 0),
  min_credits numeric not null check (min_credits >= 0),
  max_credits numeric not null check (max_credits >= 0),
  competency_required numeric not null check (competency_required between 0 and 100),
  status text not null default 'draft' check (status in ('draft', 'pending', 'active', 'archived')),
  effective_from timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint course_component_configs_credit_range check (min_credits <= max_credits),
  constraint course_component_configs_weight_total check (
    abs((theory_percentage + practical_percentage + hands_on_percentage + project_percentage) - 100) <= 0.0001
  ),
  constraint course_component_configs_unique_version unique (course_id, version)
);

create index if not exists course_component_configs_course_status_idx
  on public.course_component_configs (course_id, status, effective_from desc);

create unique index if not exists course_component_configs_active_unique_idx
  on public.course_component_configs (course_id)
  where status = 'active';

alter table public.course_component_configs enable row level security;

create table if not exists public.data_import_batches (
  id uuid primary key default gen_random_uuid(),
  import_type text not null check (import_type in ('course_configuration', 'student_performance')),
  file_name text not null,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  total_rows integer not null default 0 check (total_rows >= 0),
  successful_rows integer not null default 0 check (successful_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'review')),
  error_summary text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists data_import_batches_uploaded_by_idx
  on public.data_import_batches (uploaded_by, uploaded_at desc);

alter table public.data_import_batches enable row level security;

create table if not exists public.competency_analysis_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  configuration_id uuid references public.course_component_configs(id) on delete restrict,
  policy_id uuid references public.credit_policies(id) on delete restrict,
  competency_score numeric not null,
  percentile numeric not null,
  band_id uuid references public.credit_allocation_bands(id) on delete restrict,
  reference_credits numeric not null,
  credits_awarded numeric not null,
  credit_difference numeric not null,
  calculated_at timestamptz not null default now(),
  calculated_by uuid references auth.users(id) on delete restrict,
  details jsonb not null default '{}'::jsonb
);

create index if not exists competency_analysis_results_student_course_idx
  on public.competency_analysis_results (student_id, course_id, calculated_at desc);

create index if not exists competency_analysis_results_course_idx
  on public.competency_analysis_results (course_id, calculated_at desc);

alter table public.competency_analysis_results enable row level security;

create table if not exists public.faculty_student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  faculty_id uuid not null references auth.users(id) on delete restrict,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_shared boolean not null default false
);

create index if not exists faculty_student_notes_student_idx
  on public.faculty_student_notes (student_id, created_at desc);

alter table public.faculty_student_notes enable row level security;

create policy "faculty manage course component configs"
  on public.course_component_configs for all to authenticated
  using (public.is_faculty())
  with check (public.is_faculty());

create policy "students view own notes or faculty manage all"
  on public.faculty_student_notes for select to authenticated
  using (
    public.is_faculty()
    or student_id = (select student_id from public.user_profiles where user_id = auth.uid())
  );

create policy "faculty manage notes"
  on public.faculty_student_notes for all to authenticated
  using (public.is_faculty())
  with check (public.is_faculty());

create policy "faculty manage import batches"
  on public.data_import_batches for all to authenticated
  using (public.is_faculty())
  with check (public.is_faculty());

create policy "faculty manage competency results"
  on public.competency_analysis_results for all to authenticated
  using (public.is_faculty())
  with check (public.is_faculty());

create policy "students read own analysis results"
  on public.competency_analysis_results for select to authenticated
  using (
    student_id = (select student_id from public.user_profiles where user_id = auth.uid())
  );

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger course_component_configs_updated_at
  before update on public.course_component_configs
  for each row
  execute function public.set_updated_at();

create trigger faculty_student_notes_updated_at
  before update on public.faculty_student_notes
  for each row
  execute function public.set_updated_at();
