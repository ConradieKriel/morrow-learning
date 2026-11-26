# Morrow AI timeout fix

This patch addresses the 300-second Vercel generation timeout.

## What changed

- Groq is the primary provider whenever `GROQ_API_KEY` is configured.
- Gemini remains the automatic backup.
- Each provider is fully read and checked on the server before any generated HTML is returned to the browser. This means a failed or incomplete provider stream can be retried without mixing partial HTML from two providers.
- Providers have a 20-second response-header timeout, a 45-second stream-idle timeout and a 105-second total timeout.
- The generation route maximum is 260 seconds, leaving headroom below Vercel Hobby's 300-second maximum for one backup attempt.
- The generated HTML is validated on the server before delivery.
- The teacher dashboard now identifies Groq as the primary provider when both keys are configured.

## Deployment

1. Copy the files in this patch into the matching locations in the existing `morrow-learning` project folder, replacing the matching files.
2. Do not replace `.env.local`, `.git`, or the existing `package-lock.json`.
3. Run `npm test`.
4. Commit and push the changed files to GitHub. Vercel should create a new deployment automatically.
5. No Supabase migration or new environment variable is required. The existing `GROQ_API_KEY`, `GROQ_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `MORROW_FAKE_MODE=false` settings are reused.
6. After Vercel reports Ready, try creating a small activity. The status line should say that Groq is primary and Gemini is the automatic backup.

The live Groq and Gemini credentials are not included in this patch. A real generation request still needs to be tested against the user's configured providers after deployment.
