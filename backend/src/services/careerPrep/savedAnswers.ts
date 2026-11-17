import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { assetDir, assetFile, isAssetId, newAssetId, removeAsset } from '../hire/hireVideoFiles';
import { makeRendition, VideoRejectedError, type Runner } from '../hire/hireVideoTranscode';
import { NotFoundError } from './sessions';

/**
 * Career Prep R1.1 (Ali, 2026-11-16): "By default delete them, but also allow them to save to profile ...
 * They have to check something to save and can easily delete."
 *
 *   PENDING   After a Try answer is scored, its recording waits here for at most PENDING_MS (1 hour), so the
 *             student can look at the score and tick "Save this answer to my profile". Nothing else reads it.
 *             sweepPending (on boot and every 10 minutes) deletes anything older; a failed or unclear
 *             recording never waits (scoreAttempt deletes it at once).
 *   SAVED     Ticking the box transcodes the recording into PREP_ANSWER_ROOT/<assetId>/ (stream.mp4 and
 *             poster.jpg, the same rendition as the Hire intro video) and records it in prep_saved_answers.
 *             Unticking, or Delete in the Hire studio, removes the row and the folder.
 *
 * PLAYBACK IS THE OWNER'S ONLY. A <video> cannot send the portal's bearer token, so the authed list mints a
 * signed, expiring `?t=` token per asset (the intro video's draft-preview pattern). A token is minted only in
 * a response to the signed-in owner.
 *
 * PUBLIC IS A SECOND OPT-IN (R1.2, Ali's Q1: A). `show_public` is off by default and flipped per answer by its
 * owner. An answer is public only while it is saved, switched on, AND its owner's portfolio page is published
 * with visibility `public` (an unlisted or hidden page shows no practice answers). Public playback is its own
 * route (/api/public/hire/practice-answer/...) that re-checks all three on EVERY request, so switching off or
 * deleting takes effect at once, and it never mints or accepts the owner's signed `?t=` token.
 */
export const PREP_ANSWER_ROOT = path.resolve(process.env.PREP_ANSWER_DIR || path.join(process.cwd(), 'uploads', 'prep-answers'));
export const PENDING_DIR = path.join(os.tmpdir(), 'prep-attempt-pending');
export const PENDING_MS = 60 * 60 * 1000;
const PLAY_TTL_MS = 2 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class NotSaveableError extends Error { constructor() { super('not saveable'); this.name = 'NotSaveableError'; } }
export class RecordingGoneError extends Error { constructor() { super('recording gone'); this.name = 'RecordingGoneError'; } }
export class AnswerRejectedError extends Error { constructor() { super('answer rejected'); this.name = 'AnswerRejectedError'; } }

export function pendingFile(attemptId: string, dir = PENDING_DIR): string {
  if (!UUID.test(attemptId)) throw new Error('invalid attempt id');
  return path.join(dir, `${attemptId.toLowerCase()}.pending`);
}

/** Moves a scored recording into the pending area. Never throws: a recording that cannot wait is simply gone. */
export async function keepPending(attemptId: string, file: string, dir = PENDING_DIR): Promise<void> {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const to = pendingFile(attemptId, dir);
    try { await fs.promises.rename(file, to); } catch { await fs.promises.copyFile(file, to); await fs.promises.rm(file, { force: true }); }
  } catch {
    await fs.promises.rm(file, { force: true }).catch(() => undefined);
  }
}

/** The pending recording, if it is still inside its hour. */
export async function pendingRecording(attemptId: string, now = Date.now(), dir = PENDING_DIR): Promise<string | null> {
  const f = pendingFile(attemptId, dir);
  try {
    const st = await fs.promises.stat(f);
    return now - st.mtimeMs < PENDING_MS ? f : null;
  } catch { return null; }
}

/** Deletes pending recordings older than PENDING_MS. Returns how many went. */
export async function sweepPending(now = Date.now(), dir = PENDING_DIR): Promise<number> {
  let names: string[];
  try { names = await fs.promises.readdir(dir); } catch { return 0; }
  let n = 0;
  for (const name of names) {
    if (!name.endsWith('.pending')) continue;
    const f = path.join(dir, name);
    try {
      const st = await fs.promises.stat(f);
      if (now - st.mtimeMs >= PENDING_MS) { await fs.promises.rm(f, { force: true }); n += 1; }
    } catch { /* already gone */ }
  }
  return n;
}

let sweeper: NodeJS.Timeout | null = null;
/** At boot: sweep once now, then every 10 minutes. */
export function startPendingSweep(): void {
  if (sweeper) return;
  void sweepPending();
  sweeper = setInterval(() => { void sweepPending(); }, 10 * 60 * 1000);
  sweeper.unref?.();
}

// ── Playback tokens ─────────────────────────────────────────────────────────────

const sign = (id: string, exp: number, secret: string) => crypto.createHmac('sha256', secret).update(`prep-answer|${id}|${exp}`).digest('hex');
export function playToken(assetId: string, now = Date.now(), secret = env.jwtSecret): string {
  const exp = now + PLAY_TTL_MS;
  return `${exp}.${sign(assetId, exp, secret)}`;
}
export function verifyPlayToken(assetId: string, token: unknown, now = Date.now(), secret = env.jwtSecret): boolean {
  const m = typeof token === 'string' ? /^(\d{13})\.([0-9a-f]{64})$/.exec(token) : null;
  if (!m || Number(m[1]) < now) return false;
  return crypto.timingSafeEqual(Buffer.from(m[2], 'hex'), Buffer.from(sign(assetId, Number(m[1]), secret), 'hex'));
}
export const answerUrl = (assetId: string, kind: 'stream' | 'poster', now = Date.now()): string =>
  `/api/portal/career-prep/answer-video/${assetId}/${kind}?t=${playToken(assetId, now)}`;

/** The file to serve for a signed playback request, or null (404) for anything else. */
export async function resolveAnswerFile(assetId: string, kind: string, token: unknown, now = Date.now(), root = PREP_ANSWER_ROOT): Promise<{ path: string; type: string } | null> {
  if (!isAssetId(assetId) || (kind !== 'stream' && kind !== 'poster') || !verifyPlayToken(assetId, token, now)) return null;
  const [rows] = await sequelize.query('SELECT 1 FROM prep_saved_answers WHERE asset_id = :a', { replacements: { a: assetId } });
  if (!(rows as unknown[]).length) return null;
  return { path: assetFile(assetId, kind, root), type: kind === 'stream' ? 'video/mp4' : 'image/jpeg' };
}

// ── Saved answers ───────────────────────────────────────────────────────────────

export interface SavedAnswer { attemptId: string; question: string | null; delivery: number | null; seconds: number | null; savedAt: string; streamUrl: string; posterUrl: string; showPublic: boolean }
type SavedRow = { attempt_id: string; asset_id: string; question: string | null; delivery: number | null; seconds: number | null; created_at: string | Date; show_public?: boolean | null };
const toView = (r: SavedRow, now: number): SavedAnswer => ({
  attemptId: String(r.attempt_id), question: r.question ?? null, delivery: r.delivery === null ? null : Number(r.delivery),
  seconds: r.seconds === null ? null : Number(r.seconds), savedAt: new Date(r.created_at).toISOString(),
  streamUrl: answerUrl(String(r.asset_id), 'stream', now), posterUrl: answerUrl(String(r.asset_id), 'poster', now),
  showPublic: r.show_public === true,
});
const SELECT_SAVED = 'SELECT attempt_id, asset_id, question, delivery, seconds, created_at, show_public FROM prep_saved_answers';
const RETURN_SAVED = 'RETURNING attempt_id, asset_id, question, delivery, seconds, created_at, show_public';

/** Delivery, as the Try card shows it: the mean of the delivery scores, rounded (null when there are none). */
export function deliveryOf(result: unknown): number | null {
  const scores = (result as { scores?: Array<{ score?: unknown }> } | null)?.scores;
  const nums = Array.isArray(scores) ? scores.map((s) => Number(s?.score)).filter((n) => Number.isFinite(n)) : [];
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

export async function listSavedAnswers(enrollmentId: string, now = Date.now()): Promise<SavedAnswer[]> {
  const [rows] = await sequelize.query(`${SELECT_SAVED} WHERE enrollment_id = :e ORDER BY created_at DESC`, { replacements: { e: enrollmentId } });
  return (rows as SavedRow[]).map((r) => toView(r, now));
}

/** 'saved' | 'pending' (can still be saved) | 'gone'. */
export async function recordingState(attemptId: string, now = Date.now()): Promise<'saved' | 'pending' | 'gone'> {
  const [rows] = await sequelize.query('SELECT 1 FROM prep_saved_answers WHERE attempt_id = :a', { replacements: { a: attemptId } });
  if ((rows as unknown[]).length) return 'saved';
  return (await pendingRecording(attemptId, now)) ? 'pending' : 'gone';
}

export async function saveAnswer(enrollmentId: string, attemptId: string, question: string | null, deps: { run?: Runner; now?: number; root?: string } = {}): Promise<SavedAnswer> {
  const now = deps.now ?? Date.now();
  const root = deps.root ?? PREP_ANSWER_ROOT;
  const [own] = await sequelize.query('SELECT id, status, result FROM prep_attempts WHERE id = :a AND enrollment_id = :e', { replacements: { a: attemptId, e: enrollmentId } });
  const a = (own as Array<{ id: string; status: string; result: unknown }>)[0];
  if (!a) throw new NotFoundError();
  // Only a scored answer can be kept: a failed one (UnclearAudio included) was deleted when it failed.
  if (a.status !== 'done') throw new NotSaveableError();
  const [have] = await sequelize.query(`${SELECT_SAVED} WHERE attempt_id = :a`, { replacements: { a: attemptId } });
  if ((have as SavedRow[]).length) return toView((have as SavedRow[])[0], now);
  const pending = await pendingRecording(attemptId, now);
  if (!pending) throw new RecordingGoneError();
  const id = newAssetId();
  const dir = assetDir(id, root);
  await fs.promises.mkdir(dir, { recursive: true });
  let seconds: number;
  try {
    ({ seconds } = await makeRendition(pending, dir, deps.run));
  } catch (err) {
    await removeAsset(id, root);
    if (err instanceof VideoRejectedError) throw new AnswerRejectedError();
    throw err;
  }
  const [made] = await sequelize.query(
    `INSERT INTO prep_saved_answers (enrollment_id, attempt_id, asset_id, question, delivery, seconds)
     VALUES (:e, :a, :id, :q, :d, :s) ON CONFLICT (attempt_id) DO NOTHING
     ${RETURN_SAVED}`,
    { replacements: { e: enrollmentId, a: attemptId, id, q: question, d: deliveryOf(a.result), s: seconds } });
  if (!(made as SavedRow[]).length) {
    // Two clicks raced: the other one won. Keep its copy, drop this one.
    await removeAsset(id, root);
    const [won] = await sequelize.query(`${SELECT_SAVED} WHERE attempt_id = :a`, { replacements: { a: attemptId } });
    return toView((won as SavedRow[])[0], now);
  }
  await fs.promises.rm(pending, { force: true }).catch(() => undefined);
  return toView((made as SavedRow[])[0], now);
}

/** Deletes a saved answer (row and files). Idempotent; 404 only for an attempt that is not this student's. */
export async function deleteAnswer(enrollmentId: string, attemptId: string, root = PREP_ANSWER_ROOT): Promise<void> {
  const [own] = await sequelize.query('SELECT 1 FROM prep_attempts WHERE id = :a AND enrollment_id = :e', { replacements: { a: attemptId, e: enrollmentId } });
  if (!(own as unknown[]).length) throw new NotFoundError();
  const [rows] = await sequelize.query('DELETE FROM prep_saved_answers WHERE attempt_id = :a AND enrollment_id = :e RETURNING asset_id',
    { replacements: { a: attemptId, e: enrollmentId } });
  for (const r of rows as Array<{ asset_id: string }>) await removeAsset(String(r.asset_id), root);
  await fs.promises.rm(pendingFile(attemptId), { force: true }).catch(() => undefined);
}

// ── Public (R1.2: the second opt-in) ────────────────────────────────────────────

/** Turns "Show on my public profile" on or off for one of the caller's SAVED answers. 404 for anything else. */
export async function setShowPublic(enrollmentId: string, attemptId: string, on: boolean, now = Date.now()): Promise<SavedAnswer> {
  const [rows] = await sequelize.query(
    `UPDATE prep_saved_answers SET show_public = :on WHERE attempt_id = :a AND enrollment_id = :e ${RETURN_SAVED}`,
    { replacements: { on, a: attemptId, e: enrollmentId } });
  const r = (rows as SavedRow[])[0];
  if (!r) throw new NotFoundError();
  return toView(r, now);
}

/** What a public page may show: the question asked and the recording. Never the score, the attempt id or a token. */
export interface PublicPracticeAnswer { question: string | null; seconds: number | null; streamUrl: string; posterUrl: string }
export const publicAnswerUrl = (assetId: string, kind: 'stream' | 'poster'): string => `/api/public/hire/practice-answer/${assetId}/${kind}`;

/** The rule in ONE place: saved, switched on, and the owner's portfolio page published and `public`. */
const PUBLIC_RULE = `a.show_public = true AND EXISTS (SELECT 1 FROM career_portfolio_pages p
  WHERE p.enrollment_id = a.enrollment_id AND p.status = 'published' AND p.visibility = 'public')`;

/** The answers a student switched on, newest first, at most `limit`. Empty when their page is not public. */
export async function readPublicAnswers(enrollmentId: string, limit = 3): Promise<PublicPracticeAnswer[]> {
  const [rows] = await sequelize.query(
    `SELECT a.asset_id, a.question, a.seconds FROM prep_saved_answers a WHERE a.enrollment_id = :e AND ${PUBLIC_RULE}
      ORDER BY a.created_at DESC LIMIT :n`, { replacements: { e: enrollmentId, n: limit } });
  return (rows as Array<{ asset_id: string; question: string | null; seconds: number | null }>).map((r) => ({
    question: r.question ?? null, seconds: r.seconds === null ? null : Number(r.seconds),
    streamUrl: publicAnswerUrl(String(r.asset_id), 'stream'), posterUrl: publicAnswerUrl(String(r.asset_id), 'poster'),
  }));
}

/** The file for a public playback request, or null (404: switched off, deleted, page not public, or never existed). */
export async function resolvePublicAnswerFile(assetId: string, kind: string, root = PREP_ANSWER_ROOT): Promise<{ path: string; type: string } | null> {
  if (!isAssetId(assetId) || (kind !== 'stream' && kind !== 'poster')) return null;
  const [rows] = await sequelize.query(`SELECT 1 FROM prep_saved_answers a WHERE a.asset_id = :id AND ${PUBLIC_RULE}`, { replacements: { id: assetId } });
  if (!(rows as unknown[]).length) return null;
  return { path: assetFile(assetId, kind, root), type: kind === 'stream' ? 'video/mp4' : 'image/jpeg' };
}
