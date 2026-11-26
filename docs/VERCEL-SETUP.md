# Deploy Morrow to Vercel

## Before deployment

- Complete `SUPABASE-SETUP.md` and confirm the app works locally.
- Create a Gemini API key at [Google AI Studio](https://aistudio.google.com/app/apikey). Optionally create a Groq key at [Groq Console](https://console.groq.com/keys) for automatic backup.
- Push the project folder to your GitHub repository using [`GITHUB-SETUP.md`](GITHUB-SETUP.md). Do not commit `.env.local` or any API key.
- Run `supabase/migrations/20261112_security_hardening.sql` in Supabase if this is an existing database.

## Import the repository

1. In Vercel Project Settings, use the Node.js 22 runtime. Then open [Vercel](https://vercel.com/) and choose **Add New → Project**.
2. Import the Morrow GitHub repository.
3. Keep the detected Next.js framework preset and default build command (`npm run build`).
4. Before deploying, add these Environment Variables in the project settings:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase public anon/publishable key |
| `GEMINI_API_KEY` | Your Google AI Studio API key |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `MORROW_FAKE_MODE` | `true` for sample mode, `false` for live AI generation |
| `GROQ_API_KEY` | Optional server-only Groq backup key |
| `GROQ_MODEL` | Optional Groq model override; defaults to `openai/gpt-oss-120b` |
| `APP_URL` | Your final public URL, e.g. `https://morrow-learning.vercel.app` (server-side only) |

5. Deploy. When the first deploy is ready, set `APP_URL` to the assigned production URL and redeploy if needed.
6. In Supabase, open **Authentication → URL Configuration** and add the Vercel site URL to **Site URL** and the allowed redirect URLs. Password sign-in does not need an email callback, but the site URL should still be correct.

## Preview and production

Keep Production and Preview environment variables separate. Ideally create a second Supabase project for Preview; do not point untrusted preview deployments or pull-request builds at your production database. Add the Gemini key and, optionally, the Groq backup key only to the environments that genuinely need live generation. Keep keys server-only with no `NEXT_PUBLIC_` prefix. Keep fake mode enabled for interface work. Set `MORROW_FAKE_MODE=false` only when at least one live AI key is configured.

New share URLs are short, for example `/a/Ab12Cd3Ef9012XyZ` (16 random characters). Existing 9-character links remain compatible. Teachers can revoke a link from the activity editor; the old URL then stops working. It uses the actual deployed domain, not a long encoded activity payload. If the domain changes, previously shared links work on the old domain only unless you keep a custom domain attached.


## AI generation timeouts and providers

When `GROQ_API_KEY` is configured, Morrow tries Groq first and Gemini second. This avoids waiting on Gemini when it is busy. The full provider stream is checked server-side before sending it to the browser, so an incomplete or stalled Groq response can safely fall back to Gemini. Each provider is limited to 105 seconds total, 20 seconds to return response headers, and 45 seconds without streamed output. The route maximum is 260 seconds, leaving a margin below the 300-second Vercel Hobby limit. If neither provider completes, the route returns an error and the manual builder remains available.

Keep both API keys server-only. Set `GROQ_MODEL` to `openai/gpt-oss-120b` unless you intentionally choose another model supported by your Groq account. Set `GEMINI_MODEL` to a currently supported Gemini model.


## Git-based deployments

Vercel watches the GitHub repository after import. Pushes to the production branch (normally `main`) create production deployments; other branches and pull requests can create preview deployments depending on project settings. Keep the **Morrow checks** GitHub workflow required before merging. Configure environment variables separately for Production and Preview. Do not put `GEMINI_API_KEY` in a variable that starts with `NEXT_PUBLIC_`.

The project currently uses patched Next.js 15.5.29, which includes the November 3, 2026 security fixes. Next.js 15 is in Maintenance LTS and security releases are scheduled through January 31, 2027. Re-check advisories and plan an upgrade before that support window ends. <https://github.com/vercel/next.js/releases>
