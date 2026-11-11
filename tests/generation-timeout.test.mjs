import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/generate/route.ts', import.meta.url), 'utf8');

test('Gemini generation has a five-minute server allowance', () => {
  assert.match(route, /export const maxDuration = 300;/);
  assert.match(route, /const GEMINI_TIMEOUT_MS = 275_000;/);
});

test('Gemini uses low thinking effort for routine classroom activity generation', () => {
  assert.match(route, /thinkingConfig:\s*\{\s*thinkingLevel:\s*'low'\s*\}/);
  assert.doesNotMatch(route, /temperature:\s*0\.65/);
});

test('Gemini requests are cancelled if the browser request is cancelled', () => {
  assert.match(route, /AbortSignal\.any\(\[requestSignal, timeoutSignal\]\)/);
  assert.match(route, /request\.signal\)/);
});
