# Morrow verification notes

## Checks completed in this update

- [x] 46 automated Node tests pass.
- [x] All 11 South African spoken language options are present; SASL is excluded from text generation to avoid inaccurate sign-language claims.
- [x] French, German, Italian, Dutch, Portuguese and Spanish are also available.
- [x] The selected teacher language and grade are sent to Gemini as system-level instructions. The grade shapes vocabulary, reading load, abstraction, examples, scaffolding and task difficulty for generation, refinement and repair.
- [x] Language is stored on activities and their versions, restored with a version, and displayed on the learner-facing page.
- [x] Non-English requests in fake/sample mode are rejected with a clear explanation instead of silently returning the English sample.
- [x] Activities opened from the signed-in student dashboard show a return link to the student home page.
- [x] Direct public activity links from a teacher do not show the student-home return link.
- [x] Updated TypeScript/TSX files pass TypeScript syntax transpilation.
- [x] Existing timeout, sandbox, grade access and manual multi-question tests still pass.
- [x] Security migration resets all policies on the protected tables to a known allowlist, avoiding old permissive policies being OR-combined with the new rules.
- [x] Anonymous share access uses column-level grants plus an exact share-slug RLS check; the full activities table is not granted to anon.

## Not verified in this environment

- [ ] Full Next.js production build and complete React/Next typecheck. The project dependencies are not installed in this workspace, so full framework typechecking could not run here.
- [ ] Actual Gemini output quality in each selected language using the user's private API key.
- [x] South African Sign Language is not offered as a text-generation language because verified signing media and fluent review are not integrated.
- [ ] Supabase migration and database operations against the user's live project. The included pgTAP policy suite has not been run against a live/local Supabase database.
- [ ] Vercel deployment and physical phone testing.

Automated tests and syntax checks passed. These do not replace real API, translation-quality or classroom testing.

- [x] Selected school grade is passed to Gemini for generation, refinement and automatic repair; grade-specific instructions guide language level, reading load, abstraction, examples and difficulty.
