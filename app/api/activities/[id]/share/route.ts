import { getRequestContext, jsonError } from '@/lib/supabase-server';
import { makeShortSlug } from '@/lib/html-sandbox';
import { consumeRateLimit, isSameOriginMutation, privateJson } from '@/lib/api-security';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await getRequestContext(request);
  if (!auth) return jsonError('Please sign in first.', 401);
  if (auth.profile.role !== 'teacher') return jsonError('Only teachers can share activities.', 403);
  if (!isSameOriginMutation(request)) return jsonError('This request origin is not allowed.', 403);
  const limit = await consumeRateLimit(auth.supabase, 'share-link', 20);
  if (limit === 'unavailable') return jsonError('Security rate limiting is unavailable. Apply the security migration in Supabase first.', 503);
  if (limit === 'limited') return jsonError('Too many share links requested. Please wait and try again.', 429);

  const { data: activity, error: readError } = await auth.supabase.from('activities')
    .select('id,public_slug').eq('id', id).single();
  if (readError || !activity) return jsonError('Activity not found.', 404);

  let slug = activity.public_slug;
  if (!slug) {
    // Retry a few times if a random slug collides with an existing link.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      slug = makeShortSlug();
      const { error } = await auth.supabase.from('activities').update({
        public_slug: slug, is_published: true, updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (!error) break;
      if (attempt === 3) return jsonError('Could not create a share link. Please try again.', 500);
      slug = null;
    }
  } else {
    const { error } = await auth.supabase.from('activities').update({ is_published: true }).eq('id', id);
    if (error) return jsonError(error.message, 500);
  }

  const configuredOrigin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const origin = (configuredOrigin ? new URL(configuredOrigin).origin : new URL(request.url).origin).replace(/\/+$/, '');
  return privateJson({ slug, url: `${origin}/a/${slug}` });
}


export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await getRequestContext(request);
  if (!auth) return jsonError('Please sign in first.', 401);
  if (auth.profile.role !== 'teacher') return jsonError('Only teachers can revoke activity links.', 403);
  if (!isSameOriginMutation(request)) return jsonError('This request origin is not allowed.', 403);
  const limit = await consumeRateLimit(auth.supabase, 'share-link', 20);
  if (limit === 'unavailable') return jsonError('Security rate limiting is unavailable. Apply the security migration in Supabase first.', 503);
  if (limit === 'limited') return jsonError('Too many share-link changes. Please wait and try again.', 429);

  const { data, error } = await auth.supabase.from('activities')
    .update({ public_slug: null, is_published: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error || !data) return jsonError('Could not revoke this share link. Check that you own the activity.', 404);
  return privateJson({ success: true });
}
