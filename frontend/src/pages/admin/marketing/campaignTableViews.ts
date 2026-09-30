/**
 * campaignTableViews — objective-aware ranking, column customisation and saved views, as pure
 * logic the table renders.
 *
 * THE RANKING RULE. The server resolves, per objective, which metric a campaign should be
 * judged by and whether that was a fallback (see backend campaignRanking.ts). This module
 * applies it. It does NOT decide it - a table that kept its own opinion would drift from the
 * registry the first time a metric's trust status changed.
 *
 * WHY CAMPAIGNS ARE GROUPED, NOT INTERLEAVED. An engagement campaign ranked by engagement and
 * an acquisition campaign ranked by leads have no common scale. Sorting them into one list
 * would require converting both to some shared score, and any such score is an invented
 * number - which is the class of thing this whole build removes. So the table groups by
 * objective, ranks WITHIN each group by that group's metric, and says at the top of each
 * group what the ranking is and why. The comparison an operator can honestly make is "which
 * of my acquisition campaigns is doing best at acquisition", and that is the one offered.
 */

export type FunnelStage = 'awareness' | 'consideration' | 'conversion' | 'retention' | 'advocacy';
export type ObjectiveKey = FunnelStage | 'unset';

export interface RankingRung {
  metricKey: string;
  column: string;
  direction: 'asc' | 'desc';
  label: string;
}

export interface ResolvedRanking {
  objective: ObjectiveKey;
  rung: RankingRung | null;
  fallback: boolean;
  reason: string;
}

/**
 * The minimum a row needs for ranking. The real row has many more fields.
 *
 * No index signature here on purpose: requiring one would force every concrete row type to
 * declare `[k: string]: unknown`, which throws away the precise typing of its real fields.
 * The ranking column is read through a narrow cast at the one place it is needed instead.
 */
export interface RankableCampaign {
  campaign_id: string;
  funnel_stage: string | null;
}

export interface RankedGroup<T extends RankableCampaign> {
  objective: ObjectiveKey;
  ranking: ResolvedRanking;
  campaigns: T[];
}

const OBJECTIVE_ORDER: readonly ObjectiveKey[] = [
  'conversion', 'consideration', 'awareness', 'retention', 'advocacy', 'unset',
];

export const OBJECTIVE_LABELS: Record<ObjectiveKey, string> = {
  conversion: 'Acquisition',
  consideration: 'Engagement',
  awareness: 'Awareness',
  retention: 'Retention',
  advocacy: 'Advocacy',
  unset: 'No objective set',
};

function objectiveOf(c: RankableCampaign): ObjectiveKey {
  const s = c.funnel_stage;
  return s && (OBJECTIVE_ORDER as readonly string[]).includes(s) ? (s as ObjectiveKey) : 'unset';
}

/**
 * Rank campaigns by their own objective's metric, grouped so unlike things are never compared.
 *
 * A group whose ranking resolved to NO rung (awareness today: impressions unavailable, visitors
 * invalid) is left in arrival order. That is not a bug to hide with a default sort - it is the
 * honest state, and the group header carries the reason.
 */
export function rankCampaigns<T extends RankableCampaign>(
  campaigns: readonly T[],
  ranking: Record<string, ResolvedRanking>,
): RankedGroup<T>[] {
  const buckets = new Map<ObjectiveKey, T[]>();
  for (const c of campaigns) {
    const key = objectiveOf(c);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const groups: RankedGroup<T>[] = [];
  for (const objective of OBJECTIVE_ORDER) {
    const rows = buckets.get(objective);
    if (!rows || rows.length === 0) continue;

    const resolved = ranking[objective] ?? {
      objective, rung: null, fallback: true, reason: 'No ranking rule was provided for this objective.',
    };

    const sorted = [...rows];
    if (resolved.rung) {
      const { column, direction } = resolved.rung;
      sorted.sort((a, b) => {
        // Narrow cast, scoped to the read. The column name comes from the server's resolved
        // ranking, which only ever names columns that exist on the row.
        const av = Number((a as unknown as Record<string, unknown>)[column]);
        const bv = Number((b as unknown as Record<string, unknown>)[column]);
        // A row missing the metric sorts LAST regardless of direction - it has no claim to a
        // position, and putting it first (as NaN comparisons sometimes do) would rank an
        // unknown above every known value.
        const aBad = Number.isNaN(av);
        const bBad = Number.isNaN(bv);
        if (aBad && bBad) return 0;
        if (aBad) return 1;
        if (bBad) return -1;
        return direction === 'asc' ? av - bv : bv - av;
      });
    }
    groups.push({ objective, ranking: resolved, campaigns: sorted });
  }
  return groups;
}

// ── Columns ────────────────────────────────────────────────────────────────────────────────

export interface ColumnDef {
  key: string;
  label: string;
  /** Shown by default. Others are available through customisation. */
  defaultOn: boolean;
}

export const ALL_COLUMNS: readonly ColumnDef[] = [
  { key: 'campaign_type', label: 'Type', defaultOn: false },
  { key: 'visitors_count', label: 'Visitors', defaultOn: true },
  { key: 'high_intent_pct', label: 'Intent %', defaultOn: true },
  { key: 'leads_count', label: 'Leads', defaultOn: true },
  { key: 'engagement_count', label: 'Engagement', defaultOn: true },
  { key: 'opens_count', label: 'Opens', defaultOn: false },
  { key: 'clicks_count', label: 'Clicks', defaultOn: false },
  { key: 'replies_count', label: 'Replies', defaultOn: false },
  { key: 'strategy_calls', label: 'Calls', defaultOn: true },
  { key: 'enrollments_count', label: 'Enrolled', defaultOn: true },
  { key: 'visitor_to_lead_pct', label: 'Visitor→Lead %', defaultOn: true },
  { key: 'lead_to_call_pct', label: 'Lead→Call %', defaultOn: false },
  { key: 'call_to_enroll_pct', label: 'Call→Enroll %', defaultOn: false },
  { key: 'conversion_rate', label: 'Overall Conv %', defaultOn: true },
];

export const DEFAULT_COLUMNS: readonly string[] = ALL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key);

// ── Saved views ────────────────────────────────────────────────────────────────────────────

export interface SavedView {
  name: string;
  columns: string[];
}

const STORAGE_KEY = 'marketing.campaignTable.views';

/**
 * Saved views live in localStorage: a per-viewer convenience, which is the one thing that
 * storage is the right tool for. They are not shared, not authoritative, and losing them
 * costs a few clicks. Every access is guarded because storage can be absent or throw (private
 * windows, cleared site data), and a view picker that crashed the table would be a poor trade
 * for a remembered column set.
 */
export function loadViews(storage: Pick<Storage, 'getItem'> | null): SavedView[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate the shape rather than trusting it: storage is writable by anything on the
    // origin, and a malformed entry must not take the table down.
    return parsed.filter(
      (v): v is SavedView =>
        typeof v === 'object' && v !== null &&
        typeof (v as SavedView).name === 'string' &&
        Array.isArray((v as SavedView).columns) &&
        (v as SavedView).columns.every((c) => typeof c === 'string'),
    );
  } catch {
    return [];
  }
}

export function saveViews(storage: Pick<Storage, 'setItem'> | null, views: SavedView[]): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(views));
    return true;
  } catch {
    return false;
  }
}

/** Add or replace a view by name. Names are the identity; saving twice updates, never duplicates. */
export function upsertView(views: SavedView[], view: SavedView): SavedView[] {
  const idx = views.findIndex((v) => v.name === view.name);
  if (idx === -1) return [...views, view];
  const next = [...views];
  next[idx] = view;
  return next;
}
