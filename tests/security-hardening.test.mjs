import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('anonymous clients cannot enumerate published activities through table grants', async () => {
  const sql = await read('supabase/migrations/20261112_security_hardening.sql');
  assert.match(sql, /revoke all on table public\.activities from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.activities to authenticated/i);
  assert.match(sql, /create policy "Students read published activities for their grade"/i);
  assert.match(sql, /activities\.grade = p\.grade or public\.activities\.grade = 'Any grade'/i);
});

test('public page performs a direct select limited by the request-scoped RLS share slug', async () => {
  const page = await read('app/a/[slug]/page.tsx');
  const sql = await read('supabase/migrations/20261112_security_hardening.sql');
  assert.match(page, /getPublicSupabase\(slug\)/);
  assert.match(page, /from\('activities'\)/);
  assert.match(page, /eq\('public_slug', slug\)/);
  assert.match(page, /eq\('is_published', true\)/);
  assert.doesNotMatch(page, /get_public_activity/);
  assert.match(sql, /current_setting\('request\.headers', true\)::jsonb ->> 'x-morrow-share-slug'/i);
  assert.match(sql, /grant select \(title, subject, grade, language, html, public_slug, is_published\) on table public\.activities to anon/i);
  assert.doesNotMatch(sql, /language\s+plpgsql\s+security\s+definer/i);
  assert.match(sql, /DROP FUNCTION %s/i);
});

test('security migration drops every pre-existing policy before installing its allowlist', async () => {
  const migration = await read('supabase/migrations/20261112_security_hardening.sql');
  const schema = await read('supabase/schema.sql');
  for (const sql of [migration, schema]) {
    assert.match(sql, /from pg_policies[\s\S]*tablename in \('profiles', 'activities', 'activity_versions'\)/i);
    assert.match(sql, /drop policy %I on %I\.%I/i);
    assert.match(sql, /revoke all \(%I\) on table public\.%I from public, anon, authenticated/i);
    assert.match(sql, /grant select \(title, subject, grade, language, html, public_slug, is_published\) on table public\.activities to anon/i);
  }
  assert.match(migration, /tablename = 'api_rate_limits'/i);
});

test('API rate limiting is implemented in Postgres and applied to Gemini generation', async () => {
  const helper = await read('lib/api-security.ts');
  const generate = await read('app/api/generate/route.ts');
  const migration = await read('supabase/migrations/20261112_security_hardening.sql');
  assert.match(helper, /consume_rate_limit/);
  assert.match(generate, /gemini-generate/);
  assert.match(generate, /gemini-daily/);
  assert.match(migration, /create table if not exists public\.api_rate_limits/i);
  assert.match(migration, /security invoker[\s\S]*set search_path = ''/i);
  assert.match(migration, /protect_api_rate_limit/);
});

test('API mutations enforce same-origin checks and bounded JSON request sizes', async () => {
  const helper = await read('lib/api-security.ts');
  const save = await read('app/api/activities/route.ts');
  assert.match(helper, /isSameOriginMutation/);
  assert.match(helper, /maxBytes/);
  assert.match(helper, /reader\.read\(\)/);
  assert.match(save, /isSameOriginMutation\(request\)/);
  assert.match(save, /readJsonBody<Record<string, unknown>>/);
});

test('tokens are strictly parsed and private API responses are not cacheable', async () => {
  const server = await read('lib/supabase-server.ts');
  const helper = await read('lib/api-security.ts');
  assert.match(server, /Bearer\\s\+/);
  assert.match(server, /getUser\(token\)/);
  assert.match(helper, /private, no-store/);
});

test('security headers and framework security patch are present', async () => {
  const config = await read('next.config.ts');
  const pkg = JSON.parse(await read('package.json'));
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /Strict-Transport-Security/);
  assert.equal(pkg.dependencies.next, '15.5.29');
  assert.equal(pkg.dependencies.react, '19.3.1');
});

test('Git ignores local environment files and private key material but keeps example template', async () => {
  const gitignore = await read('.gitignore');
  assert.match(gitignore, /^\.env\*/m);
  assert.match(gitignore, /!\.env\.example/);
  assert.match(gitignore, /\*\.pem/);
  assert.match(gitignore, /\.vercel\//);
  assert.match(gitignore, /\*\.dump/);
  assert.match(gitignore, /\*\.sqlite/);
  assert.match(gitignore, /\.npmrc/);
});

test('GitHub CI uses least-privilege permissions and verifies dependencies, tests and production build', async () => {
  const workflow = await read('.github/workflows/ci.yml');
  const dependabot = await read('.github/dependabot.yml');
  const setup = await read('docs/GITHUB-SETUP.md');
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run build/);
  assert.match(dependabot, /package-ecosystem:\s+npm/);
  assert.match(setup, /\.env\.local/);
  assert.match(setup, /git diff --cached/);
  assert.match(setup, /package-lock\.json/);
});

test('Vercel guide keeps Gemini key server-only and documents production environment setup', async () => {
  const guide = await read('docs/VERCEL-SETUP.md');
  assert.match(guide, /GEMINI_API_KEY/);
  assert.match(guide, /server-side only/);
  assert.match(guide, /Preview environment/);
  assert.match(guide, /Production/);
  assert.doesNotMatch(guide, /NEXT_PUBLIC_GEMINI_API_KEY/);
});

test('teachers can revoke a public activity link so a leaked link stops working', async () => {
  const route = await read('app/api/activities/[id]/share/route.ts');
  const page = await read('app/page.tsx');
  assert.match(route, /export async function DELETE/);
  assert.match(route, /public_slug: null, is_published: false/);
  assert.match(page, /async function revokeShareLink/);
  assert.match(page, /method: 'DELETE'/);
  assert.match(page, /Revoke link/);
});

test('database security regression checks cover RLS, grants and invoker-only rate limit functions', async () => {
  const sql = await read('supabase/tests/security_policy_checks.sql');
  assert.match(sql, /relrowsecurity/);
  assert.match(sql, /has_table_privilege\('anon', 'public\.activities', 'SELECT'\)/);
  assert.match(sql, /get_public_activity/);
  assert.match(sql, /prosecdef/);
  assert.match(sql, /x-morrow-share-slug/);
});

test('host application has additional clickjacking and object/base restrictions without blocking inline sandbox activities', async () => {
  const config = await read('next.config.ts');
  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /object-src 'none'/);
  assert.match(config, /base-uri 'none'/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.doesNotMatch(config, /script-src/);
});

test('API helpers reject cross-origin mutations and oversized or non-JSON bodies', async () => {
  const { isSameOriginMutation, readJsonBody } = await import('../lib/api-security.ts');
  assert.equal(isSameOriginMutation(new Request('https://morrow.test/api/write', { headers: { origin: 'https://morrow.test' } })), true);
  assert.equal(isSameOriginMutation(new Request('https://morrow.test/api/write', { headers: { origin: 'https://attacker.test' } })), false);
  assert.equal(isSameOriginMutation(new Request('https://morrow.test/api/write')), true);

  const valid = new Request('https://morrow.test/api/write', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await readJsonBody(valid, 100), { ok: true });

  const oversized = new Request('https://morrow.test/api/write', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(100) }),
  });
  await assert.rejects(() => readJsonBody(oversized, 20), /too large/i);

  const wrongType = new Request('https://morrow.test/api/write', {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello',
  });
  await assert.rejects(() => readJsonBody(wrongType), /JSON/i);
});
