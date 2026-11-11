'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { Profile } from '@/lib/types';

type StudentActivity = { id: string; title: string; subject: string | null; grade: string | null; description: string | null; language: string | null; public_slug: string; updated_at: string };

export default function StudentHome() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activities, setActivities] = useState<StudentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { router.replace('/'); return; }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { router.replace('/'); return; }
      const sessionResponse = await fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok || session.profile?.role !== 'student') { await supabase.auth.signOut(); router.replace('/'); return; }
      const response = await fetch('/api/student/activities', { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load your activities.');
      if (active) { setProfile(session.profile); setActivities(result.activities || []); }
    }
    load().catch((error: unknown) => { if (active) setNotice(error instanceof Error ? error.message : 'Could not load the student page.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    router.replace('/');
  }

  if (loading) return <main className="center-screen"><div className="loading-card">Opening Morrow…</div></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-icon">m</span><span>morrow</span></a>
        <div className="account-area"><span>{profile?.display_name || profile?.email}</span><button className="link-button" onClick={signOut}>Sign out</button></div>
      </header>
      <main className="page-container">
        <section className="welcome-row">
          <div><p className="eyebrow">STUDENT SPACE</p><h1>Your learning activities.</h1><p className="muted">Activities shared by your teacher will appear here. Public activity links also open directly on a phone, without signing in.</p></div>
        </section>
        {notice && <p className="notice error-notice">{notice}</p>}
        <section className="section-block">
          <div className="section-heading"><div><h2>Activities for {profile?.grade || 'your class'}</h2><p>{activities.length} activities shared with your grade</p></div></div>
          {activities.length === 0 ? (
            <div className="empty-state"><h3>No activities have been shared yet</h3><p>When your teacher shares an activity for your grade, it will show up here.</p></div>
          ) : (
            <div className="activity-grid">
              {activities.map((activity) => <article className="activity-card" key={activity.id}>
                <span className="tag">{activity.subject || 'Class activity'}</span><span className="tag language-tag">{activity.language || 'English'}</span><h3>{activity.title}</h3><p>{activity.description || 'Open this activity to get started.'}</p>
                <div className="card-meta"><span>{activity.grade}</span><span>{new Date(activity.updated_at).toLocaleDateString()}</span></div>
                <div className="card-actions"><Link className="text-link" href={`/a/${activity.public_slug}?from=student-home`}>Open activity ↗</Link></div>
              </article>)}
            </div>
          )}
        </section>
      </main>
      <footer className="site-footer"><span>morrow</span><span>A little more life in every lesson.</span></footer>
    </div>
  );
}
