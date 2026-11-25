/**
 * voice:reconcile (VS4.5): find calls whose record and reality may differ, and settle the ones the carrier
 * can answer for. Dry run by default. It never dials, never retries and never guesses.
 *
 *   dispatch_unknown / never ended, WITH a CallSid: ask the carrier, append what it says (source
 *     'reconciler'), refold the call, and settle an ambiguous reservation to accepted.
 *   WITHOUT a CallSid: reported for a person. Absence of evidence is not evidence the call was not placed.
 *   Canary dispatches outside the approved audience: reported (a defect; nothing to repair).
 *
 * History (VS5.3): compares imported historical calls with the export manifest, by id and content hash.
 */
import { createHash } from 'crypto';
import { QueryTypes, type Sequelize } from 'sequelize';
import { CONTRACT_VERSION, TERMINAL_STATES, type CanonicalCallEvent, type ProviderStatus } from '../contracts/schemas';

export interface OpenCall { id: string; state: string; provider_call_id: string | null; engine: string; minutes: number }
export interface ReconcileReport {
  applied: boolean;
  unresolved: OpenCall[];
  settled: Array<{ callId: string; from: string; to: string }>;
  needsPerson: string[];
  failed: Array<{ callId: string; errorClass: string }>;
  ambiguousReservations: number;
  canaryOutsideAudience: string[];
  unreconciled: number;
}

export interface ReconcileDeps {
  carrierStatus: (providerCallId: string) => Promise<ProviderStatus>;
  append: (events: CanonicalCallEvent[]) => Promise<unknown>;
  recompute: (callId: string) => Promise<{ state: string } | null>;
}

const OPEN = `c.engine IN ('conversation_relay','openai_realtime') AND (c.state = 'dispatch_unknown'
  OR (c.state IN ('dispatching','queued','ringing','answered','session_active') AND c.created_at < NOW() - INTERVAL '70 minutes'))`;

export async function readOpen(s: Sequelize, limit: number): Promise<OpenCall[]> {
  return s.query<OpenCall>(`SELECT c.id, c.state, c.provider_call_id, c.engine, (EXTRACT(EPOCH FROM NOW() - c.created_at) / 60)::int AS minutes FROM voice_calls c WHERE ${OPEN} ORDER BY c.created_at LIMIT :limit`,
    { replacements: { limit }, type: QueryTypes.SELECT });
}

export async function runReconcile(s: Sequelize, d: ReconcileDeps, o: { apply: boolean; limit?: number }): Promise<ReconcileReport> {
  const unresolved = await readOpen(s, o.limit ?? 100);
  const [amb] = await s.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM voice_dial_reservations WHERE status = 'ambiguous'", { type: QueryTypes.SELECT });
  const outside = await s.query<{ id: string }>(
    `SELECT c.id FROM voice_calls c JOIN voice_routes r ON r.id = c.route_id
      WHERE c.engine IN ('conversation_relay','openai_realtime') AND c.test_mode = FALSE AND r.mode = 'canary' AND c.created_at >= COALESCE(r.approved_at, r.created_at)
        AND NOT (COALESCE(r.fallback->'audience', '[]'::jsonb) @> to_jsonb(c.recipient_ref::text))`, { type: QueryTypes.SELECT });
  const report: ReconcileReport = { applied: o.apply, unresolved, settled: [], needsPerson: unresolved.filter((c) => !c.provider_call_id).map((c) => c.id), failed: [], ambiguousReservations: amb.n, canaryOutsideAudience: outside.map((r) => r.id), unreconciled: 0 };
  for (const c of unresolved) {
    if (!c.provider_call_id || !o.apply) continue;
    try {
      const st = await d.carrierStatus(c.provider_call_id); // eslint-disable-line no-await-in-loop -- one at a time
      await d.append([{ contractVersion: CONTRACT_VERSION, eventKey: `reconcile:${st.state}`, callId: c.id, source: 'reconciler', state: st.state, occurredAt: st.observedAt, providerCallId: c.provider_call_id }]); // eslint-disable-line no-await-in-loop
      const rec = await d.recompute(c.id); // eslint-disable-line no-await-in-loop
      const to = rec?.state ?? c.state;
      if (TERMINAL_STATES.has(to as never)) {
        // eslint-disable-next-line no-await-in-loop
        await s.query("UPDATE voice_dial_reservations SET status = 'accepted', reconciled_at = NOW(), updated_at = NOW() WHERE call_id = :id AND status = 'ambiguous'", { replacements: { id: c.id } });
        report.settled.push({ callId: c.id, from: c.state, to });
      }
    } catch (e) {
      report.failed.push({ callId: c.id, errorClass: (e as { errorClass?: string; name?: string }).errorClass ?? ((e as Error).name || 'ReconcileError') });
    }
  }
  report.unreconciled = unresolved.length - report.settled.length;
  return report;
}

export interface HistoryRow { id: string; startedAt: string; durationSeconds: number | null; outcome: string }
export interface HistoryReport { manifest: number; imported: number; missing: string[]; unexpected: string[]; different: string[]; duplicates: string[]; ok: boolean }

export const historyHash = (r: HistoryRow): string => createHash('sha256').update(JSON.stringify([r.id, new Date(r.startedAt).toISOString(), r.durationSeconds, r.outcome])).digest('hex');

/** Every exported call imported once, unchanged, and nothing else. An empty export is not a pass. */
export function compareHistory(manifest: readonly HistoryRow[], imported: readonly HistoryRow[]): HistoryReport {
  const dup = (xs: readonly HistoryRow[]) => [...new Set(xs.map((x) => x.id).filter((id, i, a) => a.indexOf(id) !== i))];
  const want = new Map(manifest.map((r) => [r.id, historyHash(r)]));
  const got = new Map(imported.map((r) => [r.id, historyHash(r)]));
  const missing = [...want.keys()].filter((id) => !got.has(id));
  const unexpected = [...got.keys()].filter((id) => !want.has(id));
  const different = [...want].filter(([id, h]) => got.has(id) && got.get(id) !== h).map(([id]) => id);
  const duplicates = [...dup(manifest), ...dup(imported)];
  return { manifest: manifest.length, imported: imported.length, missing, unexpected, different, duplicates, ok: manifest.length > 0 && !missing.length && !unexpected.length && !different.length && !duplicates.length };
}
