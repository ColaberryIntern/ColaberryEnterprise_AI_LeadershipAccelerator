/**
 * govDiscoveryBoard: the ONE definition of where each opportunity sits in the daily process. The board route and the
 * morning email both call buildDiscoveryBoard, so they can't disagree. PURE: no IO, `today` is injected.
 *
 * Stages: needs_zip (passed the smell test, waiting for an upload), analyzing (ZIP in, AI working or a hide pending),
 * vetted (the star: AI says pursue), needs_read (a person has to look), approved (second admin approved, waiting for an
 * intern), flagged (Opportunity Pulse's no-bid or needs-review), below_bar (failed the smell test: unlisted, and hidden by
 * the next sweep, so it lands on the Hidden list with a way back). Off the board entirely: dismissed, assigned to an active
 * intern, or no_bid. A row with no fit score hasn't failed anything, so it stays on the upload list marked "Fit unknown".
 *
 * Rule: humans outrank AI. An AI pass only hides a row with no human progress and no human restore. If a saved-state read
 * failed, nothing is hidden at all.
 */
import type { GovOpportunity } from './govOpportunity';

export const AUTO_HIDE_FIT_BELOW = 60;
export const AI_NOT_A_FIT_REASON = 'ai_not_a_fit';
export const AUTO_HIDE_REASON = 'auto_fit_below_threshold';
export const OFF_TARGET_REASON = 'auto_off_target';

export type BoardStage = 'needs_zip' | 'analyzing' | 'vetted' | 'needs_read' | 'approved' | 'flagged' | 'below_bar';

/**
 * The external fit model over-scores physical construction/trades, pure-labor staffing and human-services solicitations.
 * Match on the title and treat these as off target REGARDLESS of fit. A title that also carries a software, data or AI
 * signal is rescued, so a genuine IT solicitation that merely mentions one of these words is never hidden.
 */
const OFF_TARGET_TITLE = [
  'construction', 'demolition', 'abatement', 'roofing', 'roof replacement', 'renovation',
  'general contractor', 'contractor services', 'buildout', 'build-out', 'sewer', 'irrigation',
  'paving', 'asphalt', 'concrete', 'janitorial', 'custodial', 'landscaping', 'debris',
  'blight remediation', 'property maintenance', 'traffic control', 'security guard', 'guard services',
  'temporary staffing', 'staffing agenc', 'foster care', 'hospice', 'short-term shelter',
  'emergency placement', 'group home', 'youth development', 'unit conversion',
];
const RESCUE_TITLE = [
  'software', 'system', 'platform', 'application', 'data', 'analytics', 'digital', 'website',
  'hosting', 'intranet', 'portal', 'erp', 'records', 'proctoring', 'technology', 'cyber',
  'cloud', 'dashboard', 'tracking', 'detection', 'information', 'electronic', 'online',
];
export function isOffTarget(title: string): boolean {
  const t = String(title).toLowerCase();
  if (/\bai\b/.test(t)) return false;
  if (RESCUE_TITLE.some((k) => t.includes(k))) return false;
  return OFF_TARGET_TITLE.some((k) => t.includes(k));
}

/** An opportunity Opportunity Pulse flagged (no_bid or needs_review) or that was declined: never a candidate. */
export function isFlagged(o: Pick<GovOpportunity, 'vetVerdict' | 'pursuitStatus'>): boolean {
  const s = o.vetVerdict?.status;
  return s === 'no_bid' || s === 'needs_review' || o.pursuitStatus === 'declined';
}

export interface QualFacts {
  decision: string | null;
  approvalRequested: boolean;
  establishedCount: number;
  zipSha: string | null;
  title: string | null;
  agency: string | null;
  closeDate: string | null;
}
export interface VettingFacts {
  status: string;
  verdict: 'pursue' | 'pass' | 'inconclusive' | null;
  reason: string | null;
  quote: string | null;
  coveragePct: number | null;
  errorClass: string | null;
  opportunity: Record<string, any> | null;
}
export type FactRead = 'restored' | 'assigned' | 'qualifications' | 'vettings' | 'bundles';
export interface BoardFacts {
  dismissed: ReadonlySet<string>;
  restored: ReadonlySet<string>;
  assigned: ReadonlySet<string>;
  /** Keys in these maps are discovery uuids. */
  qualifications: ReadonlyMap<string, QualFacts>;
  /** The newest upload's row per uuid. */
  vettings: ReadonlyMap<string, VettingFacts>;
  /** `${uuid}:${sha256}` of each ZIP whose bytes are stored. */
  bundles: ReadonlySet<string>;
  aiEnabled: boolean;
  /**
   * False when no sweep will act on a below-bar row: the sweep is off, or the feed isn't live. The row then stays listed,
   * because dropping it with no dismissal would leave it on neither the board nor the Hidden list. Unset means true.
   */
  sweepActs?: boolean;
  /** Reads that failed on this load. Their data above is empty, not true. */
  failedReads?: ReadonlySet<FactRead>;
}

const hasHumanProgress = (q: QualFacts | undefined): boolean =>
  !!q && (q.approvalRequested || q.establishedCount > 0 || q.decision === 'approved_bid_pursuit' || q.decision === 'rfi_response');

/** Why the smell test fails, or null. The classifier and the sweep share this, so a row they drop is always a row hidden. */
function smellTestFailure(o: Pick<GovOpportunity, 'title' | 'fitScore'>): string | null {
  if (isOffTarget(o.title)) return OFF_TARGET_REASON;
  return typeof o.fitScore === 'number' && o.fitScore < AUTO_HIDE_FIT_BELOW ? AUTO_HIDE_REASON : null;
}

/** PURE. The stage of one row, or null when it is off the board. Order is load-bearing: see the file header. */
export function classifyBoardRow(o: GovOpportunity, f: BoardFacts): BoardStage | null {
  if (f.assigned.has(o.uuid) || f.dismissed.has(o.uuid)) return null;
  const q = f.qualifications.get(o.uuid);
  if (q?.decision === 'no_bid') return null;
  if (q?.decision === 'approved_bid_pursuit' || q?.decision === 'rfi_response') return 'approved';
  if (q?.approvalRequested) return 'needs_read';
  if (isFlagged(o)) return 'flagged';

  const v = f.vettings.get(o.uuid);
  if (v) {
    if (v.status === 'completed') {
      if (v.verdict === 'pursue') return 'vetted';
      if (v.verdict === 'pass') return f.restored.has(o.uuid) || hasHumanProgress(q) ? 'needs_read' : 'analyzing';
      return 'needs_read';
    }
    return f.aiEnabled ? 'analyzing' : 'needs_read';
  }
  if (q?.zipSha && f.bundles.has(`${o.uuid}:${q.zipSha}`)) return f.aiEnabled ? 'analyzing' : 'needs_read';
  // A ZIP was attested but its bytes weren't kept: it needs uploading again, whatever its fit, and the sweep won't hide it.
  if (f.sweepActs !== false && !f.restored.has(o.uuid) && !hasHumanProgress(q) && !q?.zipSha && smellTestFailure(o)) return 'below_bar';
  return 'needs_zip';
}

export interface BoardRow {
  opportunity: GovOpportunity;
  stage: Exclude<BoardStage, 'below_bar'>;
  vetting: VettingFacts | null;
  /** True when the row left the feed and is shown from what was saved when its ZIP was vetted. */
  fromSnapshot: boolean;
}
export interface DiscoveryBoard {
  rows: BoardRow[];
  counts: Record<BoardStage, number>;
  /** Every active dismissal, including rows that have since left the feed: the size of the Hidden list. */
  dismissedCount: number;
  assignedCount: number;
  /** A saved-state read failed, so this load may understate progress. */
  incomplete: boolean;
}

const AI_OFF_REASON = 'The AI checks are off, so this needs your read.';

const FROM_SNAPSHOT_STAGES: ReadonlySet<BoardStage> = new Set(['vetted', 'needs_read', 'approved']);

/**
 * A row that left the top-50 feed but still matters. Opportunity Pulse drops bids closing within 10 days, which is the
 * final stretch, so a vetted or approved bid stays listed from its saved details until the close date passes. Needs a
 * title and a known future close date: an unknown date stays off, so old abandoned records can't flood the list.
 */
function snapshotOpportunity(uuid: string, f: BoardFacts, today: string): GovOpportunity | null {
  const q = f.qualifications.get(uuid);
  const s = f.vettings.get(uuid)?.opportunity ?? {};
  const title = s.title ?? q?.title ?? null;
  const closeDate = s.closeDate ?? q?.closeDate ?? null;
  if (!title || !closeDate || String(closeDate).slice(0, 10) < today) return null;
  return {
    uuid, title: String(title), agency: String(s.agency ?? q?.agency ?? ''), closeDate: String(closeDate).slice(0, 10),
    fitScore: typeof s.fitScore === 'number' ? s.fitScore : null, priorityScore: typeof s.priorityScore === 'number' ? s.priorityScore : null,
    estimatedValue: typeof s.estimatedValue === 'number' ? s.estimatedValue : null, category: s.category ?? null,
    sourceUrl: typeof s.sourceUrl === 'string' ? s.sourceUrl : null,
  };
}

/** PURE. The whole board from the live feed plus saved facts. Used by both the route and the email. */
export function buildDiscoveryBoard(feed: readonly GovOpportunity[], f: BoardFacts, today: string): DiscoveryBoard {
  const counts: Record<BoardStage, number> = { needs_zip: 0, analyzing: 0, vetted: 0, needs_read: 0, approved: 0, flagged: 0, below_bar: 0 };
  const rows: BoardRow[] = [];
  let assignedCount = 0;
  const add = (o: GovOpportunity, fromSnapshot: boolean): void => {
    const stage = classifyBoardRow(o, f);
    if (!stage) return;
    counts[stage] += 1;
    if (stage === 'below_bar') return;
    const v = f.vettings.get(o.uuid) ?? null;
    const aiOff = stage === 'needs_read' && !f.aiEnabled && v?.status !== 'completed' && !f.qualifications.get(o.uuid)?.approvalRequested;
    const vetting = aiOff ? { status: v?.status ?? 'queued', verdict: null, reason: AI_OFF_REASON, quote: null, coveragePct: null, errorClass: null, opportunity: null } : v;
    rows.push({ opportunity: o, stage, vetting, fromSnapshot });
  };
  const inFeed = new Set<string>();
  for (const o of feed) {
    inFeed.add(o.uuid);
    if (!f.dismissed.has(o.uuid) && f.assigned.has(o.uuid)) assignedCount += 1;
    add(o, false);
  }
  for (const uuid of new Set([...f.vettings.keys(), ...f.qualifications.keys()])) {
    if (inFeed.has(uuid)) continue;
    const o = snapshotOpportunity(uuid, f, today);
    if (o && FROM_SNAPSHOT_STAGES.has(classifyBoardRow(o, f) as BoardStage)) add(o, true);
  }
  return { rows, counts, dismissedCount: f.dismissed.size, assignedCount, incomplete: (f.failedReads?.size ?? 0) > 0 };
}

/** The reads a hide depends on. An empty one looks like "no human progress" or "never restored". */
const HIDE_NEEDS_READS: readonly FactRead[] = ['restored', 'assigned', 'qualifications', 'vettings'];

export interface HideDecision { opportunity: GovOpportunity; reason: string }

/**
 * PURE. What the morning sweep hides. Never a restored row, never a row with human progress or an uploaded ZIP, and nothing
 * at all when a read it depends on failed. Re-hiding a restored row would also clear its restored_at for good.
 */
export function rowsToHide(feed: readonly GovOpportunity[], f: BoardFacts): HideDecision[] {
  if (HIDE_NEEDS_READS.some((r) => f.failedReads?.has(r))) return [];
  const out: HideDecision[] = [];
  for (const o of feed) {
    if (f.dismissed.has(o.uuid) || f.restored.has(o.uuid) || f.assigned.has(o.uuid)) continue;
    const q = f.qualifications.get(o.uuid);
    if (hasHumanProgress(q) || q?.decision === 'no_bid') continue;
    const v = f.vettings.get(o.uuid);
    if (v?.status === 'completed' && v.verdict === 'pass') { out.push({ opportunity: o, reason: AI_NOT_A_FIT_REASON }); continue; }
    if (v || q?.zipSha) continue; // a ZIP is in: the AI decides, not the title
    const failure = smellTestFailure(o);
    if (failure) out.push({ opportunity: o, reason: failure });
  }
  return out;
}
