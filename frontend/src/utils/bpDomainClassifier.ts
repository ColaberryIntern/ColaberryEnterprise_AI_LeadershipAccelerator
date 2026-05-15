/**
 * bpDomainClassifier — groups Business Processes into operational
 * domains for the System surface's editorial architecture view.
 *
 * Operational Causality Sprint, 2026-05-12 — added bidirectional
 * relationships (feeds / receives from / supports), operational-pressure
 * narratives, entry/exit roles, and downstream-effect counts. This is
 * editorial relationship UX, NOT a graph engine.
 *
 * Frontend only. Zero backend changes. The matcher is case-insensitive,
 * longest-pattern-wins, substring-based.
 *
 * Each bucket carries:
 *   - lifecycleState: editorial state ("Foundational" → "Stabilizing")
 *   - narrative: authored prose chosen by lifecycleState (no templated %)
 *   - entryRole: where this domain sits in the operational journey
 *   - relationships: structured, clickable {verb, targetKey, targetLabel}
 *   - downstreamCount: how many domains depend on this one
 *   - pressureNote: operational-pressure sentence (or null)
 *   - orderIndex: position in the canonical operational flow
 */

export type DomainKey =
  | 'intake'
  | 'lead_intelligence'
  | 'marketing'
  | 'execution'
  | 'reporting'
  | 'ai_intelligence'
  | 'project_admin'
  | 'public_pages'
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

/** Ordered for pressure math — higher index = more mature. */
const STATE_INDEX: Record<LifecycleState, number> = {
  Foundational: 0, Emerging: 1, Coordinated: 2,
  Operational: 3, Scaling: 4, Stabilizing: 5,
};

/** Public maturity index lookup — 0 (Foundational) … 5 (Stabilizing). */
export function lifecycleMaturityIndex(state: LifecycleState): number {
  return STATE_INDEX[state];
}

/** Maximum maturity index (Stabilizing). Useful for computing headroom. */
export const MAX_MATURITY_INDEX = 5;

/** Relationship verbs — used sparingly, editorial, not a matrix. */
export type RelationshipVerb =
  | 'feeds'           // A → B (downstream flow)
  | 'receives from'   // B ← A (upstream flow)
  | 'supports'        // A assists B cross-cut
  | 'supported by';   // B is assisted by A

export interface DomainRelationship {
  verb: RelationshipVerb;
  targetKey: DomainKey;
  targetLabel: string;
}

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
  /** Position in the canonical operational flow. */
  orderIndex: number;
  /** Outgoing flow edges: this domain feeds these. */
  feedsInto?: DomainKey[];
  /** Outgoing cross-cut edges: this domain supports these. */
  supports?: DomainKey[];
  /**
   * One sentence on where this domain sits in the operational journey —
   * entry / transform / distribute / consolidate / govern language.
   */
  entryRole: string;
  /**
   * Editorial narratives per lifecycle state. No "X% complete" templating.
   * Deterministic hash-based variant pick — stable across reloads.
   */
  narratives: Record<LifecycleState, string[]>;
}

const DOMAINS: DomainSpec[] = [
  {
    key: 'ai_intelligence',
    label: 'AI & Intelligence',
    icon: 'bi-cpu-fill',
    keywords: [
      'prompt', 'discovery', 'requirement', 'artifact', 'narrative',
      'planner', 'decision', 'validation', 'parser', 'composer',
      'inference', 'generation', 'classifier', 'extraction',
    ],
    orderIndex: 1,
    supports: ['lead_intelligence', 'execution'],
    entryRole: 'This domain reasons over the whole system — discovery, prompts, requirements, decisions. It informs everything downstream.',
    narratives: {
      Foundational: ['The intelligence engine has its first scaffolding; reasoning surfaces are not yet integrated.'],
      Emerging:     ['The intelligence engine is producing prompts and artifacts; outputs are useful but still need review.'],
      Coordinated:  ['Discovery, prompts, and artifact generation work in sequence; validation closes most loops.'],
      Operational:  ['The intelligence engine runs reliably as the brain of the platform — every domain consumes its output.'],
      Scaling:      ['The intelligence engine is widening its reasoning surface — more decision types, more validation depth.'],
      Stabilizing:  ['The intelligence engine is mature; ongoing work is precision and reliability rather than new capability.'],
    },
  },
  {
    key: 'intake',
    label: 'Intake & Registration',
    icon: 'bi-door-open',
    keywords: [
      'registration', 'intake', 'signup', 'sign-up', 'enrollment',
      'onboarding', 'application', 'dataset', 'capture',
    ],
    orderIndex: 2,
    feedsInto: ['lead_intelligence'],
    entryRole: 'This is where new operational activity enters the platform.',
    narratives: {
      Foundational: ['The doorway into the system is still being built — intake exists but little flows through it yet.'],
      Emerging: ['Intake is beginning to receive structured signals; the first end-to-end path is taking shape.'],
      Coordinated: ['Intake reliably accepts new records and hands them to the lead layer; gaps remain in edge-case validation.'],
      Operational: ['Intake is running cleanly across every channel — work enters the system without manual translation.'],
      Scaling: ['Intake handles a broadening surface of channels and source types; new sources cost less to onboard.'],
      Stabilizing: ['Intake is mature; ongoing changes are refinements rather than additions.'],
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
    orderIndex: 3,
    feedsInto: ['marketing', 'execution'],
    supports: ['reporting'],
    entryRole: 'This domain transforms incoming records into qualification and routing decisions.',
    narratives: {
      Foundational: ['Lead handling is still componentized — ingestion, classification, and routing exist but do not yet talk to each other.'],
      Emerging: ['Lead systems are beginning to coordinate across intake and routing; scoring is consistent within a single pass.'],
      Coordinated: ['Leads move from intake to qualification to routing without manual intervention; enrichment is the current frontier.'],
      Operational: ['Lead intelligence runs the qualification → routing path reliably and feeds marketing + execution with consistent records.'],
      Scaling: ['Lead intelligence is expanding into attribution and segmented scoring; downstream surfaces consume the same signal.'],
      Stabilizing: ['Lead intelligence is mature; changes now focus on accuracy and model drift rather than coverage.'],
    },
  },
  {
    key: 'marketing',
    label: 'Marketing Operations',
    icon: 'bi-megaphone',
    keywords: [
      'marketing', 'campaign', 'outreach', 'content', 'social',
      'broadcast', 'engagement', 'visitor', 'attribution', 'journey',
    ],
    orderIndex: 4,
    feedsInto: ['execution'],
    supports: ['reporting'],
    entryRole: 'This domain turns intelligence into outbound activity and engagement.',
    narratives: {
      Foundational: ['Marketing exists as individual surfaces — dashboards, campaign skeletons — but no orchestrated cadence yet.'],
      Emerging: ['Marketing operations exist but are still fragmented; the same content moves through more than one disconnected path.'],
      Coordinated: ['Marketing handoffs connect to lead intelligence and to execution; cadence runs but observability is uneven.'],
      Operational: ['Marketing operations run on schedule with lead intelligence in the loop; performance feeds back into prioritization.'],
      Scaling: ['Marketing surfaces are expanding across channels with shared instrumentation; reporting picks up new sources cleanly.'],
      Stabilizing: ['Marketing is operating at steady-state; ongoing work is content cadence rather than platform expansion.'],
    },
  },
  {
    key: 'execution',
    label: 'Execution Systems',
    icon: 'bi-cpu',
    keywords: [
      'execution', 'build', 'pipeline', 'estimator', 'orchestrat',
      'workflow', 'task', 'job', 'verify', 'verification',
      'agent', 'autonomous', 'behavior', 'alert',
    ],
    orderIndex: 5,
    supports: ['reporting'],
    entryRole: 'This domain acts on the decisions the rest of the system produces.',
    narratives: {
      Foundational: ['Execution is being scaffolded — pipelines exist on paper but the through-line is incomplete.'],
      Emerging: ['Execution can take a downstream signal and act on it for the simple cases; verification is still operator-driven.'],
      Coordinated: ['Execution systems are active but under-verified — work runs to completion, but the audit trail trails the work.'],
      Operational: ['Execution runs reliably across the documented paths; verification confirms outcomes without manual replay.'],
      Scaling: ['Execution is widening the set of work it can handle autonomously while staying inside the verification envelope.'],
      Stabilizing: ['Execution is mature; current focus is on resilience and edge-case verification, not new capability.'],
    },
  },
  {
    key: 'reporting',
    label: 'Reporting & Analytics',
    icon: 'bi-bar-chart',
    keywords: [
      'reporting', 'analytics', 'dashboard', 'briefing', 'metric',
      'report', 'kpi', 'export', 'summary', 'visualization',
      'revenue', 'cost', 'optimization', 'ledger', 'event',
    ],
    orderIndex: 6,
    entryRole: 'This domain consolidates operational visibility from every other area.',
    narratives: {
      Foundational: ['Reporting infrastructure exists in skeleton form — surfaces are wired but downstream of inconsistent inputs.'],
      Emerging: ['Reporting infrastructure is operational with limited downstream integration; the dashboards exist; trust is the gap.'],
      Coordinated: ['Reporting pulls from intake, lead, and marketing reliably; gaps remain on the execution side.'],
      Operational: ['Reporting has high confidence end-to-end — every domain is represented and the numbers reconcile.'],
      Scaling: ['Reporting is expanding into derived analytics and cohort views; the platform now reads its own performance.'],
      Stabilizing: ['Reporting is mature; ongoing work is presentation refinement, not data plumbing.'],
    },
  },
  {
    key: 'project_admin',
    label: 'Project & Admin',
    icon: 'bi-gear',
    keywords: [
      'project setup', 'project scope', 'project artifact', 'project progress',
      'admin', 'authentication', 'auth', 'automation', 'route management',
      'configuration', 'settings', 'ticket', 'strategy', 'implementation',
    ],
    orderIndex: 7,
    supports: ['execution'],
    entryRole: 'This domain governs project lifecycle and operator controls.',
    narratives: {
      Foundational: ['Project and admin scaffolding is in place but most controls are still manual.'],
      Emerging:     ['Project setup and admin paths are forming; basic operator control is available.'],
      Coordinated:  ['Project and admin systems run reliably for the common cases; edge controls remain operator-driven.'],
      Operational:  ['Project lifecycle and admin tooling cover the documented surfaces; operators rarely fall back to manual.'],
      Scaling:      ['Project + admin layer is widening into more configuration types and finer permissions.'],
      Stabilizing:  ['Project + admin is mature; ongoing work is polish and accessibility.'],
    },
  },
  {
    key: 'public_pages',
    label: 'Public Pages & Surfaces',
    icon: 'bi-globe',
    keywords: [
      'landing page', 'designer page', 'partner page', 'champion page',
      'public page', 'home page', 'pricing page', 'about page',
      'advisory page', 'case studies', 'studies page', 'features page',
    ],
    orderIndex: 8,
    feedsInto: ['intake'],
    supports: ['marketing'],
    entryRole: 'This domain is the platform’s outward face — the surfaces the audience actually sees, and where the operational journey begins.',
    narratives: {
      Foundational: ['Public-facing pages exist but are still being filled in with content and structure.'],
      Emerging:     ['Public pages are present; some still need content polish or accessibility passes.'],
      Coordinated:  ['Public pages cover the documented audience set; SEO and analytics are taking hold.'],
      Operational:  ['Public pages are live across the audience set with content + analytics in the loop.'],
      Scaling:      ['Public surface is widening into more audience-specific pages; content cadence is established.'],
      Stabilizing:  ['Public pages are mature; ongoing work is content and visual refinement.'],
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
    orderIndex: 9,
    entryRole: 'This domain runs the cohort journey end to end — orthogonal to the build loop.',
    narratives: {
      Foundational: ['Student systems are early — the surface exists but cohort cadence has not yet taken hold.'],
      Emerging: ['Student lifecycle has its first cohort moving through; the operational rhythm is still finding its shape.'],
      Coordinated: ['Cohort movement is reliable across enrollment, progress, and coaching; gaps are at the lifecycle edges.'],
      Operational: ['Student lifecycle runs end-to-end with mentor cadence holding; the loop closes without manual reconciliation.'],
      Scaling: ['The student lifecycle is widening into more cohort types and richer mentor surfaces.'],
      Stabilizing: ['Student lifecycle is at steady-state; current work is content and outcome polish.'],
    },
  },
  {
    key: 'other',
    label: 'Other Operations',
    icon: 'bi-three-dots',
    keywords: [],
    orderIndex: 99,
    entryRole: 'Uncategorized operational activity that hasn’t found its domain yet.',
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
  /** Where this domain sits in the operational journey. */
  entryRole: string;
  /** Downstream flow targets (this domain feeds these), present-only. */
  feedsInto: DomainKey[];
  /** Upstream flow sources (these feed this domain), present-only. */
  receivesFrom: DomainKey[];
  /** Cross-cut targets this domain supports, present-only. */
  supports: DomainKey[];
  /** Structured, clickable relationships — feeds / receives from / supports / supported by. */
  relationships: DomainRelationship[];
  /** How many downstream domains depend on this one (feeds + supports). */
  downstreamCount: number;
  /** Operational-pressure sentence — e.g. "Constrained by early-stage Intake." Null when none. */
  pressureNote: string | null;
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
  if (completionPercent >= 90 && usableRatio >= 0.8) return 'Stabilizing';
  if (completionPercent >= 75 && usableRatio >= 0.6) return 'Scaling';
  if (completionPercent >= 55 && usableRatio >= 0.4) return 'Operational';
  if (completionPercent >= 30 || usableRatio >= 0.3) return 'Coordinated';
  if (completionPercent >= 5 || usableRatio > 0) return 'Emerging';
  return 'Foundational';
}

function pickNarrative(spec: DomainSpec, state: LifecycleState): string {
  const variants = spec.narratives[state];
  if (!variants || variants.length === 0) return '';
  let hash = 0;
  for (const c of spec.key) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return variants[hash % variants.length];
}

function classifyBP(bp: BPLike): DomainKey {
  const lower = (bp.name || '').toLowerCase();
  let best: { key: DomainKey; len: number } | null = null;
  for (const d of DOMAINS) {
    for (const kw of d.keywords) {
      if (lower.includes(kw) && (!best || kw.length > best.len)) {
        best = { key: d.key, len: kw.length };
      }
    }
  }
  if (!best && (bp.is_page_bp || bp.source === 'frontend_page')) {
    return 'public_pages';
  }
  return best?.key ?? 'other';
}

export function classifyBPs(processes: BPLike[]): DomainBucket[] {
  const visible = processes.filter(p => !/uncategorized/i.test(p.name || ''));

  const groups = new Map<DomainKey, BPLike[]>();
  for (const k of EMPTY_DOMAIN_KEYS) groups.set(k, []);
  for (const p of visible) {
    groups.get(classifyBP(p))!.push(p);
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
        entryRole: spec.entryRole,
        feedsInto: (spec.feedsInto || []),
        receivesFrom: [] as DomainKey[],
        supports: (spec.supports || []),
        relationships: [] as DomainRelationship[],
        downstreamCount: 0,
        pressureNote: null as string | null,
      };
    })
    .filter(b => b.processes.length > 0)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const presentKeys = new Set(buckets.map(b => b.key));
  const byKey = new Map(buckets.map(b => [b.key, b]));

  // ── Prune relationship edges to present-only domains ──
  for (const b of buckets) {
    b.feedsInto = b.feedsInto.filter(k => presentKeys.has(k));
    b.supports = b.supports.filter(k => presentKeys.has(k));
  }

  // ── Compute inverse edges: receivesFrom = who feeds me ──
  for (const b of buckets) {
    for (const target of b.feedsInto) {
      const t = byKey.get(target);
      if (t) t.receivesFrom.push(b.key);
    }
  }

  // ── Build structured, clickable relationship list per domain ──
  for (const b of buckets) {
    const rels: DomainRelationship[] = [];
    for (const k of b.receivesFrom) rels.push({ verb: 'receives from', targetKey: k, targetLabel: DOMAIN_LABELS[k] });
    for (const k of b.feedsInto)    rels.push({ verb: 'feeds', targetKey: k, targetLabel: DOMAIN_LABELS[k] });
    for (const k of b.supports)     rels.push({ verb: 'supports', targetKey: k, targetLabel: DOMAIN_LABELS[k] });
    // "supported by" — who supports me
    for (const other of buckets) {
      if (other.supports.includes(b.key)) {
        rels.push({ verb: 'supported by', targetKey: other.key, targetLabel: DOMAIN_LABELS[other.key] });
      }
    }
    b.relationships = rels;
    b.downstreamCount = b.feedsInto.length + b.supports.length;
  }

  // ── Operational-pressure narrative ──
  // A domain is "constrained" when an upstream it depends on is weaker
  // than it is — the operator should understand the bottleneck moves
  // downstream. Editorial language, no red alerts.
  for (const b of buckets) {
    const upstreamKeys = [
      ...b.receivesFrom,
      ...buckets.filter(o => o.supports.includes(b.key)).map(o => o.key),
    ];
    let weakest: DomainBucket | null = null;
    for (const k of upstreamKeys) {
      const u = byKey.get(k);
      if (!u) continue;
      if (STATE_INDEX[u.lifecycleState] <= 1) { // Foundational or Emerging
        if (!weakest || STATE_INDEX[u.lifecycleState] < STATE_INDEX[weakest.lifecycleState]) {
          weakest = u;
        }
      }
    }
    if (weakest) {
      b.pressureNote = `Constrained by early-stage ${weakest.label} upstream — strengthening that area unblocks this one.`;
    } else if (b.downstreamCount > 0 && STATE_INDEX[b.lifecycleState] <= 1) {
      // This domain is weak AND others depend on it → it's the bottleneck.
      b.pressureNote = `Early-stage maturity here creates downstream friction for the ${b.downstreamCount} area${b.downstreamCount === 1 ? '' : 's'} that depend on it.`;
    }
  }

  return buckets;
}

/**
 * Static domain identity — the canonical-flow facts about a domain that
 * hold regardless of which BPs are present. Lets surfaces that don't load
 * the BP list (e.g. Cory Home) still say "your work in X flows into Y"
 * without a classifier round-trip.
 */
export interface DomainProfile {
  key: DomainKey;
  label: string;
  icon: string;
  entryRole: string;
  orderIndex: number;
  /** Full canonical relationships — receives from / feeds / supports / supported by. Unpruned. */
  relationships: DomainRelationship[];
  /** Labels of domains this one feeds or supports — "your work flows into …". */
  downstreamLabels: string[];
  /** How many downstream domains this one feeds or supports. Static — derived from the canonical graph. */
  downstreamCount: number;
}

const DOMAIN_SPEC_BY_KEY = new Map(DOMAINS.map(d => [d.key, d] as const));

/**
 * Resolve the static profile for a domain key. Returns null for unknown
 * keys (e.g. memory written by an older build). Pure — no BP data needed.
 */
export function getDomainProfile(key: string): DomainProfile | null {
  const spec = DOMAIN_SPEC_BY_KEY.get(key as DomainKey);
  if (!spec) return null;

  const feedsInto = spec.feedsInto || [];
  const supports = spec.supports || [];
  const receivesFrom = DOMAINS.filter(d => (d.feedsInto || []).includes(spec.key)).map(d => d.key);
  const supportedBy = DOMAINS.filter(d => (d.supports || []).includes(spec.key)).map(d => d.key);

  const relationships: DomainRelationship[] = [
    ...receivesFrom.map(k => ({ verb: 'receives from' as RelationshipVerb, targetKey: k, targetLabel: DOMAIN_LABELS[k] })),
    ...feedsInto.map(k => ({ verb: 'feeds' as RelationshipVerb, targetKey: k, targetLabel: DOMAIN_LABELS[k] })),
    ...supports.map(k => ({ verb: 'supports' as RelationshipVerb, targetKey: k, targetLabel: DOMAIN_LABELS[k] })),
    ...supportedBy.map(k => ({ verb: 'supported by' as RelationshipVerb, targetKey: k, targetLabel: DOMAIN_LABELS[k] })),
  ];

  const downstreamLabels = [...feedsInto, ...supports].map(k => DOMAIN_LABELS[k]);
  return {
    key: spec.key,
    label: spec.label,
    icon: spec.icon,
    entryRole: spec.entryRole,
    orderIndex: spec.orderIndex,
    relationships,
    downstreamLabels,
    downstreamCount: downstreamLabels.length,
  };
}

/** Canonical ordered flow stops — used by the operational flow strip. */
export function buildFlowStops(
  buckets: DomainBucket[],
): { key: DomainKey; label: string; state: LifecycleState; bpCount: number }[] {
  const ordered = DOMAINS
    .filter(d => d.key !== 'other')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const byKey = new Map(buckets.map(b => [b.key, b]));
  return ordered
    .map(spec => {
      const b = byKey.get(spec.key);
      return b
        ? { key: spec.key, label: spec.label, state: b.lifecycleState, bpCount: b.processes.length }
        : null;
    })
    .filter((x): x is { key: DomainKey; label: string; state: LifecycleState; bpCount: number } => x !== null);
}
