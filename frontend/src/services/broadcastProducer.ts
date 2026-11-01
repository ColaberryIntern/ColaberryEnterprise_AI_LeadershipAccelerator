/**
 * The producer's half of the broadcast: putting it on air and ending it.
 *
 * Exists because Ali asked the obvious question during Test 2 — "can we just end it once the
 * stream is done? I won't have you there every time." Until now the only way to end a
 * broadcast was an engineer running a producer command by hand, and on 20 Oct the occurrence
 * sat in `live` for five minutes after the stream stopped, advertising a broadcast over dead
 * air.
 *
 * WHY THIS LIVES IN THE PORTAL AND NOT THE ADMIN APP. The command route authenticates a
 * PARTICIPANT and derives producer rights from the staff context on that token. A control in
 * the admin app would need either a second command route or a participant token it does not
 * have, and a second command path is exactly the duplication this subsystem keeps being warned
 * about. Ali already watches his own broadcast in the portal; the control belongs where he is.
 *
 * ENDING IS NOT REVERSIBLE. There is no un-end command, and the state machine treats `ended`
 * as terminal. The caller must confirm before invoking this.
 */
import portalApi from '../utils/portalApi';

export type EndOutcome = 'ended' | 'conflict' | 'forbidden' | 'failed';

export interface EndResult {
  outcome: EndOutcome;
  /** Present on conflict: the version the server believes is current, if it said. */
  currentVersion?: number;
}

/**
 * End a live broadcast, guarded on the version the caller last saw.
 *
 * A 409 is NOT an error to retry blindly: it means the occurrence moved under us, so the
 * producer is looking at a stale picture and should see a fresh one before deciding again.
 * That is reported rather than swallowed.
 */
export async function endBroadcast(occurrenceId: string, expectedVersion: number): Promise<EndResult> {
  const r = await sendProducerCommand(occurrenceId, 'end', expectedVersion);
  // `ended` rather than `sent`, kept for the mini player's existing contract: that control
  // only ever issues this one command, and reading "ended" at its call site is clearer than
  // a generic success.
  return r.outcome === 'sent'
    ? { outcome: 'ended' }
    : { outcome: r.outcome, currentVersion: r.currentVersion };
}

/**
 * The commands a client may send. Mirrors `SENDABLE_PRODUCER_COMMANDS` on the backend, which
 * is also what the route's schema is built from — `begin_processing` and `publish_replay` are
 * absent on purpose, because a replay publishes itself and a hand-sent one would race the
 * health loop.
 */
export type ProducerCommand =
  | 'enter_backstage' | 'return_to_scheduled' | 'mark_content_started'
  | 'go_live' | 'end' | 'cancel';

export type CommandOutcome = 'sent' | 'conflict' | 'forbidden' | 'failed';

export interface CommandResult {
  outcome: CommandOutcome;
  /** Present on conflict: the version the server says is current. */
  currentVersion?: number;
}

/**
 * Send one producer command, guarded on the version the caller last saw.
 *
 * A 409 is NOT an error to retry blindly: it means the occurrence moved under us, so the
 * producer is looking at a stale picture. The server now returns the version that is actually
 * current with that refusal, so the caller can re-read and decide again rather than reload.
 */
export async function sendProducerCommand(
  occurrenceId: string,
  command: ProducerCommand,
  expectedVersion: number,
): Promise<CommandResult> {
  try {
    await portalApi.post(`/api/portal/broadcasts/${occurrenceId}/command`, {
      command,
      expected_version: expectedVersion,
    });
    return { outcome: 'sent' };
  } catch (err: unknown) {
    const res = (err as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
    const status = res?.status;
    if (status === 409) {
      const v = res?.data?.version;
      return { outcome: 'conflict', currentVersion: typeof v === 'number' ? v : undefined };
    }
    // 403 is a real answer, not a failure: this viewer is not a producer. It should be
    // unreachable from the UI, because the control is only rendered when the server said so
    // — but the server deciding again is the reason that is safe.
    if (status === 403 || status === 401) return { outcome: 'forbidden' };
    return { outcome: 'failed' };
  }
}

/** One command, and why it cannot be sent right now. Mirrors the backend's description. */
export interface CommandAvailability {
  command: ProducerCommand;
  available: boolean;
  /** The server's own refusal text, or `no_change` when the command would do nothing. */
  reason?: string;
  /** Absent when the command is merely a no-op, which is how "already done" reads. */
  error_class?: string;
}

export interface ProducerOccurrence {
  id: string;
  title: string;
  editorial_state: string;
  provider_health: string;
  version: number;
  content_started_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  scheduled_start_at: string | null;
}

export type ProducerReadOutcome = 'ok' | 'forbidden' | 'failed';

export interface ProducerStateResult {
  outcome: ProducerReadOutcome;
  /** False when live was never enabled for this session. Only meaningful when `ok`. */
  found?: boolean;
  occurrence?: ProducerOccurrence | null;
  commands?: CommandAvailability[];
}

/**
 * Read the producer's view of this class: state, provider health, the version to act on, and
 * which commands are available right now.
 *
 * THIS IS THE READ THAT MAKES A GO LIVE CONTROL POSSIBLE. The playback grant was the only
 * endpoint that returned a version, and it answers 503 on a scheduled occurrence — so before
 * this route, the first command in the sequence was the one whose version could not be read.
 *
 * `forbidden` is reported rather than swallowed, because it is the signal the control uses to
 * render nothing at all: this page is loaded by ordinary viewers, and a producer strip must
 * never appear for one.
 */
export async function readProducerState(sessionId: string): Promise<ProducerStateResult> {
  try {
    const res = await portalApi.get<{
      found: boolean;
      occurrence: ProducerOccurrence | null;
      commands: CommandAvailability[];
    }>(`/api/portal/broadcasts/session/${sessionId}/producer`);
    return {
      outcome: 'ok',
      found: res.data.found,
      occurrence: res.data.occurrence,
      commands: res.data.commands ?? [],
    };
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    // 404 means the broadcast feature is dark (the flag gate answers before auth), which from
    // a producer's point of view is the same instruction as "not for you": render nothing.
    if (status === 403 || status === 401 || status === 404) return { outcome: 'forbidden' };
    return { outcome: 'failed' };
  }
}

/**
 * Four answers, and the second one is the reason this is not a plain `number | null`.
 *
 *  - `ok`      a measurement arrived. The count may be 0, which is a real verdict.
 *  - `unknown` collection is down. NOT zero. The server answers 503 for this and deliberately
 *              omits the count field entirely; this mirrors that refusal into the type, so a
 *              caller cannot render a number it was never given.
 *  - `forbidden` not a producer, or the feature is dark. Render nothing.
 *  - `failed`  the request did not land. The last good count is still the best thing to show,
 *              labelled as not updating.
 */
export type AudienceOutcome = 'ok' | 'unknown' | 'forbidden' | 'failed';

export interface LiveAudienceResult {
  outcome: AudienceOutcome;
  /** Only ever present when `ok`. Absent is "we do not know"; 0 is "nobody is watching". */
  watchingNow?: number;
}

/**
 * How many people are watching right now, for the producer.
 *
 * ZERO AND "WE DO NOT KNOW" MUST NOT COLLAPSE INTO EACH OTHER, and the client is where that
 * would happen. The server goes to real trouble to keep them apart — a collection failure
 * answers 503 with no count field at all, precisely so a client cannot print a fabricated
 * zero — and the usual `?? 0` on the way in would undo all of it in one character. "Nobody
 * watched" is a verdict on the broadcast; "collection is down" is a verdict on us, and a
 * producer who reads the second as the first stops a class people are watching.
 *
 * So the count is carried only when the server both said `available` and sent a number. An
 * `available: true` body with no usable count is a contract violation on the server's side
 * and is reported as `unknown` rather than guessed at.
 *
 * ONLY `watching_now` IS LIFTED. The route also returns `deliberate`, `auto` and `by_mode`.
 * They are genuinely useful after the fact and useless mid-air: a producer cannot act on the
 * autoplay split while teaching, and putting four numbers where one belongs costs the one
 * number its glanceability. They stay on the wire for the metrics surface that wants them.
 */
export async function readLiveAudience(occurrenceId: string): Promise<LiveAudienceResult> {
  try {
    const res = await portalApi.get<{ available?: boolean; watching_now?: number }>(
      `/api/portal/broadcasts/${occurrenceId}/audience`,
    );
    const n = res.data?.watching_now;
    if (res.data?.available === true && typeof n === 'number' && Number.isFinite(n)) {
      return { outcome: 'ok', watchingNow: n };
    }
    return { outcome: 'unknown' };
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 403 || status === 401 || status === 404) return { outcome: 'forbidden' };
    // 503 is the server's own "we are not measuring" — a successful answer to the question,
    // not a failed request, and the one case where the strip must say so out loud.
    if (status === 503) return { outcome: 'unknown' };
    // Everything else, 429 included. A throttled producer is dropping measurements, which is
    // the same thing to show as a dropped request: the last count, marked stale.
    return { outcome: 'failed' };
  }
}
