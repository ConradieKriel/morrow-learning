# Production security checklist

Complete this before sharing the deployed site outside your project group.

## Supabase

- [ ] Run the language, security-hardening and teacher-only migrations in order for an existing database. For a fresh database, use the current `supabase/schema.sql`.
- [ ] Confirm `activities`, `activity_versions`, `profiles` and `api_rate_limits` have RLS enabled.
- [ ] Confirm `anon` has no table-wide SELECT privilege on `activities`; it should have only the necessary column-level grants, constrained by the exact-slug RLS policy.
- [ ] Confirm the public link works only when the request includes its exact `x-morrow-share-slug` header; anonymous table queries without that header return no activities; anon cannot read the teacher owner column or other non-share columns.
- [ ] Confirm the migration removes the legacy `get_public_activity` RPC, including any old SECURITY DEFINER version.
- [ ] Test the teacher's **Revoke link** control; the old public URL must stop working. Create a new link and confirm it has a 16-character random ID.
- [ ] Before production, rotate any old 9-character share links by opening each activity, revoking its old link, then creating a fresh 16-character link.
- [ ] Confirm legacy student test accounts are removed, the profile role constraint allows `teacher` only, and the Auth trigger creates a teacher profile for each new account.
- [ ] Enable email sign-ups in Supabase Auth so teachers can register themselves. Keep email confirmation enabled unless you have a specific reason to turn it off.
- [ ] Confirm unauthenticated learners can open a published activity by its short link without creating an account.
- [ ] Do not place a service-role/secret key in `.env.local` or any `NEXT_PUBLIC_` variable.

## AI providers and API protection

- [ ] `GEMINI_API_KEY` and optional `GROQ_API_KEY` exist only as server-side environment variables.
- [ ] `MORROW_FAKE_MODE=false` is set only when at least one live AI provider is configured.
- [ ] Confirm `/api/generate` returns 429 after the per-user limit is exceeded.
- [ ] Confirm accounts without a teacher profile cannot call teacher-only APIs.
- [ ] Confirm requests from an unexpected browser origin receive 403 for mutation routes.

Configured server-side limits: 10 generations per 10 minutes, 60 generations per 24-hour window, 80 activity writes per 10 minutes, and 20 share-link requests per hour per authenticated user. These are application-level limits; keep an eye on AI provider billing and quotas too.

## Generated HTML sandbox

- [ ] Preview iframe has `sandbox="allow-scripts"` only; it must never have `allow-same-origin`.
- [ ] The CSP is inserted before any generated HTML or script.
- [ ] Try an activity that attempts `fetch()` to an external domain; it should be blocked by CSP.
- [ ] Try an activity that reads `parent.document`; the browser should block access due to the opaque sandbox origin.

## GitHub and Vercel

- [ ] `git check-ignore -v .env.local` confirms `.env.local` is ignored.
- [ ] Choose GitHub visibility to suit your collaborators and testers. A public repository is acceptable only when no secrets, credentials or private data are committed.
- [ ] GitHub secret scanning/push protection is enabled where available.
- [ ] `main` branch requires passing CI checks and does not allow force pushes.
- [ ] Vercel production and preview environment variables are configured separately; Preview uses a separate Supabase project, not the production database.
- [ ] The production URL uses HTTPS and is the value of server-side `APP_URL`.
- [ ] Configure Vercel Firewall rate limits for `/api/generate` and `/a/*` if available on the plan; application limits are per signed-in user and do not replace edge/IP-level abuse controls.
- [ ] Review Vercel function logs and Supabase logs after each deployment.
- [ ] Use MFA on GitHub, Vercel and Supabase owner accounts; restrict project membership to people who need access.
