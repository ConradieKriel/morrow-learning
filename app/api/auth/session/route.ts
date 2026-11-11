import { getRequestContext } from '@/lib/supabase-server';
import { privateJson } from '@/lib/api-security';

export async function GET(request: Request) {
  const context = await getRequestContext(request);
  if (!context) return privateJson({ authenticated: false }, { status: 401 });
  return privateJson({ authenticated: true, user: { id: context.user.id, email: context.user.email }, profile: context.profile });
}
