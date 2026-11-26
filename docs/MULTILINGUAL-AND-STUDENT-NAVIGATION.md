# Multilingual activities

Teachers can choose the learner-facing language before generating or refining an activity. The selected language is sent as an explicit instruction to the active AI provider and applies to all learner-facing content, including every question, answer option, explanation, hint, instruction, button and feedback message.

The language choice is saved with the activity and each version so it is retained when reopening or restoring work. Changing the language on an existing activity does not translate it automatically; send a refinement request asking Morrow to translate the complete activity. Manual fallback content is teacher-entered and should be typed in the desired language.

The list includes 11 South African spoken languages and additional European choices. South African Sign Language is intentionally excluded from the text-language selector. Reliable SASL support requires verified signed video content and review by fluent SASL users; Morrow should not present AI-generated written text as sign language.

AI-generated translations in spoken languages should be reviewed by a fluent speaker before being used for important assessment content.

Existing Supabase projects need the one-time migration at `supabase/migrations/20261111_add_activity_language.sql`; new projects get the columns from the current `supabase/schema.sql`.
