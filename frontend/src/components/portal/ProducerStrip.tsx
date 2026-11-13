import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  readLiveAudience as readLiveAudienceRequest,
  readProducerState,
  sendProducerCommand as sendProducerCommandRequest,
  type CommandAvailability,
  type LiveAudienceResult,
  type ProducerCommand,
  type ProducerStateResult,
  type RundownResult,
} from '../../services/broadcastProducer';
import { readRoomPulse as readRoomPulseRequest, type RoomPulseResult } from '../../services/liveRoomPulse';
import { clockTicks, producerClock } from './producerClock';
import ProducerHeader from './ProducerHeader';
import ProducerRehearsalNotice from './ProducerRehearsalNotice';
import ClipMarkButton from './ClipMarkButton';
import ProducerRundown from './ProducerRundown';
import {
  CONFIRM_Q, LABELS, needsConfirm, noActionsNote, blockedReasonCopy, markNotReady,
  audienceChip, roomChip, stuckChip, endReasonCopy,
} from './producerStripCopy';
import { CPS_CSS } from './producerStripStyles';

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
 *
 * IT NOW ANSWERS THE TWO QUESTIONS A PRODUCER ASKS OUT LOUD: where am I in the hour, and is
 * anyone there. Both were already on the wire and neither was rendered — `content_started_at`
 * and `scheduled_start_at` came back on every producer read and went unread, and the audience
 * route had no caller at all since the day it was written. See `producerClock.ts` for the
 * first and `audienceChip` below for the second; the one rule shared by both is that a number
 * nobody can stand behind is not shown as a number.
 */

export interface ProducerStripProps {
  sessionId: string;
  /** Injected in tests. Production reads the real producer endpoint. */
  loadState?: (sessionId: string) => Promise<ProducerStateResult>;
  sendCommand?: (
    occurrenceId: string, command: ProducerCommand, expectedVersion: number,
  ) => Promise<{ outcome: string; currentVersion?: number }>;
  /** Injected in tests. A SEPARATE request from the state read — see `AUDIENCE_POLL_MS`. */
  loadAudience?: (occurrenceId: string) => Promise<LiveAudienceResult>;
  /**
   * Injected in tests, and passed straight through to the rundown.
   *
   * It exists as a prop on THIS component rather than only on the child because a child that
   * fetches for itself turns every unit test of this strip into one that makes a real request.
   * There is no global axios mock in this app, so that would be unmocked I/O inside a component
   * test — the thing `broadcastRoutes.test.ts` had to go back and fix on the backend.
   */
  loadRundown?: (sessionId: string) => Promise<RundownResult>;
  /** Injected in tests. The clip mark POST (D10), passed through for the same reason as the rest. */
  sendClipMark?: (sessionId: string) => Promise<import('../../services/broadcastProducer').ClipMarkResult>;
  /** Injected in tests. A THIRD request, keyed on the session rather than the occurrence (D8). */
  loadRoomPulse?: (sessionId: string) => Promise<RoomPulseResult>;
  /**
   * Called once, when the server has confirmed this viewer is a producer (D6).
   *
   * The page above needs to know, because the card it draws is 440px wide and a producer's
   * controls do not fit in it. It cannot work this out for itself: the only signal it has is
   * `isAuthenticated`, and widening on that would hand every signed-in STUDENT a 980px card
   * with nothing in it. The strip is the only thing that knows, so the strip says so.
   *
   * One-shot, matching `everAuthorized`, which never goes back to false. A strip that stopped
   * being authorized mid-class keeps the width it had, because the explanation it renders in
   * that case needs the room more than the state it replaced did.
   */
  onProducerConfirmed?: () => void;
}

/**
 * Slower than the companion's 2.5s: this is one staff member's control, the thing it waits on
 * (provider health) moves on the health loop's cadence rather than a human's, and the route's
 * limiter is 60/min — a 2.5s poll would spend 24 of those every minute before a single command.
 */
const POLL_MS = 5000;

/**
 * THE AUDIENCE POLL IS SLOWER THAN THE STATE POLL, AND THE REASON IS A RATE LIMIT, NOT TASTE.
 *
 * The audience route is a second request on a second key — it is keyed on the occurrence, while
 * the state read is keyed on the session — and it carries the COMMAND limiter, 30/min, shared
 * with the actual producer commands. It was written before any client called it, when "a
 * producer looking at a dashboard, not a player polling" was true; a caller that polls changes
 * that. At 5s this control would spend 12 of those 30 every minute, and a go-live sequence that
 * hit a version conflict and re-read could find the commands throttled by the viewer counter —
 * the one thing that must never be starved by a number nobody acts on.
 *
 * 15s leaves 26/min for commands, and a viewer count is a trend rather than a control: nobody
 * decides anything differently because the number is ten seconds old. If a later surface needs
 * it fresher, the route needs its own limiter — exactly the argument `producerStateLimiter`
 * already makes on the backend — and not a smaller number here.
 */
const AUDIENCE_POLL_MS = 15_000;

/**
 * States in which the room count is worth asking for (D8).
 *
 * Starts at `scheduled`, not at `live`: the room fills up before the class does, and "is
 * anyone here yet" is the question a producer asks backstage. Stops at `ended`, because a room
 * count left on screen after the class is over is a claim about a room that has emptied.
 */
const ROOM_WATCHED_STATES = ['scheduled', 'backstage', 'live', 'reconnecting'];

/** The commands worth showing a refusal for, rather than simply omitting. */
const EXPLAIN_WHEN_BLOCKED: ProducerCommand[] = ['go_live', 'mark_content_started'];

/**
 * A one-second tick, and only while something is actually counting.
 *
 * A clock polled at the state read's 5s would visibly stutter — 0:00, 0:05, 0:10 — so the
 * displayed time comes from a local tick between polls rather than from the poll. Off when
 * nothing is counting, because an ended class has a fixed duration and a timer running
 * through a finished airing is a wakeup every second for a number that cannot change.
 *
 * `setNow` on turning on matters: between the tick stopping and starting again, `now` went
 * stale, and the first render after the restart would show a time from the last airing.
 */
function useProducerTick(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return now;
}

export default function ProducerStrip(
  {
    sessionId, loadState, sendCommand, loadAudience, loadRundown, loadRoomPulse, sendClipMark,
    onProducerConfirmed,
  }: ProducerStripProps,
): React.ReactElement | null {
  const read = loadState ?? readProducerState;
  const send = sendCommand ?? sendProducerCommandRequest;
  const readAudience = loadAudience ?? readLiveAudienceRequest;
  const readPulse = loadRoomPulse ?? readRoomPulseRequest;

  const [state, setState] = useState<ProducerStateResult | null>(null);
  const [busy, setBusy] = useState<ProducerCommand | null>(null);
  const [confirming, setConfirming] = useState<ProducerCommand | null>(null);
  /**
   * TWO NOTICES, NOT ONE, and the separation is load-bearing.
   *
   * Every command is followed immediately by a re-read. A single notice meant that re-read
   * cleared the message the command had just set — so "this airing moved under you, now at
   * version 9" appeared and vanished within the same tick, which is worse than never showing
   * it: the producer sees a flicker and learns nothing. A command's outcome is owned by the
   * command and survives until the producer issues the next one; a read failure is owned by
   * the poll and clears as soon as a read succeeds.
   */
  const [commandNotice, setCommandNotice] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  /**
   * WHETHER THIS VIEWER HAS EVER BEEN ANSWERED AS A PRODUCER.
   *
   * The control hides itself on every poll tick, which is right the first time and wrong
   * every time after. A later poll can answer `forbidden` for reasons that have nothing to do
   * with who is watching — the participant token expires mid-class, the broadcast flag is
   * turned off, staff context fails to resolve — and the strip would then vanish between one
   * tick and the next, in the middle of an airing, with no explanation and End being the
   * thing most needed. A control that disappears silently is indistinguishable from one that
   * was never there.
   *
   * So the hide is only silent BEFORE the server has ever called this viewer a producer.
   * After that it says what happened. The security property is unchanged: a viewer who is
   * not a producer never gets a successful read, so this never becomes true for them and
   * they never see a trace of the control.
   */
  const [everAuthorized, setEverAuthorized] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const next = await read(sessionId);
    // A failed poll does NOT blank a control a producer may be mid-sequence with: the last
    // good picture plus a notice is more use than an empty strip. The first read is the
    // exception — there is nothing to keep.
    setState((prev) => (next.outcome === 'failed' && prev ? prev : next));
    setReadFailed(next.outcome === 'failed');
    if (next.outcome === 'ok' && next.found && next.occurrence) setEverAuthorized(true);
  }, [read, sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let alive = true;
    const tick = () => { if (alive) void refresh(); };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [sessionId, refresh]);

  /**
   * Tell the page above that this viewer is a producer, exactly once (D6).
   *
   * In an effect rather than inside `refresh`, because calling a parent's setState from inside
   * a fetch callback ties the parent's render to this component's poll. The ref guard rather
   * than the flag alone, because the callback may be a fresh arrow on every parent render,
   * which would otherwise re-fire this on every render for the rest of the class.
   */
  const toldParent = useRef(false);
  useEffect(() => {
    if (!everAuthorized || toldParent.current) return;
    toldParent.current = true;
    onProducerConfirmed?.();
  }, [everAuthorized, onProducerConfirmed]);

  /**
   * The occurrence, pulled out ahead of the render guards because the hooks below need it and
   * hooks cannot sit after a conditional return. `null` covers every not-a-producer case.
   */
  const occ = state && state.outcome === 'ok' && state.found !== false ? state.occurrence ?? null : null;
  const onAir = occ ? occ.editorial_state === 'live' || occ.editorial_state === 'reconnecting' : false;

  const now = useProducerTick(occ ? clockTicks(occ) : false);
  const reading = occ ? producerClock(occ, now) : null;

  /**
   * The audience count. Kept apart from the state read rather than folded into it, because
   * they are genuinely two different requests: different route, different key (occurrence vs
   * session), different limiter, and a failure of one must not blank the other.
   *
   * `audStale` rather than storing the failure in `aud`: a failed request has no count, so
   * writing it over the last good one would throw away the only number there is. The last real
   * answer stays and the chip says it is not moving.
   */
  const [aud, setAud] = useState<LiveAudienceResult | null>(null);
  const [audStale, setAudStale] = useState(false);

  /**
   * Hoisted out of the effect so the dependency list can be the id rather than the occurrence.
   * The state poll hands back a fresh object every 5s; an effect depending on that object
   * would tear this poll down and restart it — and re-fire it — three times a minute.
   */
  const occurrenceId = occ ? occ.id : null;

  useEffect(() => {
    // Only while on air. Before that the count is of nobody, and polling it through the
    // go-live sequence would be spending the command budget at the worst possible moment.
    if (!onAir || !occurrenceId) return undefined;
    /**
     * Drop the previous count before asking for this one. Without it, a session that re-airs —
     * DOC 03 permits more than one occurrence per session — would show the PREVIOUS airing's
     * number for one request after the new occurrence appeared. One request is a short window
     * and a wrong number all the same, and the whole point of this chip is that it is never a
     * number nobody can stand behind.
     */
    setAud(null);
    setAudStale(false);
    let alive = true;
    const tick = async (): Promise<void> => {
      const r = await readAudience(occurrenceId);
      if (!alive) return;
      if (r.outcome === 'failed') { setAudStale(true); return; }
      setAudStale(false);
      setAud(r);
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, AUDIENCE_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [onAir, occurrenceId, readAudience]);

  /**
   * THE ROOM, which is a different question from the audience (D8).
   *
   * Keyed on the SESSION rather than the occurrence, and polled from backstage onward rather
   * than only on air, because "is anyone here yet" is a backstage question - the room fills up
   * before the class starts. Same stale-rather-than-overwrite handling as the audience count,
   * for the same reason: a failed request has no number, and writing it over the last good one
   * would throw away the only figure there is.
   */
  const [pulse, setPulse] = useState<RoomPulseResult | null>(null);
  const [pulseStale, setPulseStale] = useState(false);
  const roomWatched = occ ? ROOM_WATCHED_STATES.includes(occ.editorial_state) : false;

  useEffect(() => {
    if (!roomWatched || !sessionId) return undefined;
    setPulse(null);
    setPulseStale(false);
    let alive = true;
    const tick = async (): Promise<void> => {
      const r = await readPulse(sessionId);
      if (!alive) return;
      if (r.outcome === 'failed') { setPulseStale(true); return; }
      setPulseStale(false);
      setPulse(r);
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, AUDIENCE_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [roomWatched, sessionId, readPulse]);

  const run = useCallback(async (command: ProducerCommand): Promise<void> => {
    const occurrence = state?.occurrence;
    if (!occurrence) return;
    setConfirming(null);
    // A new command means a new outcome; the previous one is no longer what happened.
    setCommandNotice(null);
    setBusy(command);
    try {
      const result = await send(occurrence.id, command, occurrence.version);
      if (result.outcome === 'conflict') {
        // Someone else moved it. Say so plainly and re-read rather than retrying on a version
        // the server has already refused.
        setCommandNotice(
          result.currentVersion != null
            ? `This airing moved under you (now at version ${result.currentVersion}). Reading it again.`
            : 'This airing moved under you. Reading it again.',
        );
      } else if (result.outcome === 'forbidden') {
        setCommandNotice('The server says you are not a producer for this airing.');
      } else if (result.outcome === 'failed') {
        setCommandNotice(`Could not send ${LABELS[command]}. Nothing changed.`);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [refresh, send, state]);

  /**
   * The one shape this component can render: an occurrence plus its command list. Resolved as
   * a single value so the two guards below need no non-null assertions — anything else is
   * "nothing to show", and the only question left is whether to say why.
   */
  const live = occ ? { occurrence: occ, commands: state?.commands ?? [] } : null;

  // Not a producer, feature dark, or no broadcast for this session: render nothing at all —
  // but only while the server has never answered otherwise. See `everAuthorized`.
  if (!live && !everAuthorized) return null;

  if (!live) {
    /**
     * It was here a moment ago. Say so, and say what to do — a producer mid-airing needs to
     * know whether to re-authenticate or reach for the API fallback, and the one thing that
     * helps nobody is an empty space where the End button was.
     *
     * No command buttons: the server has stopped authorizing this caller, so every one of
     * them would fail. Offering them would be the dead affordance this subsystem keeps
     * finding.
     */
    return (
      <section className="cps" data-testid="producer-strip" aria-label="Producer controls">
        <style>{CPS_CSS}</style>
        <p className="cps-notice" role="status" data-testid="producer-revoked">
          <b>Producer controls are no longer available for this class.</b> The server stopped
          authorizing this session. Most often an expired sign-in, or the broadcast feature
          being switched off. Sign in again to get them back. If a class is on air and needs
          ending now, use the API fallback in the go-live directive.
        </p>
      </section>
    );
  }

  const { occurrence, commands } = live;
  const available = commands.filter((c) => c.available);
  const blocked = commands.filter(
    (c) => !c.available && c.error_class && EXPLAIN_WHEN_BLOCKED.includes(c.command),
  );
  const audience = audienceChip(onAir, aud, audStale);
  /**
   * The two chip inputs, derived once rather than twice. `measured` is the only shape that
   * carries numbers; `unmeasured` is the server saying it is not collecting, which the chips
   * must render as words. `forbidden` deliberately produces neither, so the chips disappear
   * for a viewer who is not entitled to the counts instead of nagging about a failed read.
   */
  const measured = pulse && pulse.outcome === 'ok' ? pulse : null;
  const unmeasured = pulse?.outcome === 'unknown';
  const endReason = endReasonCopy(occurrence.editorial_state, occurrence.end_reason);

  return (
    <section className="cps" data-testid="producer-strip" aria-label="Producer controls">
      <style>{CPS_CSS}</style>

      <ProducerHeader
        occurrence={occurrence}
        onAir={onAir}
        reading={reading}
        audience={audience}
        room={roomChip(measured, unmeasured, pulseStale)}
        stuck={stuckChip(measured, unmeasured, pulseStale)}
      />

      {/* A rehearsal says what it does and does not reach. See the component. */}
      {occurrence.editorial_state === 'backstage' && <ProducerRehearsalNotice />}

      {/* Who ended it, once it is over (D8). The value was already on the wire and unread. */}
      {endReason && (
        <p className="cps-note" data-testid="producer-end-reason">{endReason}</p>
      )}

      <div className="cps-actions">
        {/* D10 - stamp a moment that no slide advance will catch. Disabled, with the reason,
            rather than hidden: a control that vanishes is indistinguishable from one that was
            never there. */}
        <ClipMarkButton
          sessionId={sessionId}
          ready={onAir && !!occurrence.content_started_at}
          notReadyReason={markNotReady(occurrence)}
          sendMark={sendClipMark}
        />
        {available.map((c) => (
          <React.Fragment key={c.command}>
            {confirming === c.command ? (
              <span className="cps-confirm" data-testid={`producer-confirm-${c.command}`}>
                <span className="cps-confirm-q">{CONFIRM_Q[c.command]}</span>
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
                className={`cps-btn${needsConfirm(c.command) ? ' cps-btn-danger' : ''}`}
                disabled={busy !== null}
                data-testid={`producer-cmd-${c.command}`}
                onClick={() => {
                  if (needsConfirm(c.command)) setConfirming(c.command);
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
            {noActionsNote(occurrence.editorial_state)}
          </span>
        )}
      </div>

      {blocked.map((c) => (
        <p className="cps-blocked" key={c.command} data-testid={`producer-blocked-${c.command}`}>
          {blockedReasonCopy(c.command, c.reason ?? '')}
        </p>
      ))}

      {commandNotice && (
        <p className="cps-notice" role="status" data-testid="producer-notice">{commandNotice}</p>
      )}

      {readFailed && (
        <p className="cps-notice" role="status" data-testid="producer-read-notice">
          Could not reach the broadcast just now, and is still trying. What you see below is the last
          answer that arrived.
        </p>
      )}

      {/*
        * P4-02's segment rundown: which part of the show is on air and whether it is keeping to
        * the plan. Its own component on its own request, so a kit-spec problem cannot take the
        * controls above it away, and its own file so this one stays under the line ceiling. The
        * tick is passed down rather than started again — the pace verdict and the clock in the
        * header have to be measured from the same instant to be comparable at all.
        */}
      <ProducerRundown sessionId={sessionId} occurrence={occurrence} now={now} load={loadRundown} />
    </section>
  );
}
