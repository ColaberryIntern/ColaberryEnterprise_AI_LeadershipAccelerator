/**
 * mutationVerificationEngine — Phase 15 empirical validation.
 *
 * v1 verification = telemetry triangulation, NOT screenshot diffing.
 * Three signals are combined:
 *
 *   1. UXRemediationOutcome telemetry deltas (Phase 11) — already the
 *      empirical truth source for cognition/UX deltas.
 *   2. BuildManifest evidence (Phase 3) — did a manifest land that
 *      actually touched the expected route/component within the
 *      verification window? Cross-checks "we said we changed X; did
 *      X actually change in the repo?"
 *   3. Phase 14 net_delta scorer — composite cognition/UX/behavioral/
 *      friction delta math.
 *
 * The engine returns a `MutationVerificationResult` with:
 *   - mutation_success
 *   - rendered_change_verified (BuildManifest cross-check; null when N/A)
 *   - cognition_improvement_verified (telemetry delta; null when N/A)
 *   - regression_detected
 *   - rollback_required
 *   - verification_confidence
 *
 * Phase 15 does NOT pretend to do screenshot/DOM diffing. The architecture
 * doesn't have that yet. Future phases when a real browser layer exists
 * will extend this engine with rendered-DOM evidence.
 */

import type {
  MutationEnvelope,
  MutationVerificationResult,
  MutationIntent,
} from './mutationTypes';

const VERIFICATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const NET_DELTA_THRESHOLD = 5;                  // mirrors Phase 14 listener

/**
 * Intents that target user-facing remediation surfaces. Only these get
 * BuildManifest cross-check; pure operational mutations (TRUST_RECALIBRATION,
 * POLICY_NUDGE) verify on telemetry alone.
 */
const SURFACE_TOUCHING_INTENTS: ReadonlySet<MutationIntent> = new Set([
  'QUEUE_STABILIZATION',
  'PRESSURE_REBALANCE',
  'SELF_HEALING_ACTION',
]);

export interface VerifyMutationInput {
  readonly envelope: MutationEnvelope;
  /** Surface route or capability id the mutation expected to influence. */
  readonly expected_subject?: string;
}

export async function verifyMutation(input: VerifyMutationInput): Promise<MutationVerificationResult> {
  const env = input.envelope;
  const verified_at = new Date().toISOString();
  const evidence: Record<string, unknown> = {
    verification_window_ms: VERIFICATION_WINDOW_MS,
    intent_class: env.mutation_class,
  };

  // 1. Cognition / UX telemetry signal
  const cognition = await readCognitionSignal(env, evidence);

  // 2. BuildManifest cross-check (only when the intent class targets a
  //    user-facing surface).
  const renderedCheck = SURFACE_TOUCHING_INTENTS.has(env.mutation_class) && env.scope.subject_id
    ? await readBuildManifestSignal(env.scope.project_id, env.scope.subject_id ?? input.expected_subject ?? '', new Date(env.executed_at ?? env.created_at).getTime(), evidence)
    : null;

  const regression_detected = cognition.regression || (renderedCheck?.regression ?? false);
  const cognition_improvement_verified = cognition.scored ? cognition.improved : null;
  const rendered_change_verified = renderedCheck ? renderedCheck.matched : null;

  const mutation_success = !regression_detected && (
    (cognition_improvement_verified === true) ||
    (cognition_improvement_verified === null && rendered_change_verified === true)
  );

  // Rollback only triggers on confirmed regression, OR when the mutation
  // is not successful AND we have no positive evidence anywhere. Absence
  // of BuildManifest evidence is NOT the same as confirmed failure —
  // BuildManifest cross-check is a corroborating signal, not a fail-close.
  const rollback_required = regression_detected || (!mutation_success && cognition_improvement_verified !== true);

  // Confidence blend: cognition signal (50) + rendered match (30) + sanity inputs (20).
  let confidence = 0;
  if (cognition.scored) confidence += cognition.improved ? 50 : 10;
  else confidence += 25;     // unverified telemetry — neutral
  if (rendered_change_verified === true) confidence += 30;
  else if (rendered_change_verified === null) confidence += 15;
  else confidence += 0;
  if (!regression_detected) confidence += 20;
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    mutation_id: env.mutation_id,
    mutation_success,
    rendered_change_verified,
    cognition_improvement_verified,
    regression_detected,
    rollback_required,
    verification_confidence: confidence,
    evidence,
    verified_at,
  };
}

interface CognitionSignal {
  readonly scored: boolean;
  readonly improved: boolean;
  readonly regression: boolean;
  readonly net_delta: number;
}

async function readCognitionSignal(env: MutationEnvelope, evidence: Record<string, unknown>): Promise<CognitionSignal> {
  // Pure-operational intents (TRUST/POLICY) don't touch user-facing
  // telemetry — their success is measured in containment + downstream
  // mutation outcomes. Skip cognition scoring for them.
  if (env.mutation_class === 'TRUST_RECALIBRATION' || env.mutation_class === 'POLICY_NUDGE') {
    evidence.cognition_signal = 'skipped:operational_only';
    return { scored: false, improved: false, regression: false, net_delta: 0 };
  }
  try {
    const { Op } = await import('sequelize');
    const { default: UXRemediationOutcome } = await import('../../../models/UXRemediationOutcome');
    const since = new Date(Date.now() - VERIFICATION_WINDOW_MS);
    const outcome: any = await UXRemediationOutcome.findOne({
      where: { project_id: env.scope.project_id, observed_at: { [Op.gte]: since } } as any,
      order: [['observed_at', 'DESC']],
    });
    if (!outcome) {
      evidence.cognition_signal = 'no_outcome_in_window';
      return { scored: false, improved: false, regression: false, net_delta: 0 };
    }
    const c = (outcome.cognition_delta ?? 0) as number;
    const u = (outcome.ux_debt_delta ?? 0) as number;
    const b = (outcome.behavioral_delta ?? 0) as number;
    const f = (outcome.friction_delta ?? 0) as number;
    const net_delta = Math.round(c * 0.4 + u * 0.3 + b * 0.15 + f * 0.15);
    const regressed = (outcome.issues_regressed_count ?? 0) > 0;
    evidence.cognition_net_delta = net_delta;
    evidence.cognition_regression = regressed;
    return {
      scored: true,
      improved: net_delta >= NET_DELTA_THRESHOLD && !regressed,
      regression: regressed,
      net_delta,
    };
  } catch (err: any) {
    evidence.cognition_signal_error = err?.message;
    return { scored: false, improved: false, regression: false, net_delta: 0 };
  }
}

interface RenderedSignal {
  readonly matched: boolean;
  readonly regression: boolean;
  readonly evidence_count: number;
}

async function readBuildManifestSignal(
  project_id: string,
  expected_subject: string,
  executed_at_ms: number,
  evidence: Record<string, unknown>,
): Promise<RenderedSignal | null> {
  try {
    const { loadManifestsForProject } = await import('../telemetry/telemetryIngestionService');
    const recent = await loadManifestsForProject(project_id, { limit: 25 });
    if (!recent || recent.length === 0) {
      evidence.manifest_signal = 'no_manifests';
      return { matched: false, regression: false, evidence_count: 0 };
    }
    // Filter to manifests within +/- the verification window of the mutation.
    const winStart = executed_at_ms - 60_000; // 1 min slack before
    const winEnd = executed_at_ms + VERIFICATION_WINDOW_MS;
    const inWindow = recent.filter((m: any) => {
      const t = new Date(m.execution_timestamp).getTime();
      return t >= winStart && t <= winEnd;
    });
    if (inWindow.length === 0) {
      evidence.manifest_signal = 'no_manifests_in_window';
      return { matched: false, regression: false, evidence_count: 0 };
    }
    // Match: any manifest in window touched a route/component matching the expected subject.
    const subj = (expected_subject || '').toLowerCase();
    let matchedHits = 0;
    for (const m of inWindow as any[]) {
      const blobs: string[] = [
        ...(m.frontend_routes_added || []),
        ...(m.ui_components_added || []),
        ...(m.ui_components_modified || []),
        ...(m.files_modified || []),
        ...(m.files_created || []),
      ];
      if (blobs.some(b => typeof b === 'string' && b.toLowerCase().includes(subj))) matchedHits++;
    }
    evidence.manifest_signal = `${matchedHits}_of_${inWindow.length}_matched`;
    return {
      matched: matchedHits > 0,
      regression: false,    // BuildManifest doesn't report regressions; cognition signal handles that
      evidence_count: matchedHits,
    };
  } catch (err: any) {
    evidence.manifest_signal_error = err?.message;
    return null;
  }
}

export const _VERIFICATION_WINDOW_MS_FOR_TESTS = VERIFICATION_WINDOW_MS;
export const _NET_DELTA_THRESHOLD_FOR_TESTS = NET_DELTA_THRESHOLD;
export const _SURFACE_TOUCHING_INTENTS_FOR_TESTS = SURFACE_TOUCHING_INTENTS;
