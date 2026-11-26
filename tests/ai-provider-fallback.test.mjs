import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Groq is the primary provider when configured and Gemini is the backup', async () => {
  const route = await read('app/api/generate/route.ts');
  const config = await read('app/api/config/route.ts');
  assert.match(route, /GROQ_API_KEY/);
  assert.match(route, /GEMINI_API_KEY/);
  assert.match(route, /api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.match(route, /provider = 'gemini-backup'/);
  assert.match(route, /if \(hasGroq\)[\s\S]*?streamGroq[\s\S]*?streamGemini/);
  assert.match(route, /\[400, 401, 403, 404, 408, 409, 413, 422, 429, 500, 502, 503, 504\]/);
  assert.match(config, /primaryProvider: process\.env\.GROQ_API_KEY \? 'groq' : 'gemini'/);
});

test('provider output is fully checked before it is returned to the browser', async () => {
  const route = await read('app/api/generate/route.ts');
  assert.match(route, /async function readSseText/);
  assert.match(route, /PROVIDER_IDLE_TIMEOUT_MS = 45_000/);
  assert.match(route, /PROVIDER_TIMEOUT_MS = 105_000/);
  assert.match(route, /validateGeneratedHtml\(html\)/);
  assert.match(route, /Gemini backup also failed/);
  assert.match(route, /export const maxDuration = 260/);
});

test('AI keys are not exposed as public environment variables', async () => {
  const env = await read('.env.example');
  assert.match(env, /^GEMINI_API_KEY=/m);
  assert.match(env, /^GROQ_API_KEY=/m);
  assert.doesNotMatch(env, /^NEXT_PUBLIC_(?:GEMINI|GROQ)_API_KEY=/m);
});
