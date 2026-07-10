import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { subscribe } from './projectsStore';
import './projects.css';

// Global "your build is ready" toast. Mounted once inside PortalShell so it
// fires on any portal page — the student can start a build, navigate away, and
// still be told the moment it finishes assembling in the background.

type Toast = { key: number; name: string };

const ToastCard: React.FC<{ t: Toast; onDone: () => void }> = ({ t, onDone }) => {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const a = window.setTimeout(() => setShown(true), 20);
    const b = window.setTimeout(onDone, 6500);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [onDone]);
  return (
    <div className={`pj-toast${shown ? ' in' : ''}`}>
      <span className="tic"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Your build is ready</b>
        <span className="ts">{t.name} — lists and tasks are set up.</span>
      </div>
      <Link to="/portal/projects">Open</Link>
    </div>
  );
};

const BuildToast: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribe((ev) => {
    if (ev?.type === 'ready') setToasts((list) => [...list, { key: Date.now() + Math.random(), name: ev.project.name }]);
  }), []);
  if (!toasts.length) return null;
  return (
    <div className="pj-toastwrap">
      {toasts.map((t) => <ToastCard key={t.key} t={t} onDone={() => setToasts((l) => l.filter((x) => x.key !== t.key))} />)}
    </div>
  );
};

export default BuildToast;
