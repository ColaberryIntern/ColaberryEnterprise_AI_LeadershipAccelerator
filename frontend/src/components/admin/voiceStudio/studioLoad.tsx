import React, { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '../shell';
import { statusOf, studioErrorMessage } from '../../../services/voiceStudioApi';

/** Shared load state for the read-only Studio tabs: loading, switched off (404), error with retry. */
export function useStudioLoad<T>(load: () => Promise<T>, deps: React.DependencyList, fallback: string): { data: T | null; blocked: React.ReactElement | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  // The caller lists what its loader depends on.
  const run = useCallback(() => {
    setError(null);
    load().then((d) => { setData(d); setOff(false); })
      .catch((e) => { if (statusOf(e) === 404) setOff(true); else setError(studioErrorMessage(e, fallback)); });
  }, deps);
  useEffect(() => { run(); }, [run]);
  if (off) return { data: null, blocked: <EmptyState icon="toggle-line" title="Voice Studio is switched off on this server" description="An administrator turns it on with VOICE_STUDIO_UI_ENABLED. Calls are not affected either way." /> };
  if (error) return { data: null, blocked: <div className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-sm btn-link" onClick={run}>Retry</button></div> };
  if (data === null) return { data: null, blocked: <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading</span></div></div> };
  return { data, blocked: null };
}

/** Dates are always Central, with the zone written out. */
export const centralTime = (iso: string): string => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'medium' }) + ' Central';
