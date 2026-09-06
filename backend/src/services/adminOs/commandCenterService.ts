import { METRICS, MetricStatus } from './metricRegistry';

/**
 * The Command Center summary.
 *
 * WHY THIS IS COMPOSED SERVER-SIDE. The War Room fetches six endpoints from the
 * browser and wraps each in `.catch(() => ({ data: {} }))`. A 500 therefore
 * becomes an empty object, which renders as 0 — and a real zero and a broken
 * backend look identical on screen. That is the defect class this whole
 * consolidation exists to remove, sitting in the page it is replacing.
 *
 * Composing here means each source can report its OWN state. A tile can then say
 * "couldn't load" instead of quietly showing nothing, and the executive summary
 * can exclude a broken source from a health score rather than averaging a zero
 * into it.
 *
 * THE RULE: a value is null when it could not be computed. Never 0.
 */

/** What happened when we tried to read a source. */
export type SourceStatus =
  /** Read successfully. */
  | 'ok'
  /** The source threw. The value is unknown, NOT zero. */
  | 'failed'
  /** Registered as not computable — no source wired, or the source is untrusted. */
  | 'unavailable';

export interface MetricTile {
  key: string;
  name: string;
  /** null whenever status is not 'ok'. Never substituted with 0. */
  value: number | null;
  unit: string;
  /** Trust status from the metric registry. */
  trust: MetricStatus;
  /** Why it is not fully trusted, or why it could not be read. */
  note?: string;
  /** Whether this tile may feed a health score or an AI narrative. */
  computable: boolean;
  status: SourceStatus;
  /** Present only when status is 'failed', so a failure is diagnosable. */
  errorClass?: string;
}

/** One item in the attention queue or the activity feed. */
export interface FeedItem {
  id: string;
  label: string;
  detail?: string;
  at?: string;
  severity?: number;
}

/**
 * A list that knows whether it is empty or merely unread.
 *
 * `items: []` with `status: 'ok'` means genuinely nothing to show. The same
 * empty array with `status: 'failed'` means we could not tell. Rendering both as
 * "All clear" is how an outage looks like a calm morning.
 */
export interface FeedSection {
  status: SourceStatus;
  items: FeedItem[];
  errorClass?: string;
}

export interface CommandCenterSummary {
  generatedAt: string;
  windowDays: number;
  tiles: MetricTile[];
  /** What needs a human. Absorbed from the War Room. */
  attention: FeedSection;
  /** Cross-system activity. Absorbed from the War Room. */
  activity: FeedSection;
  /** Sources that failed to read, named so the UI can say so out loud. */
  degraded: string[];
}

/** The dependencies, injected so the composition is testable without a database. */
export interface CommandCenterDeps {
  getVisitorKpis: (days: number) => Promise<{
    unique_visitors: number;
    unique_visitors_7d: number;
    engaged_visitors: number;
    conversion_rate: number;
  }>;
  countLiveVisitors: () => Promise<number>;
  getDashboardStats: () => Promise<Record<string, unknown>>;
  /** Open alerts, newest first. Absorbed from the War Room's attention queue. */
  getAlerts: () => Promise<Array<Record<string, unknown>>>;
  /** Cross-system activity feed. */
  getActivityFeed: () => Promise<Array<Record<string, unknown>>>;
}

/** Read a string field without inventing one. */
function str(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

function toSection(
  read: { status: SourceStatus; value: Array<Record<string, unknown>> | null; errorClass?: string },
  toItem: (row: Record<string, unknown>, index: number) => FeedItem,
): FeedSection {
  return {
    status: read.status,
    // [] on failure, but paired with status 'failed' so the UI can tell the
    // difference between "nothing happened" and "we could not look".
    items: (read.value ?? []).map(toItem),
    errorClass: read.errorClass,
  };
}

/**
 * Read one source without letting its failure become someone else's zero.
 *
 * Deliberately NOT `.catch(() => 0)` or `.catch(() => ({}))`. Both of those turn
 * an error into a plausible number, which is exactly how the Visitors dashboard
 * reported 0 live visitors for weeks while the site had people on it.
 */
async function settle<T>(
  label: string,
  read: () => Promise<T>,
): Promise<{ status: SourceStatus; value: T | null; errorClass?: string }> {
  try {
    return { status: 'ok', value: await read() };
  } catch (error) {
    const errorClass = error instanceof Error ? error.constructor.name : 'Unknown';
    process.stdout.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'command-center',
        event: 'source_read_failed',
        outcome: 'failure',
        error_class: errorClass,
        context: { source: label },
      })}\n`,
    );
    return { status: 'failed', value: null, errorClass };
  }
}

/** A registered metric that cannot be computed at all — rendered, never hidden. */
function unavailableTile(key: string): MetricTile {
  const def = METRICS[key];
  return {
    key,
    name: def.name,
    // The whole point: not zero.
    value: null,
    unit: def.unit,
    trust: def.status,
    note: def.statusReason,
    computable: false,
    status: 'unavailable',
  };
}

function tile(
  key: string,
  value: number | null,
  source: { status: SourceStatus; errorClass?: string },
): MetricTile {
  const def = METRICS[key];
  return {
    key,
    name: def.name,
    value: source.status === 'ok' ? value : null,
    unit: def.unit,
    trust: def.status,
    note:
      source.status === 'failed'
        ? 'Could not be read just now. This is not a zero.'
        : def.statusReason,
    // Only a trusted metric that actually read may feed a score or a narrative.
    computable: source.status === 'ok' && def.status === 'trusted',
    status: source.status,
    errorClass: source.errorClass,
  };
}

export async function getCommandCenterSummary(
  deps: CommandCenterDeps,
  windowDays = 30,
): Promise<CommandCenterSummary> {
  // Read every source concurrently, but settle each independently. One failure
  // must not take the page down or, worse, blank the tiles that did load.
  const [visitors, live, dashboard, alerts, activity] = await Promise.all([
    settle('visitor_kpis', () => deps.getVisitorKpis(windowDays)),
    settle('live_visitors', () => deps.countLiveVisitors()),
    settle('dashboard_stats', () => deps.getDashboardStats()),
    settle('alerts', () => deps.getAlerts()),
    settle('activity_feed', () => deps.getActivityFeed()),
  ]);

  const tiles: MetricTile[] = [
    tile('growth.unique_visitors', visitors.value?.unique_visitors ?? null, visitors),
    tile('growth.engaged_visitors', visitors.value?.engaged_visitors ?? null, visitors),
    tile('growth.visitor_to_lead', visitors.value?.conversion_rate ?? null, visitors),

    // Registered as not computable. Rendered anyway, with the reason, because a
    // missing tile reads as "we don't track that" while an unavailable one reads
    // as "we can't tell yet" — and only the second is true.
    unavailableTile('learning.active_learners'),
    unavailableTile('revenue.net_revenue'),
  ];

  const degraded = [
    visitors.status === 'failed' ? 'visitor metrics' : null,
    live.status === 'failed' ? 'live visitor count' : null,
    dashboard.status === 'failed' ? 'dashboard stats' : null,
    alerts.status === 'failed' ? 'attention queue' : null,
    activity.status === 'failed' ? 'activity feed' : null,
  ].filter((x): x is string => x !== null);

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    tiles,
    attention: toSection(alerts, (row, i) => ({
      id: String(row.id ?? `alert-${i}`),
      label: str(row, 'title', 'subject', 'message') ?? 'Untitled alert',
      detail: str(row, 'description', 'detail', 'department'),
      at: str(row, 'created_at'),
      severity: typeof row.severity === 'number' ? row.severity : undefined,
    })),
    activity: toSection(activity, (row, i) => ({
      id: String(row.id ?? `${String(row.source ?? 'event')}-${i}`),
      label: str(row, 'event_type') ?? 'event',
      detail: str(row, 'detail', 'lead_name', 'lead_email'),
      at: str(row, 'created_at'),
    })),
    degraded,
  };
}

/**
 * The tiles a health score or AI narrative may use.
 *
 * Separate from the tile list on purpose. Everything is SHOWN; only trusted,
 * successfully-read values are COMPUTED WITH.
 */
export function computableTiles(summary: CommandCenterSummary): MetricTile[] {
  return summary.tiles.filter((t) => t.computable && t.value !== null);
}
