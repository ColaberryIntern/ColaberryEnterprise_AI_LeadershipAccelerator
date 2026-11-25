/**
 * Synthflow call history import (VS5.3) into voice_call_history.
 *
 * Non-overwriting: a call already there is left exactly as it is, and if it differs from the export it is
 * listed as a conflict. Rerunning an import changes nothing. The batch id comes from the export's content,
 * so the same file is always the same batch; rollback deletes that batch and nothing else.
 *
 * Fails: a malformed export is refused before anything is written; a database error stops the import with
 * earlier chunks kept (each chunk is one transaction), and the same command finishes it. No retry here.
 */
import type { Sequelize } from 'sequelize';
import { QueryTypes } from 'sequelize';
import { compareHistory, historyHash, type HistoryReport, type HistoryRow } from '../rollout/reconcile';
import { exportHash, type HistoryCall, type HistoryExport } from './historyExport';

export const HISTORY_PROVIDER = 'synthflow';
const CHUNK = 500;

/** A UUID-shaped id from the content hash. */
export const batchIdOf = (h: string): string => `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
const refuse = (m: string) => Object.assign(new Error(m), { name: 'ValidationError' });

const KEYS = ['assistant', 'durationSeconds', 'endReason', 'hasRecording', 'hasTranscript', 'id', 'outcome', 'startedAt'].join();
const okCall = (c: HistoryCall): boolean => Boolean(c) && typeof c === 'object' && Object.keys(c).sort().join() === KEYS
  && /^[A-Za-z0-9_-]{6,100}$/.test(String(c.id)) && /^sf-[0-9a-f]{8}$/.test(String(c.assistant)) && typeof c.startedAt === 'string' && !Number.isNaN(Date.parse(c.startedAt))
  && (c.durationSeconds === null || (Number.isInteger(c.durationSeconds) && c.durationSeconds >= 0 && c.durationSeconds < 1e6)) && /^[a-z0-9_]{1,60}$/.test(String(c.outcome))
  && (c.endReason === null || /^[a-z0-9_]{1,60}$/.test(String(c.endReason))) && typeof c.hasTranscript === 'boolean' && typeof c.hasRecording === 'boolean';

/** The file as read, or a refusal. An extra field is refused: that is how a transcript or a number would get in. */
export function parseExport(json: string): HistoryExport {
  let x: HistoryExport;
  try { x = JSON.parse(json) as HistoryExport; } catch { throw refuse('the export is not JSON'); }
  if (x?.version !== 1 || !Array.isArray(x.calls) || !Array.isArray(x.errors) || !/^\d{4}-\d\d-\d\d$/.test(String(x.from)) || !/^\d{4}-\d\d-\d\d$/.test(String(x.until))) throw refuse('not a history export');
  if (!x.calls.length) throw refuse('the export is empty');
  const at = x.calls.findIndex((c) => !okCall(c));
  if (at >= 0) throw refuse(`call ${at} is malformed or carries an extra field`);
  if (new Set(x.calls.map((c) => c.id)).size !== x.calls.length) throw refuse('a call appears twice');
  if (exportHash(x.calls) !== x.sha256) throw refuse('the export does not match its hash');
  return x;
}

const row = (c: HistoryCall): HistoryRow => ({ id: c.id, startedAt: c.startedAt, durationSeconds: c.durationSeconds, outcome: c.outcome });

export interface ImportReport { applied: boolean; batchId: string; exported: number; exportErrors: number; inserted: number; alreadyThere: number; conflicts: string[]; ok: boolean }

export async function importHistory(s: Sequelize, x: HistoryExport, o: { tenantId: string; apply: boolean; retentionDays?: number }): Promise<ImportReport> {
  if (o.apply && !(Number.isInteger(o.retentionDays) && (o.retentionDays as number) > 0)) throw refuse('an import needs the approved retention period in days');
  const r: ImportReport = { applied: o.apply, batchId: batchIdOf(x.sha256), exported: x.calls.length, exportErrors: x.errors.length, inserted: 0, alreadyThere: 0, conflicts: [], ok: false };
  for (let i = 0; i < x.calls.length; i += CHUNK) {
    const part = x.calls.slice(i, i + CHUNK);
    await s.transaction(async (transaction) => { // eslint-disable-line no-await-in-loop -- one chunk at a time
      let fresh = new Set<string>();
      if (o.apply) {
        const made = await s.query<{ provider_call_id: string }>(
          `INSERT INTO voice_call_history (tenant_id, provider, provider_call_id, assistant_key, started_at, duration_seconds, outcome, end_reason, has_transcript, has_recording, row_hash, batch_id, retention_until)
           SELECT CAST(:t AS uuid), :p, j.id, j.assistant, j."startedAt", j."durationSeconds", j.outcome, j."endReason", j."hasTranscript", j."hasRecording", j.hash, CAST(:b AS uuid), NOW() + make_interval(days => CAST(:days AS int))
           FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS j(id text, assistant text, "startedAt" timestamptz, "durationSeconds" int, outcome text, "endReason" text, "hasTranscript" boolean, "hasRecording" boolean, hash text)
           ON CONFLICT (tenant_id, provider, provider_call_id) DO NOTHING RETURNING provider_call_id`,
          { replacements: { t: o.tenantId, p: HISTORY_PROVIDER, b: r.batchId, days: o.retentionDays, rows: JSON.stringify(part.map((c) => ({ ...c, hash: historyHash(row(c)) }))) }, type: QueryTypes.SELECT, transaction });
        fresh = new Set(made.map((m) => m.provider_call_id));
      }
      const have = await s.query<{ provider_call_id: string; row_hash: string }>('SELECT provider_call_id, row_hash FROM voice_call_history WHERE tenant_id = :t AND provider = :p AND provider_call_id IN (:ids)',
        { replacements: { t: o.tenantId, p: HISTORY_PROVIDER, ids: part.map((c) => c.id) }, type: QueryTypes.SELECT, transaction });
      const hashes = new Map(have.map((h) => [h.provider_call_id, h.row_hash]));
      for (const c of part) {
        if (fresh.has(c.id)) r.inserted++;
        else if (hashes.has(c.id)) { r.alreadyThere++; if (hashes.get(c.id) !== historyHash(row(c))) r.conflicts.push(c.id); }
      }
    });
  }
  r.ok = r.conflicts.length === 0 && r.exportErrors === 0 && (!o.apply || r.inserted + r.alreadyThere === r.exported);
  return r;
}

/** Compare the export with what the database holds for its assistants in its date range. */
export async function verifyHistory(s: Sequelize, x: HistoryExport, tenantId: string): Promise<HistoryReport> {
  const got = await s.query<{ id: string; started_at: string | Date; duration_seconds: number | null; outcome: string }>(
    'SELECT provider_call_id AS id, started_at, duration_seconds, outcome FROM voice_call_history WHERE tenant_id = :t AND provider = :p AND assistant_key IN (:keys) AND started_at >= :from AND started_at < :until',
    { replacements: { t: tenantId, p: HISTORY_PROVIDER, keys: [...new Set(x.calls.map((c) => c.assistant))], from: `${x.from}T00:00:00Z`, until: `${x.until}T00:00:00Z` }, type: QueryTypes.SELECT });
  return compareHistory(x.calls.map(row), got.map((g) => ({ id: g.id, startedAt: new Date(g.started_at).toISOString(), durationSeconds: g.duration_seconds, outcome: g.outcome })));
}

async function remove(s: Sequelize, where: string, replacements: Record<string, unknown>, apply: boolean): Promise<number> {
  if (!apply) return (await s.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM voice_call_history WHERE ${where}`, { replacements, type: QueryTypes.SELECT }))[0].n;
  return (await s.query<{ id: string }>(`DELETE FROM voice_call_history WHERE ${where} RETURNING id`, { replacements, type: QueryTypes.SELECT })).length;
}
export const rollbackBatch = (s: Sequelize, tenantId: string, batchId: string, apply: boolean): Promise<number> => remove(s, 'tenant_id = :t AND batch_id = :b', { t: tenantId, b: batchId }, apply);
/** Rows past the deadline they were imported with. */
export const purgeExpired = (s: Sequelize, tenantId: string, apply: boolean): Promise<number> => remove(s, 'tenant_id = :t AND retention_until <= NOW()', { t: tenantId }, apply);

export interface HistoryHit { provider: string; providerCallId: string; assistant: string; startedAt: string; durationSeconds: number | null; outcome: string; endReason: string | null }
export async function findHistory(s: Sequelize, tenantId: string, providerCallId: string): Promise<HistoryHit | null> {
  const [h] = await s.query<{ provider: string; provider_call_id: string; assistant_key: string; started_at: string | Date; duration_seconds: number | null; outcome: string; end_reason: string | null }>(
    'SELECT provider, provider_call_id, assistant_key, started_at, duration_seconds, outcome, end_reason FROM voice_call_history WHERE tenant_id = :t AND provider_call_id = :id ORDER BY provider LIMIT 1', { replacements: { t: tenantId, id: providerCallId }, type: QueryTypes.SELECT });
  return h ? { provider: h.provider, providerCallId: h.provider_call_id, assistant: h.assistant_key, startedAt: new Date(h.started_at).toISOString(), durationSeconds: h.duration_seconds, outcome: h.outcome, endReason: h.end_reason } : null;
}
