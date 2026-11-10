/**
 * store - persistence for the sidecar: the per-run snapshots `delta` compares against, and a
 * content-addressed cache of model replies so a re-run is byte-identical.
 *
 * Tables (additive, idempotent `CREATE TABLE IF NOT EXISTS`, the ensure*Schema pattern):
 *   internship_report_snapshots    report_date PK -> the minimum per-intern state for the next delta.
 *                                  Written only by a real send (never a dry run), upserted, so a
 *                                  re-run on the same day replaces that day's row instead of adding one.
 *   internship_report_model_cache  sha256(the exact request) PK -> the model's reply. The same
 *                                  request always gets the same reply, so the narrative (and so the
 *                                  HTML and JSON) does not change between two runs on unchanged data.
 *
 * Failure modes: any store error is logged and degrades - no snapshot means `delta: null`, a cache
 * miss or cache error means a live model call. Nothing here can fail the report.
 */
import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../../config/database';
import type { ChatClient } from '../narrate';
import type { PreviousSnapshot } from './types';

function log(event: string, err: unknown): void {
  const e = err as Error;
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'internship-portfolio-report', event, outcome: 'partial', error_class: e?.name || 'UnknownError', context: { message: e?.message } }));
}

export async function ensureSidecarSchema(): Promise<void> {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS internship_report_snapshots (
      report_date DATE PRIMARY KEY,
      generated_at TIMESTAMPTZ NOT NULL,
      snapshot JSONB NOT NULL,
      sidecar_sha256 CHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await sequelize.query(`CREATE TABLE IF NOT EXISTS internship_report_model_cache (
      request_sha256 CHAR(64) PRIMARY KEY,
      model TEXT,
      response JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

/** The latest snapshot from BEFORE `reportDate`, so re-running today still compares to yesterday. */
export async function loadPreviousSnapshot(reportDate: string): Promise<PreviousSnapshot | null> {
  try {
    const rows = await sequelize.query<{ snapshot: PreviousSnapshot }>(
      'SELECT snapshot FROM internship_report_snapshots WHERE report_date < :d ORDER BY report_date DESC LIMIT 1',
      { replacements: { d: reportDate }, type: QueryTypes.SELECT },
    );
    return rows[0]?.snapshot ?? null;
  } catch (err) {
    log('snapshot_read_failed', err);
    return null;
  }
}

export async function saveSnapshot(snapshot: PreviousSnapshot, sidecarText: string): Promise<boolean> {
  try {
    await sequelize.query(
      `INSERT INTO internship_report_snapshots (report_date, generated_at, snapshot, sidecar_sha256)
       VALUES (:d, :g, CAST(:s AS JSONB), :h)
       ON CONFLICT (report_date) DO UPDATE SET generated_at = EXCLUDED.generated_at, snapshot = EXCLUDED.snapshot,
         sidecar_sha256 = EXCLUDED.sidecar_sha256, updated_at = NOW()`,
      { replacements: { d: snapshot.report_date, g: snapshot.generated_at, s: JSON.stringify(snapshot), h: sha256(sidecarText) } },
    );
    return true;
  } catch (err) {
    log('snapshot_write_failed', err);
    return false;
  }
}

export const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/** Key order in the request objects is fixed by their literals, so JSON.stringify is a stable key. */
export const requestKey = (params: unknown): string => sha256(JSON.stringify(params));

export interface ModelCache {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, model: string | null, response: unknown): Promise<void>;
}

export const dbModelCache: ModelCache = {
  async get(key) {
    const rows = await sequelize.query<{ response: unknown }>('SELECT response FROM internship_report_model_cache WHERE request_sha256 = :k', { replacements: { k: key }, type: QueryTypes.SELECT });
    return rows[0]?.response;
  },
  async put(key, model, response) {
    await sequelize.query(
      'INSERT INTO internship_report_model_cache (request_sha256, model, response) VALUES (:k, :m, CAST(:r AS JSONB)) ON CONFLICT (request_sha256) DO NOTHING',
      { replacements: { k: key, m: model, r: JSON.stringify(response) } },
    );
  },
};

/** Wrap a chat client so an identical request is answered from the cache. */
export function cachedChatClient(inner: ChatClient, cache: ModelCache = dbModelCache): ChatClient {
  return {
    chat: {
      completions: {
        create: async (params: { model?: string }, opts?: unknown) => {
          const key = requestKey(params);
          try {
            const hit = await cache.get(key);
            if (hit !== undefined) return hit;
          } catch (err) { log('model_cache_read_failed', err); }
          const resp = await inner.chat.completions.create(params, opts);
          // Plain JSON only: the SDK object can carry non-serializable fields.
          const plain = JSON.parse(JSON.stringify(resp));
          try { await cache.put(key, params.model ?? null, plain); } catch (err) { log('model_cache_write_failed', err); }
          return plain;
        },
      },
    },
  };
}
