# CSP: Competency-Based Credit System

## Run locally

```bash
npm install
npm run dev
```

The Vite client reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SITE_URL`. Set `VITE_SITE_URL` to the deployed frontend URL so Supabase confirmation emails return to the correct application. Never put a Supabase service-role key in this file or in browser code.

## AI competency insights

The student competency page includes an optional question-driven AI explanation layer at `/api/ai/competency-insights`. The endpoint derives the authenticated student from the Supabase bearer session and reads only that student's existing academic competency data. It never accepts a trusted `student_id` from the browser and never calculates official competency scores, percentiles, or credits.

Configure these server-side variables for local development and the backend deployment. `OPENROUTER_API_KEY` must never use a `VITE_` prefix and must not be placed in React code, browser storage, or the database:

```env
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_MODEL=your-openrouter-model
OPENROUTER_SITE_URL=https://creditcalculationsystem.vercel.app
```

For Vercel, the `api/ai/competency-insights.js` function is deployed automatically. Add the three OpenRouter variables and the existing Supabase variables in the Vercel project environment settings for the relevant environments. During local `npm run dev`, the same handler is mounted by `vite.config.js`.

In Supabase Dashboard, open **Authentication > URL Configuration** and set **Site URL** to `https://creditcalculationsystem.vercel.app`. Add `https://creditcalculationsystem.vercel.app/**` to **Redirect URLs**. Add your local Vite URL separately only if local email testing is needed.

## Database setup

Apply `supabase/migrations/001_user_profiles_and_rls.sql` to the existing Supabase project. It creates the auth-to-student role mapping and enables read policies for students, faculty, courses, outcomes, policies, and allocation bands. Seed `user_profiles` from a trusted admin workflow after creating Auth users.

The application intentionally does not fabricate competency results. When a competency-performance/results table is introduced, add its RLS policy and connect it through `src/services/analysisService.js`.

## Dynamic credit algorithm

Apply `supabase/migrations/004_dynamic_credit_algorithm.sql` after the existing migrations. It creates `student_course_performance` and the `calculate_dynamic_credits(student_id, course_id)` RPC. The RPC calculates weighted competency scores from `public.courses`, ranks only the selected course cohort with PostgreSQL `PERCENT_RANK() * 100`, selects the current active policy and matching allocation band, validates course credit limits, and returns the complete auditable result. It never calculates credits with a multiplier.

Run `supabase/tests/004_dynamic_credit_algorithm_test.sql` in a development database to seed temporary performance records from existing students/courses, inspect weighted scores and course-level percentiles, then roll back the test data.

## Authentication and RLS

Apply `supabase/migrations/005_auth_rls_hardening.sql` after migrations `001` through `004`. The browser can read only authorized rows: students are restricted to the `student_id` in their own `user_profiles` row, faculty can read all academic rows, and neither browser role can write academic/configuration data. The dynamic-credit RPC keeps its existing ownership check.

If an existing Auth user shows “Account awaiting academic access”, apply `supabase/migrations/006_backfill_existing_student_profiles.sql`. It maps existing `@klu.ac.in` users to a matching `public.students.student_id` and does not overwrite existing profiles.

Apply `supabase/migrations/007_harden_student_profile_trigger.sql` for new accounts. It creates a student profile from either the signup register-number metadata or the university email prefix. Logout uses local Supabase scope so a global token-revocation failure does not block signing out of the current browser.

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