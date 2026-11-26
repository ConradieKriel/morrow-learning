# Morrow Learning update: teacher accounts and AI backup

This update keeps the existing Morrow visual design and free-form activity builder.

## What changed

- Teachers can sign in or create their own teacher account from the existing sign-in page.
- A Supabase Auth database trigger creates each new profile with the `teacher` role. A browser cannot choose another role.
- Learners no longer have accounts, a student role, a student dashboard or a student activity-list API. They use only the published `/a/<short-id>` link shared by a teacher.
- Existing student test accounts are removed by the new migration, so former student logins are not promoted to teacher accounts. Any data owned by a deleted student profile is also removed through the existing profile foreign-key cascade; the previous student role could not create or save teacher activities.
- Gemini remains the primary AI provider. Groq can be added as a server-side backup and is called automatically when Gemini returns an initial 408, 429 or 5xx/busy/unavailable response before streaming starts. Groq can also be used by itself if no Gemini key is configured.
- The Groq default model is `openai/gpt-oss-120b`. The manual activity builder remains available when live AI providers are unavailable.

## Supabase update for an existing project

Run these migrations in order in Supabase SQL Editor, only if they have not already been run:

1. `supabase/migrations/20261111_add_activity_language.sql`
2. `supabase/migrations/20261112_security_hardening.sql`
3. `supabase/migrations/20261126_teacher_accounts_only.sql`

Then enable Email sign-ups under Supabase Authentication settings. Email confirmation is recommended. Set the production site URL and allowed redirect URL to the Morrow Vercel domain.

For a brand-new database, use `supabase/schema.sql` instead of replaying the historical migrations.

## Vercel environment variables

Keep the existing Supabase settings. Keep the Gemini key if already configured, and add:

- `GROQ_API_KEY`: a new private key from https://console.groq.com/keys
- `GROQ_MODEL`: `openai/gpt-oss-120b`
- `MORROW_FAKE_MODE`: `false`

Do not use a `NEXT_PUBLIC_` prefix for either AI key. Save the variables for Production (and Preview only if Preview should use live AI), then redeploy.

Groq fallback only applies when Gemini rejects the request before streaming starts. It cannot safely restart after partial HTML has already been sent to the browser.

## Verification

- `npm test`: 47 tests passed.
- Server-side TypeScript files passed Node syntax checks.
- A full dependency install did not complete in the available environment, so TypeScript project checking and Next.js production build were not completed here.
- Supabase sign-up, email confirmation, provider credentials, and Vercel deployment must still be tested in the user's connected accounts.
