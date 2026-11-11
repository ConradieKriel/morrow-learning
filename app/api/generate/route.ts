import { getRequestContext, jsonError } from '@/lib/supabase-server';
import { SAMPLE_ACTIVITY_HTML } from '@/lib/sample-activity';
import { normalizeActivityLanguage } from '@/lib/activity-languages';
import { consumeRateLimit, isSameOriginMutation, privateJson, readJsonBody } from '@/lib/api-security';

export const runtime = 'nodejs';
// Allow enough time for a complete free-form HTML activity to be generated.
// Vercel Hobby supports up to 300 seconds when Fluid Compute is enabled.
export const maxDuration = 300;

const GEMINI_TIMEOUT_MS = 275_000;

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

  const timeoutSignal = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
  const combinedSignal = AbortSignal.any([requestSignal, timeoutSignal]);
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${languageInstruction}\n\n${gradeInstruction}` }] },
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        // Low thinking is quicker for routine lesson/activity creation. Teachers can
        // still ask for detailed, challenging activities in their prompt.
        generationConfig: { maxOutputTokens: 12000, thinkingConfig: { thinkingLevel: 'low' } },
      }),
      signal: combinedSignal,
    });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new Error('Gemini took too long to start generating. Try a shorter or simpler activity request.');
    }
    if (requestSignal.aborted) {
      throw new Error('The generation request was cancelled because the page was closed or refreshed.');
    }
    throw error;
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini request failed (${response.status}). ${detail.slice(0, 700)}`);
  }

  const encoder = new TextEncoder();
  const upstream = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const { value, done } = await upstream.read();
          if (done) {
            buffer += decoder.decode();
            const finalLines = buffer.split('\n');
            for (const line of finalLines) {
              if (!line.startsWith('data:')) continue;
              const raw = line.slice(5).trim();
              if (!raw || raw === '[DONE]') continue;
              const parsed = JSON.parse(raw) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
              const piece = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
              if (piece) controller.enqueue(encoder.encode(piece));
            }
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            const parsed = JSON.parse(raw) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
            const piece = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
            if (piece) controller.enqueue(encoder.encode(piece));
          }
          return;
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      if (!combinedSignal.aborted) {
        // Stop the Gemini request if the browser leaves the page.
        try { await upstream.cancel(); } catch { /* The upstream may already be closed. */ }
      }
    },
  });
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
    // Fake mode is intentionally saved sample output for interface testing. It never calls Gemini.
    // Avoid silently showing an English sample when the teacher selected another language.
    if (targetLanguage !== 'English') return jsonError('Language-specific generation needs live Gemini. Set MORROW_FAKE_MODE=false and add GEMINI_API_KEY to generate in the selected language.', 409);
    return new Response(textStream(SAMPLE_ACTIVITY_HTML), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'X-Morrow-Mode': 'sample', 'Vary': 'Authorization' },
    });
  }

  try {
    const stream = await streamGemini(prompt, currentHtml, action, runtimeError, history, targetLanguage, targetGrade, request.signal);
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'X-Morrow-Mode': 'gemini', 'Vary': 'Authorization' },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Gemini could not create this activity.', 502);
  }
}
