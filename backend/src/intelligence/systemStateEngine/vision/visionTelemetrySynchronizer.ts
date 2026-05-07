/**
 * visionTelemetrySynchronizer — load DOM snapshots + behavioral events for
 * a project, run the analyzers, and emit aggregated outputs the engine can
 * consume.
 *
 * The engine's `loadVisualInputs` (Phase 5) already returns UX debt + visual
 * tasks. This Phase 6 helper adds: visual contradictions, the worst-route
 * cognition score, and the project-wide friction pressure.
 */
import type { ContradictionFlag } from '../types/systemState.types';
import { runVisionAnalysis, type VisionAnalysisReport } from './visionAnalysisEngine';
import { detectVisualContradictions } from './visualContradictionDetector';
import { detectUXRegression, type RegressionReport } from './uxRegressionDetector';
import { analyzeBehavioralSignals, type BehavioralAggregateReport } from '../behavioral/behavioralSignalAnalyzer';
import { analyzeUserFlow, type UserFlowReport } from '../behavioral/userFlowIntelligence';

export interface VisionTelemetryBundle {
  readonly contradictions: ReadonlyArray<ContradictionFlag>;
  readonly worst_route: string | null;
  readonly worst_cognition_score: number;
  readonly behavioral: BehavioralAggregateReport;
  readonly user_flow: UserFlowReport;
  readonly regressions: ReadonlyArray<{ route: string; report: RegressionReport }>;
  readonly snapshot_count: number;
  readonly behavioral_event_count: number;
}

const EMPTY: VisionTelemetryBundle = {
  contradictions: [],
  worst_route: null,
  worst_cognition_score: 100,
  behavioral: { per_route: [], worst_route: null, project_friction_pressure: 0 },
  user_flow: { edges: [], drop_off_points: [], loop_routes: [], completion_rate: 1, friction_zones: [] },
  regressions: [],
  snapshot_count: 0,
  behavioral_event_count: 0,
};

export async function loadVisionTelemetry(projectId: string): Promise<VisionTelemetryBundle> {
  let snapshots: any[] = [];
  let events: any[] = [];
  try {
    const [{ default: DOMSnapshot }, { default: BehavioralEvent }] = await Promise.all([
      import('../../../models/DOMSnapshot'),
      import('../../../models/BehavioralEvent'),
    ]);
    [snapshots, events] = await Promise.all([
      DOMSnapshot.findAll({
        where: { project_id: projectId },
        order: [['captured_at', 'DESC']],
        limit: 100,
      }),
      BehavioralEvent.findAll({
        where: { project_id: projectId },
        order: [['observed_at', 'DESC']],
        limit: 5000,
      }),
    ]);
  } catch (err: any) {
    // Tables may not yet exist.
    console.warn('[visionTelemetrySynchronizer] degraded:', err?.message);
    return EMPTY;
  }

  // Group snapshots by route, run analysis on the most recent per route
  const latestByRoute = new Map<string, any>();
  const allByRoute = new Map<string, any[]>();
  for (const s of snapshots) {
    const r = s as any;
    if (!latestByRoute.has(r.route)) latestByRoute.set(r.route, r);
    const arr = allByRoute.get(r.route) || [];
    arr.push(r);
    allByRoute.set(r.route, arr);
  }

  // Behavioral analysis
  const eventsForAnalyzer = events.map((e: any) => ({
    route: e.route, kind: e.kind, session_id: e.session_id,
    observed_at: e.observed_at, target_selector: e.target_selector, duration_ms: e.duration_ms,
  }));
  const behavioral = analyzeBehavioralSignals(eventsForAnalyzer);
  const user_flow = analyzeUserFlow(eventsForAnalyzer);

  // Per-route vision + contradictions
  const all_known_routes = Array.from(latestByRoute.keys());
  const contradictions: ContradictionFlag[] = [];
  let worst_route: string | null = null;
  let worst_cognition_score = 100;
  const regressions: Array<{ route: string; report: RegressionReport }> = [];

  for (const [route, snap] of latestByRoute) {
    const cached = (snap as any).cached_vision_report as VisionAnalysisReport | null;
    const report = cached ?? runVisionAnalysis({ dom: (snap as any).dom_tree, viewport: (snap as any).viewport_width ? { width: (snap as any).viewport_width, height: (snap as any).viewport_height } : undefined });

    const routeBehavioral = behavioral.per_route.find(r => r.route === route);
    const flags = detectVisualContradictions({
      project_id: projectId,
      bp_id: (snap as any).bp_id ?? null,
      route,
      vision: report,
      behavioral: routeBehavioral
        ? {
            rage_clicks: routeBehavioral.rage_clicks,
            nav_loops: routeBehavioral.nav_loops,
            form_retries: routeBehavioral.form_retries,
            abandonment_rate: routeBehavioral.abandonment_rate,
          }
        : undefined,
      all_known_routes,
    });
    contradictions.push(...flags);

    if (report.cognition_score < worst_cognition_score) {
      worst_cognition_score = report.cognition_score;
      worst_route = route;
    }

    // Regression: compare latest vs second-latest (when 2+ snapshots exist)
    const all = allByRoute.get(route) || [];
    if (all.length >= 2) {
      const prev = all[1];
      const prevReport = (prev as any).cached_vision_report
        ?? runVisionAnalysis({ dom: (prev as any).dom_tree, viewport: (prev as any).viewport_width ? { width: (prev as any).viewport_width, height: (prev as any).viewport_height } : undefined });
      const reg = detectUXRegression(prevReport, report);
      if (reg.is_regression) {
        regressions.push({ route, report: reg });
        // Promote to a contradiction so the engine surfaces it.
        const worst = reg.findings.reduce((acc, f) => f.delta < acc.delta ? f : acc, reg.findings[0]);
        contradictions.push({
          kind: 'ux_regression',
          severity: worst.severity === 'high' ? 'warning' : 'info',
          message: `${route}: ${worst.description}`,
          project_id: projectId,
          capability_id: (snap as any).bp_id ?? undefined,
          evidence: { route, finding: worst },
        });
      }
    }
  }

  return {
    contradictions,
    worst_route,
    worst_cognition_score,
    behavioral,
    user_flow,
    regressions,
    snapshot_count: snapshots.length,
    behavioral_event_count: events.length,
  };
}
