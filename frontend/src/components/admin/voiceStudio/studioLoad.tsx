import React, { useEffect, useRef, useState } from 'react';
import { EmptyState } from '../shell';
import { statusOf, studioErrorMessage } from '../../../services/voiceStudioApi';

type Loaded<T> = { key: string; data?: T; error?: string; off?: boolean };

/**
 * Shared load state for the read-only Studio tabs: loading, switched off (404), error with retry.
 * Data is tagged with what it was loaded FOR: a response that was superseded is dropped, and data
 * loaded for other inputs is never rendered (an audit trail must not appear under another call).
 */
export function useStudioLoad<T>(load: () => Promise<T>, deps: ReadonlyArray<unknown>, fallback: string): { data: T | null; blocked: React.ReactElement | null } {
  const [state, setState] = useState<Loaded<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([deps, attempt]);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let current = true;
    loader.current()
      .then((data) => { if (current) setState({ key, data }); })
      .catch((e) => { if (current) setState(statusOf(e) === 404 ? { key, off: true } : { key, error: studioErrorMessage(e, fallback) }); });
    return () => { current = false; };
  }, [key, fallback]);
  const s = state && state.key === key ? state : null;
  if (s?.off) return { data: null, blocked: <EmptyState icon="toggle-line" title="Voice Studio is switched off on this server" description="An administrator turns it on with VOICE_STUDIO_UI_ENABLED. Calls are not affected either way." /> };
  if (s?.error) return { data: null, blocked: <div className="alert alert-danger" role="alert">{s.error} <button type="button" className="btn btn-sm btn-link" onClick={() => setAttempt((n) => n + 1)}>Retry</button></div> };
  if (!s || s.data === undefined) return { data: null, blocked: <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading</span></div></div> };
  return { data: s.data, blocked: null };
}

/** Dates are always Central, with the zone written out. */
export const centralTime = (iso: string): string => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'medium' }) + ' Central';
