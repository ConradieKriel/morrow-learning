const MAX_HTML_LENGTH = 180_000;
const SHARE_SLUG_LENGTH = 16;

export function validateGeneratedHtml(input: unknown): string {
  if (typeof input !== 'string') throw new Error('The activity generator did not return HTML. Please try again.');
  const html = input.trim();
  if (html.length < 80) throw new Error('The generated activity looks incomplete. Please try again.');
  if (html.length > MAX_HTML_LENGTH) throw new Error('The generated activity is too large. Ask for a smaller activity.');
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new Error('The AI response was not a complete HTML page. Please generate it again.');
  }
  return html;
}

// The activity is always hosted in an opaque-origin iframe with allow-scripts only.
// This helper adds a restrictive CSP and a small error-reporting bridge to the document.
export function prepareSandboxHtml(html: string): string {
  const securityMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">`;
  const bridge = `<script>
(() => {
  const send = (message) => {
    try { window.parent.postMessage({ source: 'morrow-activity', type: 'runtime-error', message: String(message || 'Unknown activity error').slice(0, 1200) }, '*'); } catch (_) {}
  };
  window.onerror = (message, source, line, column, error) => { send((error && error.stack) || (message + ' at ' + line + ':' + column)); return false; };
  window.addEventListener('unhandledrejection', (event) => send((event.reason && (event.reason.stack || event.reason.message)) || event.reason));
  const originalError = console.error.bind(console);
  console.error = (...args) => { send(args.map((item) => typeof item === 'string' ? item : (item && item.message) || String(item)).join(' ')); originalError(...args); };
  window.reportScore = (score, maxScore) => {
    const safeScore = Number(score); const safeMax = Number(maxScore);
    if (Number.isFinite(safeScore) && Number.isFinite(safeMax) && safeMax > 0) {
      window.parent.postMessage({ source: 'morrow-activity', type: 'score', score: Math.max(0, Math.min(safeScore, safeMax)), maxScore: safeMax }, '*');
    }
  };
})();
</script>`;

  // Put the CSP before any model-generated markup or script, including markup placed
  // before a conventional <head>. The iframe remains sandboxed with an opaque origin.
  const doctype = html.match(/^\s*<!doctype\s+html\s*>/i)?.[0] || '<!doctype html>';
  const remainder = html.replace(/^\s*<!doctype\s+html\s*>/i, '');
  const prelude = `${securityMeta}${bridge}`;
  const result = `${doctype}${prelude}${remainder}`;
  return result;
}

export function makeShortSlug(): string {
  // 16 base-62 characters provide roughly 95 bits of entropy while staying shareable.
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = new Uint8Array(SHARE_SLUG_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}
