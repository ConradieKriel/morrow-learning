# Security policy

Morrow is a student project. It uses defence in depth, but no web application can be guaranteed to be impossible to hack.

## Reporting a problem

Do not post live credentials, API keys, student data, or an exploitable vulnerability in a public issue. Contact the project owner privately and include the affected route, steps to reproduce, and impact. Rotate any credential that may have been exposed immediately.

## Security controls in this project

- Supabase Auth user tokens are verified server-side with `auth.getUser()`.
- Teacher APIs verify the server-side profile role before changing data.
- Supabase Row Level Security enforces teacher ownership and student grade restrictions in the database.
- Anonymous activity reads are limited by RLS to the one published row matching the request-scoped `x-morrow-share-slug` header. The server sets this header only after validating the URL slug; anonymous clients cannot enumerate the table.
- Gemini and database rate limits are counted atomically in Postgres per authenticated user. A trigger protects the counters from direct resets; the rate-limit function runs as the caller, not as a SECURITY DEFINER.
- Mutating API routes check the request origin and enforce bounded JSON request bodies.
- Private API responses use `Cache-Control: private, no-store`.
- Generated activities execute only in an iframe with `sandbox="allow-scripts"`, no `allow-same-origin`, a restrictive CSP and no external network connections.
- Security headers are configured in `next.config.ts`.
- Secrets are read from server environment variables and must never be committed. The browser Supabase client uses the public publishable/anon key only; the Gemini key remains server-side.
- The app still relies on the Supabase browser session store. Keep the main app free of third-party scripts and untrusted HTML; generated activities stay isolated in the sandboxed iframe. For a larger production deployment, consider moving to a server-managed HttpOnly session design after a dedicated auth migration and testing.

## Owner actions still required

- Disable public sign-ups in Supabase Auth. Create and manage accounts from the dashboard.
- Change the demonstration account passwords before any public deployment.
- Run every SQL migration, including `20261112_security_hardening.sql`.
- Keep the Gemini API key only in local `.env.local` and Vercel server environment variables.
- Enable GitHub secret scanning and push protection where available, and protect the `main` branch.
- Review Vercel logs, Supabase Auth logs and Gemini usage regularly.
- Enable MFA for GitHub, Vercel and Supabase owner accounts and use separate Supabase projects for production and preview deployments.
- Run `npm audit` and update dependencies promptly when security advisories appear.
