import { notFound } from 'next/navigation';
import { getPublicSupabase } from '@/lib/supabase-server';
import PublicActivity from '@/components/public-activity';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Morrow Learning', description: 'A learning activity made with Morrow.' };

export default async function SharedActivityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const showStudentHomeLink = query.from === 'student-home';
  if (!/^(?:[A-Za-z0-9]{9}|[A-Za-z0-9]{16})$/.test(slug)) notFound();
  const supabase = getPublicSupabase(slug);
  if (!supabase) return <main className="center-screen"><section className="login-card"><div className="brand"><span className="brand-icon">m</span><span>morrow</span></div><h1>Morrow is not set up yet.</h1><p className="muted">The site owner needs to add the Supabase project details before shared activities can open.</p></section></main>;

  // The server-created Supabase client attaches x-morrow-share-slug.
  // RLS permits anon to read only the published row whose slug matches that header.
  const { data: activity, error } = await supabase
    .from('activities')
    .select('title,subject,grade,language,html')
    .eq('public_slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error || !activity) notFound();
  return <PublicActivity title={activity.title} subject={activity.subject} grade={activity.grade} language={activity.language || 'English'} html={activity.html} showStudentHomeLink={showStudentHomeLink} />;
}
