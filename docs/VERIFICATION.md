# Verification record

This project is supplied as source code and must be verified against the connected Supabase project and Vercel deployment before use with real classes.

## Current expected behaviour

- Teachers can create an account on the same page they use to sign in.
- The database Auth trigger creates a teacher-only profile for each new account.
- Learners do not sign in. The published `/a/<short-id>` route opens directly when a teacher shares it.
- Groq is the primary AI provider when its key is configured. Gemini is the automatic backup when Groq rejects, stalls during streaming, or returns no usable output. Provider streams are fully checked before being delivered to the browser.
- Public activity access remains restricted to the exact published slug supplied by the server-side request header.

Run `npm test`, `npm run typecheck` and `npm run build`, then use `docs/TEST-CHECKLIST.md` for live tests.
