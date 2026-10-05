/**
 * govOpportunitySync — gov pursuit DAILY TRACKING (narrow v1).
 *
 * For each gov opportunity we are actively pursuing, re-check the live v1 discovery feed and flag a CHANGED close
 * date or a DROP from the feed, and refresh the last-seen close date so the on-page countdown stays current. It
 * NEVER auto-advances a decision — it only records a flag the workspace surfaces ("review changes").
 *
 * HONEST SCOPE: the only live source today is the v1 best-fit feed, which carries the close DATE only — NOT
 * amendments, Q&A, or meeting dates (there is no programmatic Bonfire access; those live in the manually
 * downloaded ZIP). Canonical (op:gov:) records need the undeployed v2 feed, so this v1 syncs DECOUPLED (gws:) records.
 *
 * Ships DARK behind FLAGS.govDailySync (ENABLE_GOV_DAILY_SYNC) — distinct from govIngestion (already on). Idempotent:
 * a once-per-day slot claim guards the multiple prod scheduler instances; the sync-state is a read-modify-write of
 * one system_settings JSONB row. The pure diff is unit-tested; fail-closed on a feed error (records nothing).
 */
import { QueryTypes } from 'sequelize';
import { FLAGS } from '../../config/featureFlags';

const GWS_RE = /^gws:([0-9a-f-]{36})$/i;
const PURSUED_DECISIONS = ['needs_evidence', 'approved_bid_pursuit', 'rfi_response'];
const SYNC_STATE_KEY = 'gov_opportunity_sync_state';

export interface SyncSnapshot { closeDate: string | null; present: boolean; }
export type SyncChangeKind = 'none' | 'first_seen' | 'deadline_changed' | 'dropped_from_feed' | 'returned_to_feed';
export interface SyncChange { kind: SyncChangeKind; detail: string; }

/** PURE: what changed between the last-seen snapshot and the current feed read. Total; never throws. */
export function diffGovOpportunity(prev: SyncSnapshot | null | undefined, curr: SyncSnapshot): SyncChange {
  if (!prev) return { kind: 'first_seen', detail: curr.present ? `tracked (closes ${curr.closeDate ?? 'TBD'})` : 'not in the discovery feed' };
  if (prev.present && !curr.present) return { kind: 'dropped_from_feed', detail: 'no longer in the discovery feed — verify in Bonfire (it may have closed, or dropped out of best-fit)' };
  if (!prev.present && curr.present) return { kind: 'returned_to_feed', detail: `back in the discovery feed (closes ${curr.closeDate ?? 'TBD'})` };
  if (prev.present && curr.present && (prev.closeDate ?? null) !== (curr.closeDate ?? null)) {
    return { kind: 'deadline_changed', detail: `close date changed from ${prev.closeDate ?? 'TBD'} to ${curr.closeDate ?? 'TBD'}` };
  }
  return { kind: 'none', detail: '' };
}

export interface StoredSyncEntry { closeDate: string | null; present: boolean; syncedAt: string; change: SyncChange | null; }
type SyncStateMap = Record<string, StoredSyncEntry>;

async function readSyncState(): Promise<SyncStateMap> {
  const { sequelize } = await import('../../config/database');
  const rows = await sequelize.query<{ value: any }>(
    `SELECT value FROM system_settings WHERE key = :k LIMIT 1`,
    { replacements: { k: SYNC_STATE_KEY }, type: QueryTypes.SELECT });
  const v = rows && rows[0] && rows[0].value;
  return v && typeof v === 'object' ? (v as SyncStateMap) : {};
}

async function writeSyncState(map: SyncStateMap): Promise<void> {
  const { sequelize } = await import('../../config/database');
  await sequelize.query(
    `INSERT INTO system_settings (id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), :k, :v::jsonb, NOW(), NOW())
     ON CONFLICT (key) DO UPDATE SET value = :v::jsonb, updated_at = NOW()`,
    { replacements: { k: SYNC_STATE_KEY, v: JSON.stringify(map) } });
}

/** Read one opportunity's last sync entry — used by the workspace to surface "last synced" + any change. */
export async function getGovSyncEntry(canonicalOpportunityId: string): Promise<StoredSyncEntry | null> {
  const map = await readSyncState();
  return map[canonicalOpportunityId] ?? null;
}

/** Claim the once-per-day run slot (guards against the multiple prod scheduler instances). */
async function claimDailyRun(): Promise<boolean> {
  const { sequelize } = await import('../../config/database');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  await sequelize.query(
    `INSERT INTO system_settings (id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), 'gov_sync_run_log', '{}'::jsonb, NOW(), NOW()) ON CONFLICT (key) DO NOTHING`);
  const claimed = await sequelize.query(
    `UPDATE system_settings SET value = jsonb_set(COALESCE(value,'{}'::jsonb), ARRAY['lastRun'], to_jsonb(:today::text), true), updated_at = NOW()
      WHERE key = 'gov_sync_run_log' AND COALESCE(value->>'lastRun','') <> :today RETURNING key`,
    { replacements: { today }, type: QueryTypes.SELECT });
  return Array.isArray(claimed) && claimed.length > 0;
}

export interface GovSyncResult { skipped?: string; checked: number; changed: number; changes: Array<{ canonical: string; change: SyncChange }>; }

/**
 * The daily runner. Ships dark (FLAGS.govDailySync). Re-checks the live v1 feed for pursued DECOUPLED opportunities,
 * records a material change (deadline moved / dropped from feed) for the workspace to surface, and refreshes the
 * last-seen close date. Never advances a decision. Fail-closed on a feed error.
 */
export async function syncPursuedGovOpportunities(): Promise<GovSyncResult> {
  if (!FLAGS.govDailySync) return { skipped: 'disabled', checked: 0, changed: 0, changes: [] };
  if (!(await claimDailyRun())) return { skipped: 'already_ran_today', checked: 0, changed: 0, changes: [] };

  const { default: GovQualification } = await import('../../models/GovQualification');
  const { fetchBestFitOpportunities } = await import('./opportunities/oppPulseClient');

  // Cohort: latest active version per thread, decided-to-bid / still-working, DECOUPLED (gws) only.
  const rows: any[] = await GovQualification.findAll({ where: { status: 'active' }, order: [['version', 'DESC']] });
  const latestByThread = new Map<string, any>();
  for (const r of rows) {
    const key = `${r.canonical_opportunity_id}|${r.bidding_entity}`;
    if (!latestByThread.has(key)) latestByThread.set(key, r); // first seen = highest version (ordered desc)
  }
  const cohort = Array.from(latestByThread.values()).filter(
    (r) => PURSUED_DECISIONS.includes(String(r.decision)) && GWS_RE.test(String(r.canonical_opportunity_id)));

  // One feed read for all; fail-closed: on a feed error record nothing and report. fetchBestFitOpportunities
  // returns a GovOpportunityFeed ({ opportunities, source, ... }), so read the rows off `.opportunities`.
  let feed: any[] = [];
  try { const res: any = await fetchBestFitOpportunities(); feed = Array.isArray(res?.opportunities) ? res.opportunities : []; }
  catch { return { skipped: 'feed_unavailable', checked: 0, changed: 0, changes: [] }; }
  const byUuid = new Map<string, any>();
  for (const o of feed) if (o && o.uuid) byUuid.set(String(o.uuid).toLowerCase(), o);

  const state = await readSyncState();
  const now = new Date().toISOString();
  const changes: Array<{ canonical: string; change: SyncChange }> = [];
  for (const r of cohort) {
    const canonical = String(r.canonical_opportunity_id);
    const uuid = (GWS_RE.exec(canonical) as RegExpExecArray)[1].toLowerCase();
    const row = byUuid.get(uuid) || null;
    const curr: SyncSnapshot = { closeDate: row ? (row.closeDate ?? row.closeAt ?? null) : null, present: !!row };
    const prevEntry = state[canonical];
    const prev = prevEntry ? { closeDate: prevEntry.closeDate, present: prevEntry.present } : null;
    const change = diffGovOpportunity(prev, curr);
    const isMaterial = change.kind === 'deadline_changed' || change.kind === 'dropped_from_feed';
    state[canonical] = { closeDate: curr.closeDate, present: curr.present, syncedAt: now, change: isMaterial ? change : (prevEntry?.change ?? null) };
    if (isMaterial) changes.push({ canonical, change });
  }
  await writeSyncState(state);
  return { checked: cohort.length, changed: changes.length, changes };
}
