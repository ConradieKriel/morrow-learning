# Morrow project rules

- This is **Option 2: Free-form builder**. Gemini returns a complete standalone HTML file containing CSS and JavaScript. Do not convert this into a fixed question-template or JSON quiz builder.
- Generated HTML must only execute inside an iframe using `sandbox="allow-scripts"`. Never add `allow-same-origin`. Do not render generated HTML directly into the Next.js document.
- Add a restrictive CSP to generated activity pages. Generated activities must not make network requests or access the host app's cookies, storage, database, or DOM.
- Gemini API keys are server-only. Never add them to a `NEXT_PUBLIC_` variable, client component, source file, or committed `.env` file.
- Supabase RLS must remain enabled. Teachers can only read and change their own activities and version history. Student access must be limited by the profile role and grade in the student dashboard API.
- Shared `/a/<short-id>` pages are public and must work on phones without login, as the brief requires.
- `MORROW_FAKE_MODE=true` uses saved sample HTML and must not call Gemini. Use it for interface work.
- Keep the current Morrow branding and restrained visual design. Do not add unnecessary product features or polished marketing visuals.
- Runtime errors are captured only while the preview is open. Automatic repair may run at most twice; on failure return to the last saved/working HTML.
- Save every teacher generation/refinement as a version. A restore action creates a new version rather than deleting history.
- Keep comments simple and useful. Add tests for security-sensitive helpers and API permission changes.

## Project map

- `app/page.tsx`: unified login and teacher workspace.
- `app/student/page.tsx`: signed-in student test dashboard.
- `app/a/[slug]/page.tsx`: public, short-link activity page.
- `app/api/generate/route.ts`: sample or streamed Gemini generation and chat refinement.
- `components/preview-frame.tsx`: sandbox iframe and runtime/score message handling.
- `lib/html-sandbox.ts`: generated HTML validation, CSP/error bridge injection and short IDs.
- `lib/supabase-server.ts`: token verification and role profile lookup for APIs.
- `supabase/schema.sql`: tables, RLS, indexes and the two demo profiles.
- `docs/`: Supabase setup, Vercel setup and 10 prompt-based test requests.

## Local commands

- `npm install`
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
