import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Gemini remains the primary provider and Groq is configured as a backup', async () => {
  const route = await read('app/api/generate/route.ts');
  const config = await read('app/api/config/route.ts');
  assert.match(route, /GEMINI_API_KEY/);
  assert.match(route, /GROQ_API_KEY/);
  assert.match(route, /api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.match(route, /provider = 'groq-backup'/);
  assert.match(route, /\[408, 429, 500, 502, 503, 504\]/);
  assert.match(config, /groqConfigured: Boolean\(process\.env\.GROQ_API_KEY\)/);
});

test('AI keys are not exposed as public environment variables', async () => {
  const env = await read('.env.example');
  assert.match(env, /^GEMINI_API_KEY=/m);
  assert.match(env, /^GROQ_API_KEY=/m);
  assert.doesNotMatch(env, /^NEXT_PUBLIC_(?:GEMINI|GROQ)_API_KEY=/m);
});
