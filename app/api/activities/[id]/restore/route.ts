import { getRequestContext, jsonError } from '@/lib/supabase-server';
import { validateGeneratedHtml } from '@/lib/html-sandbox';
import { normalizeActivityLanguage } from '@/lib/activity-languages';
import { consumeRateLimit, isSameOriginMutation, privateJson, readJsonBody } from '@/lib/api-security';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await getRequestContext(request);
  if (!auth) return jsonError('Please sign in first.', 401);
  if (auth.profile.role !== 'teacher') return jsonError('Only teachers can restore versions.', 403);
  if (!isSameOriginMutation(request)) return jsonError('This request origin is not allowed.', 403);
  const limit = await consumeRateLimit(auth.supabase, 'activity-write', 80);
  if (limit === 'unavailable') return jsonError('Security rate limiting is unavailable. Apply the security migration in Supabase first.', 503);
  if (limit === 'limited') return jsonError('Too many changes in a short period. Please wait and try again.', 429);
  try {
    const body = await readJsonBody<{ versionId?: string }>(request, 8_000);
    const { data: version, error: versionReadError } = await auth.supabase.from('activity_versions')
      .select('html,version,language').eq('id', body.versionId).eq('activity_id', id).single();
    if (versionReadError || !version) return jsonError('That version could not be found.', 404);
    const html = validateGeneratedHtml(version.html);
    const { data: activity, error: activityError } = await auth.supabase.from('activities')
      .select('current_version').eq('id', id).single();
    if (activityError || !activity) return jsonError('Activity not found.', 404);
    const nextVersion = Number(activity.current_version || 0) + 1;
    const { data: updated, error } = await auth.supabase.from('activities').update({
      html, language: normalizeActivityLanguage(version.language), current_version: nextVersion, updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error || !updated) return jsonError(error?.message || 'Could not restore this version.', 500);
    const { error: saveError } = await auth.supabase.from('activity_versions').insert({
      activity_id: id, teacher_id: auth.user.id, version: nextVersion, html, language: normalizeActivityLanguage(version.language),
      prompt: `Restore version ${version.version}`, change_note: `Restored version ${version.version}`,
    });
    if (saveError) return jsonError(saveError.message, 500);
    return privateJson({ activity: updated });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not restore the version.');
  }
}
