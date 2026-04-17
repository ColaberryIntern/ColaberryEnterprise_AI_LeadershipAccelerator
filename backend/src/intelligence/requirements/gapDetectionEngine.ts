/**
 * Gap Detection Engine — Autonomous Requirement Expansion
 *
 * Analyzes enriched BPs to detect 4 categories of gaps:
 *   1. Behavior — missing user tracking, decision logging
 *   2. Intelligence — no AI agents, recommendations, pattern detection
 *   3. Optimization — no feedback loops, performance scoring
 *   4. Reporting — missing dashboards, visibility
 *
 * All detection is deterministic (no LLM calls). Uses signals already
 * computed by enrichCapability: quality scores, linked files, requirement
 * keywords. Max 3 gaps per type per BP.
 *
 * Only runs when effective mode = 'autonomous'.
 */

export interface DetectedGap {
  gap_id: string;
  gap_type: 'behavior' | 'intelligence' | 'optimization' | 'reporting';
  title: string;
  description: string;
  signals: string[];
  severity: number; // 0-10
  target: 'BP' | 'REPORTING';
  suggested_category: string;
}

interface EnrichedBP {
  id: string;
  name: string;
  quality?: Record<string, number>;
  metrics?: Record<string, number>;
  maturity?: { level: number };
  implementation_links?: {
    backend?: string[];
    frontend?: string[];
    agents?: string[];
    models?: string[];
  };
  linked_agents?: string[];
  total_requirements?: number;
  matched_requirements?: number;
  features?: Array<{ requirements?: Array<{ requirement_text?: string; status?: string }> }>;
}

function getReqTexts(bp: EnrichedBP): string[] {
  return (bp.features || []).flatMap(f =>
    (f.requirements || []).map(r => (r.requirement_text || '').toLowerCase())
  );
}

function hasReqMatching(bp: EnrichedBP, patterns: string[]): boolean {
  const texts = getReqTexts(bp);
  return texts.some(t => patterns.some(p => t.includes(p)));
}

function hasFileMatching(repoTree: string[], patterns: RegExp[]): boolean {
  return repoTree.some(f => patterns.some(p => p.test(f)));
}

// ---------------------------------------------------------------------------
// Behavior Gaps — missing user/system tracking
// ---------------------------------------------------------------------------

function detectBehaviorGaps(bp: EnrichedBP, repoTree: string[], existingAutoKeys: Set<string>): DetectedGap[] {
  const gaps: DetectedGap[] = [];
  const q = bp.quality || {};
  const signals: string[] = [];

  if ((q.observability || 0) === 0) signals.push('observability score = 0');
  if (!hasFileMatching(repoTree, [/track/i, /analytics/i, /telemetry/i, /event.*log/i]))
    signals.push('no tracking/analytics files in repo');
  if (!hasReqMatching(bp, ['tracking', 'analytics', 'telemetry', 'event log', 'audit trail', 'user action']))
    signals.push('no tracking requirements defined');

  if (signals.length >= 2) {
    const key = `AUTO-${slugify(bp.name)}-USER-EVENT-TRACKING`;
    if (!existingAutoKeys.has(key)) {
      gaps.push({
        gap_id: 'BEHAVIOR-USER-TRACKING',
        gap_type: 'behavior',
        title: 'User Interaction Tracking',
        description: `No user interaction tracking detected for "${bp.name}". System cannot learn from user behavior without event capture.`,
        signals,
        severity: 7,
        target: 'BP',
        suggested_category: 'frontend',
      });
    }
  }

  const decisionSignals: string[] = [];
  if (!hasReqMatching(bp, ['decision log', 'decision audit', 'decision track', 'action log']))
    decisionSignals.push('no decision logging requirements');
  if (!hasFileMatching(repoTree, [/decision.*log/i, /audit.*log/i, /action.*log/i]))
    decisionSignals.push('no decision logging files');

  if (decisionSignals.length >= 2) {
    const key = `AUTO-${slugify(bp.name)}-DECISION-AUDIT-LOG`;
    if (!existingAutoKeys.has(key)) {
      gaps.push({
        gap_id: 'BEHAVIOR-DECISION-LOGGING',
        gap_type: 'behavior',
        title: 'Decision Audit Logging',
        description: `No decision audit logging for "${bp.name}". Autonomous operations require traceable decision records.`,
        signals: decisionSignals,
        severity: 6,
        target: 'BP',
        suggested_category: 'backend',
      });
    }
  }

  return gaps.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Intelligence Gaps — missing AI/ML capabilities
// ---------------------------------------------------------------------------

function detectIntelligenceGaps(bp: EnrichedBP, repoTree: string[], existingAutoKeys: Set<string>): DetectedGap[] {
  const gaps: DetectedGap[] = [];
  const q = bp.quality || {};

  if ((q.automation || 0) === 0 && !(bp.linked_agents || []).length) {
    const key = `AUTO-${slugify(bp.name)}-SMART-RECOMMENDATIONS`;
    if (!existingAutoKeys.has(key)) {
      gaps.push({
        gap_id: 'INTELLIGENCE-RECOMMENDATIONS',
        gap_type: 'intelligence',
        title: 'Smart Recommendations',
        description: `No AI agent or recommendation system for "${bp.name}". Adding intelligence enables data-driven decisions.`,
        signals: ['automation score = 0', 'no linked agents'],
        severity: 8,
        target: 'BP',
        suggested_category: 'agent',
      });
    }
  }

  if (!hasReqMatching(bp, ['pattern', 'detect', 'anomaly', 'trend', 'predict'])) {
    const key = `AUTO-${slugify(bp.name)}-PATTERN-DETECTION`;
    if (!existingAutoKeys.has(key)) {
      gaps.push({
        gap_id: 'INTELLIGENCE-PATTERN-DETECTION',
        gap_type: 'intelligence',
        title: 'Pattern Detection',
        description: `No pattern detection or trend analysis for "${bp.name}". System cannot identify recurring issues or opportunities.`,
        signals: ['no pattern/anomaly/trend requirements'],
        severity: 7,
        target: 'BP',
        suggested_category: 'intelligence',
      });
    }
  }

  if (!hasReqMatching(bp, ['simulat', 'what-if', 'scenario', 'forecast'])) {
    const key = `AUTO-${slugify(bp.name)}-SIMULATION`;
    if (!existingAutoKeys.has(key)) {
      gaps.push({
        gap_id: 'INTELLIGENCE-SIMULATION',
        gap_type: 'intelligence',
        title: 'Simulation Capability',
        description: `No simulation or forecasting for "${bp.name}". Cannot predict outcomes before committing to actions.`,
        signals: ['no simulation/forecast requirements'],
        severity: 6,
        target: 'BP',
        suggested_category: 'intelligence',
      });
    }
  }

  return gaps.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Optimization Gaps — missing feedback, performance scoring
// ---------------------------------------------------------------------------

function detectOptimizationGaps(bp: EnrichedBP, repoTree: string[], existingAutoKeys: Set<string>): DetectedGap[] {
  const gaps: DetectedGap[] = [];
  const q = bp.quality || {};

  if ((q.production_readiness || 0) < 5 && !hasReqMatching(bp, ['feedback', 'loop', 'iterate', 'improve', 'optimize'])) {
    const key = `AUTO-${slugify(bp.name)}-FEEDBACK-LOOP`;
    if (!existingAutoKeys.has(key)) {
      gaps.push({
        gap_id: 'OPTIMIZATION-FEEDBACK-LOOP',
        gap_type: 'optimization',
        title: 'Feedback Loop',
        description: `No feedback loop for "${bp.name}". System cannot learn from outcomes without measuring and iterating.`,
        signals: [`production_readiness = ${q.production_readiness || 0}/10`, 'no feedback/optimization requirements'],
        severity: 6,
        target: 'BP',
        suggested_category: 'backend',
      });
    }
  }

  if (!hasReqMatching(bp, ['performance scor', 'benchmark', 'metric', 'kpi', 'sla'])) {
    const key = `AUTO-${slugify(bp.name)}-PERFORMANCE-SCORING`;
    if (!existingAutoKeys.has(key)) {
      gaps.push({
        gap_id: 'OPTIMIZATION-PERFORMANCE-SCORING',
        gap_type: 'optimization',
        title: 'Performance Scoring',
        description: `No performance scoring or KPI tracking for "${bp.name}". Cannot measure improvement without baselines.`,
        signals: ['no performance/benchmark/kpi requirements'],
        severity: 5,
        target: 'BP',
        suggested_category: 'backend',
      });
    }
  }

  return gaps.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Reporting Gaps — missing dashboards, visibility
// ---------------------------------------------------------------------------

function detectReportingGaps(bp: EnrichedBP, repoTree: string[], existingAutoKeys: Set<string>): DetectedGap[] {
  const gaps: DetectedGap[] = [];
  const q = bp.quality || {};

  if ((q.ux_exposure || 0) < 3 && !hasReqMatching(bp, ['dashboard', 'report', 'visualiz', 'chart', 'graph'])) {
    const key = `AUTO-${slugify(bp.name)}-HEALTH-DASHBOARD`;
    if (!existingAutoKeys.has(key)) {
      gaps.push({
        gap_id: 'REPORTING-DASHBOARD',
        gap_type: 'reporting',
        title: 'Process Health Dashboard',
        description: `No dashboard or reporting UI for "${bp.name}". Stakeholders have no visibility into process performance.`,
        signals: [`ux_exposure = ${q.ux_exposure || 0}/10`, 'no dashboard/reporting requirements'],
        severity: 5,
        target: 'REPORTING',
        suggested_category: 'frontend',
      });
    }
  }

  if (!hasReqMatching(bp, ['agent performance', 'agent monitor', 'agent health', 'agent metric'])) {
    const key = `AUTO-${slugify(bp.name)}-AGENT-VISIBILITY`;
    if (!existingAutoKeys.has(key)) {
      gaps.push({
        gap_id: 'REPORTING-AGENT-VISIBILITY',
        gap_type: 'reporting',
        title: 'Agent Performance Visibility',
        description: `No agent performance monitoring for "${bp.name}". Cannot assess AI effectiveness without visibility.`,
        signals: ['no agent performance/monitoring requirements'],
        severity: 4,
        target: 'REPORTING',
        suggested_category: 'frontend',
      });
    }
  }

  return gaps.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function detectGaps(
  enrichedBP: EnrichedBP,
  repoFileTree: string[],
  existingAutoKeys: Set<string>,
): DetectedGap[] {
  return [
    ...detectBehaviorGaps(enrichedBP, repoFileTree, existingAutoKeys),
    ...detectIntelligenceGaps(enrichedBP, repoFileTree, existingAutoKeys),
    ...detectOptimizationGaps(enrichedBP, repoFileTree, existingAutoKeys),
    ...detectReportingGaps(enrichedBP, repoFileTree, existingAutoKeys),
  ];
}

function slugify(name: string): string {
  return (name || 'bp')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
}
