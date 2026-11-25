/**
 * voice:reconcile (VS4.5): find calls whose record and reality may differ, and settle the ones the carrier
 * can answer for. Dry run by default. It never dials, never retries and never guesses.
 *
 *   dispatch_unknown / never ended, WITH a CallSid: ask the carrier, append what it says (source
 *     'reconciler'), refold the call. Then every reservation whose
 *     call has ended, by this command or by the carrier's own webhook, is settled to accepted.
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
  /** Reservations whose call has ended, whoever ended it (this command or the carrier's own webhook). */
  reservationsSettled: number;
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
  // Calls the carrier can answer for come first: rows only a person can settle must never starve them.
  return s.query<OpenCall>(`SELECT c.id, c.state, c.provider_call_id, c.engine, (EXTRACT(EPOCH FROM NOW() - c.created_at) / 60)::int AS minutes FROM voice_calls c WHERE ${OPEN} ORDER BY (c.provider_call_id IS NULL), c.created_at LIMIT :limit`,
    { replacements: { limit }, type: QueryTypes.SELECT });
}

export async function runReconcile(s: Sequelize, d: ReconcileDeps, o: { apply: boolean; limit?: number }): Promise<ReconcileReport> {
  const unresolved = await readOpen(s, o.limit ?? 100);
  const countOpen = async () => (await s.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM voice_calls c WHERE ${OPEN}`, { type: QueryTypes.SELECT }))[0].n;
  const totalOpen = await countOpen();
  const outside = await s.query<{ id: string }>(
    `SELECT c.id FROM voice_calls c JOIN voice_routes r ON r.id = c.route_id
      WHERE c.engine IN ('conversation_relay','openai_realtime') AND c.test_mode = FALSE AND r.mode = 'canary' AND c.created_at >= COALESCE(r.approved_at, r.created_at)
        AND NOT (COALESCE(r.fallback->'audience', '[]'::jsonb) @> to_jsonb(c.recipient_ref::text))`, { type: QueryTypes.SELECT });
  const report: ReconcileReport = { applied: o.apply, unresolved, settled: [], needsPerson: unresolved.filter((c) => !c.provider_call_id).map((c) => c.id), failed: [], reservationsSettled: 0, ambiguousReservations: 0, canaryOutsideAudience: outside.map((r) => r.id), unreconciled: 0 };
  for (const c of unresolved) {
    if (!c.provider_call_id || !o.apply) continue;
    try {
      const st = await d.carrierStatus(c.provider_call_id); // eslint-disable-line no-await-in-loop -- one at a time
      await d.append([{ contractVersion: CONTRACT_VERSION, eventKey: `reconcile:${st.state}`, callId: c.id, source: 'reconciler', state: st.state, occurredAt: st.observedAt, providerCallId: c.provider_call_id }]); // eslint-disable-line no-await-in-loop
      const rec = await d.recompute(c.id); // eslint-disable-line no-await-in-loop
      const to = rec?.state ?? c.state;
      if (TERMINAL_STATES.has(to as never)) {
        report.settled.push({ callId: c.id, from: c.state, to });
      }
    } catch (e) {
      report.failed.push({ callId: c.id, errorClass: (e as { errorClass?: string; name?: string }).errorClass ?? ((e as Error).name || 'ReconcileError') });
    }
  }
  // A dial that reached the phone network stays counted against its caps (accepted), however it ended.
  const SETTLE = "r.status IN ('ambiguous','dispatching') AND c.id = r.call_id AND c.state IN ('completed','busy','no_answer','failed','canceled')";
  const done = o.apply
    ? await s.query<{ id: string }>(`UPDATE voice_dial_reservations r SET status = 'accepted', reconciled_at = NOW(), updated_at = NOW() FROM voice_calls c WHERE ${SETTLE} AND r.lease_expires_at < NOW() RETURNING r.id`, { type: QueryTypes.SELECT })
    : await s.query<{ id: string }>(`SELECT r.id FROM voice_dial_reservations r, voice_calls c WHERE ${SETTLE} AND r.lease_expires_at < NOW()`, { type: QueryTypes.SELECT });
  report.reservationsSettled = done.length;
  const [amb] = await s.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM voice_dial_reservations WHERE status = 'ambiguous'", { type: QueryTypes.SELECT });
  report.ambiguousReservations = amb.n;
  report.unreconciled = o.apply ? await countOpen() : totalOpen;
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
