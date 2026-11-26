# Morrow Learning

Morrow is the same classroom learning app, rebuilt around **Option 2: Free-form builder** from the student project brief. A teacher describes an activity and the AI returns one complete HTML page with its own CSS and JavaScript. Morrow runs that generated page in a restricted iframe instead of injecting it into the app.

The visual design keeps the original Morrow name, green palette, simple cards and split login layout.

## What is included

- Teacher sign-in and self-service teacher account creation.
- Learners do not have accounts. Teachers share a short link that opens the activity directly.
- Teacher dashboard and saved activity list.
- Free-form generation from a description or pasted lesson notes.
- Live AI APIs called only from the server, with Groq as an optional automatic backup when Gemini is busy or unavailable. Both providers stream their output.
- Sample/fake mode (`MORROW_FAKE_MODE=true`) for interface testing without using a live AI provider.
- Phone-friendly sandboxed HTML preview using `sandbox="allow-scripts"` and no `allow-same-origin`.
- Runtime error capture in the teacher preview and at most two AI-provider auto-fix attempts when live mode is enabled.
- Chat refinement, manual HTML code editing, version history and restore.
- No-AI manual fallback builder for activities with up to 50 questions. Teachers can add, remove and reorder questions, mix written response, revealable hint/example, step checklist and multiple-choice interactions, and see a combined final score for multiple-choice questions. It creates standalone HTML locally; Supabase is still needed to save and publish it.
- Supabase persistence with row-level security for activities and versions, including teacher-only permissions enforced in Postgres.
- Public share links use 16 random URL-safe characters for new activities. Existing 9-character links are retained for compatibility. Anonymous users cannot enumerate the activities table; they can look up one published item only when they know its exact share link.
- Vercel-ready Next.js application metadata and environment variable setup.
- Supabase and Vercel setup guides, plus a set of 10 realistic Option 2 generation prompts.

## Teacher accounts

Teachers can create their own account from the sign-in page. Supabase creates a teacher profile automatically after account registration. Legacy student test accounts are removed by the teacher-only migration rather than being given teacher access. Learners do not create accounts and do not see a dashboard.

## Run locally

Requirements: Node.js 22.6 or newer.

1. Set up Supabase using [`docs/SUPABASE-SETUP.md`](docs/SUPABASE-SETUP.md).
2. Copy `.env.example` to `.env.local` and add your Supabase URL and public anon/publishable key.
3. Keep `MORROW_FAKE_MODE=true` while checking the interface.
4. If all live AI providers are unavailable, open Create activity and choose **Build without AI**. Add lesson notes and instructions, then add as many questions as needed. Each question can use a different interaction type. The fallback creates a standalone activity locally.
5. Install and start:

```bash
npm install
npm run dev
```

6. Open `http://localhost:3000`. The browser tab title is **Morrow Learning**.

## Turn on AI generation

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey) and add it as `GEMINI_API_KEY`.
2. Optionally create a Groq key at [Groq Console](https://console.groq.com/keys) and add it as `GROQ_API_KEY`.
3. Set `MORROW_FAKE_MODE=false`.
4. Restart the development server.

For Groq, the default model is `openai/gpt-oss-120b`; override it with `GROQ_MODEL` if required. Keep both keys server-only and never prefix them with `NEXT_PUBLIC_`.

The default model is `gemini-3.8-flash`. You can optionally add a Groq API key as a backup. Gemini is tried first; if the provider rejects the request as busy or unavailable (HTTP 408, 429 or 5xx) before streaming begins, Morrow retries with Groq. If you configure Groq alone, it is used as the primary provider. The keys are used only by `app/api/generate/route.ts` and are never sent to the browser.

## Important routes

| Route | Purpose |
|---|---|
| `/` | Teacher sign-in, account creation and workspace |
| `/a/<short-id>` | Public, phone-friendly learner activity |
| `POST /api/generate` | Sample mode or streamed Gemini/Groq generation, refinement and repair |
| `/api/activities` | List and save the signed-in teacher's activities |
| `/api/activities/<id>/versions` | Read version history |
| `/api/activities/<id>/restore` | Restore a prior version as a new version |
| `/api/activities/<id>/share` | Publish and return a short public link |


## Safety notes

- Generated HTML is validated as one complete HTML document and shown only in a sandboxed iframe.
- The iframe has `allow-scripts` only. Do not add `allow-same-origin`.
- A restrictive Content Security Policy blocks network connections and external resources from generated activity pages.
- The app does not use a service-role key. API requests verify the signed-in Supabase user and database access remains protected by RLS.
- Anonymous users have no table-wide SELECT privilege. Column-level grants plus a request-scoped share header and Supabase RLS allow only the one published activity matching the exact random share slug; no public SECURITY DEFINER lookup function is used. These share URLs are intentionally public/no-login, as required by the brief.
- Learners do not sign in. An anonymous visitor can only read the published activity matching the exact random share slug in the request header.
- AI generation and write/share operations have per-user database-backed rate limits. Teachers can revoke a public share link if it is forwarded or exposed. Mutating APIs check request origin, reject oversized JSON payloads and return private no-store responses.
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

The automated tests cover teacher account creation and role restrictions, supported activity languages, HTML validation, sandbox isolation, short-link generation, multi-question activities and the Gemini/Groq provider fallback logic. Follow `docs/TEST-REQUESTS.md` for the 10 manual AI generation checks. Live generation requires your own AI provider key, and Supabase permissions require the database migration described in the setup guide.

## GitHub and Vercel

First follow [`docs/GITHUB-SETUP.md`](docs/GITHUB-SETUP.md) to review the repository, check staged files and push safely. Choose public or private visibility based on your collaboration needs, and never commit secrets. The `.github/workflows/ci.yml` workflow runs tests, lint, TypeScript, dependency audit and a production build on pushes and pull requests. Then follow [`docs/VERCEL-SETUP.md`](docs/VERCEL-SETUP.md) to import that GitHub repository. Never commit `.env.local` or any real keys.

## Verification notes

The included automated suite covers account registration, teacher-only profiles, direct public sharing, manual activity creation, AI provider fallback and the sandbox security rules. Run the test and build commands before deploying. A live Supabase/Gemini/Groq connection still needs to be verified using your own account credentials.


## Activity languages

Teachers can choose the learner-facing language before generating or refining an activity. The selected AI provider is instructed to use that language for the title, explanations, every question, answer option, button, hint and feedback message. The list includes the 11 South African spoken languages supported by text generation, plus French, German, Italian, Dutch, Portuguese and Spanish. South African Sign Language is intentionally not offered until verified signing media and fluent review can be provided. Language is saved with the activity and retained when teachers reopen or refine it.

AI-generated translations in spoken languages should be reviewed by a fluent speaker before being used for important assessment content.

If Supabase was already set up before this language update, run `supabase/migrations/20261111_add_activity_language.sql` once in Supabase SQL Editor.


## Language selection

The activity builder includes 11 South African spoken languages and extra European choices. The selected language is sent to the active AI provider as an explicit output-language instruction and applies to all learner-facing content, including every question, answer option, hint, instruction and feedback message. The language is saved with the activity and each version so it is retained when reopening or restoring work. Changing the language on an existing activity does not translate it automatically; send a refinement request asking Morrow to translate the complete activity. Manual fallback content is teacher-entered and should be typed in the desired language.

South African Sign Language is intentionally excluded from the text-language selector. Reliable SASL support requires verified signed video content and review by fluent SASL users; Morrow should not present AI-generated written text as sign language.

Existing Supabase projects need the one-time migration at `supabase/migrations/20261111_add_activity_language.sql`; new projects get the columns from the current `supabase/schema.sql`.


## Security migration

For an existing Supabase project, run the migrations in `docs/SUPABASE-SETUP.md` in order: activity language, security hardening, then teacher-only accounts. The final migration removes legacy student test accounts, restricts profiles to the teacher role, removes the student-only activity policy and adds automatic teacher profile creation for new signups. New projects can use the updated `supabase/schema.sql` directly. See [`docs/SECURITY-CHECKLIST.md`](docs/SECURITY-CHECKLIST.md).
