/**
 * workflowFrictionAnalyzer — heuristic detection of workflow friction from
 * the project's UI map + manifest history.
 *
 * V1 detectors (all pure):
 *   - excessive_actions   : a page declares >7 actions
 *   - duplicate_actions   : two pages declare the same action label
 *   - dead_end_workflow   : a page has no critical_workflows nor outbound nav
 *   - inconsistent_nav    : different categories use clashing navigation patterns
 *   - missing_feedback    : action without expected_outcome (when known)
 *
 * Phase 5 §6.
 */

export interface UIPageSummary {
  readonly route: string;
  readonly category?: string;
  readonly actions: ReadonlyArray<{ id?: string; label?: string; kind?: string; handler?: string }>;
  readonly critical_workflows?: ReadonlyArray<string>;
  readonly accessibility_warnings?: ReadonlyArray<string>;
  readonly ux_debt?: ReadonlyArray<string>;
}

export type FrictionKind =
  | 'excessive_actions'
  | 'duplicate_actions'
  | 'dead_end_workflow'
  | 'inconsistent_nav'
  | 'missing_feedback'
  | 'high_cognitive_load';

export interface FrictionFinding {
  readonly kind: FrictionKind;
  readonly severity: 'low' | 'medium' | 'high';
  readonly route: string;
  readonly description: string;
  readonly evidence: Record<string, unknown>;
}

export interface WorkflowFrictionReport {
  readonly findings: ReadonlyArray<FrictionFinding>;
  readonly friction_score: number;     // 0-100; higher = more friction
}

const ACTION_THRESHOLD = 7;
const COGNITIVE_LOAD_THRESHOLD = 12;

export function analyzeWorkflowFriction(pages: ReadonlyArray<UIPageSummary>): WorkflowFrictionReport {
  const findings: FrictionFinding[] = [];

  // Cross-page: collect duplicate action labels
  const labelCounts = new Map<string, string[]>();   // label -> routes
  for (const p of pages) {
    for (const a of p.actions || []) {
      const lbl = (a.label || a.id || '').trim().toLowerCase();
      if (!lbl) continue;
      const existing = labelCounts.get(lbl) || [];
      existing.push(p.route);
      labelCounts.set(lbl, existing);
    }
  }

  for (const p of pages) {
    const actions = p.actions || [];

    if (actions.length > COGNITIVE_LOAD_THRESHOLD) {
      findings.push({
        kind: 'high_cognitive_load',
        severity: 'high',
        route: p.route,
        description: `${p.route} declares ${actions.length} actions — likely cognitive overload.`,
        evidence: { action_count: actions.length, threshold: COGNITIVE_LOAD_THRESHOLD },
      });
    } else if (actions.length > ACTION_THRESHOLD) {
      findings.push({
        kind: 'excessive_actions',
        severity: 'medium',
        route: p.route,
        description: `${p.route} declares ${actions.length} actions — consider grouping or progressive disclosure.`,
        evidence: { action_count: actions.length, threshold: ACTION_THRESHOLD },
      });
    }

    if (actions.length === 0 && (!p.critical_workflows || p.critical_workflows.length === 0)) {
      findings.push({
        kind: 'dead_end_workflow',
        severity: 'low',
        route: p.route,
        description: `${p.route} declares no actions and no critical workflows — is this page used?`,
        evidence: {},
      });
    }

    for (const a of actions) {
      const lbl = (a.label || a.id || '').trim().toLowerCase();
      if (!lbl) continue;
      const dupRoutes = labelCounts.get(lbl) || [];
      if (dupRoutes.length > 1 && dupRoutes[0] === p.route) {
        // Only emit once per duplicate cluster (when we hit the first route)
        findings.push({
          kind: 'duplicate_actions',
          severity: 'low',
          route: p.route,
          description: `Action "${a.label || a.id}" appears on ${dupRoutes.length} pages — confirm it's intentionally duplicated.`,
          evidence: { label: a.label || a.id, routes: dupRoutes },
        });
      }
    }
  }

  // Inconsistent nav: more than 2 distinct categories visible in one page's actions
  for (const p of pages) {
    const handlerCategories = new Set<string>();
    for (const a of p.actions || []) {
      if (!a.handler) continue;
      // Heuristic: handler path prefix as category (e.g. /admin vs /portal)
      const m = /^\/(admin|portal|public|internal)/.exec(a.handler);
      if (m) handlerCategories.add(m[1]);
    }
    if (handlerCategories.size > 2) {
      findings.push({
        kind: 'inconsistent_nav',
        severity: 'medium',
        route: p.route,
        description: `${p.route} mixes ${handlerCategories.size} navigation contexts (${Array.from(handlerCategories).join(', ')}) — confirm intentional.`,
        evidence: { contexts: Array.from(handlerCategories) },
      });
    }
  }

  // Friction score: 6 per high, 3 per medium, 1 per low; cap at 100.
  const SEV: Record<string, number> = { high: 6, medium: 3, low: 1 };
  const raw = findings.reduce((s, f) => s + SEV[f.severity], 0);
  const friction_score = Math.min(100, raw);

  return {
    findings,
    friction_score,
  };
}
