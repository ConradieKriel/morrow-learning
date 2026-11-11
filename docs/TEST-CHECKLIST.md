# Morrow manual test checklist

Run this after configuring Supabase. Keep `MORROW_FAKE_MODE=true` for the first pass so no Gemini calls are made.

## Sign-in and roles

- [ ] Open `/`. Confirm there is one sign-in page for both roles.
- [ ] Sign in with `teacher@morrow.app`. Confirm the teacher workspace opens.
- [ ] Sign out, then sign in with `student@morrow.app`. Confirm the student page opens.
- [ ] Sign out and try an incorrect password. Confirm a friendly error appears.
- [ ] Try opening `/student` while signed out. Confirm it returns to the shared sign-in page.

## Teacher activity workflow

- [ ] Sign in as the teacher and create an activity titled `Water Cycle Explorer`, Grade 7.
- [ ] Use the sample generation mode. Confirm the sample water-cycle simulation appears in the preview.
- [ ] Move the temperature slider and use the answer buttons. Confirm the activity responds.
- [ ] Save it. Confirm it appears in the teacher's saved activity list.
- [ ] Open it again, ask Morrow to make a change, and confirm the refinement conversation is shown.
- [ ] Save the refinement. Confirm the version number increases.
- [ ] Open version history and restore the earlier version. Confirm restore creates a new version.
- [ ] Edit the HTML directly, save it, and confirm the preview updates.
- [ ] Delete a temporary activity. Confirm it is removed from the teacher's list.

## No-AI fallback workflow

- [ ] In the teacher builder, select **Build without AI**.
- [ ] Create an activity with at least five questions.
- [ ] Add a question, remove a question, and move questions up and down. Confirm the displayed order changes.
- [ ] Use at least two multiple-choice questions and confirm the learner sees one combined final score.
- [ ] Mix multiple-choice, written response, revealable hint/example and step checklist questions in one activity.
- [ ] Confirm written response, reveal and checklist questions must be completed before the activity can be finished.
- [ ] Confirm a wrong multiple-choice answer counts as incorrect rather than preventing the learner from receiving a result.
- [ ] Save the manual activity, reload it from My activities, then share its short link and complete it as a learner.
- [ ] Confirm the manual builder works with `MORROW_FAKE_MODE=true` and with Gemini not configured.
- [ ] Confirm the app explains that saving/sharing still requires Supabase.

## Sharing and student grade view

- [ ] Share the saved activity. Confirm new URL format is `/a/` followed by a 16-character random ID. Existing 9-character links should continue working.
- [ ] Open the link in a private/incognito browser window. Confirm it opens without a student login.
- [ ] Create and publish a second activity for Grade 6.
- [ ] Sign in as the Grade 7 student. Confirm Grade 7 and `Any grade` activities appear, but Grade 6 does not.
- [ ] Confirm the student account cannot open the teacher workspace or call teacher-only APIs.

Note: The `/student` dashboard filters by the student's assigned grade. Per the Option 2 brief, a published `/a/<short-id>` activity link is public and works without login. Anyone who has that direct share link can open it, even if the activity was labelled for another grade.

## Live Gemini checks

- [ ] Add `GEMINI_API_KEY` to the local environment and set `MORROW_FAKE_MODE=false`.
- [ ] Restart the app and confirm the teacher dashboard reports Gemini mode.
- [ ] Run the ten prompts in `TEST-REQUESTS.md`, including at least one simulation, drag-and-drop task, branching story and interactive diagram.
- [ ] Confirm generation streams and the complete HTML appears in the preview.
- [ ] Test the activity controls before sharing. Confirm the generated page cannot make network requests or access the parent page.
- [ ] Cause or reproduce a preview JavaScript error. Confirm no more than two automatic fix attempts occur and the prior working HTML is restored if both attempts fail.
- [ ] Repeat the preview checks at a narrow mobile width.

## Permissions

For a final security check, use the Supabase SQL editor or the Supabase dashboard to verify that the teacher only sees their own drafts and versions. The SQL policies are part of the access control, not just the frontend role checks.


## Multilingual activities and student navigation

- [ ] Select each of the 11 supported South African spoken language choices and confirm the selected value appears in the generation request.
- [ ] With live Gemini enabled, create a short activity in the selected language and check the title, instructions, every question, every answer choice and all feedback.
- [ ] Refine that activity and confirm the selected language is retained.
- [ ] Save, reopen and restore a version; confirm the activity language follows the saved version.
- [ ] Confirm South African Sign Language is not offered in the text-language selector. Do not claim support until verified signing media and fluent review are integrated.
- [ ] Open an activity from the signed-in student dashboard and confirm a Back to activities link is shown.
- [ ] Open the same public URL without `?from=student-home` and confirm the return link is not shown.

- [ ] Create activities for Grade 2, Grade 7 and Grade 11 using the same topic and confirm Gemini adjusts vocabulary, reading load, abstraction and difficulty appropriately.
- [ ] Refine an existing activity and trigger an automatic fix; confirm the original selected grade is retained.
