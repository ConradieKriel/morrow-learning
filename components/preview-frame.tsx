'use client';

import { useEffect, useRef } from 'react';
import { prepareSandboxHtml } from '@/lib/html-sandbox';

type Props = {
  html: string;
  title?: string;
  onRuntimeError?: (message: string) => void;
  onScore?: (score: number, maxScore: number) => void;
  className?: string;
};

export default function PreviewFrame({ html, title = 'Activity preview', onRuntimeError, onScore, className }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latestCallbacks = useRef({ onRuntimeError, onScore });
  latestCallbacks.current = { onRuntimeError, onScore };

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string; message?: string; score?: number; maxScore?: number };
      if (!data || data.source !== 'morrow-activity') return;
      if (data.type === 'runtime-error') latestCallbacks.current.onRuntimeError?.(data.message || 'The activity reported an error.');
      if (data.type === 'score' && typeof data.score === 'number' && typeof data.maxScore === 'number') {
        latestCallbacks.current.onScore?.(data.score, data.maxScore);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!html) return <div className={`preview-empty ${className || ''}`}>Your activity preview will appear here.</div>;

  return (
    <iframe
      ref={iframeRef}
      className={`activity-frame ${className || ''}`}
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'"
      srcDoc={prepareSandboxHtml(html)}
    />
  );
}
