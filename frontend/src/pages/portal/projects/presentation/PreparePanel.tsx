import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAssignment, saveAssignment, type PresentationAssignment } from './presentationApi';

/**
 * The Prepare stage: who the audience is, what this presentation is for, and the
 * checklist for the chosen template.
 *
 * WHY THESE ANSWERS ARE SAVED SERVER-SIDE. They feed the generated deck prompt and an
 * instructor's readiness view, so losing them to a cleared cache would cost the
 * student real work. The stage cursor stays in the browser; these do not.
 *
 * THE SERVER DECIDES READINESS. Every save returns the authoritative row, including a
 * `prepState` the server derived from what was actually filled in, and that response
 * replaces local state. The client cannot declare itself ready.
 *
 * AUTOSAVE IS DEBOUNCED AND LAST-WRITE-WINS PER FIELD. A student typing an audience
 * should not fire a request per keystroke, and an in-flight save must not be clobbered
 * by a stale one — the pending timer is cleared on unmount so a navigation mid-edit
 * does not leave a write racing a component that no longer exists.
 */

export interface PreparePanelProps {
  projectId: string;
  storyId: string;
  demo?: boolean;
}

type Status = 'loading' | 'ready' | 'saving' | 'saved' | 'error';

const SAVE_DEBOUNCE_MS = 700;

export default function PreparePanel({ projectId, storyId, demo }: PreparePanelProps) {
  const [data, setData] = useState<PresentationAssignment | null>(null);
  const [status, setStatus] = useState<Status>(demo ? 'ready' : 'loading');
  const [message, setMessage] = useState('');
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // A navigation mid-edit must not leave a timer firing into a dead component.
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (demo) return;
    setStatus('loading');
    fetchAssignment(projectId, storyId)
      .then((d) => { if (alive.current) { setData(d); setStatus('ready'); } })
      .catch((err: any) => {
        if (!alive.current) return;
        setStatus('error');
        setMessage(err?.response?.data?.error || 'Could not load your preparation. Try again.');
      });
  }, [projectId, storyId, demo]);

  const push = useCallback((patch: Parameters<typeof saveAssignment>[2]) => {
    if (demo) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setStatus('saving');
      saveAssignment(projectId, storyId, patch)
        .then((d) => {
          // The server's row wins — including the prepState it derived.
          if (alive.current) { setData(d); setStatus('saved'); }
        })
        .catch((err: any) => {
          if (!alive.current) return;
          setStatus('error');
          setMessage(err?.response?.data?.error || 'Could not save. Your text is still here — try again.');
        });
    }, SAVE_DEBOUNCE_MS);
  }, [projectId, storyId, demo]);

  const setField = (field: 'audience' | 'purpose', value: string) => {
    setData((d) => (d ? { ...d, [field]: value } : d));
    push({ [field]: value });
  };

  const toggle = (item: string) => {
    if (!data) return;
    const next = { ...data.checklist, [item]: !data.checklist[item] };
    setData({ ...data, checklist: next });
    push({ checklist: next });
  };

  if (demo) {
    return (
      <div className="ps-pending" data-testid="ps-prepare-demo">
        <strong>This is a preview account.</strong>
        Preparation is saved against a real student&rsquo;s own project, so there is nothing to save here.
      </div>
    );
  }

  if (status === 'loading') {
    return <p className="ps-note ps-note--soft" data-testid="ps-prepare-loading">Loading your preparation&hellip;</p>;
  }

  if (status === 'error' && !data) {
    return <p className="ps-note" role="alert" data-testid="ps-prepare-error">{message}</p>;
  }

  if (!data) return null;

  return (
    <div data-testid="ps-prepare">
      <div className="ps-card">
        <h3>Who is this for?</h3>
        <label className="ps-label" htmlFor="ps-audience">
          The audience. Be specific — &ldquo;hiring managers&rdquo; leads to a different deck than &ldquo;my team&rdquo;.
        </label>
        <input
          id="ps-audience"
          className="ps-input"
          type="text"
          value={data.audience || ''}
          onChange={(e) => setField('audience', e.target.value)}
          placeholder="e.g. Hiring managers who have not seen the project"
          data-testid="ps-audience"
        />

        <label className="ps-label" htmlFor="ps-purpose" style={{ marginTop: 12 }}>
          What do you want to happen afterwards?
        </label>
        <input
          id="ps-purpose"
          className="ps-input"
          type="text"
          value={data.purpose || ''}
          onChange={(e) => setField('purpose', e.target.value)}
          placeholder="e.g. They understand what I built and ask me about the guardrails"
          data-testid="ps-purpose"
        />

        {/* Honest save state. "Saved" only ever appears after the server said so.
            role=status + aria-live so a screen-reader user learns their work saved —
            or did not — without having to go looking for the message. */}
        <p
          className="ps-note ps-note--soft"
          style={{ marginTop: 10 }}
          role="status"
          aria-live="polite"
          data-testid="ps-save-state"
        >
          {status === 'saving' && 'Saving…'}
          {status === 'saved' && 'Saved'}
          {status === 'error' && message}
          {status === 'ready' && 'Changes save automatically.'}
        </p>
      </div>

      <div className="ps-card">
        <h3>{data.templateLabel} · checklist</h3>
        <ul className="ps-check" data-testid="ps-checklist">
          {data.checklistItems.map((item) => (
            <li key={item}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(data.checklist[item])}
                  onChange={() => toggle(item)}
                />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
