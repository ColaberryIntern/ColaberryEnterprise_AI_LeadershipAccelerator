/**
 * hireVideoCoach - the OpenAI transport behind hireVideoAnalysisClient: a recording is transcribed,
 * its content reviewed, and captions plus candidate-only coaching are stored on the same asset.
 *
 * QUEUE. One video at a time, in process, deduplicated by asset id: a candidate re-pressing
 * "Try again" or a restart sweep never runs the same asset twice at once.
 *
 * IDEMPOTENT. The result is written WHERE video_asset_id = the asset analysed, so a video replaced
 * mid-run writes nothing (the new one has its own run). Re-running an asset rewrites the same rows.
 *
 * FAILURE. Transcription failing (after the SDK's capped retries) stores `{status:'failed'}`, which
 * the studio shows with a "Try again" button; the video itself is unaffected. The content review
 * failing only drops the review. A restart mid-run leaves coaching NULL, and the boot sweep
 * (`startHireVideoCoach`) re-queues every such video.
 */
import fs from 'fs';
import { sequelize } from '../../config/database';
import { assetFile, isAssetId } from './hireVideoFiles';
import { transcribe, type TranscribeCall, TranscribeError } from './hireVideoTranscribe';
import type { Runner } from './hireVideoTranscode';
import { reviewContent, type ReviewCall } from './hireVideoContent';
import { buildCoaching, wordsToVtt } from './hireVideoAnalysis';
import { setAnalysisTransport } from './hireVideoAnalysisClient';
import { applyCoaching } from './hireVideoService';
import { OPENING_SECONDS } from './hireVideoSpeech';
import { readVoice, type PcmReader } from './hireVideoVoice';

const log = (level: 'info' | 'warn' | 'error', event: string, assetId: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event, context: { assetId }, ...extra }));

export interface CoachDeps { readonly transcribeCall?: TranscribeCall; readonly reviewCall?: ReviewCall; readonly pcm?: PcmReader; readonly run?: Runner }

/** One asset, start to stored result. Returns what it stored. */
export async function coachAsset(assetId: string, deps: CoachDeps = {}): Promise<'done' | 'failed' | 'gone'> {
  if (!isAssetId(assetId)) return 'gone';
  const [rows] = await sequelize.query('SELECT video_seconds FROM hire_profile_intro WHERE video_asset_id = $1', { bind: [assetId] });
  const row = Array.isArray(rows) ? (rows[0] as { video_seconds?: number } | undefined) : undefined;
  if (!row) return 'gone';
  const seconds = Number(row.video_seconds) || 0;
  const t0 = Date.now();
  try {
    const stream = assetFile(assetId, 'stream');
    const t = await transcribe(stream, deps.transcribeCall, deps.run);
    const opening = t.words.filter((w) => w.start < OPENING_SECONDS).map((w) => w.word).join(' ');
    const [review, voice] = await Promise.all([reviewContent(t.text, seconds, deps.reviewCall, opening), readVoice(stream, deps.pcm)]);
    const coaching = buildCoaching(t.words, seconds, review, voice);
    const vtt = wordsToVtt(t.words);
    if (vtt) await fs.promises.writeFile(assetFile(assetId, 'captions'), vtt, 'utf8');
    const stored = await applyCoaching(assetId, coaching, Boolean(vtt));
    log('info', 'hire_video_coached', assetId, { outcome: stored ? 'success' : 'partial', duration_ms: Date.now() - t0, words: t.words.length, review: Boolean(review) });
    return stored ? 'done' : 'gone';
  } catch (err) {
    const errorClass = err instanceof TranscribeError ? err.error_class : 'UpstreamUnavailable';
    log('error', 'hire_video_coach_failed', assetId, { outcome: 'failure', error_class: errorClass, duration_ms: Date.now() - t0 });
    await applyCoaching(assetId, { status: 'failed', error_class: errorClass }, false).catch(() => undefined);
    return 'failed';
  }
}

const queued = new Set<string>();
let chain: Promise<unknown> = Promise.resolve();

/** Adds an asset to the one-at-a-time queue unless it is already waiting or running. */
export function enqueue(assetId: string, deps: CoachDeps = {}): Promise<unknown> {
  if (queued.has(assetId)) return chain;
  queued.add(assetId);
  chain = chain.then(() => coachAsset(assetId, deps)).catch(() => undefined).finally(() => queued.delete(assetId));
  return chain;
}

/** Record ids are `hire-<assetId>` (hireVideoAnalysisClient). */
const assetOf = (recordId: string) => recordId.replace(/^hire-/, '');

/**
 * Registers the OpenAI transport (only when a key is configured, so 'off' stays honest) and
 * re-queues any video whose coaching never landed. Called once at boot, after the schema.
 */
export async function startHireVideoCoach(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;
  setAnalysisTransport({ submit: async (recordId) => { void enqueue(assetOf(recordId)); } });
  try {
    const [rows] = await sequelize.query(
      'SELECT video_asset_id FROM hire_profile_intro WHERE video_asset_id IS NOT NULL AND video_coaching IS NULL',
    );
    for (const r of (rows as { video_asset_id: string }[])) void enqueue(r.video_asset_id);
  } catch (err) {
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'hire_video_coach_sweep_failed', error_class: (err as Error)?.name || 'DatabaseError' }));
  }
}
