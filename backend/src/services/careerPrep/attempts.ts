import fs from 'fs';
import { sequelize } from '../../config/database';
import { transcribe, type TranscribeCall } from '../hire/hireVideoTranscribe';
import { speechMetrics } from '../hire/hireVideoSpeech';
import { coachingNotes, deliveryScores } from '../hire/hireVideoAnalysis';
import { writeObservations } from './observationWriter';
import type { ObservationRow } from './observationAdapters';
import { NotFoundError } from './sessions';

/**
 * Career Prep v27, CP4.4: a recorded "Try" answer (prep_attempts), scored with the same pipeline as the
 * Hire intro video (hireVideoTranscribe, hireVideoSpeech, hireVideoAnalysis): pace and filler words
 * against their published targets. The intro video's LENGTH target (about 90 s) does not apply to a
 * practice answer, so its score and note are left out. Only the audio's words and timing are used; no video
 * frame is analyzed. CONTENT is not scored into observations in Release 1 (declared deviation, plan.md T20):
 * content scoring gives levels, and whether levels may ever count toward skill numbers is Ali's open call.
 *
 * RETRY-SAFE: (session_id, client_key) is UNIQUE, so a retried upload returns the same attempt and is not
 * scored twice. Scoring runs in a one-at-a-time in-process queue; the uploaded file is deleted after
 * scoring whether it worked or not. A failure is stored (status failed + error_class) and the student
 * records again. At boot, attempts still pending (their files are gone with the restart) are marked failed.
 * Scores become observations (source video, ref attempt:<id>) only when scoring succeeds.
 */
export interface AttemptResult { seconds: number; scores: Array<{ key: string; label: string; score: number; value: string; target: string; source: string }>; notes: string[] }
export interface AttemptView { id: string; status: 'pending' | 'done' | 'failed'; result: AttemptResult | null; errorClass: string | null }
type Row = { id: string; status: AttemptView['status']; result: AttemptResult | null; error_class: string | null };
const view = (r: Row): AttemptView => ({ id: String(r.id), status: r.status, result: r.result ?? null, errorClass: r.error_class ?? null });
const SKILL_OF: Record<string, string> = { pace: 'pace_clarity', fillers: 'few_fillers' };

export async function createAttempt(enrollmentId: string, sessionId: string, segmentIndex: number, clientKey: string): Promise<{ attempt: AttemptView; created: boolean }> {
  const [own] = await sequelize.query(`SELECT jsonb_array_length(segments) AS n FROM prep_sessions WHERE id = :s AND enrollment_id = :e AND status IN ('running','paused')`,
    { replacements: { s: sessionId, e: enrollmentId } });
  const session = (own as Array<{ n: number }>)[0];
  if (!session || segmentIndex >= Number(session.n)) throw new NotFoundError();
  const [made] = await sequelize.query(
    `INSERT INTO prep_attempts (session_id, enrollment_id, segment_index, client_key) VALUES (:s, :e, :i, :k)
     ON CONFLICT (session_id, client_key) DO NOTHING RETURNING id, status, result, error_class`,
    { replacements: { s: sessionId, e: enrollmentId, i: segmentIndex, k: clientKey } });
  if ((made as Row[]).length) return { attempt: view((made as Row[])[0]), created: true };
  const [found] = await sequelize.query('SELECT id, status, result, error_class FROM prep_attempts WHERE session_id = :s AND client_key = :k',
    { replacements: { s: sessionId, k: clientKey } });
  return { attempt: view((found as Row[])[0]), created: false };
}

export async function getAttempt(enrollmentId: string, sessionId: string, attemptId: string): Promise<AttemptView> {
  const [rows] = await sequelize.query('SELECT id, status, result, error_class FROM prep_attempts WHERE id = :a AND session_id = :s AND enrollment_id = :e',
    { replacements: { a: attemptId, s: sessionId, e: enrollmentId } });
  const r = (rows as Row[])[0];
  if (!r) throw new NotFoundError();
  return view(r);
}

/**
 * When a transcript is not a real answer. Whisper fills a mostly silent recording with a loop of one phrase
 * (production 2026-11-16: "i'm i'm" 69 times, scored as 371 wpm and 83.3% repetition), so such a transcript
 * must never become a score or an observation. The thresholds are set so a real speaker never trips them:
 *   minWords 8        under 8 words is not an answer to an interview question (a real 30-60 s answer is 70+).
 *   maxWpm 260        fast conversational speech peaks around 200-230 words a minute (the pace target is
 *                     100 to 165); above 260 over the speaking span is words that were not really said.
 *   loop share 0.4    one 1- to 4-word phrase, said at least 6 times, covering 40% or more of all words. In
 *                     real speech the most common word ("the", "I") is under 10% of words, and a repeated
 *                     phrase rarely covers more than 5%; the minimum of 6 keeps a short answer that says
 *                     "and I" twice from tripping it.
 */
export const UNCLEAR = { minWords: 8, maxWpm: 260, loopShare: 0.4, loopMinRepeats: 6 } as const;
export class UnclearAudioError extends Error {
  readonly error_class = 'UnclearAudio';
  constructor(readonly reason: string) { super(`unclear audio: ${reason}`); this.name = 'UnclearAudioError'; }
}

/** Pure: why this transcript is not a clear answer ('few_words' | 'too_fast' | 'loop'), or null when it is one. */
export function unclearAudio(words: Parameters<typeof speechMetrics>[0], seconds: number): string | null {
  const toks = words.map((w) => w.word.toLowerCase().replace(/[^a-z']/g, '')).filter(Boolean);
  if (toks.length < UNCLEAR.minWords) return 'few_words';
  const wpm = speechMetrics(words, seconds).wordsPerMinute;
  if (wpm !== null && wpm > UNCLEAR.maxWpm) return 'too_fast';
  for (let n = 1; n <= 4; n += 1) {
    const counts = new Map<string, number>();
    for (let i = 0; i + n <= toks.length; i += 1) {
      const key = toks.slice(i, i + n).join(' ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const top = Math.max(0, ...counts.values());
    if (top >= UNCLEAR.loopMinRepeats && (top * n) / toks.length >= UNCLEAR.loopShare) return 'loop';
  }
  return null;
}

/** Pure: the result shown to the student, from a transcript. */
export function attemptResult(words: Parameters<typeof speechMetrics>[0], seconds: number): AttemptResult {
  const m = speechMetrics(words, seconds);
  return { seconds: m.seconds, scores: deliveryScores(m).filter((s) => s.key !== 'length'), notes: coachingNotes(m).slice(1) };
}

/** The observations one scored attempt becomes (pace and fillers only; ref attempt:<id>). Shared with the recap. */
export function attemptObservationRows(enrollmentId: string, attemptId: string, result: AttemptResult, observedAt: Date): ObservationRow[] {
  return result.scores.filter((s) => SKILL_OF[s.key])
    .map((s) => ({ enrollmentId, skill: SKILL_OF[s.key], value: s.score, source: 'video', sourceRef: `attempt:${attemptId}`, observedAt }));
}

export interface ScoreDeps { transcribeCall?: TranscribeCall }

export async function scoreAttempt(attemptId: string, enrollmentId: string, file: string, deps: ScoreDeps = {}): Promise<'done' | 'failed'> {
  try {
    const t = await transcribe(file, deps.transcribeCall);
    // A silent or garbled recording is failed as UnclearAudio BEFORE anything is written (no observations).
    const unclear = unclearAudio(t.words, t.duration);
    if (unclear) throw new UnclearAudioError(unclear);
    const result = attemptResult(t.words, t.duration);
    await writeObservations(attemptObservationRows(enrollmentId, attemptId, result, new Date()));
    await sequelize.query(`UPDATE prep_attempts SET status = 'done', result = CAST(:r AS JSONB) WHERE id = :a`, { replacements: { r: JSON.stringify(result), a: attemptId } });
    return 'done';
  } catch (err) {
    const errorClass = (err as { error_class?: string; name?: string })?.error_class ?? (err as Error)?.name ?? 'UpstreamUnavailable';
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'career_prep_attempt_failed', outcome: 'failure', error_class: errorClass }));
    await sequelize.query(`UPDATE prep_attempts SET status = 'failed', error_class = :c WHERE id = :a`, { replacements: { c: String(errorClass).slice(0, 40), a: attemptId } }).catch(() => undefined);
    return 'failed';
  } finally {
    await fs.promises.rm(file, { force: true }).catch(() => undefined);
  }
}

const queued = new Set<string>();
let chain: Promise<unknown> = Promise.resolve();
/** One attempt at a time; an attempt already waiting is not queued twice. */
export function enqueueAttempt(attemptId: string, enrollmentId: string, file: string, deps: ScoreDeps = {}): Promise<unknown> {
  if (queued.has(attemptId)) return chain;
  queued.add(attemptId);
  chain = chain.then(() => scoreAttempt(attemptId, enrollmentId, file, deps)).catch(() => undefined).finally(() => queued.delete(attemptId));
  return chain;
}

/** At boot: attempts left pending by a restart lost their files; mark them failed so the student records again. */
export async function failStaleAttempts(): Promise<number> {
  const [rows] = await sequelize.query(`UPDATE prep_attempts SET status = 'failed', error_class = 'Interrupted' WHERE status = 'pending' RETURNING id`);
  return (rows as unknown[]).length;
}
