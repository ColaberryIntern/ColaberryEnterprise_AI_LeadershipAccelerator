/**
 * hireVideoService - the candidate's intro video, from upload to public playback (kit §3.2, §4.3).
 *
 *   saveVideo        a recording or upload becomes a DRAFT rendition (replacing any earlier one)
 *   updateVideo      publish / unpublish, and the "captions automatically" box
 *   deleteVideo      removes it everywhere
 *   readStudioVideo  what the studio shows, with short-lived signed preview URLs for a draft
 *   resolveVideoFile what the public route may serve: a PUBLISHED asset, or a draft with a valid preview token
 *   applyAnalysis    a colaberry/video-analysis result becomes captions and candidate-only coaching
 *
 * THE CALLER IS ALWAYS THE LEARNER for the first four; the enrollment comes from the portal session.
 *
 * NOTHING GOES PUBLIC UNTIL PUBLISH. A new upload is always a draft, so replacing a published
 * video hides it from Hire until the new one is published (logged assumption: one asset per
 * candidate, matching the Phase 2 columns).
 *
 * IDEMPOTENT END STATE. Each upload mints a new asset id and the row swap returns the previous id
 * in the same statement, which is then removed; uploading twice leaves exactly one asset.
 */
import crypto from 'crypto';
import fs from 'fs';
import { z } from 'zod';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { assetDir, assetFile, assetUrl, isAssetId, newAssetId, removeAsset, VIDEO_FILES, type VideoFileKind } from './hireVideoFiles';
import { makeRendition, type Runner } from './hireVideoTranscode';
import { readCoaching, transcriptToVtt, type VideoCoaching } from './hireVideoAnalysis';
import { analysisMode, submitForAnalysis, type AnalysisMode } from './hireVideoAnalysisClient';

type Row = Record<string, unknown>;
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

async function one(sql: string, bind: unknown[]): Promise<Row | null> {
  const [rows] = await sequelize.query(sql, { bind });
  return Array.isArray(rows) && rows[0] ? (rows[0] as Row) : null;
}

const notFound = (message: string) => Object.assign(new Error(message), { status: 404, error_class: 'NotFound' });

// ── Preview grant: a draft is playable only by whoever the studio handed this URL to ──────────

const sign = (id: string, exp: number, secret: string) =>
  crypto.createHmac('sha256', secret).update(`hire-video-preview|${id}|${exp}`).digest('hex');

export function previewToken(id: string, now: number, secret = env.jwtSecret): string {
  const exp = now + PREVIEW_TTL_MS;
  return `${exp}.${sign(id, exp, secret)}`;
}

export function verifyPreviewToken(id: string, token: unknown, now: number, secret = env.jwtSecret): boolean {
  const m = typeof token === 'string' ? /^(\d{13})\.([0-9a-f]{64})$/.exec(token) : null;
  if (!m || Number(m[1]) < now) return false;
  return crypto.timingSafeEqual(Buffer.from(m[2], 'hex'), Buffer.from(sign(id, Number(m[1]), secret), 'hex'));
}

// ── Studio ──────────────────────────────────────────────────────────────────────

export interface StudioVideo {
  readonly status: 'draft' | 'published';
  readonly seconds: number | null;
  readonly streamUrl: string;
  readonly posterUrl: string;
  readonly captionsUrl: string | null;
  readonly captionsWanted: boolean;
  readonly analysis: AnalysisMode | 'done';
  readonly coaching: VideoCoaching | null;
}

export function toStudioVideo(row: Row | null, now: number, mode: AnalysisMode = analysisMode()): StudioVideo | null {
  const id = row?.video_asset_id;
  if (!row || !isAssetId(id)) return null;
  const q = `?t=${previewToken(id, now)}`;
  const coaching = (row.video_coaching as VideoCoaching | null) ?? null;
  return {
    status: row.video_status === 'published' ? 'published' : 'draft',
    seconds: typeof row.video_seconds === 'number' ? row.video_seconds : null,
    streamUrl: assetUrl(id, 'stream') + q,
    posterUrl: assetUrl(id, 'poster') + q,
    captionsUrl: row.captions_url ? assetUrl(id, 'captions') + q : null,
    captionsWanted: row.video_captions_wanted !== false,
    analysis: coaching ? 'done' : mode,
    coaching,
  };
}

const SELECT_VIDEO = 'SELECT video_asset_id, video_status, video_seconds, captions_url, video_coaching, video_captions_wanted FROM hire_profile_intro';

export async function readStudioVideo(enrollmentId: string, now = Date.now()): Promise<StudioVideo | null> {
  return toStudioVideo(await one(`${SELECT_VIDEO} WHERE enrollment_id = $1`, [enrollmentId]), now);
}

export async function saveVideo(enrollmentId: string, upload: string, run?: Runner, now = Date.now()): Promise<StudioVideo | null> {
  const id = newAssetId();
  const dir = assetDir(id);
  await fs.promises.mkdir(dir, { recursive: true });
  let seconds: number;
  try {
    ({ seconds } = await makeRendition(upload, dir, run));
  } catch (err) {
    await removeAsset(id);
    throw err;
  }
  const row = await one(
    `WITH prev AS (SELECT video_asset_id FROM hire_profile_intro WHERE enrollment_id = $1 FOR UPDATE)
     INSERT INTO hire_profile_intro (enrollment_id, video_asset_id, video_status, video_seconds, video_stream_url, poster_url, captions_url, video_coaching, updated_at)
     VALUES ($1, $2, 'draft', $3, $4, $5, NULL, NULL, NOW())
     ON CONFLICT (enrollment_id) DO UPDATE SET video_asset_id = EXCLUDED.video_asset_id, video_status = 'draft',
       video_seconds = EXCLUDED.video_seconds, video_stream_url = EXCLUDED.video_stream_url, poster_url = EXCLUDED.poster_url,
       captions_url = NULL, video_coaching = NULL, updated_at = NOW()
     RETURNING (SELECT video_asset_id FROM prev) AS prev_asset_id`,
    [enrollmentId, id, seconds, assetUrl(id, 'stream'), assetUrl(id, 'poster')],
  );
  if (row?.prev_asset_id && row.prev_asset_id !== id) await removeAsset(String(row.prev_asset_id));
  submitForAnalysis(id, assetFile(id, 'stream'));
  return readStudioVideo(enrollmentId, now);
}

export const videoUpdateSchema = z.object({
  published: z.boolean().optional(),
  captionsWanted: z.boolean().optional(),
}).strict().refine((v) => v.published !== undefined || v.captionsWanted !== undefined, 'nothing to change');
export type VideoUpdate = z.infer<typeof videoUpdateSchema>;

const exists = (file: string) => fs.promises.access(file).then(() => true, () => false);

export async function updateVideo(enrollmentId: string, u: VideoUpdate, now = Date.now()): Promise<StudioVideo | null> {
  const cur = await one(`${SELECT_VIDEO} WHERE enrollment_id = $1`, [enrollmentId]);
  const id = cur?.video_asset_id;
  if (!cur || !isAssetId(id)) throw notFound('Record or upload a video first.');
  // Turning captions off removes the public track; turning them back on restores it if one was made.
  let captions = typeof cur.captions_url === 'string' ? cur.captions_url : null;
  if (u.captionsWanted === false) captions = null;
  if (u.captionsWanted === true && await exists(assetFile(id, 'captions'))) captions = assetUrl(id, 'captions');
  const row = await one(
    `UPDATE hire_profile_intro SET video_status = COALESCE($3, video_status),
       video_captions_wanted = COALESCE($4, video_captions_wanted), captions_url = $5, updated_at = NOW()
     WHERE enrollment_id = $1 AND video_asset_id = $2 RETURNING video_asset_id`,
    [enrollmentId, id, u.published === undefined ? null : (u.published ? 'published' : 'draft'), u.captionsWanted ?? null, captions],
  );
  // A replacement landed between the read and the write: the candidate acts on the new draft next.
  if (!row) throw notFound('Your video just changed. Reload and try again.');
  return readStudioVideo(enrollmentId, now);
}

export async function deleteVideo(enrollmentId: string): Promise<void> {
  const row = await one(
    `WITH prev AS (SELECT video_asset_id FROM hire_profile_intro WHERE enrollment_id = $1 FOR UPDATE)
     UPDATE hire_profile_intro SET video_asset_id = NULL, video_status = 'draft', video_seconds = NULL, video_stream_url = NULL,
       poster_url = NULL, captions_url = NULL, video_coaching = NULL, updated_at = NOW()
     WHERE enrollment_id = $1 RETURNING (SELECT video_asset_id FROM prev) AS prev_asset_id`,
    [enrollmentId],
  );
  await removeAsset(row?.prev_asset_id ? String(row.prev_asset_id) : null);
}

// ── Public files ────────────────────────────────────────────────────────────────

export interface ServableFile { readonly path: string; readonly type: string; readonly published: boolean }

export async function resolveVideoFile(id: string, kind: VideoFileKind, token: unknown, now = Date.now()): Promise<ServableFile | null> {
  if (!isAssetId(id)) return null;
  const row = await one('SELECT video_status, captions_url FROM hire_profile_intro WHERE video_asset_id = $1', [id]);
  if (!row || (kind === 'captions' && !row.captions_url)) return null;
  const published = row.video_status === 'published';
  if (!published && !verifyPreviewToken(id, token, now)) return null;
  const file = assetFile(id, kind);
  if (!await exists(file)) return null;
  return { path: file, type: VIDEO_FILES[kind].type, published };
}

// ── Analysis result (colaberry/video-analysis) ──────────────────────────────────

/** Stores coaching, and captions when the candidate wants them. Safe to run twice on the same result. */
export async function applyAnalysis(id: string, result: unknown): Promise<boolean> {
  if (!isAssetId(id)) return false;
  const row = await one('SELECT video_seconds, video_captions_wanted FROM hire_profile_intro WHERE video_asset_id = $1', [id]);
  if (!row) return false;
  const coaching = readCoaching(result, Number(row.video_seconds) || 0);
  const metrics = (coaching && typeof result === 'object' && result) ? (result as { metrics?: Row }).metrics : null;
  const vtt = metrics ? transcriptToVtt(metrics.transcript_json) : null;
  if (vtt) await fs.promises.writeFile(assetFile(id, 'captions'), vtt, 'utf8');
  await one(
    `UPDATE hire_profile_intro SET video_coaching = $2::jsonb,
       captions_url = CASE WHEN $3::text IS NOT NULL AND video_captions_wanted THEN $3 ELSE captions_url END, updated_at = NOW()
     WHERE video_asset_id = $1 RETURNING video_asset_id`,
    [id, coaching ? JSON.stringify(coaching) : null, vtt ? assetUrl(id, 'captions') : null],
  );
  return coaching !== null;
}
