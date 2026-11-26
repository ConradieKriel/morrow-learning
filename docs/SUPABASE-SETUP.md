# Set up Supabase for Morrow

Morrow uses Supabase Auth for teacher accounts and Postgres for activities and version history. Learners do not create accounts. They open the short public link a teacher shares with them.

## 1. Create or open your Supabase project

1. Go to [Supabase](https://supabase.com/) and open the project already used by Morrow.
2. In **Project Settings → API** (or **Connect**), copy the project URL and the public anon/publishable key.
3. Keep the secret/service-role key private. Morrow does not need it in the app.

## 2. Apply database updates

For an existing Morrow project, open **SQL Editor → New query** and run the migrations in this order if they have not already been applied:

1. `supabase/migrations/20261111_add_activity_language.sql`
2. `supabase/migrations/20261112_security_hardening.sql`
3. `supabase/migrations/20261126_teacher_accounts_only.sql`

The final migration:
- removes old student test accounts and their profiles (and any content owned by those profiles);
- makes `teacher` the only allowed profile role;
- creates a teacher profile automatically whenever someone creates a Supabase Auth account;
- removes the student-only activity listing policy.

For a brand-new Supabase project, run the current `supabase/schema.sql` once. It includes the teacher-profile trigger and teacher-only database role check. Do not also run older migrations that duplicate schema setup unless you are upgrading an existing project.

## 3. Allow teachers to create accounts

In Supabase Dashboard:

1. Open **Authentication → Settings** (the exact label may appear as **Auth → Providers → Email** in the current dashboard).
2. Make sure the **Email** provider is enabled.
3. Enable **Allow new users to sign up** / **Enable sign ups**.
4. Leave email confirmation enabled if you want each teacher to verify their email before signing in. If you turn confirmation off, accounts can sign in immediately, but email verification is not performed.
5. Under **URL Configuration**, set the Site URL to your production Morrow URL and add it to the Redirect URLs. Also add your local development URL if needed, for example `http://localhost:3000/**`.

The application always creates teacher accounts. There is no student role selector and no learner login. The database trigger ignores any role metadata sent from a browser and creates `role = 'teacher'` itself.

## 4. Connect the local app

1. Copy `.env.example` to `.env.local`.
2. Add your Supabase URL and public anon/publishable key.
3. Add at least one live AI provider key (Gemini or Groq) and set `MORROW_FAKE_MODE=false` when you are ready to use live generation.
4. Restart the local app after changing `.env.local`:

```bash
npm install
npm run dev
```

## 5. Add the same settings to Vercel

Open the Morrow project in Vercel → **Settings → Environment Variables**. Add the Supabase URL, Supabase public key, `MORROW_FAKE_MODE=false`, and the AI provider key(s) you intend to use. AI keys must not have a `NEXT_PUBLIC_` prefix. Redeploy after changing environment variables.

## 6. Check account creation and sharing

- Create a teacher account from the Morrow sign-in screen.
- If email confirmation is enabled, confirm the message arrives, follow its link, then sign in.
- Create and save an activity. Share its short link.
- Open the share link in a private/incognito browser window or on a phone. It should open without a login or account.
- Confirm the account only sees its own saved activities.

Do not disable RLS. Anonymous visitors should only be able to read the published activity whose random share slug matches the server-supplied request header.
