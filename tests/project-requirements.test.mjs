import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateGeneratedHtml } from '../lib/html-sandbox.ts';
import { SAMPLE_ACTIVITY_HTML } from '../lib/sample-activity.ts';

const root = new URL('../', import.meta.url);
const read = (relativePath) => readFile(new URL(relativePath, root), 'utf8');

test('fake mode sample is a complete single-file activity', () => {
  assert.doesNotThrow(() => validateGeneratedHtml(SAMPLE_ACTIVITY_HTML));
  assert.match(SAMPLE_ACTIVITY_HTML, /<script>/i);
  assert.match(SAMPLE_ACTIVITY_HTML, /<style>/i);
});

test('the project has one login page for both user roles', async () => {
  const page = await read('app/page.tsx');
  assert.match(page, /signInWithPassword/);
  assert.match(page, /profile\.role === 'student'/);
  assert.match(page, /router\.push\('\/student'\)/);
});

test('database schema enables RLS and separates teacher permissions', async () => {
  const sql = await read('supabase/schema.sql');
  assert.match(sql, /alter table public\.activities enable row level security/i);
  assert.match(sql, /Teachers can create their own activities/i);
  assert.match(sql, /Teachers can update their own activities/i);
  assert.match(sql, /Teachers can read their own versions/i);
});

test('only one teacher test account and one student test account are configured', async () => {
  const sql = await read('supabase/schema.sql');
  assert.match(sql, /teacher@morrow\.app/i);
  assert.match(sql, /student@morrow\.app/i);
  assert.match(sql, /'Grade 7'/);
});


test('student grade access is strict and allows only Any grade as a general activity', async () => {
  const { canStudentAccessGrade } = await import('../lib/grade-access.ts');
  assert.equal(canStudentAccessGrade('Grade 7', 'Grade 7'), true);
  assert.equal(canStudentAccessGrade('Grade 7', 'Grade 6'), false);
  assert.equal(canStudentAccessGrade(null, 'Grade 7'), false);
  assert.equal(canStudentAccessGrade(null, 'Any grade'), true);
  assert.equal(canStudentAccessGrade('Grade 7', null), false);
});

test('teacher can create a saved activity without calling the AI endpoint', async () => {
  const page = await read('app/page.tsx');
  const manual = await read('lib/manual-activity.ts');
  assert.match(page, /Build without AI/);
  assert.match(page, /createWithoutAi/);
  assert.match(page, /buildManualActivityHtml/);
  assert.match(page, /\+ Add question/);
  assert.match(page, /Create \{manualQuestions.length\}-question activity/);
  assert.match(manual, /questions: ManualQuestionInput\[\]/);
  assert.match(manual, /not sent to Morrow or saved/);
});
