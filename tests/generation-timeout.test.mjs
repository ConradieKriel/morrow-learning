import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/generate/route.ts', import.meta.url), 'utf8');

test('AI provider timeouts leave margin below Vercel function limit', () => {
  assert.match(route, /export const maxDuration = 260;/);
  assert.match(route, /const PROVIDER_TIMEOUT_MS = 105_000;/);
  assert.match(route, /const PROVIDER_HEADER_TIMEOUT_MS = 20_000;/);
  assert.match(route, /const PROVIDER_IDLE_TIMEOUT_MS = 45_000;/);
});

test('stream stalls and empty output are treated as provider failures and can trigger fallback', () => {
  assert.match(route, /stopped sending output for/);
  assert.match(route, /finished without returning any activity content/);
  assert.match(route, /canFallbackFromProvider\(primaryError\)/);
});

test('provider requests are cancelled when the browser cancels generation', () => {
  assert.match(route, /AbortSignal\.any\(\[requestSignal, totalTimeout\]\)/);
  assert.match(route, /requestSignal\.aborted/);
});
