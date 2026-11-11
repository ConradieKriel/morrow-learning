import { getRequestContext, jsonError } from '@/lib/supabase-server';
import { privateJson } from '@/lib/api-security';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await getRequestContext(request);
  if (!auth) return jsonError('Please sign in first.', 401);
  if (auth.profile.role !== 'teacher') return jsonError('Only teachers can view version history.', 403);
  const { data, error } = await auth.supabase.from('activity_versions')
    .select('id,activity_id,version,language,prompt,change_note,created_at')
    .eq('activity_id', id).order('version', { ascending: false });
  if (error) return jsonError(error.message, 500);
  return privateJson({ versions: data || [] });
}
