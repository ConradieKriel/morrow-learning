import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateGeneratedHtml, prepareSandboxHtml, makeShortSlug } from '../lib/html-sandbox.ts';

const validHtml = '<!doctype html><html><head><title>Test</title></head><body><h1>Hello</h1><script>console.log("ok")</script></body></html>';

test('accepts a complete standalone HTML document', () => {
  assert.equal(validateGeneratedHtml(validHtml), validHtml);
});

test('rejects plain text and incomplete documents', () => {
  assert.throws(() => validateGeneratedHtml('This is plain text rather than a complete activity file. '.repeat(3)), /complete HTML page/i);
  assert.throws(() => validateGeneratedHtml('<html><body>short</body></html>'), /incomplete/i);
});

test('rejects HTML that exceeds the activity size limit', () => {
  assert.throws(() => validateGeneratedHtml(`<html><body>${'x'.repeat(181000)}</body></html>`), /too large/i);
});

test('sandbox helper injects CSP before all generated markup and an error/score bridge', () => {
  const prepared = prepareSandboxHtml(validHtml);
  assert.ok(prepared.indexOf('Content-Security-Policy') < prepared.indexOf('<title>'));
  assert.ok(prepared.indexOf('Content-Security-Policy') < prepared.indexOf('<script>console.log'));
  assert.match(prepared, /Content-Security-Policy/);
  assert.match(prepared, /connect-src 'none'/);
  assert.match(prepared, /morrow-activity/);
  assert.match(prepared, /reportScore/);
  assert.match(prepared, /unhandledrejection/);
});

test('short public link IDs are URL-safe and compact', () => {
  const slug = makeShortSlug();
  assert.equal(slug.length, 16);
  assert.match(slug, /^[A-Za-z0-9]+$/);
});

test('preview iframe uses scripts only and never grants same-origin access', async () => {
  const component = await readFile(new URL('../components/preview-frame.tsx', import.meta.url), 'utf8');
  assert.match(component, /sandbox="allow-scripts"/);
  assert.doesNotMatch(component, /allow-same-origin/);
});
