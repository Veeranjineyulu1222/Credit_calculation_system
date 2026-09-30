# CSP: Competency-Based Credit System

## Run locally

```bash
npm install
npm run dev
```

The Vite client reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put a Supabase service-role key in this file or in browser code.

## Database setup

Apply `supabase/migrations/001_user_profiles_and_rls.sql` to the existing Supabase project. It creates the auth-to-student role mapping and enables read policies for students, faculty, courses, outcomes, policies, and allocation bands. Seed `user_profiles` from a trusted admin workflow after creating Auth users.

The application intentionally does not fabricate competency results. When a competency-performance/results table is introduced, add its RLS policy and connect it through `src/services/analysisService.js`.

## Dynamic credit algorithm

Apply `supabase/migrations/004_dynamic_credit_algorithm.sql` after the existing migrations. It creates `student_course_performance` and the `calculate_dynamic_credits(student_id, course_id)` RPC. The RPC calculates weighted competency scores from `public.courses`, ranks only the selected course cohort with PostgreSQL `PERCENT_RANK() * 100`, selects the current active policy and matching allocation band, validates course credit limits, and returns the complete auditable result. It never calculates credits with a multiplier.

Run `supabase/tests/004_dynamic_credit_algorithm_test.sql` in a development database to seed temporary performance records from existing students/courses, inspect weighted scores and course-level percentiles, then roll back the test data.

## Authentication and RLS

Apply `supabase/migrations/005_auth_rls_hardening.sql` after migrations `001` through `004`. The browser can read only authorized rows: students are restricted to the `student_id` in their own `user_profiles` row, faculty can read all academic rows, and neither browser role can write academic/configuration data. The dynamic-credit RPC keeps its existing ownership check.

Create test Auth users from Supabase Dashboard > Authentication > Users. Do not put credentials in source code. For a faculty test user, insert its Auth UUID through a trusted SQL editor/admin workflow:

```sql
insert into public.user_profiles (user_id, role, student_id)
values ('AUTH_USER_UUID', 'faculty', null);
```

For a student test user, use an existing `public.students.id`:

```sql
insert into public.user_profiles (user_id, role, student_id)
values ('AUTH_USER_UUID', 'student', 'EXISTING_STUDENT_UUID');
```

Run `supabase/tests/005_auth_rls_security_tests.sql` with the corresponding authenticated sessions. The application does not infer a role from an email address; an authenticated user without a valid `user_profiles` row is stopped at the account-configuration screen.