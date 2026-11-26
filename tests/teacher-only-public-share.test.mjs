import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('learner share pages are public and do not link into a student account area', async () => {
  const page = await read('app/a/[slug]/page.tsx');
  const component = await read('components/public-activity.tsx');
  assert.match(page, /getPublicSupabase\(slug\)/);
  assert.match(page, /is_published/);
  assert.match(component, /Made with Morrow/);
  assert.doesNotMatch(component, /\/student|student-home/);
  await assert.rejects(access(new URL('app/student/page.tsx', root)));
  await assert.rejects(access(new URL('app/api/student/activities/route.ts', root)));
});

test('server-side auth accepts teacher profiles only', async () => {
  const server = await read('lib/supabase-server.ts');
  const schema = await read('supabase/schema.sql');
  assert.match(server, /profile\.role !== 'teacher'/);
  assert.match(schema, /check \(role = 'teacher'\)/);
  assert.match(schema, /after insert on auth\.users/i);
});
