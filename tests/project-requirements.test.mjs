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

test('teachers can sign in or create a teacher account on the same screen', async () => {
  const page = await read('app/page.tsx');
  assert.match(page, /signInWithPassword/);
  assert.match(page, /signUp\(/);
  assert.match(page, /auth\.signUp/);
  assert.match(page, /Create teacher account/);
  assert.doesNotMatch(page, /\/student/);
});

test('database schema enables RLS and separates teacher permissions', async () => {
  const sql = await read('supabase/schema.sql');
  assert.match(sql, /alter table public\.activities enable row level security/i);
  assert.match(sql, /Teachers can create their own activities/i);
  assert.match(sql, /Teachers can update their own activities/i);
  assert.match(sql, /Teachers can read their own versions/i);
});

test('new Auth users automatically receive teacher-only profiles', async () => {
  const sql = await read('supabase/schema.sql');
  const migration = await read('supabase/migrations/20261126_teacher_accounts_only.sql');
  assert.match(sql, /role text not null default 'teacher' check \(role = 'teacher'\)/);
  assert.match(sql, /after insert on auth\.users/i);
  assert.match(sql, /handle_new_teacher_profile/);
  assert.match(migration, /delete from auth\.users/i);
  assert.match(migration, /old_profile\.role = 'student'/i);
  assert.match(migration, /role = 'teacher'/);
  assert.match(migration, /drop policy if exists \"Students read published activities for their grade\"/i);
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
