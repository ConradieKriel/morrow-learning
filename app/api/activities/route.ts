import { getRequestContext, jsonError } from '@/lib/supabase-server';
import { validateGeneratedHtml, makeShortSlug } from '@/lib/html-sandbox';
import { normalizeActivityLanguage } from '@/lib/activity-languages';
import { consumeRateLimit, isSameOriginMutation, privateJson, readJsonBody } from '@/lib/api-security';

export async function GET(request: Request) {
  const context = await getRequestContext(request);
  if (!context) return jsonError('Please sign in first.', 401);
  if (context.profile.role !== 'teacher') return jsonError('Only teachers can open this page.', 403);

  const { data, error } = await context.supabase
    .from('activities')
    .select('id,title,subject,grade,description,language,html,public_slug,is_published,current_version,created_at,updated_at')
    .eq('teacher_id', context.user.id)
    .order('updated_at', { ascending: false });
  if (error) return jsonError(error.message, 500);
  return privateJson({ activities: data || [] });
}

export async function POST(request: Request) {
  const context = await getRequestContext(request);
  if (!context) return jsonError('Please sign in first.', 401);
  if (context.profile.role !== 'teacher') return jsonError('Only teachers can save activities.', 403);
  if (!isSameOriginMutation(request)) return jsonError('This request origin is not allowed.', 403);
  const limit = await consumeRateLimit(context.supabase, 'activity-write', 80);
  if (limit === 'unavailable') return jsonError('Security rate limiting is unavailable. Apply the security migration in Supabase first.', 503);
  if (limit === 'limited') return jsonError('Too many changes in a short period. Please wait and try again.', 429);

  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 200_000);
    const title = String(body.title || '').trim().slice(0, 120);
    const html = validateGeneratedHtml(body.html);
    if (!title) return jsonError('Give your activity a title.');

    const { data: activity, error } = await context.supabase.from('activities').insert({
      teacher_id: context.user.id,
      title,
      subject: String(body.subject || 'Other').slice(0, 80),
      grade: String(body.grade || 'Any grade').slice(0, 30),
      description: String(body.description || '').slice(0, 2000),
      language: normalizeActivityLanguage(body.language),
      html,
      current_version: 1,
      is_published: false,
    }).select('*').single();

    if (error || !activity) return jsonError(error?.message || 'Could not save this activity.', 500);

    const { error: versionError } = await context.supabase.from('activity_versions').insert({
      activity_id: activity.id,
      teacher_id: context.user.id,
      version: 1,
      html,
      prompt: String(body.prompt || '').slice(0, 4000),
      language: normalizeActivityLanguage(body.language),
      change_note: 'First version',
    });

    if (versionError) {
      await context.supabase.from('activities').delete().eq('id', activity.id);
      return jsonError(versionError.message, 500);
    }

    return privateJson({ activity }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not save this activity.');
  }
}
