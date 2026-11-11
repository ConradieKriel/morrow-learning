'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PreviewFrame from '@/components/preview-frame';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { Activity, ActivityVersion, Profile } from '@/lib/types';
import { validateGeneratedHtml } from '@/lib/html-sandbox';
import { buildManualActivityHtml, createManualQuestion, type ManualQuestionInput } from '@/lib/manual-activity';
import { ACTIVITY_LANGUAGES, DEFAULT_ACTIVITY_LANGUAGE, normalizeActivityLanguage, type ActivityLanguage } from '@/lib/activity-languages';

type AppScreen = 'dashboard' | 'builder';
type Config = { supabaseConfigured: boolean; fakeMode: boolean; geminiConfigured: boolean; model: string };

async function readStream(response: Response, onText: (value: string) => void): Promise<string> {
  if (!response.body) throw new Error('The generation service returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      onText(fullText);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/abort|timeout|timed out|terminated|network/i.test(message)) {
      throw new Error('Gemini stopped before the activity was complete. Please try again with a shorter or simpler request. Your existing saved activity has not been changed.');
    }
    throw error;
  }
  fullText += decoder.decode();
  onText(fullText);
  return fullText.trim().replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '');
}

export default function MorrowHome() {
  const router = useRouter();
  const [config, setConfig] = useState<Config>({ supabaseConfigured: false, fakeMode: true, geminiConfigured: false, model: 'gemini-3.8-flash' });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [screen, setScreen] = useState<AppScreen>('dashboard');
  const [activeActivity, setActiveActivity] = useState<Activity | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Natural Sciences');
  const [grade, setGrade] = useState('Grade 7');
  const [language, setLanguage] = useState<ActivityLanguage>(DEFAULT_ACTIVITY_LANGUAGE);
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [showManualBuilder, setShowManualBuilder] = useState(false);
  const [manualLesson, setManualLesson] = useState('');
  const [manualInstructions, setManualInstructions] = useState('');
  const [manualQuestions, setManualQuestions] = useState<ManualQuestionInput[]>([createManualQuestion()]);
  const [html, setHtml] = useState('');
  const [streamPreview, setStreamPreview] = useState('');
  const [partialPreview, setPartialPreview] = useState('');
  const [versions, setVersions] = useState<ActivityVersion[]>([]);
  const [refinementHistory, setRefinementHistory] = useState<Array<{ role: 'teacher' | 'morrow'; text: string }>>([]);
  const [shareLink, setShareLink] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [autoFixing, setAutoFixing] = useState(false);
  const [fixAttempts, setFixAttempts] = useState(0);
  const [scoreNotice, setScoreNotice] = useState('');
  const lastWorkingHtml = useRef('');
  const handlingError = useRef(false);
  const lastPartialLength = useRef(0);

  const getToken = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    return data.session?.access_token || null;
  }, []);

  const loadActivities = useCallback(async (token: string) => {
    const response = await fetch('/api/activities', { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load your activities.');
    setActivities(data.activities || []);
  }, []);

  useEffect(() => {
    let active = true;
    async function start() {
      const configResponse = await fetch('/api/config');
      const configData = await configResponse.json();
      if (active) setConfig(configData);
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const sessionResponse = await fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } });
      const sessionData = await sessionResponse.json();
      if (!sessionResponse.ok || !sessionData.profile) { await supabase.auth.signOut(); return; }
      if (!active) return;
      if (sessionData.profile.role === 'student') { router.replace('/student'); return; }
      setProfile(sessionData.profile);
      setEmail(sessionData.user.email || '');
      await loadActivities(token);
    }
    start().catch((error: unknown) => { if (active) setNotice(error instanceof Error ? error.message : 'Could not open Morrow.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadActivities, router]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice('Supabase has not been connected yet. Follow the Supabase setup guide in the project folder, then add the two public Supabase values to .env.local.');
      setBusy(false);
      return;
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.session) throw new Error(error?.message || 'Sign in failed.');
      const response = await fetch('/api/auth/session', { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const result = await response.json();
      if (!response.ok || !result.profile) {
        await supabase.auth.signOut();
        throw new Error('This account has not been assigned a Morrow role yet. Complete the profile setup SQL in the Supabase guide.');
      }
      if (result.profile.role === 'student') { router.push('/student'); return; }
      setProfile(result.profile);
      setEmail(result.user.email || email);
      await loadActivities(data.session.access_token);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not sign in.');
    } finally { setBusy(false); }
  }

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    setProfile(null);
    setActivities([]);
    setPassword('');
    setNotice('');
    setScreen('dashboard');
    setActiveActivity(null);
  }

  function startNewActivity() {
    setActiveActivity(null);
    setTitle('');
    setSubject('Natural Sciences');
    setGrade('Grade 7');
    setLanguage(DEFAULT_ACTIVITY_LANGUAGE);
    setDescription('');
    setPrompt('');
    setShowManualBuilder(false);
    setManualLesson('');
    setManualInstructions('');
    setManualQuestions([createManualQuestion()]);
    setHtml('');
    setStreamPreview('');
    setPartialPreview('');
    setVersions([]);
    setRefinementHistory([]);
    setShareLink('');
    setShowCode(false);
    setFixAttempts(0);
    setNotice('');
    setScreen('builder');
  }

  async function runGeneration(
    action: 'create' | 'refine' | 'fix',
    requestedPrompt: string,
    runtimeError = '',
    history = refinementHistory,
  ): Promise<string> {
    const token = await getToken();
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, prompt: requestedPrompt, currentHtml: html, error: runtimeError, history, language, grade }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Morrow could not generate the activity.');
    }
    lastPartialLength.current = 0;
    setPartialPreview('');
    const generated = await readStream(response, (value) => {
      setStreamPreview(value);
      // Show the first safe-to-display body chunk while the rest of the page is still streaming.
      if (value.length - lastPartialLength.current > 2200 && /<body[\s>]/i.test(value) && /<\/head>/i.test(value) && !/<script[\s>]/i.test(value)) {
        lastPartialLength.current = value.length;
        setPartialPreview(value);
      }
    });
    const valid = validateGeneratedHtml(generated);
    setStreamPreview('');
    setPartialPreview('');
    return valid;
  }

  async function generateActivity(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!title.trim()) { setNotice('Add a title for this activity first.'); return; }
    if (!prompt.trim()) { setNotice('Describe what you want the activity to do.'); return; }
    setBusy(true);
    setNotice('');
    setShareLink('');
    lastWorkingHtml.current = html;
    setFixAttempts(0);
    const requestedPrompt = prompt.trim();
    const nextHistory = activeActivity
      ? [...refinementHistory, { role: 'teacher' as const, text: requestedPrompt }]
      : [];
    try {
      const generated = await runGeneration(activeActivity ? 'refine' : 'create', requestedPrompt, '', nextHistory);
      setHtml(generated);
      setPartialPreview('');
      if (activeActivity) setRefinementHistory([...nextHistory, { role: 'morrow', text: 'The activity has been updated. Try the preview and send another change when you are ready.' }]);
      setPrompt('');
      setNotice(activeActivity ? 'Your updated activity is ready. Save it to add a new version.' : 'Your activity is ready. Try it in the preview, then save it.');
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : 'Could not generate the activity.'} You can use the manual builder below to create and save an activity without AI.`);
      setShowManualBuilder(true);
    } finally { setBusy(false); }
  }

  function updateManualQuestion(questionId: string, updates: Partial<ManualQuestionInput>) {
    setManualQuestions((current) => current.map((question) =>
      question.id === questionId ? { ...question, ...updates } : question,
    ));
  }

  function moveManualQuestion(questionId: string, direction: -1 | 1) {
    setManualQuestions((current) => {
      const index = current.findIndex((question) => question.id === questionId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
  }

  function createWithoutAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    try {
      const generated = buildManualActivityHtml({
        title,
        lesson: manualLesson,
        instructions: manualInstructions,
        questions: manualQuestions,
      });
      setHtml(validateGeneratedHtml(generated));
      setPrompt('');
      setShareLink('');
      setShowManualBuilder(false);
      setNotice(`Your ${manualQuestions.length}-question activity was created without AI. Preview it, then save and share it when ready.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create the manual activity.');
    }
  }

  async function saveActivity() {
    if (!profile) return;
    setBusy(true);
    setNotice('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const isExisting = Boolean(activeActivity);
      const response = await fetch(isExisting ? `/api/activities/${activeActivity!.id}` : '/api/activities', {
        method: isExisting ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, subject, grade, language, description, html, prompt, changeNote: prompt ? `Refined: ${prompt.slice(0, 90)}` : 'Saved changes' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save this activity.');
      setActiveActivity(result.activity);
      lastWorkingHtml.current = html;
      await loadActivities(token);
      await loadVersions(result.activity.id, token);
      setShareLink('');
      setNotice(isExisting ? `Saved as version ${result.activity.current_version}.` : 'Activity saved. You can now share a short link with learners.');
      setScreen('builder');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save this activity.');
    } finally { setBusy(false); }
  }

  async function loadVersions(activityId: string, token?: string) {
    const authToken = token || await getToken();
    if (!authToken) return;
    const response = await fetch(`/api/activities/${activityId}/versions`, { headers: { Authorization: `Bearer ${authToken}` } });
    const result = await response.json();
    if (response.ok) setVersions(result.versions || []);
  }

  async function openActivity(activity: Activity) {
    setBusy(true);
    setNotice('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch(`/api/activities/${activity.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not open this activity.');
      const item = result.activity as Activity;
      setActiveActivity(item);
      setShowManualBuilder(false);
      setRefinementHistory([]);
      lastWorkingHtml.current = item.html;
      setFixAttempts(0);
      setTitle(item.title);
      setSubject(item.subject || 'Other');
      setGrade(item.grade || 'Any grade');
      setLanguage(normalizeActivityLanguage(item.language));
      setDescription(item.description || '');
      setHtml(item.html);
      setPrompt('');
      setShareLink(item.public_slug ? `${window.location.origin}/a/${item.public_slug}` : '');
      await loadVersions(item.id, token);
      setScreen('builder');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open the activity.'); }
    finally { setBusy(false); }
  }

  async function revokeShareLink() {
    if (!activeActivity || !window.confirm('Revoke this public link? Anyone using the old link will no longer be able to open the activity.')) return;
    setBusy(true);
    setNotice('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch(`/api/activities/${activeActivity.id}/share`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not revoke the share link.');
      setShareLink('');
      const refreshed = { ...activeActivity, public_slug: null, is_published: false };
      setActiveActivity(refreshed);
      setActivities((current) => current.map((item) => item.id === refreshed.id ? refreshed : item));
      setNotice('The old share link has been revoked. Create a new link when you are ready to share again.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not revoke the share link.');
    } finally {
      setBusy(false);
    }
  }

  async function shareActivity() {
    if (!activeActivity) { setNotice('Save the activity before sharing it.'); return; }
    setBusy(true);
    setNotice('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch(`/api/activities/${activeActivity.id}/share`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create a share link.');
      const link = data.url as string;
      setShareLink(link);
      await navigator.clipboard.writeText(link).catch(() => undefined);
      setNotice('Short activity link copied. Learners can open it on a phone without signing in.');
      const refreshed = { ...activeActivity, public_slug: data.slug, is_published: true };
      setActiveActivity(refreshed);
      setActivities((items) => items.map((item) => item.id === refreshed.id ? refreshed : item));
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not create the link.'); }
    finally { setBusy(false); }
  }

  async function restoreVersion(version: ActivityVersion) {
    if (!activeActivity) return;
    setBusy(true);
    setNotice('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch(`/api/activities/${activeActivity.id}/restore`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ versionId: version.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not restore this version.');
      setActiveActivity(result.activity);
      setHtml(result.activity.html);
      setLanguage(normalizeActivityLanguage(result.activity.language));
      lastWorkingHtml.current = result.activity.html;
      await loadVersions(activeActivity.id, token);
      await loadActivities(token);
      setNotice(`Version ${version.version} restored as a new version.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not restore the version.'); }
    finally { setBusy(false); }
  }

  async function deleteActivity(activity: Activity) {
    if (!window.confirm(`Delete “${activity.title}”? This also deletes its version history.`)) return;
    const token = await getToken();
    if (!token) return;
    const response = await fetch(`/api/activities/${activity.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) { setNotice(result.error || 'Could not delete this activity.'); return; }
    setActivities((items) => items.filter((item) => item.id !== activity.id));
    setNotice('Activity deleted.');
  }

  const handleRuntimeError = useCallback(async (message: string) => {
    if (handlingError.current) return;
    handlingError.current = true;
    const currentAttempts = fixAttempts;
    if (config.fakeMode || !config.geminiConfigured) {
      setNotice(`The preview reported an error: ${message}. Automatic fixing needs Gemini mode. The previous saved version has been kept.`);
      setHtml(lastWorkingHtml.current);
      handlingError.current = false;
      return;
    }
    if (currentAttempts >= 2) {
      setNotice(`Morrow tried two automatic fixes but the issue remains: ${message}. The previous version has been restored.`);
      setHtml(lastWorkingHtml.current);
      handlingError.current = false;
      return;
    }

    setAutoFixing(true);
    setFixAttempts(currentAttempts + 1);
    setNotice(`Morrow found a problem and is trying automatic fix ${currentAttempts + 1} of 2…`);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired.');
      const response = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'fix', currentHtml: html, error: message, language, grade }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Automatic fix failed.');
      }
      lastPartialLength.current = 0;
      const fixed = await readStream(response, (value) => {
        setStreamPreview(value);
        if (value.length - lastPartialLength.current > 2200 && /<body[\s>]/i.test(value) && /<\/head>/i.test(value) && !/<script[\s>]/i.test(value)) {
          lastPartialLength.current = value.length;
          setPartialPreview(value);
        }
      });
      setStreamPreview('');
      setPartialPreview('');
      setHtml(validateGeneratedHtml(fixed));
      setNotice(`Automatic fix ${currentAttempts + 1} completed. Check the preview before saving.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Automatic fix failed.');
      setHtml(lastWorkingHtml.current);
    } finally {
      setAutoFixing(false);
      // Let the replacement iframe mount before it is allowed to report another error.
      window.setTimeout(() => { handlingError.current = false; }, 600);
    }
  }, [config.fakeMode, config.geminiConfigured, fixAttempts, getToken, html, language, grade]);

  if (loading) return <main className="center-screen"><div className="loading-card">Opening Morrow…</div></main>;

  if (!profile) {
    return (
      <main className="login-layout">
        <section className="login-story">
          <a className="brand" href="/"><span className="brand-icon">m</span><span>morrow</span></a>
          <div className="login-message"><h1>A little more life in <em>every lesson.</em></h1><p>Build an activity, share the link and let your learners get stuck in.</p><p>They can open a shared activity on their phone without an account.</p></div>
          <p className="login-footer">A simple tool for thoughtful teaching.</p>
        </section>
        <section className="login-panel">
          <div className="login-card">
            <p className="eyebrow">MORROW LEARNING</p>
            <h1>Welcome to Morrow.</h1>
            <p className="muted">Sign in to your workspace. Teachers and students use this same page.</p>
            {!config.supabaseConfigured && <p className="notice error-notice">Supabase is not connected yet. Add the two Supabase values from your project settings after following the setup guide.</p>}
            <form className="form-stack" onSubmit={signIn}>
              <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" autoComplete="off" /></label>
              <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
              {notice && <p className="notice error-notice">{notice}</p>}
              <button className="button primary-button full-button" disabled={busy || !config.supabaseConfigured}>{busy ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">↗</span></button>
            </form>

          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-icon">m</span><span>morrow</span></a>
        <nav className="nav-links">
          <button className={screen === 'dashboard' ? 'nav-link active' : 'nav-link'} onClick={() => { setScreen('dashboard'); setNotice(''); }}>My activities</button>
          <button className={screen === 'builder' ? 'nav-link active' : 'nav-link'} onClick={startNewActivity}>Create activity</button>
        </nav>
        <div className="account-area"><span>{profile.display_name || email}</span><button className="link-button" onClick={signOut}>Sign out</button></div>
      </header>

      <main className="page-container">
        {screen === 'dashboard' ? (
          <>
            <section className="welcome-row">
              <div><p className="eyebrow">TEACHER WORKSPACE</p><h1>Your activities.</h1><p className="muted">Describe what you want learners to do. Morrow builds a complete interactive activity you can preview, refine and share.</p></div>
              <div className="form-actions"><button className="button primary-button" onClick={startNewActivity}>＋ Create activity</button></div>
            </section>
            <div className="mode-row"><span className={config.fakeMode ? 'mode-dot sample-mode' : 'mode-dot live-mode'} />{config.fakeMode ? 'Sample mode is on. You can also build activities manually without AI.' : config.geminiConfigured ? `Gemini is connected (${config.model}).` : 'AI generation is unavailable. You can still create activities without AI.'}</div>
            {notice && <p className="notice">{notice}</p>}
            <section className="section-block">
              <div className="section-heading"><div><h2>My saved activities</h2><p>{activities.length} {activities.length === 1 ? 'activity' : 'activities'} saved to your account</p></div></div>
              {activities.length === 0 ? (
                <div className="empty-state"><h3>Your first activity starts here</h3><p>Describe a lesson, game or simulation for Gemini, or use the manual builder when AI is unavailable.</p><button className="button primary-button" onClick={startNewActivity}>Create an activity</button></div>
              ) : (
                <div className="activity-grid">
                  {activities.map((activity) => <article className="activity-card" key={activity.id}>
                    <span className="tag">{activity.subject || 'Learning activity'}</span><h3>{activity.title}</h3><p>{activity.description || 'An interactive activity for your learners.'}</p>
                    <div className="card-meta"><span>{activity.grade || 'Any grade'} · Version {activity.current_version}</span><span>{new Date(activity.updated_at).toLocaleDateString()}</span></div>
                    <div className="card-actions"><button className="text-link" onClick={() => openActivity(activity)}>Open and edit</button><button className="text-link" onClick={() => deleteActivity(activity)}>Delete</button>{activity.public_slug && <Link className="text-link" href={`/a/${activity.public_slug}`} target="_blank">Open share link ↗</Link>}</div>
                  </article>)}
                </div>
              )}
            </section>
            <section className="section-block helper-section"><h2>How Morrow works</h2><p>Start with a description or lesson notes. The AI writes a full activity page, which is kept separate from the Morrow app for safety. You can refine it, restore an earlier version and share a short link.</p><div className="helper-steps"><span>1. Describe it</span><span>2. Preview and refine</span><span>3. Save and share</span></div></section>
          </>
        ) : (
          <>
            <button className="back-link" onClick={() => { setScreen('dashboard'); setNotice(''); }}>← Back to activities</button>
            <section className="builder-heading"><div><p className="eyebrow">{activeActivity ? 'EDIT ACTIVITY' : 'NEW ACTIVITY'}</p><h1>{activeActivity ? 'Make it better.' : 'Create a learning activity.'}</h1><p className="muted">Describe the experience, not just the questions. It can be a game, simulation, diagram, story or something else that helps learners understand.</p></div><div className="builder-heading-actions">{activeActivity && <button className="button light-button" onClick={shareActivity} disabled={busy}>Share short link</button>}<button className="button primary-button" onClick={saveActivity} disabled={busy || !html}>{busy ? 'Saving…' : activeActivity ? 'Save new version' : 'Save activity'}</button></div></section>
            {notice && <p className={notice.toLowerCase().includes('error') || notice.toLowerCase().includes('failed') ? 'notice error-notice' : 'notice'}>{notice}</p>}
            {shareLink && <div className="share-panel"><div><strong>Your short activity link</strong><a href={shareLink} target="_blank" rel="noreferrer">{shareLink}</a><span className="form-help">Anyone with this link can open the published activity. You can revoke it at any time.</span></div><div className="share-actions"><button className="button light-button" onClick={() => navigator.clipboard.writeText(shareLink)}>Copy link</button><button className="button danger-button" onClick={revokeShareLink} disabled={busy}>Revoke link</button></div></div>}

            <div className="builder-layout">
              <section className="builder-controls">
                <div className="create-form form-stack">
                  {activeActivity && refinementHistory.length > 0 && <div className="refinement-chat" aria-live="polite">{refinementHistory.map((message, index) => <div className={`refinement-message ${message.role}`} key={`${message.role}-${index}`}><b>{message.role === 'teacher' ? 'You' : 'Morrow'}</b><p>{message.text}</p></div>)}</div>}
                  <label>Activity title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Explore the solar system" maxLength={120} /></label>
                  <div className="form-row"><label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Natural Sciences" /></label><label>Grade<select value={grade} onChange={(event) => setGrade(event.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index}>Grade {index + 1}</option>)}<option>Any grade</option></select></label></div>
                  <label>Activity language<select value={language} onChange={(event) => setLanguage(event.target.value as ActivityLanguage)}>{['South African official languages', 'Additional languages'].map((group) => <optgroup key={group} label={group}>{ACTIVITY_LANGUAGES.filter((item) => item.group === group).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>)}</select><span className="form-help">Gemini will write every learner-facing part, including all questions, answer choices, instructions and feedback, in this language. For an existing activity, ask Morrow to translate it after changing this setting. Manual activities must be typed in the language you want learners to use.</span></label>
                  <label>Short description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="What should learners take away from it?" /></label>
                  <form className="prompt-box form-stack" onSubmit={generateActivity}>
                    <label>{activeActivity ? 'Refine with a message' : 'What should Morrow make?'}<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} placeholder={activeActivity ? 'e.g. Make the simulation easier and add a challenge at the end.' : 'e.g. Make a simple interactive water cycle simulation for Grade 7. Learners should be able to change the temperature and see what happens to evaporation.'} /></label>
                    <p className="form-help">You can ask for activities that are not quizzes. Paste lesson notes, describe how a game should work, or explain a concept to turn into an interactive diagram. The selected activity language applies to all learner-facing text, including every question and answer.</p>
                    <button className="button primary-button full-button" disabled={busy || autoFixing || !prompt.trim()}>{busy ? 'Building your activity…' : activeActivity ? 'Refine activity' : 'Generate activity'} <span aria-hidden="true">↗</span></button>
                  </form>
                  <div className="manual-fallback-intro">
                    <div><strong>AI unavailable?</strong><p>You can still make a useful activity with the manual builder. It does not need Gemini to create the page. Saving and sharing still need Supabase to be connected.</p></div>
                    <button type="button" className="button light-button" onClick={() => setShowManualBuilder((value) => !value)}>{showManualBuilder ? 'Close manual builder' : 'Build without AI'}</button>
                  </div>
                  {showManualBuilder && <form className="manual-builder form-stack" onSubmit={createWithoutAi}>
                    <div><p className="eyebrow">MANUAL ACTIVITY BUILDER</p><h3>Create without AI</h3><p className="form-help">Build one complete activity with as many questions as you need. Each question can use a different interaction. Enter manual learner-facing text in your chosen language; language generation is handled by Gemini above.</p></div>
                    <label>Lesson content or notes<textarea value={manualLesson} onChange={(event) => setManualLesson(event.target.value)} rows={4} placeholder="Explain the topic or paste a short set of lesson notes." /></label>
                    <label>Instructions for learners<textarea value={manualInstructions} onChange={(event) => setManualInstructions(event.target.value)} rows={2} placeholder="e.g. Read the notes, then complete every question." /></label>
                    <div className="manual-question-list">
                      {manualQuestions.map((question, index) => {
                        const optionList = question.options.split(/\r?\n/).map((option) => option.trim()).filter(Boolean);
                        return <section className="manual-question-card" key={question.id}>
                          <div className="manual-question-card-heading"><div><p className="eyebrow">QUESTION {index + 1} OF {manualQuestions.length}</p><strong>Question details</strong></div><div className="manual-question-actions"><button type="button" className="text-link" onClick={() => moveManualQuestion(question.id, -1)} disabled={index === 0} aria-label={`Move question ${index + 1} up`}>Move up</button><button type="button" className="text-link" onClick={() => moveManualQuestion(question.id, 1)} disabled={index === manualQuestions.length - 1} aria-label={`Move question ${index + 1} down`}>Move down</button><button type="button" className="text-link danger-link" onClick={() => setManualQuestions((current) => current.length > 1 ? current.filter((item) => item.id !== question.id) : current)} disabled={manualQuestions.length === 1}>Remove</button></div></div>
                          <label>Question or task<textarea value={question.prompt} onChange={(event) => updateManualQuestion(question.id, { prompt: event.target.value })} rows={3} required placeholder="Write the question or task for learners." /></label>
                          <label>Question type<select value={question.interaction} onChange={(event) => updateManualQuestion(question.id, { interaction: event.target.value as ManualQuestionInput['interaction'] })}><option value="choice">Multiple choice</option><option value="reflection">Written response</option><option value="reveal">Reveal a hint or answer</option><option value="checklist">Step-by-step checklist</option></select></label>
                          {question.interaction === 'reveal' && <label>Hint or example answer<textarea value={question.reveal} onChange={(event) => updateManualQuestion(question.id, { reveal: event.target.value })} rows={3} placeholder="Write the hint or example answer to reveal." /></label>}
                          {question.interaction === 'checklist' && <label>Steps (one per line)<textarea value={question.steps} onChange={(event) => updateManualQuestion(question.id, { steps: event.target.value })} rows={4} placeholder={'Read the question\nPlan your answer\nCheck your work'} /></label>}
                          {question.interaction === 'choice' && <><label>Answer options (one per line, 2 to 4 options)<textarea value={question.options} onChange={(event) => updateManualQuestion(question.id, { options: event.target.value })} rows={4} /></label><label>Correct answer<select value={String(Math.min(question.correctIndex, Math.max(0, optionList.length - 1)))} onChange={(event) => updateManualQuestion(question.id, { correctIndex: Number(event.target.value) })}>{optionList.map((option, optionIndex) => <option key={`${optionIndex}-${option}`} value={optionIndex}>{option}</option>)}</select></label></>}
                        </section>;
                      })}
                    </div>
                    <button type="button" className="button light-button" onClick={() => setManualQuestions((current) => [...current, createManualQuestion(`question-${Date.now()}-${current.length + 1}`)])} disabled={manualQuestions.length >= 50}>+ Add question</button>
                    <p className="form-help">You can add up to 50 questions and mix question types. Multiple-choice questions contribute to the final score. Written responses, reveal prompts and checklists are marked as completed but are not automatically graded.</p>
                    <button type="submit" className="button primary-button" disabled={busy || autoFixing}>Create {manualQuestions.length}-question activity</button>
                  </form>}
                </div>
                {streamPreview && <div className="stream-progress"><b>Writing your activity…</b><span>{streamPreview.length.toLocaleString()} characters received</span><div className="stream-bar"><i /></div></div>}
                {activeActivity && <section className="version-panel"><div className="section-heading"><div><h2>Version history</h2><p>Restore an earlier version if a change does not work.</p></div></div>
                  {versions.length === 0 ? <p className="form-help">No saved versions yet.</p> : versions.map((version) => <div className="version-row" key={version.id}><div><b>Version {version.version}</b><span>{version.change_note || version.prompt || 'Saved activity'}</span><small>{new Date(version.created_at).toLocaleString()}</small></div><button className="text-link" onClick={() => restoreVersion(version)} disabled={busy || version.version === activeActivity.current_version}>Restore</button></div>)}
                </section>}
                {html && <section className="code-panel"><button className="text-link" onClick={() => setShowCode(!showCode)}>{showCode ? 'Hide code' : 'Edit HTML directly'}</button>{showCode && <><p className="form-help">Advanced editing. The HTML still runs in the sandboxed preview.</p><textarea className="code-editor" value={html} onChange={(event) => setHtml(event.target.value)} spellCheck={false} /><button className="button light-button" onClick={() => setNotice('HTML edits are ready. Save the activity to keep them.')}>Apply code edits</button></>}</section>}
              </section>
              <section className="preview-column"><div className="preview-heading"><div><h2>Live preview</h2><p>{autoFixing ? `Automatic fix ${fixAttempts} of 2` : 'Try the activity as a learner would see it.'}</p></div><span className="tag">Phone friendly</span></div>
                {autoFixing && <div className="fix-banner">Morrow is trying to fix a problem in the preview…</div>}
                <PreviewFrame html={partialPreview || html} title={`${title || 'Activity'} preview`} onRuntimeError={partialPreview ? undefined : handleRuntimeError} onScore={(value, max) => setScoreNotice(`Preview score: ${value} / ${max}`)} className="teacher-preview" />
                {scoreNotice && <p className="score-toast small-toast">{scoreNotice}</p>}
              </section>
            </div>
          </>
        )}
      </main>
      <footer className="site-footer"><span>morrow</span><span>A little more life in every lesson.</span></footer>
    </div>
  );
}
