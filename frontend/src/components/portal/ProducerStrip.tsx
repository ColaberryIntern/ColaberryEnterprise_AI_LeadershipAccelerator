import React, { useCallback, useEffect, useState } from 'react';
import {
  readProducerState,
  sendProducerCommand as sendProducerCommandRequest,
  type CommandAvailability,
  type ProducerCommand,
  type ProducerOccurrence,
  type ProducerStateResult,
} from '../../services/broadcastProducer';

/**
 * The producer's control for one class: backstage, content started, go live, end.
 *
 * WHAT THIS REPLACES. Starting a broadcast had no UI at all. The procedure was three
 * hand-sent `POST /command` calls at showtime, each carrying a version read out of the
 * database by whoever had a console open — and the first of them could not be made from any
 * endpoint, because the only route returning a version answers 503 before a stream exists.
 * On 2026-10-20 an occurrence sat `live` over dead air for five minutes because nobody was
 * at a console to end it. P4-02.
 *
 * IT RENDERS NOTHING FOR A VIEWER, and that is a security property, not a nicety. This page
 * is public and ordinary students load it. The strip appears only when the server answers the
 * producer read — a 403 renders null — so producer capability is asserted by the server and
 * never inferred from anything the client knows about itself.
 *
 * IT NEVER DECIDES WHAT IS LEGAL. Which commands are available comes from the server, which
 * derives it by running the real state machine. A second copy of "go live needs provider
 * health" in this component is exactly the duplication this subsystem keeps paying for, so
 * the buttons are whatever the server said, in the order the server said.
 *
 * THE BLOCKED REASON IS THE POINT, NOT AN ERROR. Most of a producer's pre-air minute is spent
 * waiting for the platform to see the feed, and until now that wait was invisible: the
 * occurrence sits in `backstage` with health never reaching `ready`, which looks exactly like
 * a stream that has not started. So an unavailable Go Live is shown WITH the server's reason
 * rather than hidden.
 */

export interface ProducerStripProps {
  sessionId: string;
  /** Injected in tests. Production reads the real producer endpoint. */
  loadState?: (sessionId: string) => Promise<ProducerStateResult>;
  sendCommand?: (
    occurrenceId: string, command: ProducerCommand, expectedVersion: number,
  ) => Promise<{ outcome: string; currentVersion?: number }>;
}

/**
 * Slower than the companion's 2.5s: this is one staff member's control, the thing it waits on
 * (provider health) moves on the health loop's cadence rather than a human's, and the route's
 * limiter is 60/min — a 2.5s poll would spend 24 of those every minute before a single command.
 */
const POLL_MS = 5000;

/** Human labels. The wire values are the contract; these are for a person under time pressure. */
const LABELS: Record<ProducerCommand, string> = {
  enter_backstage: 'Go backstage',
  mark_content_started: 'Mark content started',
  go_live: 'Go live',
  end: 'End broadcast',
  return_to_scheduled: 'Back to scheduled',
  cancel: 'Cancel this airing',
};

/**
 * The irreversible ones. `end` is terminal — there is no un-end command and the state machine
 * treats `ended` as one-way — and `cancel` is terminal too. Both ask first.
 */
const NEEDS_CONFIRM: ProducerCommand[] = ['end', 'cancel'];

/** The commands worth showing a refusal for, rather than simply omitting. */
const EXPLAIN_WHEN_BLOCKED: ProducerCommand[] = ['go_live', 'mark_content_started'];

function stateLabel(o: ProducerOccurrence): string {
  if (o.editorial_state === 'live') return 'ON AIR';
  if (o.editorial_state === 'reconnecting') return 'RECONNECTING';
  return o.editorial_state.replace(/_/g, ' ').toUpperCase();
}

export default function ProducerStrip(
  { sessionId, loadState, sendCommand }: ProducerStripProps,
): React.ReactElement | null {
  const read = loadState ?? readProducerState;
  const send = sendCommand ?? sendProducerCommandRequest;

  const [state, setState] = useState<ProducerStateResult | null>(null);
  const [busy, setBusy] = useState<ProducerCommand | null>(null);
  const [confirming, setConfirming] = useState<ProducerCommand | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const next = await read(sessionId);
    // A failed poll does NOT blank a control a producer may be mid-sequence with: the last
    // good picture plus a notice is more use than an empty strip. The first read is the
    // exception — there is nothing to keep.
    setState((prev) => (next.outcome === 'failed' && prev ? prev : next));
    if (next.outcome === 'failed') setNotice('Could not reach the broadcast just now — still trying.');
    else if (next.outcome === 'ok') setNotice(null);
  }, [read, sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let alive = true;
    const tick = () => { if (alive) void refresh(); };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [sessionId, refresh]);

  const run = useCallback(async (command: ProducerCommand): Promise<void> => {
    const occurrence = state?.occurrence;
    if (!occurrence) return;
    setConfirming(null);
    setBusy(command);
    try {
      const result = await send(occurrence.id, command, occurrence.version);
      if (result.outcome === 'conflict') {
        // Someone else moved it. Say so plainly and re-read rather than retrying on a version
        // the server has already refused.
        setNotice(
          result.currentVersion != null
            ? `This airing moved under you (now at version ${result.currentVersion}). Reading it again.`
            : 'This airing moved under you. Reading it again.',
        );
      } else if (result.outcome === 'forbidden') {
        setNotice('The server says you are not a producer for this airing.');
      } else if (result.outcome === 'failed') {
        setNotice(`Could not send ${LABELS[command]}. Nothing changed.`);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [refresh, send, state]);

  // Not a producer, feature dark, or no broadcast for this session: render nothing at all.
  if (!state || state.outcome === 'forbidden') return null;
  if (state.outcome === 'ok' && state.found === false) return null;
  const occurrence = state.occurrence;
  if (!occurrence) return null;

  const commands = state.commands ?? [];
  const available = commands.filter((c) => c.available);
  const blocked = commands.filter(
    (c) => !c.available && c.error_class && EXPLAIN_WHEN_BLOCKED.includes(c.command),
  );
  const onAir = occurrence.editorial_state === 'live' || occurrence.editorial_state === 'reconnecting';

  return (
    <section className="cps" data-testid="producer-strip" aria-label="Producer controls">
      <style>{CPS_CSS}</style>

      <header className="cps-head">
        <span
          className={`cps-badge${onAir ? ' is-live' : ''}`}
          data-testid="producer-state"
        >
          {onAir && <span className="cps-dot" aria-hidden="true" />}
          {stateLabel(occurrence)}
        </span>
        <span className="cps-health" data-testid="producer-health">
          feed: {occurrence.provider_health}
        </span>
        <span className="cps-version">v{occurrence.version}</span>
      </header>

      <div className="cps-actions">
        {available.map((c) => (
          <React.Fragment key={c.command}>
            {confirming === c.command ? (
              <span className="cps-confirm" data-testid={`producer-confirm-${c.command}`}>
                <span className="cps-confirm-q">
                  {c.command === 'end'
                    ? 'End it? This cannot be undone.'
                    : 'Cancel this airing? This cannot be undone.'}
                </span>
                <button
                  type="button"
                  className="cps-btn cps-btn-danger"
                  onClick={() => { void run(c.command); }}
                  data-testid={`producer-confirm-yes-${c.command}`}
                >
                  Yes, {LABELS[c.command].toLowerCase()}
                </button>
                <button type="button" className="cps-btn cps-btn-ghost" onClick={() => setConfirming(null)}>
                  Keep going
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={`cps-btn${NEEDS_CONFIRM.includes(c.command) ? ' cps-btn-danger' : ''}`}
                disabled={busy !== null}
                data-testid={`producer-cmd-${c.command}`}
                onClick={() => {
                  if (NEEDS_CONFIRM.includes(c.command)) setConfirming(c.command);
                  else void run(c.command);
                }}
              >
                {busy === c.command ? 'Working…' : LABELS[c.command]}
              </button>
            )}
          </React.Fragment>
        ))}

        {available.length === 0 && (
          <span className="cps-note" data-testid="producer-no-actions">
            Nothing to do from here.
          </span>
        )}
      </div>

      {blocked.map((c) => (
        <p className="cps-blocked" key={c.command} data-testid={`producer-blocked-${c.command}`}>
          <b>{LABELS[c.command]}</b> is not available yet — {c.reason}
        </p>
      ))}

      {notice && (
        <p className="cps-notice" role="status" data-testid="producer-notice">{notice}</p>
      )}
    </section>
  );
}

const CPS_CSS = `
.cps{
  width:100%; margin:18px 0 0; padding:14px 16px;
  text-align:left;
  border:1px solid var(--border-subtle,#d8dde5); border-radius:12px;
  background:var(--surface-raised,#fbfcfe);
  font-family:var(--font-body);
}
.cps-head{ display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:12px; }
.cps-badge{
  display:inline-flex; align-items:center; gap:6px;
  padding:3px 9px; border-radius:999px;
  font-size:11px; font-weight:700; letter-spacing:.06em;
  background:var(--surface-sunken,#eef1f6); color:var(--text-muted,#55606f);
}
.cps-badge.is-live{ background:#b3261e; color:#fff; }
.cps-dot{ width:7px; height:7px; border-radius:50%; background:currentColor; }
.cps-health,.cps-version{ font-size:12px; color:var(--text-muted,#55606f); }
.cps-version{ margin-left:auto; font-variant-numeric:tabular-nums; }
.cps-actions{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.cps-btn{
  min-height:40px; padding:0 14px;
  border:1px solid var(--border-strong,#aab3c0); border-radius:8px;
  background:var(--surface-default,#fff); color:var(--text-body,#1d2430);
  font-size:14px; font-weight:600; cursor:pointer;
}
.cps-btn:hover:not(:disabled){ background:var(--surface-sunken,#eef1f6); }
.cps-btn:disabled{ opacity:.55; cursor:default; }
.cps-btn-danger{ border-color:#b3261e; color:#b3261e; }
.cps-btn-ghost{ border-color:var(--border-subtle,#d8dde5); font-weight:500; }
.cps-confirm{ display:inline-flex; flex-wrap:wrap; align-items:center; gap:8px; }
.cps-confirm-q{ font-size:13px; font-weight:600; color:#b3261e; }
.cps-note,.cps-blocked,.cps-notice{ margin:10px 0 0; font-size:13px; }
.cps-note{ color:var(--text-muted,#55606f); }
.cps-blocked{ color:var(--text-muted,#55606f); }
.cps-notice{ color:#8a4b00; }
`;
