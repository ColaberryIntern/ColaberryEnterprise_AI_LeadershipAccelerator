/**
 * ourServicesModel - the PURE derivations behind the Our Services evidence page (Services Upgrade SV3).
 *
 * No React and no I/O, so every rule the page shows can be pinned by a unit test. Every number here is derived
 * from the evidence-summary response; nothing is invented. A value the server could not read stays null and the
 * UI says "not available" rather than showing a 0.
 *
 * Dates: deadlines and "this year" are read in US Central time (America/Chicago), the operator's clock.
 */
import type { EvidenceService, EvidenceSummary, EvidenceTier, FitGap, IntakeSummaryItem } from '../../../services/ourServicesApi';

export const CENTRAL_TZ = 'America/Chicago';

/** Tier display: the label, the Bootstrap subtle/emphasis pill, and the token used for meter and chart fills. */
export const TIER_META: Record<EvidenceTier, { label: string; pill: string; fill: string; text: string }> = {
  proven: { label: 'Proven', pill: 'bg-success-subtle text-success-emphasis', fill: 'var(--status-success)', text: 'text-success-emphasis' },
  emerging: { label: 'Emerging', pill: 'bg-warning-subtle text-warning-emphasis', fill: 'var(--status-warning)', text: 'text-warning-emphasis' },
  thin: { label: 'Thin', pill: 'bg-danger-subtle text-danger-emphasis', fill: 'var(--red-300)', text: 'text-danger-emphasis' },
  none: { label: 'No proof', pill: 'bg-danger-subtle text-danger-emphasis', fill: 'var(--status-danger)', text: 'text-danger-emphasis' },
};
export const TIER_ORDER: EvidenceTier[] = ['proven', 'emerging', 'thin', 'none'];
export const TIER_RANGE: Record<EvidenceTier, string> = { proven: '70+', emerging: '40-69', thin: '1-39', none: '0' };

/** Inside (our own repo evidence) and Outside (Drive documents) series colors. Data-viz tokens, never hex. */
export const SOURCE_FILL = { inside: 'var(--chart-1)', outside: 'var(--chart-5)' } as const;

/** Today's calendar date in Central time, as YYYY-MM-DD. */
export function centralToday(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: CENTRAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const centralYear = (now: Date): number => Number(centralToday(now).slice(0, 4));

/** Whole days from today (Central) until a YYYY-MM-DD calendar date. Negative once it has passed. */
export function daysUntil(closeDate: string, now: Date): number {
  const a = Date.parse(`${centralToday(now)}T00:00:00Z`);
  const b = Date.parse(`${closeDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * A YYYY-MM-DD deadline shown as "Nov 23" (Central). The date is a calendar date, so it is anchored at noon UTC:
 * formatting midnight UTC in Central would print the day before.
 */
export function formatCentralDate(closeDate: string): string {
  const d = new Date(`${closeDate.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return closeDate;
  return new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TZ, month: 'short', day: 'numeric' }).format(d);
}

/** "2026-Q4" -> "Q4 '26". */
export function quarterLabel(q: string): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(q);
  return m ? `Q${m[2]} '${m[1].slice(2)}` : q;
}

export type Freshness = 'fresh' | 'recent' | 'stale' | 'none';
/** Freshest proof: this year = fresh (green), last year = recent (amber), older or none = red. */
export function freshnessOf(newestYear: number | null, currentYear: number): Freshness {
  if (newestYear == null) return 'none';
  if (newestYear >= currentYear) return 'fresh';
  if (newestYear === currentYear - 1) return 'recent';
  return 'stale';
}

/**
 * The suggestor's raw score (category 3 + 1 per matched keyword) as a 0-100 match confidence, banded to agree
 * with the backend's own strength bands: strong (category + 2 keywords, score >= 5) lands at 75 or more,
 * moderate (score 3-4) at 50-74, weak (score 1-2) under 50. Monotonic and deterministic. Null or 0 -> 0.
 */
export function suggestionConfidence(score: number | null): number {
  if (score == null || !Number.isFinite(score) || score <= 0) return 0;
  if (score >= 5) return Math.min(100, 75 + (score - 5) * 5);
  if (score >= 3) return 50 + (score - 3) * 12;
  return Math.round(score * 20);
}

export type ConfidenceTone = 'success' | 'warning' | 'muted';
export const confidenceTone = (pct: number): ConfidenceTone => (pct >= 75 ? 'success' : pct >= 50 ? 'warning' : 'muted');
/** Suggestions at or above this confidence start pre-checked. A person still has to click Link. */
export const PRECHECK_AT = 75;

export const nonRetired = (services: EvidenceService[]): EvidenceService[] => services.filter((s) => s.status !== 'retired');
export const confirmedCount = (s: EvidenceService): number => s.insideCount + s.outsideCount;

export interface KpiValues {
  active: number;
  growth: number;
  linkedCaseStudies: number;
  linkedInside: number;
  linkedOutside: number;
  proven: number;
  /** null when the catalog is empty (a percent of nothing is not 0%). */
  provenPct: number | null;
  avgScore: number | null;
  noProof: number;
  /** noProof split by status, so the tile can say which are live in bids (active) vs not yet (growth). */
  noProofActive: number;
  noProofGrowth: number;
  blocked: number;
}

export function buildKpis(summary: EvidenceSummary): KpiValues {
  const live = nonRetired(summary.services);
  const linked = new Map<string, 'inside' | 'outside'>();
  for (const s of live) for (const c of s.caseStudies) linked.set(c.id, c.sourceKind);
  const proven = live.filter((s) => s.evidenceTier === 'proven').length;
  const values = [...linked.values()];
  return {
    active: live.filter((s) => s.status === 'active').length,
    growth: live.filter((s) => s.status === 'growth').length,
    linkedCaseStudies: linked.size,
    linkedInside: values.filter((k) => k === 'inside').length,
    linkedOutside: values.filter((k) => k === 'outside').length,
    proven,
    provenPct: live.length ? Math.round((proven / live.length) * 100) : null,
    avgScore: live.length ? Math.round(live.reduce((a, s) => a + s.evidenceScore, 0) / live.length) : null,
    noProof: live.filter((s) => s.evidenceTier === 'none').length,
    noProofActive: live.filter((s) => s.evidenceTier === 'none' && s.status === 'active').length,
    noProofGrowth: live.filter((s) => s.evidenceTier === 'none' && s.status === 'growth').length,
    blocked: summary.decideNow.blockedCaseStudies.count,
  };
}

/** Heat step 0-4 for a cell: 0 = empty, then four alpha steps relative to the busiest cell. */
export function heatStep(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const r = count / max;
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}

/** Open-match color relative to the busiest service: top third danger, middle third warning, else muted. */
export function matchesTone(n: number | null, max: number): 'danger' | 'warning' | 'muted' {
  if (n == null || max <= 0) return 'muted';
  if (n >= (2 / 3) * max) return 'danger';
  if (n >= (1 / 3) * max) return 'warning';
  return 'muted';
}

/** The quadrant's horizontal split: the median of the known open-match counts (at least 1). */
export function demandSplit(services: EvidenceService[]): number {
  const xs = services.map((s) => s.openOpportunityMatches).filter((n): n is number => n != null).sort((a, b) => a - b);
  if (!xs.length) return 1;
  const mid = Math.floor(xs.length / 2);
  const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return Math.max(1, median);
}

/**
 * Industry thumbnails are RemixIcon class names. House style (frontendTypographyLint) forbids emoji in product
 * copy; an icon is the supported way to show a glyph.
 */
const INDUSTRY_ICON: Array<[RegExp, string]> = [
  [/gov|public|federal|county|city|state/i, 'ri-government-line'], [/agri|agtech|farm|crop/i, 'ri-plant-line'], [/financ|bank|insur|credit/i, 'ri-line-chart-line'],
  [/health|medic|hospital|pharma|claims/i, 'ri-hospital-line'], [/educat|school|universit|learn/i, 'ri-graduation-cap-line'], [/retail|commerce|consumer/i, 'ri-shopping-cart-2-line'],
  [/energy|utilit|power|oil|gas/i, 'ri-flashlight-line'], [/manufact|industr/i, 'ri-building-3-line'], [/tech|software|saas/i, 'ri-computer-line'],
];
export const DEFAULT_INDUSTRY_ICON = 'ri-file-text-line';
/** A decorative thumbnail icon class for an industry. Unknown industries get a plain document. */
export function industryIcon(industry: string | null): string {
  if (!industry) return DEFAULT_INDUSTRY_ICON;
  for (const [re, icon] of INDUSTRY_ICON) if (re.test(industry)) return icon;
  return DEFAULT_INDUSTRY_ICON;
}

const STOP = new Set(['and', 'the', 'for', 'with', 'from', 'into', 'management', 'services', 'service', 'support', 'system', 'systems']);
const terms = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3 && !STOP.has(t));

/**
 * Possible unlinked proof for a proposal gap: Intake case studies whose keywords or title share a term with the
 * capability name. Deterministic keyword overlap, the same idea as the backend's possibleProof; it is a hint to
 * check, never a link. At most `limit`, strongest overlap first.
 */
export function possibleProofForGap(capabilityName: string, intake: IntakeSummaryItem[], limit = 2): Array<{ item: IntakeSummaryItem; matched: string[] }> {
  const want = new Set(terms(capabilityName));
  if (!want.size) return [];
  const out: Array<{ item: IntakeSummaryItem; matched: string[] }> = [];
  for (const item of intake) {
    const have = new Set([...item.keywords.flatMap(terms), ...terms(item.title)]);
    const matched = [...want].filter((t) => have.has(t));
    if (matched.length) out.push({ item, matched });
  }
  return out.sort((a, b) => b.matched.length - a.matched.length || a.item.title.localeCompare(b.item.title)).slice(0, limit);
}

/** Group open Fit gaps by pursuit, soonest deadline first (the server already sorts by close date). */
export function gapsByPursuit(items: FitGap[]): Array<{ key: string; title: string | null; buyer: string | null; closeDate: string; gaps: FitGap[] }> {
  const groups = new Map<string, { key: string; title: string | null; buyer: string | null; closeDate: string; gaps: FitGap[] }>();
  for (const g of items) {
    const cur = groups.get(g.qualificationKey) ?? { key: g.qualificationKey, title: g.title, buyer: g.buyer, closeDate: g.closeDate, gaps: [] };
    cur.gaps.push(g);
    groups.set(g.qualificationKey, cur);
  }
  return [...groups.values()].sort((a, b) => a.closeDate.localeCompare(b.closeDate) || a.key.localeCompare(b.key));
}

/** Where "Re-assess fit" goes: the pursuit's own Fit step, which owns the re-assess action. */
export const fitStepHref = (qualificationKey: string): string =>
  `/admin/gov-qualification?gws=${encodeURIComponent(qualificationKey)}&tab=fit`;
