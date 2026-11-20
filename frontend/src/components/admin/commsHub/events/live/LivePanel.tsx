import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SectionCard } from '../../../shell';
import {
  apiErrorMessage, getLiveIngest, getLivePanel, prepareLiveStream, sendLiveCommand,
  type HubEvent, type LivePanelView,
} from '../../../../../services/commsHubApi';

/**
 * The event's Live panel (CH5.2): Prepare stream, the Zoom push details, the stream's health, Go
 * live, End. The broadcast state machine decides what is possible; this shows it and says why not.
 * While a stream is being prepared or is live, the panel checks the stream's health every 5 seconds.
 */
export const LIVE_POLL_MS = 5_000;

const STATE_WORDS: Record<string, string> = {
  scheduled: 'Prepared', backstage: 'Getting ready', live: 'Live now', reconnecting: 'Reconnecting',
  ended: 'Ended', processing: 'Ended, recording processing', replay_ready: 'Ended, replay ready', cancelled: 'Cancelled',
};
const HEALTH_WORDS: Record<string, string> = {
  ready: 'Stream ready: Cloudflare is receiving it.', unknown: 'Waiting for the stream from Zoom.', down: 'No stream arriving from Zoom.', degraded: 'The stream is arriving but unstable.',
};

interface Props { event: HubEvent; locked: boolean; onStatusChange?: () => void }

function CopyField({ id, label, value, secret }: { id: string; label: string; value: string; secret?: boolean }): React.ReactElement {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(value); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <div className="mb-2">
      <label className="form-label" htmlFor={id}>{label}</label>
      <div className="ch-live-field">
        <input id={id} className="form-control font-monospace" type={shown ? 'text' : 'password'} value={value} readOnly autoComplete="off" />
        {secret && <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={() => setShown((s) => !s)} aria-pressed={shown}>{shown ? 'Hide' : 'Show'}</button>}
        <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

export default function LivePanel({ event, locked, onStatusChange }: Props): React.ReactElement {
  const [view, setView] = useState<LivePanelView | null>(null);
  const [busy, setBusy] = useState<null | 'prepare' | 'go_live' | 'end' | 'return_to_scheduled' | 'ingest'>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingest, setIngest] = useState<{ rtmps_url: string; stream_key: string } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async (): Promise<void> => {
    try { const v = await getLivePanel(event.id); if (alive.current) setView(v); } catch (err) { if (alive.current) setError(apiErrorMessage(err, 'The live panel did not load.')); }
  }, [event.id]);
  useEffect(() => { void load(); }, [load]);

  const state = view?.occurrence?.editorial_state ?? null;
  const watching = state === 'backstage' || state === 'live' || state === 'reconnecting';
  useEffect(() => {
    if (!watching) return undefined;
    const t = setInterval(() => { void load(); }, LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [watching, load]);

  const act = async (what: 'prepare' | 'go_live' | 'end' | 'return_to_scheduled'): Promise<void> => {
    setBusy(what); setError(null);
    try {
      const v = what === 'prepare' ? await prepareLiveStream(event.id) : await sendLiveCommand(event.id, what, view!.occurrence!.version);
      setView(v);
      setConfirmEnd(false);
      if (what === 'go_live' || what === 'end') onStatusChange?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'That did not work. Try again.'));
      await load();
    } finally { setBusy(null); }
  };

  const showIngest = async (): Promise<void> => {
    setBusy('ingest'); setError(null);
    try { setIngest(await getLiveIngest(event.id)); } catch (err) { setError(apiErrorMessage(err, 'The stream details could not be read.')); } finally { setBusy(null); }
  };

  const ready = view?.occurrence?.provider_health === 'ready';
  const held = view?.input_held_by;
  const off = locked || busy !== null;
  const chip = state ? STATE_WORDS[state] ?? state : 'Not prepared';

  return (
    <SectionCard className="ch-live" title="Live stream" icon="live-line" actions={<span className={`ch-status ${state === 'live' ? 'ch-status-danger' : state === 'backstage' ? 'ch-status-info' : 'ch-status-neutral'}`}>{chip}</span>}>
      <div role="status" aria-live="polite">
        {view?.occurrence && watching && <p className={`ch-live-health ch-health-${view.occurrence.provider_health} mb-2`}>{HEALTH_WORDS[view.occurrence.provider_health] ?? view.occurrence.provider_health}</p>}
      </div>
      {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
      {view && !view.input_configured && <div className="alert alert-secondary py-2">No live stream input is set up on this server, so events cannot go live yet.</div>}
      {held && <div className="alert alert-warning py-2">&quot;{held.title}&quot; is {held.state === 'backstage' ? 'getting ready to stream' : 'live'} right now. Only one event can use the stream at a time.</div>}

      {view === null && !error && <p className="text-muted mb-0">Loading...</p>}

      {view && view.input_configured && (!view.occurrence || state === 'scheduled' || ((state === 'ended' || state === 'processing' || state === 'replay_ready') && event.repeat_rule)) && (
        <>
          <p className="text-muted">Streams this event to members through Colaberry Live. Prepare it a few minutes before the start, then start streaming from Zoom.</p>
          <button type="button" className="btn btn-outline-primary comms-hub-action" disabled={off || !!held} onClick={() => void act('prepare')}>{busy === 'prepare' ? 'Preparing...' : state && state !== 'scheduled' ? 'Prepare the next date' : 'Prepare stream'}</button>
        </>
      )}

      {watching && (
        <>
          <h3 className="ch-studio-h mt-2">Stream from Zoom</h3>
          <p className="small text-muted mb-2">In Zoom: More, Live on Custom Live Streaming Service. Paste the URL and key, then start.</p>
          {ingest ? (
            <>
              <CopyField id="ch-live-url" label="Stream URL" value={ingest.rtmps_url} />
              <CopyField id="ch-live-key" label="Stream key" value={ingest.stream_key} secret />
            </>
          ) : (
            <button type="button" className="btn btn-outline-secondary comms-hub-action mb-2" disabled={busy !== null} onClick={() => void showIngest()}>{busy === 'ingest' ? 'Loading...' : 'Show stream details'}</button>
          )}
          <div className="d-flex flex-wrap gap-2 mt-2">
            {state === 'backstage' && (
              <>
                <button type="button" className="btn btn-danger comms-hub-action" disabled={off || !ready || !!held} aria-describedby="ch-live-why" onClick={() => void act('go_live')}>{busy === 'go_live' ? 'Going live...' : 'Go live'}</button>
                <button type="button" className="btn btn-outline-secondary comms-hub-action" disabled={off} onClick={() => void act('return_to_scheduled')}>Not now</button>
              </>
            )}
            {(state === 'live' || state === 'reconnecting') && !confirmEnd && (
              <button type="button" className="btn btn-outline-danger comms-hub-action" disabled={off} onClick={() => setConfirmEnd(true)}>End stream</button>
            )}
          </div>
          {state === 'backstage' && !ready && <p id="ch-live-why" className="small text-muted mt-2 mb-0">Go live unlocks when the stream from Zoom is ready.</p>}
          {confirmEnd && (
            <div className="alert alert-warning mt-3" role="alertdialog" aria-labelledby="ch-live-end-q">
              <p id="ch-live-end-q" className="fw-bold mb-2">End the stream for everyone watching?</p>
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-danger comms-hub-action" disabled={off} onClick={() => void act('end')}>{busy === 'end' ? 'Ending...' : 'Yes, end it'}</button>
                <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={() => setConfirmEnd(false)}>Keep streaming</button>
              </div>
            </div>
          )}
        </>
      )}

      {(state === 'ended' || state === 'processing' || state === 'replay_ready') && !event.repeat_rule && <p className="mb-0">This stream has ended.{state === 'replay_ready' ? ' The replay is ready for members.' : ''}</p>}
      {state === 'cancelled' && <p className="mb-0">The stream for this date was cancelled.</p>}
    </SectionCard>
  );
}
