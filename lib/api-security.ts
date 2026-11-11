import type { SupabaseClient } from '@supabase/supabase-js';

export const PRIVATE_NO_STORE = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Authorization',
};

export function privateJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(PRIVATE_NO_STORE)) headers.set(key, value);
  return Response.json(data, { ...init, headers });
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Non-browser clients still need a valid bearer token.
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function readJsonBody<T = Record<string, unknown>>(request: Request, maxBytes = 220_000): Promise<T> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('Send this request as JSON.');
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error('This request is too large. Reduce the activity size and try again.');

  if (!request.body) throw new Error('The request body is missing.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('This request is too large. Reduce the activity size and try again.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new Error('The request body is not valid JSON.');
  }
}

export async function consumeRateLimit(
  supabase: SupabaseClient,
  action: 'gemini-generate' | 'gemini-daily' | 'activity-write' | 'share-link',
  limit: number,
): Promise<'allowed' | 'limited' | 'unavailable'> {
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_action: action,
    p_limit: limit,
  });
  if (error) return 'unavailable';
  return data === true ? 'allowed' : 'limited';
}
