# Multilingual activities and student navigation

## Teacher language choice

The teacher builder has an **Activity language** selector. It covers the 11 South African spoken languages supported by text generation and six additional European languages. The selected value is sent to `/api/generate` for new activities, refinements and automatic fixes.

The selected school grade (Grade 1 through Grade 12, or Any grade) is also sent to Gemini for new activities, refinements and automatic fixes. It shapes vocabulary, reading length, complexity, prior knowledge, examples, scaffolding and task difficulty. The generation instruction applies to all learner-facing content, not only headings. It specifically covers every question, answer option, explanation, hint, instruction, button and feedback message. The choice is saved with the activity and each version.

When changing the language of an existing activity, the teacher must submit a refinement request such as: `Translate the complete activity into isiXhosa. Keep all questions and features, and translate every answer option and feedback message.` Merely changing the selector does not rewrite an existing preview.

The manual builder does not call Gemini. Teachers should type their own learner-facing text in the language they want to use.

### Sign language

South African Sign Language is intentionally not offered as a text-generation language. A reliable SASL activity needs verified signing videos or images and review by fluent SASL users; written AI output must not be presented as SASL.

AI-generated spoken-language translations should be reviewed by a fluent speaker before use in important assessment content.

## Database changes for grade-aware generation

No database migration is required for this grade-level update. Morrow already stores the chosen grade on each activity; the selected grade is now included in the server-side Gemini request for creation, refinement and automatic repair.

## Supabase migration

For an existing project, run `supabase/migrations/20261111_add_activity_language.sql` once in Supabase SQL Editor. This adds a `language` column to both `activities` and `activity_versions`, defaulting existing rows to English. For a new Supabase project, the current `supabase/schema.sql` already includes both columns.

## Student return navigation

Student dashboard links use the `?from=student-home` marker. The public activity page displays **Back to activities** only when this marker is present. Teacher-shared public links remain clean `/a/<short-id>` URLs and do not show a student-home navigation link.
