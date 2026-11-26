# Morrow manual test checklist

## Teacher accounts

- [ ] Open `/`. Confirm the page offers **Sign in** and **Create a teacher account**.
- [ ] Create an account with a name, email and password of at least eight characters.
- [ ] With email confirmation enabled, confirm the email arrives and the confirmation link returns to Morrow.
- [ ] Sign in with the new account. Confirm the teacher workspace opens.
- [ ] Sign out and sign in again. Confirm the account's saved activities remain available.
- [ ] Try an incorrect password and confirm a clear error appears.
- [ ] Confirm there is no student account option or student dashboard.
- [ ] Confirm former student test accounts are no longer able to sign in after the teacher-only Supabase migration.

## Teacher activity workflow

- [ ] Create an activity with a descriptive title, subject, grade and language.
- [ ] With sample mode enabled, confirm the sample activity appears in the preview.
- [ ] When live AI is enabled, generate an activity, check it and save it.
- [ ] Open the activity again, refine it and confirm the version number increases after saving.
- [ ] Open version history and restore an earlier version. Confirm restore creates a new version.
- [ ] Edit the HTML directly, save it, and confirm the preview updates.
- [ ] Delete a temporary activity. Confirm it is removed from the teacher's list.

## Learner access through share links

- [ ] Share a saved activity. Confirm the URL format is `/a/` followed by a random short ID.
- [ ] Open the link in a private/incognito browser window. Confirm no login is required.
- [ ] Open the link on a phone and complete the activity.
- [ ] Revoke the link. Confirm the old link no longer opens.
- [ ] Confirm the public activity page does not expose the teacher dashboard or a student account route.

## AI availability

- [ ] Configure Gemini only and confirm Morrow can generate.
- [ ] Configure Gemini and Groq. Simulate or wait for a Gemini 408/429/5xx response before streaming begins and confirm Morrow retries the request with Groq.
- [ ] Configure Groq only and confirm Morrow generates using the Groq model.
- [ ] Confirm provider keys are stored only in server-side environment variables, never with a `NEXT_PUBLIC_` prefix.
- [ ] If both providers are unavailable, confirm the manual activity builder remains usable.

## Permissions and language

- [ ] Confirm each teacher only sees their own saved activities and version history.
- [ ] Confirm unauthenticated learners can only read a published activity through its exact share slug.
- [ ] Test every language option with a live AI provider and review the title, instructions, questions, choices and feedback.
- [ ] Create activities for several grades and check that the content matches the selected level.
