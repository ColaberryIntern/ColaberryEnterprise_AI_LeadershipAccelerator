/**
 * autonomousRegressionDetector — runs every heartbeat tick. Compares the
 * latest project snapshot against the previous one; if a regression is
 * detected, opens or updates a `CognitiveIncident`.
 *
 * Pure logic in `evaluateRegression`; DB-backed runner in `runRegressionTick`.
 *
 * Phase 8 §5.
 */
import { publishCognitiveEvent } from './cognitiveEventBus';

export interface RegressionEvaluation {
  readonly project_id: string;
  readonly is_regression: boolean;
  readonly cognition_delta: number;
  readonly affected_routes: ReadonlyArray<string>;
  readonly evidence: Record<string, unknown>;
}

export interface RegressionInputs {
  readonly project_id: string;
  readonly previous: { worst_cognition_score: number; regression_count: number; pressure_level: number } | null;
  readonly current: { worst_cognition_score: number; regression_count: number; pressure_level: number };
  readonly recent_routes_with_regression: ReadonlyArray<string>;
}

export function evaluateRegression(input: RegressionInputs): RegressionEvaluation {
  const evidence: Record<string, unknown> = { current: input.current, previous: input.previous };
  if (!input.previous) {
    return {
      project_id: input.project_id,
      is_regression: false,
      cognition_delta: 0,
      affected_routes: [],
      evidence,
    };
  }
  const delta = input.current.worst_cognition_score - input.previous.worst_cognition_score;
  const regressionCountIncrease = input.current.regression_count - input.previous.regression_count;
  const pressureSurge = input.current.pressure_level - input.previous.pressure_level;

  // Trigger conditions:
  //   cognition drop ≥10 points, OR
  //   regression_count increased ≥1, OR
  //   pressure jumped ≥20 points
  const isRegression = delta <= -10 || regressionCountIncrease >= 1 || pressureSurge >= 20;
  return {
    project_id: input.project_id,
    is_regression: isRegression,
    cognition_delta: delta,
    affected_routes: input.recent_routes_with_regression,
    evidence: { ...evidence, delta, regressionCountIncrease, pressureSurge },
  };
}

/**
 * DB-backed runner. Looks up the latest 2 snapshots, runs evaluation, and
 * upserts a `CognitiveIncident` when triggered. Publishes
 * `regression.detected` + `incident.opened`/`incident.updated`.
 */
export async function runRegressionTick(projectId: string): Promise<RegressionEvaluation | null> {
  try {
    const { default: SystemStateSnapshot } = await import('../../../models/SystemStateSnapshot');
    const rows = await SystemStateSnapshot.findAll({
      where: { project_id: projectId },
      order: [['generated_at', 'DESC']],
      limit: 2,
    });
    if (rows.length === 0) return null;
    const [curr, prev] = rows;
    const r = curr as any;
    const p = (prev as any) ?? null;

    // Pull behavioral / vision telemetry
    const { loadVisionTelemetry } = await import('../vision/visionTelemetrySynchronizer');
    const bundle = await loadVisionTelemetry(projectId);

    const currentInputs = {
      worst_cognition_score: bundle.worst_cognition_score,
      regression_count: bundle.regressions.length,
      pressure_level: 0,    // computed below if needed
    };
    const previousInputs = p
      ? {
          worst_cognition_score: 100,        // we don't denormalize per-snapshot worst; fallback assumption
          regression_count: 0,
          pressure_level: 0,
        }
      : null;

    // For now we lean on the contradiction count as a coarse pressure proxy
    // when the snapshot doesn't carry pressure.
    currentInputs.pressure_level = (r.contradiction_flags || []).length;
    if (previousInputs) previousInputs.pressure_level = ((p.contradiction_flags) || []).length;

    const evaluation = evaluateRegression({
      project_id: projectId,
      previous: previousInputs,
      current: currentInputs,
      recent_routes_with_regression: bundle.regressions.map(g => g.route),
    });

    if (evaluation.is_regression) {
      await openOrUpdateIncident(projectId, evaluation, bundle);
      publishCognitiveEvent({
        kind: 'regression.detected',
        project_id: projectId,
        severity: 'warning',
        payload: {
          cognition_delta: evaluation.cognition_delta,
          affected_routes: evaluation.affected_routes,
          evidence: evaluation.evidence,
        },
      });
    }
    return evaluation;
  } catch (err: any) {
    console.warn('[autonomousRegressionDetector] tick failed:', err?.message);
    return null;
  }
}

async function openOrUpdateIncident(
  projectId: string,
  evaluation: RegressionEvaluation,
  bundle: any,
): Promise<void> {
  try {
    const { default: CognitiveIncident } = await import('../../../models/CognitiveIncident');
    // Look for an open ux_regression incident on this project.
    const existing = await CognitiveIncident.findOne({
      where: { project_id: projectId, type: 'ux_regression', state: 'open' },
    });
    if (existing) {
      const e = existing as any;
      await CognitiveIncident.update(
        {
          last_seen_at: new Date(),
          occurrence_count: (e.occurrence_count || 1) + 1,
          severity: Math.abs(evaluation.cognition_delta) >= 25 ? 'error' : 'warning',
          affected_routes: evaluation.affected_routes,
          behavioral_evidence: bundle.behavioral,
          visual_evidence: bundle.regressions,
        } as any,
        { where: { id: e.id } },
      );
      publishCognitiveEvent({
        kind: 'incident.updated',
        project_id: projectId,
        severity: 'warning',
        payload: { incident_id: e.id, occurrence_count: (e.occurrence_count || 1) + 1 },
      });
    } else {
      const row = await CognitiveIncident.create({
        project_id: projectId,
        type: 'ux_regression',
        severity: Math.abs(evaluation.cognition_delta) >= 25 ? 'error' : 'warning',
        state: 'open',
        affected_routes: [...evaluation.affected_routes],
        cognition_impact: evaluation.cognition_delta,
        behavioral_evidence: bundle.behavioral,
        visual_evidence: bundle.regressions,
        recommended_actions: [
          'Run a visual review session on the most-affected route.',
          'Check the latest manifest for a route this incident covers.',
        ],
        opened_at: new Date(),
        last_seen_at: new Date(),
        resolved_at: null,
        acknowledged_by: null,
        occurrence_count: 1,
        metadata: { evidence: evaluation.evidence },
      } as any);
      publishCognitiveEvent({
        kind: 'incident.opened',
        project_id: projectId,
        severity: 'warning',
        payload: { incident_id: (row as any).id, type: 'ux_regression' },
      });
    }
  } catch (err: any) {
    console.warn('[autonomousRegressionDetector] incident write failed:', err?.message);
  }
}
