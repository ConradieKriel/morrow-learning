'use client';

import PreviewFrame from '@/components/preview-frame';
import { useState } from 'react';

export default function PublicActivity({ title, subject, grade, language = 'English', html }: { title: string; subject: string | null; grade: string | null; language?: string; html: string }) {
  const [score, setScore] = useState<{ score: number; max: number } | null>(null);
  return (
    <main className="public-activity-page">
      <header className="public-activity-header"><div className="brand"><span className="brand-icon">m</span><span>morrow</span></div><div className="public-activity-meta"><span className="tag">{subject || 'Learning activity'}</span><span className="tag language-tag">{language}</span>{grade && <span className="public-grade">{grade}</span>}</div></header>
      <section className="public-title"><p className="eyebrow">YOUR ACTIVITY</p><h1>{title}</h1></section>
      <PreviewFrame html={html} title={title} className="public-frame" onScore={(value, max) => setScore({ score: value, max })} />
      {score && <p className="score-toast">Activity result: {score.score} / {score.max}</p>}
      <footer className="student-footer">Made with Morrow</footer>
    </main>
  );
}
