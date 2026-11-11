import { getRequestContext, jsonError } from '@/lib/supabase-server';
import { validateGeneratedHtml } from '@/lib/html-sandbox';
import { normalizeActivityLanguage } from '@/lib/activity-languages';
import { consumeRateLimit, isSameOriginMutation, privateJson, readJsonBody } from '@/lib/api-security';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await getRequestContext(request);
  if (!auth) return jsonError('Please sign in first.', 401);
  if (auth.profile.role !== 'teacher') return jsonError('Only teachers can edit activities.', 403);

  const { data, error } = await auth.supabase.from('activities').select('*').eq('id', id).single();
  if (error || !data) return jsonError('Activity not found.', 404);
  return privateJson({ activity: data });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await getRequestContext(request);
  if (!auth) return jsonError('Please sign in first.', 401);
  if (auth.profile.role !== 'teacher') return jsonError('Only teachers can edit activities.', 403);
  if (!isSameOriginMutation(request)) return jsonError('This request origin is not allowed.', 403);
  const limit = await consumeRateLimit(auth.supabase, 'activity-write', 80);
  if (limit === 'unavailable') return jsonError('Security rate limiting is unavailable. Apply the security migration in Supabase first.', 503);
  if (limit === 'limited') return jsonError('Too many changes in a short period. Please wait and try again.', 429);

  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 200_000);
    const html = validateGeneratedHtml(body.html);
    const { data: current, error: readError } = await auth.supabase.from('activities')
      .select('id,current_version').eq('id', id).single();
    if (readError || !current) return jsonError('Activity not found.', 404);

    const nextVersion = Number(current.current_version || 0) + 1;
    const { data: updated, error } = await auth.supabase.from('activities').update({
      html,
      title: String(body.title || '').trim().slice(0, 120) || 'Untitled activity',
      subject: String(body.subject || 'Other').slice(0, 80),
      grade: String(body.grade || 'Any grade').slice(0, 30),
      description: String(body.description || '').slice(0, 2000),
      language: normalizeActivityLanguage(body.language),
      current_version: nextVersion,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error || !updated) return jsonError(error?.message || 'Could not update this activity.', 500);

    const { error: versionError } = await auth.supabase.from('activity_versions').insert({
      activity_id: id,
      teacher_id: auth.user.id,
      version: nextVersion,
      html,
      prompt: String(body.prompt || '').slice(0, 4000),
      language: normalizeActivityLanguage(body.language),
      change_note: String(body.changeNote || 'Saved changes').slice(0, 160),
    });
    if (versionError) return jsonError(`Activity saved, but version history could not be updated: ${versionError.message}`, 500);
    return privateJson({ activity: updated });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not update this activity.');
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await getRequestContext(_request);
  if (!auth) return jsonError('Please sign in first.', 401);
  if (auth.profile.role !== 'teacher') return jsonError('Only teachers can delete activities.', 403);
  if (!isSameOriginMutation(_request)) return jsonError('This request origin is not allowed.', 403);
  const limit = await consumeRateLimit(auth.supabase, 'activity-write', 80);
  if (limit === 'unavailable') return jsonError('Security rate limiting is unavailable. Apply the security migration in Supabase first.', 503);
  if (limit === 'limited') return jsonError('Too many changes in a short period. Please wait and try again.', 429);
  const { error } = await auth.supabase.from('activities').delete().eq('id', id);
  if (error) return jsonError(error.message, 500);
  return privateJson({ success: true });
}
