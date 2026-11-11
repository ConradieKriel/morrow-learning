# Production security checklist

Complete this before sharing the deployed site outside your project group.

## Supabase

- [ ] Run `supabase/migrations/20261112_security_hardening.sql` in SQL Editor for an existing database. For a fresh database, use the current `supabase/schema.sql`.
- [ ] Confirm `activities`, `activity_versions`, `profiles` and `api_rate_limits` have RLS enabled.
- [ ] Confirm `anon` has no table-wide SELECT privilege on `activities`; it should have only the necessary column-level grants, constrained by the exact-slug RLS policy.
- [ ] Confirm the public link works only when the request includes its exact `x-morrow-share-slug` header; anonymous table queries without that header return no activities; anon cannot read the teacher owner column or other non-share columns.
- [ ] Confirm the migration removes the legacy `get_public_activity` RPC, including any old SECURITY DEFINER version.
- [ ] Test the teacher's **Revoke link** control; the old public URL must stop working. Create a new link and confirm it has a 16-character random ID.
- [ ] Before production, rotate any old 9-character share links by opening each activity, revoking its old link, then creating a fresh 16-character link.
- [ ] Confirm authenticated Grade 7 can query only Grade 7 and `Any grade` activities.
- [ ] Disable public sign-ups under Authentication settings. Create users manually.
- [ ] Change the known test account passwords to unique passwords before production.
- [ ] Do not place a service-role/secret key in `.env.local` or any `NEXT_PUBLIC_` variable.

## Gemini and API protection

- [ ] `GEMINI_API_KEY` exists only as a server-side environment variable.
- [ ] `MORROW_FAKE_MODE=false` is set only when live Gemini is intended.
- [ ] Confirm `/api/generate` returns 429 after the per-user limit is exceeded.
- [ ] Confirm a student token receives 403 from teacher-only APIs.
- [ ] Confirm requests from an unexpected browser origin receive 403 for mutation routes.

Configured server-side limits: 10 generations per 10 minutes, 60 generations per 24-hour window, 80 activity writes per 10 minutes, and 20 share-link requests per hour per authenticated user. These are application-level limits; keep an eye on Gemini billing and provider quotas too.

## Generated HTML sandbox

- [ ] Preview iframe has `sandbox="allow-scripts"` only; it must never have `allow-same-origin`.
- [ ] The CSP is inserted before any generated HTML or script.
- [ ] Try an activity that attempts `fetch()` to an external domain; it should be blocked by CSP.
- [ ] Try an activity that reads `parent.document`; the browser should block access due to the opaque sandbox origin.

## GitHub and Vercel

- [ ] `git check-ignore -v .env.local` confirms `.env.local` is ignored.
- [ ] GitHub repository is private while coursework secrets remain in use.
- [ ] GitHub secret scanning/push protection is enabled where available.
- [ ] `main` branch requires passing CI checks and does not allow force pushes.
- [ ] Vercel production and preview environment variables are configured separately; Preview uses a separate Supabase project, not the production database.
- [ ] The production URL uses HTTPS and is the value of server-side `APP_URL`.
- [ ] Configure Vercel Firewall rate limits for `/api/generate` and `/a/*` if available on the plan; application limits are per signed-in user and do not replace edge/IP-level abuse controls.
- [ ] Review Vercel function logs and Supabase logs after each deployment.
- [ ] Use MFA on GitHub, Vercel and Supabase owner accounts; restrict project membership to people who need access.
