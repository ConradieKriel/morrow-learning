import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Profile } from './types';
import { privateJson } from './api-security';

export type RequestContext = {
  supabase: SupabaseClient;
  user: User;
  profile: Profile;
};

export function getPublicSupabase(shareSlug: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { headers: { 'x-morrow-share-slug': shareSlug } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// API calls use a verified Supabase access token. Database RLS is still applied to each query.
export async function getRequestContext(request: Request): Promise<RequestContext | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]{20,4096})$/i);
  const token = match?.[1];
  if (!url || !key || !token) return null;

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,role,grade,display_name')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile || (profile.role !== 'teacher' && profile.role !== 'student')) return null;
  return { supabase, user: authData.user, profile: profile as Profile };
}

export function jsonError(message: string, status = 400) {
  return privateJson({ error: message }, { status });
}
