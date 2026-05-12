/**
 * bpDomainClassifier — groups Business Processes into operational
 * domains for the System surface's editorial architecture view.
 *
 * BP V2 Operational Architecture Sprint, 2026-05-12 — rewritten to
 * express lifecycle states, authored narratives, operational flow,
 * and inter-domain relationships.
 *
 * Frontend only. Zero backend changes. The matcher is case-insensitive,
 * longest-pattern-wins, substring-based.
 *
 * Each bucket carries:
 *   - lifecycleState: editorial state ("Foundational" → "Stabilizing")
 *   - narrative: authored prose chosen by lifecycleState (no templated %)
 *   - relationship: one-line "feeds into …" hint when applicable
 *   - orderIndex: position in the canonical operational flow
 */

export type DomainKey =
  | 'intake'
  | 'lead_intelligence'
  | 'marketing'
  | 'execution'
  | 'reporting'
  | 'student_lifecycle'
  | 'other';

/** Editorial maturity states. Choose by completion + usable density. */
export type LifecycleState =
  | 'Foundational'    // exists; little is connected
  | 'Emerging'        // starting to coordinate
  | 'Coordinated'     // pieces fit together
  | 'Operational'     // running reliably
  | 'Scaling'         // mature, expanding
  | 'Stabilizing';    // mature, late-stage optimization

export interface BPLike {
  id: string;
  name: string;
  total_requirements?: number;
  matched_requirements?: number;
  is_complete?: boolean;
  applicability_status?: string;
  lifecycle_status?: string;
  usability?: { backend?: string; frontend?: string; agent?: string; usable?: boolean };
  is_page_bp?: boolean;
  source?: string;
}

interface DomainSpec {
  key: DomainKey;
  label: string;
  icon: string;
  keywords: string[];
  /** Position in the canonical Intake → Lead → Marketing → Execution → Reporting flow. */
  orderIndex: number;
  /** Lightweight relationship hint surfaced when applicable. */
  feedsInto?: DomainKey[];
  supports?: DomainKey[];
  /**
   * Editorial narratives per lifecycle state. No "X% complete" templating.
   * Multiple variants per state — picker uses a deterministic hash of the
   * domain key so the narrative is stable across reloads.
   */
  narratives: Record<LifecycleState, string[]>;
}

const DOMAINS: DomainSpec[] = [
  {
    key: 'intake',
    label: 'Intake & Registration',
    icon: 'bi-door-open',
    keywords: [
      'registration', 'intake', 'signup', 'sign-up', 'enrollment',
      'onboarding', 'application', 'dataset', 'capture',
    ],
    orderIndex: 1,
    feedsInto: ['lead_intelligence'],
    narratives: {
      Foundational: [
        'The doorway into the system is still being built — intake exists but little flows through it yet.',
      ],
      Emerging: [
        'Intake is beginning to receive structured signals; the first end-to-end path is taking shape.',
      ],
      Coordinated: [
        'Intake reliably accepts new records and hands them to the lead layer; gaps remain in edge-case validation.',
      ],
      Operational: [
        'Intake is running cleanly across every channel — work enters the system without manual translation.',
      ],
      Scaling: [
        'Intake handles a broadening surface of channels and source types; new sources cost less to onboard.',
      ],
      Stabilizing: [
        'Intake is mature; ongoing changes are refinements rather than additions.',
      ],
    },
  },
  {
    key: 'lead_intelligence',
    label: 'Lead Intelligence',
    icon: 'bi-bullseye',
    keywords: [
      'lead', 'prospect', 'qualification', 'scoring', 'routing',
      'classification', 'attribution', 'enrichment',
    ],
    orderIndex: 2,
    feedsInto: ['marketing', 'execution'],
    supports: ['reporting'],
    narratives: {
      Foundational: [
        'Lead handling is still componentized — ingestion, classification, and routing exist but do not yet talk to each other.',
      ],
      Emerging: [
        'Lead systems are beginning to coordinate across intake and routing; scoring is consistent within a single pass.',
      ],
      Coordinated: [
        'Leads move from intake to qualification to routing without manual intervention; enrichment is the current frontier.',
      ],
      Operational: [
        'Lead intelligence runs the qualification → routing path reliably and feeds marketing + execution with consistent records.',
      ],
      Scaling: [
        'Lead intelligence is expanding into attribution and segmented scoring; downstream surfaces consume the same signal.',
      ],
      Stabilizing: [
        'Lead intelligence is mature; changes now focus on accuracy and model drift rather than coverage.',
      ],
    },
  },
  {
    key: 'marketing',
    label: 'Marketing Operations',
    icon: 'bi-megaphone',
    keywords: [
      'marketing', 'campaign', 'outreach', 'content', 'social',
      'broadcast', 'engagement',
    ],
    orderIndex: 3,
    feedsInto: ['execution'],
    supports: ['reporting'],
    narratives: {
      Foundational: [
        'Marketing exists as individual surfaces — dashboards, campaign skeletons — but no orchestrated cadence yet.',
      ],
      Emerging: [
        'Marketing operations exist but are still fragmented; the same content moves through more than one disconnected path.',
      ],
      Coordinated: [
        'Marketing handoffs connect to lead intelligence and to execution; cadence runs but observability is uneven.',
      ],
      Operational: [
        'Marketing operations run on schedule with lead intelligence in the loop; performance feeds back into prioritization.',
      ],
      Scaling: [
        'Marketing surfaces are expanding across channels with shared instrumentation; reporting picks up new sources cleanly.',
      ],
      Stabilizing: [
        'Marketing is operating at steady-state; ongoing work is content cadence rather than platform expansion.',
      ],
    },
  },
  {
    key: 'execution',
    label: 'Execution Systems',
    icon: 'bi-cpu',
    keywords: [
      'execution', 'build', 'pipeline', 'estimator', 'orchestrat',
      'workflow', 'task', 'job', 'verify', 'verification', 'validate',
      'agent', 'autonomous',
    ],
    orderIndex: 4,
    supports: ['reporting'],
    narratives: {
      Foundational: [
        'Execution is being scaffolded — pipelines exist on paper but the through-line is incomplete.',
      ],
      Emerging: [
        'Execution can take a downstream signal and act on it for the simple cases; verification is still operator-driven.',
      ],
      Coordinated: [
        'Execution systems are active but under-verified — work runs to completion, but the audit trail trails the work.',
      ],
      Operational: [
        'Execution runs reliably across the documented paths; verification confirms outcomes without manual replay.',
      ],
      Scaling: [
        'Execution is widening the set of work it can handle autonomously while staying inside the verification envelope.',
      ],
      Stabilizing: [
        'Execution is mature; current focus is on resilience and edge-case verification, not new capability.',
      ],
    },
  },
  {
    key: 'reporting',
    label: 'Reporting & Analytics',
    icon: 'bi-bar-chart',
    keywords: [
      'reporting', 'analytics', 'dashboard', 'briefing', 'metric',
      'report', 'kpi', 'export', 'summary', 'visualization',
    ],
    orderIndex: 5,
    narratives: {
      Foundational: [
        'Reporting infrastructure exists in skeleton form — surfaces are wired but downstream of inconsistent inputs.',
      ],
      Emerging: [
        'Reporting infrastructure is operational with limited downstream integration; the dashboards exist; trust is the gap.',
      ],
      Coordinated: [
        'Reporting pulls from intake, lead, and marketing reliably; gaps remain on the execution side.',
      ],
      Operational: [
        'Reporting has high confidence end-to-end — every domain is represented and the numbers reconcile.',
      ],
      Scaling: [
        'Reporting is expanding into derived analytics and cohort views; the platform now reads its own performance.',
      ],
      Stabilizing: [
        'Reporting is mature; ongoing work is presentation refinement, not data plumbing.',
      ],
    },
  },
  {
    key: 'student_lifecycle',
    label: 'Student Lifecycle',
    icon: 'bi-mortarboard',
    keywords: [
      'student', 'cohort', 'curriculum', 'lesson', 'assignment',
      'progress', 'mentor', 'session', 'coaching',
    ],
    orderIndex: 6,
    narratives: {
      Foundational: [
        'Student systems are early — the surface exists but cohort cadence has not yet taken hold.',
      ],
      Emerging: [
        'Student lifecycle has its first cohort moving through; the operational rhythm is still finding its shape.',
      ],
      Coordinated: [
        'Cohort movement is reliable across enrollment, progress, and coaching; gaps are at the lifecycle edges.',
      ],
      Operational: [
        'Student lifecycle runs end-to-end with mentor cadence holding; the loop closes without manual reconciliation.',
      ],
      Scaling: [
        'The student lifecycle is widening into more cohort types and richer mentor surfaces.',
      ],
      Stabilizing: [
        'Student lifecycle is at steady-state; current work is content and outcome polish.',
      ],
    },
  },
  {
    key: 'other',
    label: 'Other Operations',
    icon: 'bi-three-dots',
    keywords: [],
    orderIndex: 99,
    narratives: {
      Foundational: ['Additional processes that have not yet been categorized — they live outside the named domains for now.'],
      Emerging:    ['Additional processes outside the named domains — early to call them a domain of their own.'],
      Coordinated: ['Additional processes outside the named domains — coordinated, but not yet earning their own bucket.'],
      Operational: ['Additional processes outside the named domains — running, but unstructured.'],
      Scaling:     ['Additional processes outside the named domains — growing in number; may warrant a domain split.'],
      Stabilizing: ['Additional processes outside the named domains — stable but uncategorized.'],
    },
  },
];

export interface DomainBucket {
  key: DomainKey;
  label: string;
  icon: string;
  orderIndex: number;
  processes: BPLike[];
  totalRequirements: number;
  matchedRequirements: number;
  completionPercent: number;
  usableCount: number;
  /** Editorial maturity state for this domain. */
  lifecycleState: LifecycleState;
  /** Authored prose; never templated with raw %. */
  narrative: string;
  /** One-line relationship hint (or null if no meaningful relationship). */
  relationshipHint: string | null;
  /** Whether the domain feeds another visible domain. */
  feedsInto: DomainKey[];
}

const EMPTY_DOMAIN_KEYS = DOMAINS.map(d => d.key);
const DOMAIN_LABELS: Record<DomainKey, string> = Object.fromEntries(
  DOMAINS.map(d => [d.key, d.label] as const),
) as Record<DomainKey, string>;

/** Pick a lifecycle state from completion + usability density. */
export function lifecycleStateFor(processes: BPLike[], completionPercent: number): LifecycleState {
  const total = processes.length;
  if (total === 0) return 'Foundational';
  const usable = processes.filter(p => p.usability?.usable).length;
  const usableRatio = usable / total;
  // Combine completion + usability — both must lift to advance the state.
  // Heuristic, intentionally simple. Stable; ordered.
  if (completionPercent >= 90 && usableRatio >= 0.8) return 'Stabilizing';
  if (completionPercent >= 75 && usableRatio >= 0.6) return 'Scaling';
  if (completionPercent >= 55 && usableRatio >= 0.4) return 'Operational';
  if (completionPercent >= 30 || usableRatio >= 0.3) return 'Coordinated';
  if (completionPercent >= 5 || usableRatio > 0) return 'Emerging';
  return 'Foundational';
}

/** Stable index-pick of a narrative variant based on the bucket key. */
function pickNarrative(spec: DomainSpec, state: LifecycleState): string {
  const variants = spec.narratives[state];
  if (!variants || variants.length === 0) return '';
  // Deterministic — same domain always picks same variant across reloads.
  let hash = 0;
  for (const c of spec.key) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return variants[hash % variants.length];
}

function classifyName(name: string): DomainKey {
  const lower = name.toLowerCase();
  let best: { key: DomainKey; len: number } | null = null;
  for (const d of DOMAINS) {
    for (const kw of d.keywords) {
      if (lower.includes(kw) && (!best || kw.length > best.len)) {
        best = { key: d.key, len: kw.length };
      }
    }
  }
  return best?.key ?? 'other';
}

export function classifyBPs(processes: BPLike[]): DomainBucket[] {
  const visible = processes.filter(p => !/uncategorized/i.test(p.name || ''));

  const groups = new Map<DomainKey, BPLike[]>();
  for (const k of EMPTY_DOMAIN_KEYS) groups.set(k, []);
  for (const p of visible) {
    const key = classifyName(p.name || '');
    groups.get(key)!.push(p);
  }

  const buckets: DomainBucket[] = DOMAINS
    .map(spec => {
      const procs = groups.get(spec.key) || [];
      const totalRequirements = procs.reduce((s, p) => s + (p.total_requirements || 0), 0);
      const matchedRequirements = procs.reduce((s, p) => s + (p.matched_requirements || 0), 0);
      const completionPercent = totalRequirements > 0
        ? Math.round((matchedRequirements / totalRequirements) * 100)
        : 0;
      const usableCount = procs.filter(p => p.usability?.usable).length;
      const lifecycleState = lifecycleStateFor(procs, completionPercent);
      const narrative = procs.length === 0
        ? `No ${spec.label.toLowerCase()} processes are present in the current architecture.`
        : pickNarrative(spec, lifecycleState);
      return {
        key: spec.key,
        label: spec.label,
        icon: spec.icon,
        orderIndex: spec.orderIndex,
        processes: procs,
        totalRequirements,
        matchedRequirements,
        completionPercent,
        usableCount,
        lifecycleState,
        narrative,
        relationshipHint: null as string | null,
        feedsInto: spec.feedsInto || [],
      };
    })
    .filter(b => b.processes.length > 0)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // Decorate with relationship hints — only mention a downstream domain
  // that's actually present in the current architecture, so the hint
  // never references something the operator doesn't see.
  const presentKeys = new Set(buckets.map(b => b.key));
  for (const b of buckets) {
    const visibleDownstream = b.feedsInto.filter(k => presentKeys.has(k));
    if (visibleDownstream.length === 1) {
      b.relationshipHint = `Feeds ${DOMAIN_LABELS[visibleDownstream[0]]}`;
    } else if (visibleDownstream.length > 1) {
      const labels = visibleDownstream.map(k => DOMAIN_LABELS[k]);
      b.relationshipHint = `Feeds ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
    }
  }

  return buckets;
}

/** Canonical ordered flow labels — used by the operational flow strip. */
export function buildFlowStops(buckets: DomainBucket[]): { label: string; state: LifecycleState }[] {
  const ordered = DOMAINS
    .filter(d => d.key !== 'other')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const byKey = new Map(buckets.map(b => [b.key, b]));
  return ordered
    .map(spec => {
      const b = byKey.get(spec.key);
      return b ? { label: spec.label, state: b.lifecycleState } : null;
    })
    .filter((x): x is { label: string; state: LifecycleState } => x !== null);
}
