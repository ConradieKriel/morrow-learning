import { privateJson } from '@/lib/api-security';

export async function GET() {
  return privateJson({
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    fakeMode: process.env.MORROW_FAKE_MODE !== 'false',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  });
}
