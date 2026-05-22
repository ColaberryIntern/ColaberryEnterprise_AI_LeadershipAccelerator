/**
 * bpSignals — pure helpers to derive scan-speed signals from a BP's
 * usability + source fields.
 *
 * Operational Honest-Build-Signal Sprint, 2026-05-15.
 *
 * Each BP in this system carries:
 *   usability: { backend: 'ready'|'partial'|'missing'|'n/a',
 *                frontend: 'ready'|'partial'|'missing'|'n/a',
 *                agent:    'ready'|'partial'|'missing'|'n/a',
 *                usable:   boolean,
 *                why_not:  string[] }
 *
 * This file turns that into operator-readable signal:
 *   - bpPillars(bp): three pillar dots (backend / frontend / agent)
 *                   each with tone + label
 *   - bpKindLabel(bp): "Page" / "Agent" / "Service" / "Process"
 *   - bpBuiltness(bp): editorial word — "Built" / "Wired" / "Partial" /
 *                     "Foundation" / "Not built yet"
 *
 * These signals tell the operator at a glance whether a row is real
 * shipped work or just discovered-but-empty scaffolding.
 *
 * Honest framing: a pillar marked "n/a" doesn't mean missing — it means
 * this BP doesn't need that pillar (e.g. a frontend-only page doesn't
 * need an agent). The tooltip explains.
 */

export type PillarStatus = 'ready' | 'partial' | 'missing' | 'na';

export interface BPLikeSignal {
  is_page_bp?: boolean;
  source?: string;
  is_complete?: boolean;
  frontend_route?: string;
  usability?: {
    backend?: string;
    frontend?: string;
    agent?: string;
    usable?: boolean;
    why_not?: string[];
  };
  matched_requirements?: number;
  total_requirements?: number;
}

export interface PillarSignal {
  status: PillarStatus;
  label: 'backend' | 'frontend' | 'agent';
  tone: { fg: string; bg: string };
  /** Human-readable status — for tooltips. */
  description: string;
}

// 2026-05-22: missing collapses to gray (was red). Decision: operators
// scan B/F/A as "what's present?" not "is the BP wired correctly?" —
// red implied broken-ness for layers a BP may legitimately not need yet.
// The Components tab + BPs tab now share this palette so the operator
// learns one vocabulary across both surfaces. Caps that genuinely
// "don't need" a layer can still be marked 'n/a' for the same gray dim;
// the difference is now semantic (missing = absent, n/a = irrelevant)
// rather than visual.
export const PILLAR_TONES: Record<PillarStatus, { fg: string; bg: string }> = {
  ready:   { fg: '#15803d', bg: '#dcfce7' },              // green
  partial: { fg: '#b45309', bg: '#fef3c7' },              // amber
  missing: { fg: '#9ca3af', bg: 'transparent' },          // gray — absent
  na:      { fg: '#9ca3af', bg: 'transparent' },          // dim — not applicable
};

function normalizePillar(raw: string | undefined): PillarStatus {
  const v = (raw || '').toLowerCase();
  if (v === 'ready' || v === 'complete' || v === 'usable') return 'ready';
  if (v === 'partial' || v === 'in_progress' || v === 'forming') return 'partial';
  if (v === 'missing' || v === 'unbuilt' || v === 'none' || v === '') return 'missing';
  return 'na'; // anything we don't recognize — including literal "n/a"
}

const PILLAR_DESCRIPTION: Record<PillarStatus, string> = {
  ready:   'ready',
  partial: 'partially wired',
  missing: 'not yet built',
  na:      'not applicable for this BP',
};

export function bpPillars(bp: BPLikeSignal): PillarSignal[] {
  const u = bp.usability || {};
  return [
    { label: 'backend',  status: normalizePillar(u.backend),  tone: PILLAR_TONES[normalizePillar(u.backend)],  description: `Backend ${PILLAR_DESCRIPTION[normalizePillar(u.backend)]}` },
    { label: 'frontend', status: normalizePillar(u.frontend), tone: PILLAR_TONES[normalizePillar(u.frontend)], description: `Frontend ${PILLAR_DESCRIPTION[normalizePillar(u.frontend)]}` },
    { label: 'agent',    status: normalizePillar(u.agent),    tone: PILLAR_TONES[normalizePillar(u.agent)],    description: `Agent ${PILLAR_DESCRIPTION[normalizePillar(u.agent)]}` },
  ];
}

/**
 * Derive the BP "kind" from is_page_bp / source / usability.
 *
 * - is_page_bp OR source frontend_page → 'Page'
 * - agent is the only non-na pillar → 'Agent'
 * - backend is the only non-na pillar → 'Service'
 * - otherwise → 'Process'
 */
export function bpKindLabel(bp: BPLikeSignal): 'Page' | 'Agent' | 'Service' | 'Process' {
  if (bp.is_page_bp || bp.source === 'frontend_page') return 'Page';
  const u = bp.usability || {};
  const b = normalizePillar(u.backend);
  const f = normalizePillar(u.frontend);
  const a = normalizePillar(u.agent);
  const nonNa = [b !== 'na', f !== 'na', a !== 'na'].filter(Boolean).length;
  if (nonNa === 1) {
    if (a !== 'na') return 'Agent';
    if (b !== 'na') return 'Service';
    if (f !== 'na') return 'Page';
  }
  return 'Process';
}

/**
 * Operator-readable build state — the single most honest word for the
 * row. Replaces the harsh "Not built yet" / "Forming" / "Usable" trio
 * with something that respects the page-vs-service distinction.
 *
 * - usable === true            → 'Built'
 * - is_complete === true       → 'Built' (page BPs)
 * - some pillar ready          → 'Wired'
 * - some pillar partial        → 'Partial'
 * - any non-na pillar present  → 'Foundation'
 * - all pillars n/a or missing → 'Not built yet'
 */
export function bpBuiltness(bp: BPLikeSignal): 'Built' | 'Wired' | 'Partial' | 'Foundation' | 'Not built yet' {
  const u = bp.usability || {};
  if (u.usable === true) return 'Built';
  if (bp.is_complete === true) return 'Built';
  const statuses = [u.backend, u.frontend, u.agent].map(normalizePillar);
  if (statuses.includes('ready')) return 'Wired';
  if (statuses.includes('partial')) return 'Partial';
  // Has at least one non-NA pillar → there's a foundation even if nothing's built
  if (statuses.some(s => s !== 'na' && s !== 'missing')) return 'Foundation';
  return 'Not built yet';
}

/**
 * Domain-level build composition — for the expanded view's summary row.
 * Pure aggregation over a list of BPs.
 */
export interface DomainBuildBreakdown {
  total: number;
  built: number;        // usable=true OR is_complete=true
  wired: number;        // some pillar ready (not built end-to-end)
  partial: number;      // some pillar partial
  foundation: number;   // pillars present but nothing built
  notBuilt: number;     // no pillars
}

export function domainBuildBreakdown(bps: BPLikeSignal[]): DomainBuildBreakdown {
  const out = { total: bps.length, built: 0, wired: 0, partial: 0, foundation: 0, notBuilt: 0 };
  for (const bp of bps) {
    const word = bpBuiltness(bp);
    if (word === 'Built') out.built++;
    else if (word === 'Wired') out.wired++;
    else if (word === 'Partial') out.partial++;
    else if (word === 'Foundation') out.foundation++;
    else out.notBuilt++;
  }
  return out;
}

/**
 * One calm sentence describing the domain's build composition. Returns
 * null when the domain is empty.
 */
export function domainBuildSummary(breakdown: DomainBuildBreakdown): string | null {
  if (breakdown.total === 0) return null;
  const parts: string[] = [];
  if (breakdown.built > 0) parts.push(`${breakdown.built} built`);
  if (breakdown.wired > 0) parts.push(`${breakdown.wired} wired`);
  if (breakdown.partial > 0) parts.push(`${breakdown.partial} partial`);
  if (breakdown.foundation > 0) parts.push(`${breakdown.foundation} foundation`);
  if (breakdown.notBuilt > 0) parts.push(`${breakdown.notBuilt} not built yet`);
  return parts.length > 0 ? `${parts.join(' · ')} — of ${breakdown.total} total` : null;
}
