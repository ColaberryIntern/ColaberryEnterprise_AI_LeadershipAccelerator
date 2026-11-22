import { roomProvider } from './roomProvider';
import { ReplayScopeError, type ReplayFiles, type ReplayTranscript, type StoredRecording } from './replayFiles';
import { replayObservationRows, scoreTranscript } from './replayScoring';
import * as store from './replayStore';
import { writeObservations } from '../careerPrep/observationWriter';
import type { ObservationRow } from '../careerPrep/observationAdapters';

/**
 * Career Prep v27, CP9.2 (kit F5 "replay"): after an interview is held (state done) WITH everyone's recording consent
 * for the meeting it was held in (replayStore.CONSENTED, checked in the scan and again under the row lock before any
 * fetch), fetch Zoom's transcript and recording through roomProvider, score the candidate's answers (replayScoring.ts)
 * and store ONE replay (interview_replays, interview_id UNIQUE). Never for an unconsented or partly consented interview.
 *
 * Order inside one attempt: claim (the lease) -> ONE Zoom recording (its transcript and its MP4) -> score -> observations (ON CONFLICT DO
 * NOTHING, so a retry after a crash writes nothing twice) -> finish (only the claiming attempt). Running the pass twice
 * therefore makes one replay and no new observations.
 *
 * Failure modes handled:
 *   Zoom permission missing (ReplayScopeError)   unavailable, "Replay unavailable: Zoom permission missing." ONCE; no retry.
 *   nothing at Zoom yet / a Zoom or network error  stays waiting; retried every pass after attempts x 15 minutes, at most
 *                                                  12 attempts (about 16 hours), then unavailable with the reason.
 *   recording but no transcript at the last try    no_score (the recording can still be played), reason says why.
 *   no single voice matches the learner            no_score (NO_SPEAKER); nothing is guessed.
 *   observations or the finish fail                the row stays waiting; the next attempt repeats it (idempotent).
 * Not handled: a transcript Zoom later REPLACES (the first finished replay stands); Zoom down for all 12 attempts (the
 * reason says so and a person can look). The video is never analyzed: only the transcript's words and timings are read.
 */
export const PASS_EVERY_MS = 15 * 60_000;
export const SCOPE_REASON = 'Replay unavailable: Zoom permission missing.';
export const NOTHING_REASON = 'Zoom has no recording of this interview, so there is no replay.';
export const NO_TRANSCRIPT_REASON = 'Zoom made no transcript of this recording, so nothing was scored. The recording can still be played.';
export const GAVE_UP_REASON = 'Zoom could not be reached for this recording after many tries, so there is no replay.';

export interface ReplayProvider {
  replayFiles(meetingId: string): Promise<ReplayFiles>;
}
export interface ReplayDeps {
  provider?: ReplayProvider;
  store?: Pick<typeof store, 'listDue' | 'claim' | 'finish' | 'keepWaiting'>;
  write?: (rows: readonly ObservationRow[]) => Promise<number>;
}
export type Outcome = 'scored' | 'no_score' | 'unavailable' | 'waiting' | 'skipped' | 'failed';
export interface PassResult { scanned: number; outcomes: Record<Outcome, number> }

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}
const errClass = (e: unknown) => ((e as Error)?.name && (e as Error).name !== 'Error' ? (e as Error).name : 'UpstreamUnavailable');

type Fetched = { kind: 'scope' } | { kind: 'error'; err: unknown } | { kind: 'ok'; transcript: ReplayTranscript | null; recording: StoredRecording | null };

async function fetchBoth(p: ReplayProvider, c: store.Claimed): Promise<Fetched> {
  try {
    const { transcript, recording } = await p.replayFiles(c.meetingId);
    return { kind: 'ok', transcript, recording };
  } catch (err) {
    return err instanceof ReplayScopeError ? { kind: 'scope' } : { kind: 'error', err };
  }
}

/** One claimed interview, start to finish. */
export async function replayOne(c: store.Claimed, deps: Required<ReplayDeps>): Promise<Outcome> {
  const s = deps.store;
  const last = c.attempt >= store.MAX_ATTEMPTS;
  const end = async (status: store.Finish['status'], reason: string | null, recording: StoredRecording | null, extra: Partial<store.Finish> = {}): Promise<Outcome> =>
    ((await s.finish(c, { status, reason, recording, questions: [], score: null, ...extra })) ? status : 'skipped');
  const got = await fetchBoth(deps.provider, c);
  if (got.kind === 'scope') return end('unavailable', SCOPE_REASON, null);
  if (got.kind === 'error') {
    log('warn', 'placement_replay_fetch_failed', { interview_id: c.interviewId, attempt: c.attempt }, errClass(got.err));
    return last ? end('unavailable', GAVE_UP_REASON, null) : 'waiting';
  }
  if (!got.transcript) {
    if (!last) { await s.keepWaiting(c, got.recording); return 'waiting'; }
    return got.recording ? end('no_score', NO_TRANSCRIPT_REASON, got.recording) : end('unavailable', NOTHING_REASON, null);
  }
  const scored = scoreTranscript(got.transcript.cues, c.fullName);
  if (scored.status === 'no_score') return end('no_score', scored.reason, got.recording);
  await deps.write(replayObservationRows(c.enrollmentId, c.interviewId, scored.questions, c.startsAt));
  return end('scored', null, got.recording, { questions: scored.questions, score: scored.score });
}

const resolve = (d: ReplayDeps): Required<ReplayDeps> => ({ provider: d.provider ?? roomProvider, store: d.store ?? store, write: d.write ?? writeObservations });

/** One pass: every due interview, one at a time (at most PASS_LIMIT). One interview's failure never stops the pass. */
export async function runReplayPass(d: ReplayDeps = {}): Promise<PassResult> {
  const deps = resolve(d);
  const outcomes: Record<Outcome, number> = { scored: 0, no_score: 0, unavailable: 0, waiting: 0, skipped: 0, failed: 0 };
  const due = await deps.store.listDue();
  for (const row of due) {
    try {
      const c = await deps.store.claim(row.id);
      outcomes[c ? await replayOne(c, deps) : 'skipped'] += 1;
    } catch (err) {
      outcomes.failed += 1;
      log('error', 'placement_replay_failed', { interview_id: row.id }, errClass(err));
    }
  }
  log('info', 'placement_replay_pass', { scanned: due.length, ...outcomes });
  return { scanned: due.length, outcomes };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** placementBoot SCHEDULERS: a pass every 15 minutes (never two at once in this process); does nothing until a held, consented interview exists. */
export function startReplayJob(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    runReplayPass().catch((err: unknown) => log('error', 'placement_replay_pass_failed', {}, errClass(err))).finally(() => { running = false; });
  }, PASS_EVERY_MS);
  timer.unref?.();
}
