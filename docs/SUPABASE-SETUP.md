# Set up Supabase for Morrow

Morrow uses Supabase Auth for the two test accounts and Postgres for activities and version history. The generated activity HTML is saved in the `activities` table. Row-level security (RLS) keeps each teacher's drafts and version history private.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com/) and create a new project.
2. Choose a project name such as `morrow-learning` and set a strong database password.
3. Wait for the database to finish provisioning.
4. Open **Project Settings → API** (or **Connect** in the project dashboard) and copy the project URL and public `anon` / publishable key.

## 2. Create the two testing users

Open **Authentication → Users → Add user**. Create exactly these two accounts and enable/confirm each user:

| Role | Email | Profile grade |
|---|---|---|
| Teacher | `teacher@morrow.app` | Not applicable |
| Student | `student@morrow.app` | Grade 7 |

Choose unique passwords in Supabase Auth and keep them private. Do not write the passwords in SQL files, `.env.example`, README files or GitHub. Change any older demonstration passwords before public deployment. Disable public sign-ups in **Authentication → Settings** so only accounts you create can access Morrow.

## 3. Create the database and role profiles

1. Open **SQL Editor → New query**.
2. Open `supabase/schema.sql` from this project folder and paste the full file into the editor.
3. Click **Run**. The schema creates the tables, indexes, triggers, least-privilege grants, RLS policies, request-header-restricted public share access and rate-limit function.
4. The final two SQL statements in the file create/update the two demo profiles based on the Auth users' email addresses. Check **Table Editor → profiles** and confirm there is one `teacher` and one `student` row. The student should have `Grade 7` in the `grade` column.

### If you created the Morrow database before the language and security updates

Run `supabase/migrations/20261111_add_activity_language.sql` in **SQL Editor → New query → Run**. This adds the activity language column without deleting existing activities. You only need to run it once. If you are setting up a brand-new project using the updated `schema.sql`, the column is already included and this extra migration is not necessary.

Do not disable RLS. Do not put the Supabase service-role or secret key in the application. Morrow only uses the public key in the browser and sends the signed-in user's access token to its API routes.

## 4. Connect the local app

1. In the project root, copy `.env.example` to `.env.local`.
2. Replace the placeholders:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLIC_ANON_OR_PUBLISHABLE_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-3.8-flash
MORROW_FAKE_MODE=true
APP_URL=http://localhost:3000
```

3. Keep `MORROW_FAKE_MODE=true` while checking the interface. It uses the saved sample activity and does not call Gemini.
4. Restart the local app after changing `.env.local`:

```bash
npm install
npm run dev
```

5. Open `http://localhost:3000`. Both roles use the same sign-in form. The teacher account opens the teacher workspace; the student account opens the student activity list.

## 5. Check the database permissions

- Sign in as the teacher and create an activity. It should appear in **activities** and **activity_versions**.
- Sign out and sign in as the student. The student page only lists published activities that match the student's `grade` value.
- Open a published activity's `/a/<short-id>` URL in a private/incognito browser window. The share page should open without a learner account.
- A student's token cannot create or edit activities. The database policies are the final permission check, not just the buttons in the interface.

The public share route deliberately has no login, as required by the project brief. Its random short ID is the share URL. The student dashboard is a separate testing view that filters published work by the student's profile grade.


## 6. Apply the security migration to an existing project

After the language migration, run `supabase/migrations/20261112_security_hardening.sql` in **SQL Editor → New query**. This is required for the current app. It:

- Removes anonymous table-wide SELECT access to activities. It grants only the share-page columns, and RLS allows a visitor to read a row only when its exact random slug matches the request header, so public clients cannot enumerate published activities.
- Lets an anonymous visitor retrieve only one published activity by its exact server-supplied share slug (new links use 16 characters; older 9-character links continue working).
- Restricts signed-in student table queries to their assigned grade or `Any grade` using RLS.
- Removes any older `get_public_activity` RPC so anonymous clients cannot call a legacy public lookup function.
- Adds a private rate-limit table and an authenticated function used by the Gemini and write/share endpoints.

Do not skip this migration. Until it is applied, some routes will deliberately fail closed rather than run without the rate limits and database rules.

## 7. Before production

- In Supabase Auth settings, disable public sign-ups. Create and manage users manually.
- Change all demonstration passwords to long, unique passwords that are not stored in the repository.
- Never place a Supabase secret/service-role key in the browser or a `NEXT_PUBLIC_` variable. The project does not need that key.
- Review Supabase Auth rate limits and logs, and enable CAPTCHA in Supabase Auth if your chosen sign-in flow supports it. Keep account creation restricted to accounts you create manually.

## 8. Optional database security tests

For a local Supabase CLI environment, run `supabase test db` after applying the schema and migrations. The project includes `supabase/tests/security_policy_checks.sql`, which checks that RLS is enabled, the expected role grants and policies exist, the old public lookup RPC is absent, and rate-limit functions run as SECURITY INVOKER. These are database configuration checks; also perform the live teacher/student tests in the checklist.
