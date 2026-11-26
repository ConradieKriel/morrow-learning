import { getRequestContext, jsonError } from '@/lib/supabase-server';
import { SAMPLE_ACTIVITY_HTML } from '@/lib/sample-activity';
import { validateGeneratedHtml } from '@/lib/html-sandbox';
import { normalizeActivityLanguage } from '@/lib/activity-languages';
import { consumeRateLimit, isSameOriginMutation, privateJson, readJsonBody } from '@/lib/api-security';

export const runtime = 'nodejs';
// Keep a margin below Vercel's 300-second Hobby function ceiling.
// Providers are tried one at a time, with a bounded total time and idle-stream timeout.
export const maxDuration = 260;

const PROVIDER_TIMEOUT_MS = 105_000;
const PROVIDER_HEADER_TIMEOUT_MS = 20_000;
const PROVIDER_IDLE_TIMEOUT_MS = 45_000;

class ProviderHttpError extends Error {
  constructor(public provider: string, public status: number, message: string) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

function canFallbackFromProvider(error: unknown): error is ProviderHttpError {
  return error instanceof ProviderHttpError && [400, 401, 403, 404, 408, 409, 413, 422, 429, 500, 502, 503, 504].includes(error.status);
}

type SseParser = (payload: string) => string;

async function readSseText(
  body: ReadableStream<Uint8Array>,
  provider: string,
  signal: AbortSignal,
  parsePayload: SseParser,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      output += parsePayload(payload);
    } catch (error) {
      if (error instanceof ProviderHttpError) throw error;
      throw new ProviderHttpError(provider, 502, `${provider} returned an unreadable streaming response.`);
    }
  };

  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abortHandler: (() => void) | undefined;
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new ProviderHttpError(provider, 504, `${provider} stopped sending output for ${PROVIDER_IDLE_TIMEOUT_MS / 1000} seconds.`)), PROVIDER_IDLE_TIMEOUT_MS);
            abortHandler = () => reject(new ProviderHttpError(provider, 504, `${provider} exceeded its ${PROVIDER_TIMEOUT_MS / 1000}-second generation limit.`));
            signal.addEventListener('abort', abortHandler, { once: true });
            if (signal.aborted) abortHandler();
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
        if (abortHandler) signal.removeEventListener('abort', abortHandler);
      }

      if (result.done) {
        buffer += decoder.decode();
        if (buffer) consumeLine(buffer);
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) consumeLine(line);
      if (signal.aborted) {
        throw new ProviderHttpError(provider, 504, `${provider} exceeded its ${PROVIDER_TIMEOUT_MS / 1000}-second generation limit.`);
      }
    }
  } catch (error) {
    try { await reader.cancel(error); } catch { /* The upstream may already be closed. */ }
    if (signal.aborted && !(error instanceof ProviderHttpError)) {
      throw new ProviderHttpError(provider, 504, `${provider} exceeded its ${PROVIDER_TIMEOUT_MS / 1000}-second generation limit.`);
    }
    if (error instanceof ProviderHttpError) throw error;
    throw new ProviderHttpError(provider, 503, `${provider} stopped while generating the activity: ${error instanceof Error ? error.message : 'stream error'}`);
  } finally {
    reader.releaseLock();
  }

  if (!output.trim()) throw new ProviderHttpError(provider, 502, `${provider} finished without returning any activity content.`);
  return output;
}

async function fetchProviderResponse(
  url: string,
  init: RequestInit,
  provider: string,
  requestSignal: AbortSignal,
): Promise<{ response: Response; signal: AbortSignal }> {
  const totalTimeout = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  const headerTimeout = new AbortController();
  const signal = AbortSignal.any([requestSignal, totalTimeout]);
  const fetchSignal = AbortSignal.any([signal, headerTimeout.signal]);
  const timer = setTimeout(() => headerTimeout.abort(), PROVIDER_HEADER_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: fetchSignal });
  } catch (error) {
    if (requestSignal.aborted) throw new Error('The generation request was cancelled because the page was closed or refreshed.');
    if (headerTimeout.signal.aborted) throw new ProviderHttpError(provider, 504, `${provider} did not start responding within ${PROVIDER_HEADER_TIMEOUT_MS / 1000} seconds.`);
    if (totalTimeout.aborted) throw new ProviderHttpError(provider, 504, `${provider} exceeded its ${PROVIDER_TIMEOUT_MS / 1000}-second generation limit.`);
    throw new ProviderHttpError(provider, 503, `${provider} could not be reached: ${error instanceof Error ? error.message : 'network error'}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new ProviderHttpError(provider, response.status || 502, `${provider} request failed (${response.status}). ${detail.slice(0, 700)}`);
  }
  return { response, signal };
}

const SYSTEM_PROMPT = `You are the activity creator inside Morrow, a small classroom learning tool. Return exactly one complete, standalone HTML document and nothing else. The document must contain its own HTML, CSS and JavaScript. Do not use Markdown fences. Create the kind of activity the teacher describes: it can be a game, simulation, interactive diagram, branching story, drag-and-drop activity, practice exercise, virtual lab, puzzle, or other useful learning experience. Do not default to a multiple-choice quiz unless the teacher asks for one.

The activity is for school learners and must work on a phone. Use plain HTML, CSS and vanilla JavaScript. Do not make network requests, use fetch/WebSocket/import, load external scripts/styles/images/fonts, store data, add authentication, add server code, or connect to databases. All assets must be made with HTML, CSS, emoji or inline SVG. Keep all code in this one page. Use clear instructions, readable text, accessible buttons and visible feedback. Avoid excessive animations. Use a friendly, ordinary classroom style, not an over-designed corporate interface.

The host runs this page in an iframe sandbox. You may call window.reportScore(score, maxScore) if the learner completes an activity and a score is appropriate. Do not try to access parent documents, cookies, storage, or browser APIs outside the activity. Never include secret keys. Keep the full document reasonably compact and syntactically valid. Return the complete HTML from <!doctype html> to </html>.`;

function textStream(text: string) {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 900) chunks.push(text.slice(i, i + 900));
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, 18));
      }
      controller.close();
    },
  });
}

type RefinementMessage = { role: 'teacher' | 'morrow'; text: string };

async function streamGemini(prompt: string, currentHtml: string, action: string, errorText: string, history: RefinementMessage[], targetLanguage: string, targetGrade: string, requestSignal: AbortSignal) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini is not configured yet. Add GEMINI_API_KEY to your environment variables.');
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const languageInstruction = `REQUIRED LEARNER-FACING LANGUAGE: ${targetLanguage}. This setting is authoritative. Write ALL learner-visible content in ${targetLanguage}, not just the heading or introduction. This includes the activity title, descriptions, questions, every question in a multi-question activity, answer choices, explanations, hints, feedback, instructions, button labels, navigation labels, success/error messages and any text rendered after the learner interacts. The teacher may write their request in English or another language; understand the request, but create the actual activity in ${targetLanguage}. Do not leave question stems or answer choices in English. Do not add English translations unless the teacher requests a bilingual activity. Preserve proper names, standard scientific symbols, equations and code identifiers where appropriate, but explain them in ${targetLanguage}. Before returning the HTML, review every visible text node and every JavaScript-generated message and translate any learner-facing wording that is still in another spoken language. Set the root HTML lang attribute to the appropriate language tag when one exists.`;
  const gradeInstruction = targetGrade === 'Any grade'
    ? `TARGET LEARNER LEVEL: Any grade. The teacher has not selected a specific grade. Make the activity broadly accessible, explain subject-specific vocabulary, avoid assuming advanced prior knowledge, and offer a gentle progression from introductory to more challenging parts where useful. Do not label the activity as Grade 7 or assume a particular age.`
    : `TARGET LEARNER LEVEL: ${targetGrade} in the South African school system. This grade selection is authoritative and must shape the actual content, not merely appear in the title. Adjust vocabulary, sentence length, reading load, abstraction, prerequisite knowledge, examples, number complexity, scaffolding, instructions and expected independence to be appropriate for ${targetGrade}. Keep concepts and tasks suitable for learners at this grade. Do not silently change the target grade. If the teacher asks for a more challenging or easier activity, adjust difficulty within ${targetGrade} rather than switching to a different grade. Review every question, answer option, explanation and interaction against this level.`;
  const taskPrompt = action === 'fix'
    ? `Fix the runtime error in this activity. Return the entire corrected HTML page, not a patch. Keep all learner-facing content in the required language. Error: ${errorText}\n\nCurrent HTML:\n${currentHtml}`
    : action === 'refine'
      ? `Improve the current activity as requested. Return the entire updated HTML document. Keep its working features unless the change requires adjusting them. Keep the entire activity, including all existing questions and answer choices, in the required language.\n\nEarlier refinement conversation:\n${history.map((item) => `${item.role === 'teacher' ? 'Teacher' : 'Morrow'}: ${item.text}`).join('\n')}\n\nLatest teacher request: ${prompt}\n\nCurrent HTML:\n${currentHtml}`
      : `Create a new interactive learning activity from this teacher request. Follow the teacher's requested activity type and requirements rather than copying a sample or default activity.\n\nTeacher request: ${prompt}`;
  const fullPrompt = `${languageInstruction}\n\n${gradeInstruction}\n\n${taskPrompt}`;

  const { response, signal } = await fetchProviderResponse(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${languageInstruction}\n\n${gradeInstruction}` }] },
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: 12000, thinkingConfig: { thinkingLevel: 'low' } },
      }),
    },
    'Gemini',
    requestSignal,
  );

  const html = await readSseText(response.body!, 'Gemini', signal, (payload) => {
    const parsed = JSON.parse(payload) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { code?: number; message?: string } };
    if (parsed.error) throw new ProviderHttpError('Gemini', parsed.error.code || 502, parsed.error.message || 'Gemini returned an error in its stream.');
    return parsed.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  });
  try { return textStream(validateGeneratedHtml(html)); }
  catch (error) { throw new ProviderHttpError('Gemini', 502, error instanceof Error ? error.message : 'Gemini returned an incomplete activity.'); }
}

async function streamGroq(prompt: string, currentHtml: string, action: string, errorText: string, history: RefinementMessage[], targetLanguage: string, targetGrade: string, requestSignal: AbortSignal) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Groq is not configured. Add GROQ_API_KEY to your environment variables.');
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const languageInstruction = `REQUIRED LEARNER-FACING LANGUAGE: ${targetLanguage}. This setting is authoritative. Write ALL learner-visible content in ${targetLanguage}, including questions, answer choices, explanations, hints, feedback, instructions and button labels. Understand a teacher prompt written in another language, but create the activity in ${targetLanguage}. Do not leave learner-facing text in English unless English is selected. Preserve proper names, scientific symbols and equations where appropriate. Set the root HTML lang attribute to the appropriate language tag.`;
  const gradeInstruction = targetGrade === 'Any grade'
    ? 'TARGET LEARNER LEVEL: Any grade. Make the activity broadly accessible, explain subject-specific vocabulary and avoid assuming advanced prior knowledge.'
    : `TARGET LEARNER LEVEL: ${targetGrade} in the South African school system. Adjust vocabulary, sentence length, abstraction, prerequisite knowledge, examples, number complexity, scaffolding and expected independence to this grade. Do not silently change the target grade.`;
  const taskPrompt = action === 'fix'
    ? `Fix the runtime error in this activity. Return the entire corrected HTML page, not a patch. Error: ${errorText}\n\nCurrent HTML:\n${currentHtml}`
    : action === 'refine'
      ? `Improve the current activity as requested. Return the entire updated HTML document and keep working features.\n\nEarlier refinement conversation:\n${history.map((item) => `${item.role === 'teacher' ? 'Teacher' : 'Morrow'}: ${item.text}`).join('\n')}\n\nLatest teacher request: ${prompt}\n\nCurrent HTML:\n${currentHtml}`
      : `Create a new interactive learning activity from this teacher request. Follow the teacher's requested activity type rather than defaulting to multiple choice.\n\nTeacher request: ${prompt}`;
  const { response, signal } = await fetchProviderResponse(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n${languageInstruction}\n\n${gradeInstruction}` },
          { role: 'user', content: `${languageInstruction}\n\n${gradeInstruction}\n\n${taskPrompt}` },
        ],
        stream: true,
        max_completion_tokens: 12000,
        reasoning_effort: 'low',
      }),
    },
    'Groq',
    requestSignal,
  );

  const html = await readSseText(response.body!, 'Groq', signal, (payload) => {
    const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string | null } }>; error?: { message?: string } };
    if (parsed.error) throw new ProviderHttpError('Groq', 502, parsed.error.message || 'Groq returned an error in its stream.');
    return parsed.choices?.[0]?.delta?.content || '';
  });
  try { return textStream(validateGeneratedHtml(html)); }
  catch (error) { throw new ProviderHttpError('Groq', 502, error instanceof Error ? error.message : 'Groq returned an incomplete activity.'); }
}

export async function POST(request: Request) {
  const auth = await getRequestContext(request);
  if (!auth) return jsonError('Please sign in first.', 401);
  if (auth.profile.role !== 'teacher') return jsonError('Only teachers can generate activities.', 403);
  if (!isSameOriginMutation(request)) return jsonError('This request origin is not allowed.', 403);

  const shortWindow = await consumeRateLimit(auth.supabase, 'gemini-generate', 10);
  if (shortWindow === 'unavailable') return jsonError('Security rate limiting is unavailable. Apply the security migration in Supabase before generating.', 503);
  if (shortWindow === 'limited') return jsonError('You have reached the activity generation limit. Please wait 10 minutes and try again.', 429);
  const dailyWindow = await consumeRateLimit(auth.supabase, 'gemini-daily', 60);
  if (dailyWindow === 'unavailable') return jsonError('Security rate limiting is unavailable. Apply the security migration in Supabase before generating.', 503);
  if (dailyWindow === 'limited') return jsonError('You have reached the daily generation limit. Please try again tomorrow.', 429);

  let body: { prompt?: string; currentHtml?: string; action?: string; error?: string; history?: unknown; language?: unknown; grade?: unknown };
  try { body = await readJsonBody(request, 220_000); } catch (error) { return jsonError(error instanceof Error ? error.message : 'The generation request was not valid.'); }
  const action = body.action || 'create';
  const targetLanguage = normalizeActivityLanguage(body.language);
  const requestedGrade = typeof body.grade === 'string' ? body.grade.trim() : '';
  const targetGrade = requestedGrade === 'Any grade' || /^Grade ([1-9]|1[0-2])$/.test(requestedGrade) ? requestedGrade : 'Any grade';
  const prompt = String(body.prompt || '').trim().slice(0, 12_000);
  const currentHtml = String(body.currentHtml || '').slice(0, 180_000);
  const runtimeError = String(body.error || '').slice(0, 2000);
  const history: RefinementMessage[] = Array.isArray(body.history)
    ? body.history.slice(-8).flatMap((item): RefinementMessage[] => {
        if (!item || typeof item !== 'object') return [];
        const message = item as { role?: unknown; text?: unknown };
        if ((message.role !== 'teacher' && message.role !== 'morrow') || typeof message.text !== 'string') return [];
        return [{ role: message.role, text: message.text.slice(0, 1500) }];
      })
    : [];
  if (action !== 'fix' && !prompt) return jsonError('Describe the activity you would like to make.');
  if ((action === 'refine' || action === 'fix') && currentHtml.length < 80) return jsonError('There is no complete activity to update yet.');

  const fakeMode = process.env.MORROW_FAKE_MODE !== 'false';
  if (fakeMode) {
    // Fake mode is intentionally saved sample output for interface testing. It never calls a live AI provider.
    // Avoid silently showing an English sample when the teacher selected another language.
    if (targetLanguage !== 'English') return jsonError('Language-specific generation needs live AI. Set MORROW_FAKE_MODE=false and add GEMINI_API_KEY or GROQ_API_KEY to generate in the selected language.', 409);
    return new Response(textStream(SAMPLE_ACTIVITY_HTML), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'X-Morrow-Mode': 'sample', 'Vary': 'Authorization' },
    });
  }

  try {
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasGroq = Boolean(process.env.GROQ_API_KEY);
    if (!hasGemini && !hasGroq) return jsonError('No live AI provider is configured. Add GEMINI_API_KEY or GROQ_API_KEY in Vercel.', 503);

    let stream: ReadableStream<Uint8Array>;
    let provider: 'groq' | 'gemini' | 'gemini-backup';
    // Prefer Groq when configured because it is intended to return activities quickly.
    // Gemini remains the automatic backup if Groq rejects, stalls, or returns no usable output.
    if (hasGroq) {
      try {
        stream = await streamGroq(prompt, currentHtml, action, runtimeError, history, targetLanguage, targetGrade, request.signal);
        provider = 'groq';
      } catch (primaryError) {
        if (!hasGemini || !canFallbackFromProvider(primaryError) || request.signal.aborted) throw primaryError;
        try {
          stream = await streamGemini(prompt, currentHtml, action, runtimeError, history, targetLanguage, targetGrade, request.signal);
          provider = 'gemini-backup';
        } catch (backupError) {
          const firstMessage = primaryError instanceof Error ? primaryError.message : 'Groq failed.';
          const backupMessage = backupError instanceof Error ? backupError.message : 'Gemini failed.';
          throw new ProviderHttpError('AI providers', 502, `Groq could not finish the activity (${firstMessage}). Gemini backup also failed (${backupMessage}).`);
        }
      }
    } else {
      stream = await streamGemini(prompt, currentHtml, action, runtimeError, history, targetLanguage, targetGrade, request.signal);
      provider = 'gemini';
    }
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'X-Morrow-Mode': provider, 'Vary': 'Authorization' },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'The AI provider could not create this activity.', 502);
  }
}
