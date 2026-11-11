import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const page = await read('app/page.tsx');
const route = await read('app/api/generate/route.ts');
const createApi = await read('app/api/activities/route.ts');
const updateApi = await read('app/api/activities/[id]/route.ts');
const schema = await read('supabase/schema.sql');
const migration = await read('supabase/migrations/20261111_add_activity_language.sql');

test('teacher can select an activity language and the setting is included in generation requests', () => {
  assert.match(page, /Activity language/);
  assert.match(page, /ACTIVITY_LANGUAGES/);
  assert.match(page, /JSON\.stringify\(\{ action, prompt: requestedPrompt, currentHtml: html, error: runtimeError, history, language, grade \}\)/);
  assert.match(page, /JSON\.stringify\(\{ action: 'fix',[^}]*language, grade \}\)/);
});

test('Gemini receives the selected language as a system instruction for all learner-facing text', () => {
  assert.match(route, /REQUIRED LEARNER-FACING LANGUAGE/);
  assert.match(route, /TARGET LEARNER LEVEL/);
  assert.match(route, /TARGET LEARNER LEVEL: \$\{targetGrade\}/);
  assert.match(route, /every question in a multi-question activity/);
  assert.match(route, /answer choices/);
  assert.match(route, /feedback/);
  assert.match(route, /systemInstruction:[\s\S]*languageInstruction/);
});

test('non-English generation is not silently replaced by the English sample in fake mode', () => {
  assert.match(route, /targetLanguage !== 'English'/);
  assert.match(route, /Language-specific generation needs live Gemini/);
});

test('selected language is saved and restored with activities and versions', () => {
  assert.match(createApi, /language: normalizeActivityLanguage\(body\.language\)/);
  assert.match(updateApi, /language: normalizeActivityLanguage\(body\.language\)/);
  assert.match(schema, /language text not null default 'English'/);
  assert.match(migration, /add column if not exists language/);
});

test('generation route validates and uses the selected school grade', () => {
  assert.match(route, /grade\?: unknown/);
  assert.match(route, /Grade \(\[1-9\]\|1\[0-2\]\)/);
  assert.ok(route.includes('Adjust vocabulary, sentence length, reading load, abstraction'));
  assert.match(route, /targetGrade, request\.signal/);
});
