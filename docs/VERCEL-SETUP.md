# Deploy Morrow to Vercel

## Before deployment

- Complete `SUPABASE-SETUP.md` and confirm the app works locally.
- Create a Gemini API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
- Push the project folder to a private GitHub repository using [`GITHUB-SETUP.md`](GITHUB-SETUP.md). Do not commit `.env.local` or any API key.
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
| `MORROW_FAKE_MODE` | `true` for sample mode, `false` for live Gemini generation |
| `APP_URL` | Your final public URL, e.g. `https://morrow-learning.vercel.app` (server-side only) |

5. Deploy. When the first deploy is ready, set `APP_URL` to the assigned production URL and redeploy if needed.
6. In Supabase, open **Authentication → URL Configuration** and add the Vercel site URL to **Site URL** and the allowed redirect URLs. Password sign-in does not need an email callback, but the site URL should still be correct.

## Preview and production

Keep Production and Preview environment variables separate. Ideally create a second Supabase project for Preview; do not point untrusted preview deployments or pull-request builds at your production database. Add the Gemini key only to the environments that genuinely need live generation. Keep fake mode enabled for interface work. Set `MORROW_FAKE_MODE=false` only when the Gemini API key is configured and you are ready to test paid/limited API calls.

New share URLs are short, for example `/a/Ab12Cd3Ef9012XyZ` (16 random characters). Existing 9-character links remain compatible. Teachers can revoke a link from the activity editor; the old URL then stops working. It uses the actual deployed domain, not a long encoded activity payload. If the domain changes, previously shared links work on the old domain only unless you keep a custom domain attached.


## Long AI generations

Morrow's `/api/generate` route allows up to 300 seconds for free-form activity creation, with a 275-second upstream Gemini timeout. On Vercel, use Node.js runtime with Fluid Compute enabled. Vercel Hobby supports up to 300 seconds with Fluid Compute; projects without Fluid Compute have lower function-duration limits. If a generation still times out, check the function logs and the Gemini API response before increasing limits further.


## Git-based deployments

Vercel watches the GitHub repository after import. Pushes to the production branch (normally `main`) create production deployments; other branches and pull requests can create preview deployments depending on project settings. Keep the **Morrow checks** GitHub workflow required before merging. Configure environment variables separately for Production and Preview. Do not put `GEMINI_API_KEY` in a variable that starts with `NEXT_PUBLIC_`.

The project currently uses patched Next.js 15.5.29, which includes the November 3, 2026 security fixes. Next.js 15 is in Maintenance LTS and security releases are scheduled through January 31, 2027. Re-check advisories and plan an upgrade before that support window ends. <https://github.com/vercel/next.js/releases>
