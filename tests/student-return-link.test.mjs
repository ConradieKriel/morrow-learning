import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const studentPage = await read('app/student/page.tsx');
const publicRoute = await read('app/a/[slug]/page.tsx');
const activityComponent = await read('components/public-activity.tsx');

test('activities opened from the student dashboard carry the return marker', () => {
  assert.match(studentPage, /\?from=student-home/);
});

test('shared activity page only enables the student return link for the dashboard marker', () => {
  assert.match(publicRoute, /query\.from === 'student-home'/);
  assert.match(activityComponent, /showStudentHomeLink/);
  assert.match(activityComponent, /href="\/student"/);
});
