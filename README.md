# Morrow Learning

Morrow is the same classroom learning app, rebuilt around a free-form builder from the student project brief. A teacher describes an activity and the AI returns one complete HTML page with its own CSS and JavaScript. Morrow runs that generated page in a restricted iframe instead of injecting it into the app.

The visual design keeps the original Morrow name, green palette, simple cards and split login layout.

## What is included

- One shared login page for the teacher and student roles.
- One demo teacher account and one demo student account (create them in Supabase; setup instructions below).
- Teacher dashboard and saved activity list.
- Free-form generation from a description or pasted lesson notes.
- Gemini API called only from the server, with streamed text output.
- Sample/fake mode (`MORROW_FAKE_MODE=true`) for interface testing without using Gemini.
- Phone-friendly sandboxed HTML preview using `sandbox="allow-scripts"` and no `allow-same-origin`.
- Runtime error capture in the teacher preview and at most two Gemini auto-fix attempts when live mode is enabled.
- Chat refinement, manual HTML code editing, version history and restore.
- No-AI manual fallback builder for activities with up to 50 questions. Teachers can add, remove and reorder questions, mix written response, revealable hint/example, step checklist and multiple-choice interactions, and see a combined final score for multiple-choice questions. It creates standalone HTML locally; Supabase is still needed to save and publish it.
- Supabase persistence with row-level security for activities and versions, including grade restrictions enforced in Postgres.
- Public share links use 16 random URL-safe characters for new activities. Existing 9-character links are retained for compatibility. Anonymous users cannot enumerate the activities table; they can look up one published item only when they know its exact share link.
- A student testing dashboard that lists published activities for the student's profile grade, with direct share-link revocation for teachers.
- Vercel-ready Next.js application metadata and environment variable setup.
- Supabase and Vercel setup guides, plus a set of 10 realistic Option 2 generation prompts.

## Two testing accounts

Create these two users in Supabase Authentication, then run the profile SQL at the end of `supabase/schema.sql`:

| Role | Email | Grade |
|---|---|---|
| Teacher | `teacher@morrow.app` | - |
| Student | `student@morrow.app` | Grade 7 |

Create these two users manually in Supabase Auth and choose private passwords that are not written into the repository. They both sign in on the same page at `/`. Change any old demonstration passwords before using a public deployment.

## Run locally

Requirements: Node.js 22.6 or newer.

1. Set up Supabase using [`docs/SUPABASE-SETUP.md`](docs/SUPABASE-SETUP.md).
2. Copy `.env.example` to `.env.local` and add your Supabase URL and public anon/publishable key.
3. Keep `MORROW_FAKE_MODE=true` while checking the interface.
4. If Gemini is unavailable, open Create activity and choose **Build without AI**. Add lesson notes and instructions, then add as many questions as needed. Each question can use a different interaction type. The fallback creates a standalone activity locally.
5. Install and start:

```bash
npm install
npm run dev
```

6. Open `http://localhost:3000`. The browser tab title is **Morrow Learning**.

## Turn on Gemini generation

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Add it as `GEMINI_API_KEY` in `.env.local`.
3. Set `MORROW_FAKE_MODE=false`.
4. Restart the development server.

The default model is `gemini-3.8-flash`; change `GEMINI_MODEL` if you decide to use another Gemini model supported by your API key. The API key is used only by `app/api/generate/route.ts`; it is never sent to the browser.

## Important routes

| Route | Purpose |
|---|---|
| `/` | Unified sign-in and teacher workspace |
| `/student` | Student test dashboard, filtered by profile grade |
| `/a/<short-id>` | Public, phone-friendly learner activity |
| `POST /api/generate` | Fake sample generation or streamed Gemini generation/refinement/fix |
| `/api/activities` | List and save the signed-in teacher's activities |
| `/api/activities/<id>/versions` | Read version history |
| `/api/activities/<id>/restore` | Restore a prior version as a new version |
| `/api/activities/<id>/share` | Publish and return a short public link |
| `/api/student/activities` | Published activity list for the signed-in student's grade |

## Safety notes

- Generated HTML is validated as one complete HTML document and shown only in a sandboxed iframe.
- The iframe has `allow-scripts` only. Do not add `allow-same-origin`.
- A restrictive Content Security Policy blocks network connections and external resources from generated activity pages.
- The app does not use a service-role key. API requests verify the signed-in Supabase user and database access remains protected by RLS.
- Anonymous users have no table-wide SELECT privilege. Column-level grants plus a request-scoped share header and Supabase RLS allow only the one published activity matching the exact random share slug; no public SECURITY DEFINER lookup function is used. These share URLs are intentionally public/no-login, as required by the brief.
- Students are limited to their assigned grade or activities marked `Any grade` at the database level and in the student API.
- Gemini generation and write/share operations have per-user database-backed rate limits. Teachers can revoke a public share link if it is forwarded or exposed. Mutating APIs check request origin, reject oversized JSON payloads and return private no-store responses.
- Generated HTML is isolated in an opaque-origin iframe; the CSP is inserted before generated markup, and the app disables the iframe's camera, microphone, geolocation and payment permissions.
- The `main` branch should be protected, CI must pass, and `.env.local` must never be committed. Use a separate Supabase project for Vercel Preview deployments. See `SECURITY.md`, `docs/SECURITY-CHECKLIST.md` and `docs/GITHUB-SETUP.md`.
- The runtime error handler can only detect errors while the preview is open and while the relevant code runs. It cannot prove that every button in every generated page works. The teacher must still try the activity before sharing.

## Test and build commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The automated tests cover grade-aware Gemini prompting, supported activity languages, HTML validation, sandbox isolation, short-link generation, multi-question activities and security-sensitive API/database rules. Follow `docs/TEST-REQUESTS.md` for the 10 manual AI generation checks. Full Gemini behaviour requires your own API key, and Supabase permissions require the database migration described in the setup guide.

## GitHub and Vercel

First follow [`docs/GITHUB-SETUP.md`](docs/GITHUB-SETUP.md) to create a private repository, review staged files and push safely. The `.github/workflows/ci.yml` workflow runs tests, lint, TypeScript, dependency audit and a production build on pushes and pull requests. Then follow [`docs/VERCEL-SETUP.md`](docs/VERCEL-SETUP.md) to import that GitHub repository. Never commit `.env.local` or any real keys.

## Verification notes

The included automated suite contains 46 Node tests, including multi-question activity creation, combined scoring, HTML escaping, student grade access and security hardening checks.

A full Next.js production build and browser end-to-end test could not be completed in this environment because dependency installation did not finish. The app has not yet been connected to your Supabase project, a live Gemini key or a Vercel deployment. Follow the setup guides and manual test checklist before presenting it as a live product.


## Activity languages

Teachers can choose the learner-facing language before generating or refining an activity. Gemini is instructed to use that language for the title, explanations, every question, answer option, button, hint and feedback message. The list includes the 11 South African spoken languages supported by text generation, plus French, German, Italian, Dutch, Portuguese and Spanish. South African Sign Language is intentionally not offered until verified signing media and fluent review can be provided. Language is saved with the activity and retained when teachers reopen or refine it.

AI-generated translations in spoken languages should be reviewed by a fluent speaker before being used for important assessment content.

If Supabase was already set up before this language update, run `supabase/migrations/20261111_add_activity_language.sql` once in Supabase SQL Editor.


## Language selection

The activity builder includes 11 South African spoken languages and extra European choices. The selected language is sent to Gemini as an explicit output-language instruction and applies to all learner-facing content, including every question, answer option, hint, instruction and feedback message. The language is saved with the activity and each version so it is retained when reopening or restoring work. Changing the language on an existing activity does not translate it automatically; send a refinement request asking Morrow to translate the complete activity. Manual fallback content is teacher-entered and should be typed in the desired language.

South African Sign Language is intentionally excluded from the text-language selector. Reliable SASL support requires verified signed video content and review by fluent SASL users; Morrow should not present AI-generated written text as sign language.

Existing Supabase projects need the one-time migration at `supabase/migrations/20261111_add_activity_language.sql`; new projects get the columns from the current `supabase/schema.sql`.


## Security migration

If your Supabase project already exists, run `supabase/migrations/20261112_security_hardening.sql` in SQL Editor after the language migration. It removes anonymous table listing, enforces student grade access in RLS, adds request-header-restricted public share access and creates atomic API rate-limit storage/functions. New projects can use the updated `supabase/schema.sql` directly. See [`docs/SECURITY-CHECKLIST.md`](docs/SECURITY-CHECKLIST.md).
