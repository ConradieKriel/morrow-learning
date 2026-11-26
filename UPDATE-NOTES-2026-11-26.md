# Morrow Learning update: teacher accounts and AI backup

This update keeps the existing Morrow visual design and free-form activity builder.

## What changed

- Teachers can sign in or create their own teacher account from the existing sign-in page.
- A Supabase Auth database trigger creates each new profile with the `teacher` role. A browser cannot choose another role.
- Learners no longer have accounts, a student role, a student dashboard or a student activity-list API. They use only the published `/a/<short-id>` link shared by a teacher.
- Existing student test accounts are removed by the new migration, so former student logins are not promoted to teacher accounts. Any data owned by a deleted student profile is also removed through the existing profile foreign-key cascade; the previous student role could not create or save teacher activities.
- Groq is the primary AI provider when its key is configured. Gemini is the automatic backup when Groq returns an initial error, stalls while streaming, or finishes without usable output. If Groq is not configured, Gemini is used by itself. Provider output is fully validated before being sent to the browser so an incomplete stream can be retried safely.
- The Groq default model is `openai/gpt-oss-120b`. Each provider is limited to 105 seconds total, 20 seconds to return response headers, and 45 seconds without streamed output. The generation route has a 260-second maximum, leaving room for one backup attempt on Vercel Hobby. The manual activity builder remains available when live AI providers are unavailable.

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

Groq is now attempted first when configured. Gemini is used as a backup if Groq returns an HTTP error, stalls, or produces no usable output. Each provider response is buffered and checked before the browser receives it, so a failed provider can be retried without mixing partial HTML from two providers.

## Verification

- `npm test`: 48 tests passed after the provider timeout and fallback update.
- Server-side TypeScript files passed Node syntax checks.
- A full dependency install did not complete in the available environment, so TypeScript project checking and Next.js production build were not completed here.
- Supabase sign-up, email confirmation, provider credentials, and Vercel deployment must still be tested in the user's connected accounts.
