/**
 * bpDomainClassifier — groups Business Processes into operational
 * domains for the System surface's editorial redesign.
 *
 * System Surface Maturity Sprint, 2026-05-12.
 *
 * The old BPs tab showed ~45 flat cards in a 3-column grid — visually
 * indistinguishable, no hierarchy, "engineering inventory" energy. The
 * new surface groups them into 6 named operational domains with a
 * narrative one-liner each.
 *
 * Classification is keyword-based. Frontend only. Zero backend changes.
 * If a BP name doesn't match any domain pattern, it lands in "Other
 * Operations" — surfaced honestly, never silently hidden.
 *
 * To re-classify a BP, edit the keyword lists below. The matcher is
 * case-insensitive, longest-pattern-wins, and uses substring matching
 * (not regex) so it's safe for non-engineers to extend.
 */

export type DomainKey =
  | 'intake'
  | 'lead_intelligence'
  | 'marketing'
  | 'student_lifecycle'
  | 'execution'
  | 'reporting'
  | 'other';

export interface DomainSpec {
  key: DomainKey;
  label: string;
  /** Single-sentence operational meaning. Editorial tone, not engineering. */
  narrative: (count: number, completion: number) => string;
  icon: string;
  /** Substring keywords to match against BP name (case-insensitive). */
  keywords: string[];
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
    narrative: (count, c) => {
      if (c >= 80) return `Your intake systems are healthy — ${count} processes, ${c}% complete.`;
      if (c >= 40) return `Intake is partially operational — ${count} processes, ${c}% complete.`;
      return `Intake systems still need work — ${count} processes, ${c}% complete.`;
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
    narrative: (count, c) => {
      if (c >= 80) return `Lead intelligence is connected end-to-end — ${count} processes, ${c}% complete.`;
      if (c >= 40) return `Lead orchestration is partially connected — ${count} processes, ${c}% complete.`;
      return `Lead intelligence pipeline has structural gaps — ${count} processes, ${c}% complete.`;
    },
  },
  {
    key: 'marketing',
    label: 'Marketing Operations',
    icon: 'bi-megaphone',
    keywords: [
      'marketing', 'campaign', 'outreach', 'content', 'social',
      'email send', 'broadcast', 'engagement',
    ],
    narrative: (count, c) => {
      if (c >= 80) return `Marketing operations are running smoothly — ${count} processes, ${c}% complete.`;
      if (c >= 40) return `Marketing pieces are in place but uneven — ${count} processes, ${c}% complete.`;
      return `Marketing operations need foundational work — ${count} processes, ${c}% complete.`;
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
    narrative: (count, c) => {
      if (c >= 80) return `Student lifecycle is well-instrumented — ${count} processes, ${c}% complete.`;
      if (c >= 40) return `Student lifecycle is partially instrumented — ${count} processes, ${c}% complete.`;
      return `Student lifecycle systems are early-stage — ${count} processes, ${c}% complete.`;
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
    narrative: (count, c) => {
      if (c >= 80) return `Execution systems are active and verified — ${count} processes, ${c}% complete.`;
      if (c >= 40) return `Execution systems are active but under-verified — ${count} processes, ${c}% complete.`;
      return `Execution systems are still being scaffolded — ${count} processes, ${c}% complete.`;
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
    narrative: (count, c) => {
      if (c >= 80) return `Reporting systems have high confidence — ${count} processes, ${c}% complete.`;
      if (c >= 40) return `Reporting layer is taking shape — ${count} processes, ${c}% complete.`;
      return `Reporting layer is sparse — ${count} processes, ${c}% complete.`;
    },
  },
  {
    key: 'other',
    label: 'Other Operations',
    icon: 'bi-three-dots',
    keywords: [],
    narrative: (count, c) => `${count} additional processes haven't been categorized yet — ${c}% complete.`,
  },
];

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

export interface DomainBucket {
  spec: DomainSpec;
  processes: BPLike[];
  /** Sum of total_requirements across processes in this bucket. */
  totalRequirements: number;
  /** Sum of matched_requirements across processes in this bucket. */
  matchedRequirements: number;
  /** Rounded completion %. 0 when totalRequirements is 0. */
  completionPercent: number;
  /** How many BPs in this bucket are `usable`. */
  usableCount: number;
  /** Pre-built narrative line. */
  narrative: string;
}

const EMPTY_DOMAIN_KEYS = DOMAINS.map(d => d.key);

/** Find the best domain for a BP name by longest-keyword match. */
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
  // Filter out "Uncategorized" placeholder BPs — they pollute the surface
  // with engineering-internal terms. The matching requirement counts are
  // preserved via the per-bucket totals.
  const visible = processes.filter(p => !/uncategorized/i.test(p.name || ''));

  const groups = new Map<DomainKey, BPLike[]>();
  for (const k of EMPTY_DOMAIN_KEYS) groups.set(k, []);
  for (const p of visible) {
    const key = classifyName(p.name || '');
    groups.get(key)!.push(p);
  }

  return DOMAINS
    .map(spec => {
      const procs = groups.get(spec.key) || [];
      const totalRequirements = procs.reduce((s, p) => s + (p.total_requirements || 0), 0);
      const matchedRequirements = procs.reduce((s, p) => s + (p.matched_requirements || 0), 0);
      const completionPercent = totalRequirements > 0
        ? Math.round((matchedRequirements / totalRequirements) * 100)
        : 0;
      const usableCount = procs.filter(p => p.usability?.usable).length;
      const narrative = procs.length === 0
        ? `No ${spec.label.toLowerCase()} processes detected yet.`
        : spec.narrative(procs.length, completionPercent);
      return {
        spec,
        processes: procs,
        totalRequirements,
        matchedRequirements,
        completionPercent,
        usableCount,
        narrative,
      };
    })
    // Hide empty buckets — keeps the surface calm
    .filter(b => b.processes.length > 0);
}
