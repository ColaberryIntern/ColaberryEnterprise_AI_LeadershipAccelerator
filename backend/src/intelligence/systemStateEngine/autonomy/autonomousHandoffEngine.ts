/**
 * autonomousHandoffEngine — Phase 14 top-level coordinator.
 *
 * For an approved PreparedRemediationPlan with auto_executed_at != null:
 *   1. Optimistic-lock flip on direct_executed_at + execution_verification_status='pending'.
 *   2. Re-check active isolations (audit-row-backed).
 *   3. Re-run safeExecutionGuardrails (state may have degraded since approval).
 *   4. Compute blast radius; high-risk → abort.
 *   5. Per-project rate limit (3/min).
 *   6. Generate prompt via generateImprovementPrompt('ui_fix_adaptive', ...).
 *   7. Persist GovernanceAuditEntry { kind: 'autonomy_execution_started' }.
 *   8. Emit autonomy.execution.started event with the prompt body.
 *
 * Phase 14 §A.1.
 *
 * IMPORTANT: this module does NOT execute Claude Code. It generates the
 * prompt and queues it for the operator/Cory worker to consume. The
 * actual mutation lane stays unchanged (operator runs Claude Code,
 * pastes validation report, recordPhase10_5Outcomes fires).
 */

import { isIsolated } from './isolationRegistry';
import { runSandboxValidation, evaluateSafeExecutionGuardrails, assessBlastRadius, evaluateBlastRadiusGate, type SandboxValidationResult, type BlastRadiusProfile } from './safeExecutionGuardrails';
import { allowByRateLimit } from '../realtime/cognitiveStabilityProtection';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';
import type { AutonomyActionClass } from './autonomyTrustState';
import { noteHandoffFired } from './executionSummaryCounters';

export interface HandoffInput {
  readonly project_id: string;
  readonly plan_id: string;
  readonly capability_id: string;
  readonly cluster_signature: string;
  readonly cluster_type: string;
  readonly issue_count: number;
  readonly historical_success_rate: number;
  readonly initial_pressure: number;
  readonly initial_cognition: number;
  readonly confidence: number;
  readonly confidence_floor: number;
  readonly proposed_rank_delta_abs: number;
  readonly rank_delta_abs_max: number;
  readonly proposed_queue_mutation_count: number;
  readonly queue_mutation_max: number;
  readonly action_class: AutonomyActionClass;
  // Blast inputs:
  readonly affected_components_count: number;
  readonly dependency_fanout: number;
  readonly neighbouring_routes: number;
  readonly cluster_severity: 'low' | 'medium' | 'high';
}

export interface HandoffResult {
  readonly handoff_fired: boolean;
  readonly outcome: 'fired' | 'preempted' | 'isolated' | 'guardrail_blocked' | 'blast_blocked' | 'rate_limited' | 'prompt_failed';
  readonly reason: string;
  readonly sandbox: SandboxValidationResult;
  readonly blast: BlastRadiusProfile;
  readonly prompt_text_hash: string | null;
  readonly prompt_text_length: number;
  readonly summary: string;
}

const HANDOFF_RATE_LIMIT_MAX_PER_MIN = 3;

/**
 * Pure(-ish) handoff orchestrator. DB writes happen at the end (audit row).
 * Returns a HandoffResult describing what happened so callers can write
 * downstream events / dashboards.
 *
 * Phase 23 — opt-in instrumentation. Registers the dispatch as a bounded
 * execution worker so it shows up in the unified visibility surface.
 * Lifecycle is marked in `finalize()`. The instrumentation never throws;
 * if registration is rejected (envelope-invalid / kind-isolated), the
 * handoff still runs as before but no envelope is created. This preserves
 * Phase 14's existing behavior under all paths.
 */
export async function fireAutonomousHandoff(input: HandoffInput): Promise<HandoffResult> {
  // 0. Phase 23: register the dispatch as a bounded worker. The worker_id
  //    is threaded into finalize() so every return path marks the
  //    appropriate lifecycle state.
  let phase23WorkerId: string | null = null;
  try {
    const { registerWorker, markRunning } = await import('../executionSubstrate/executionRuntimeCoordinator');
    const reg = registerWorker({
      kind: 'autonomous_handoff_dispatch',
      organization_id: 'colaberry',
      project_id: input.project_id,
      scope_summary: `Handoff dispatch for plan ${input.plan_id} (cluster ${input.cluster_signature})`,
      bounded_envelope: {
        max_duration_ms: 60_000,
        max_attempts: 1,
        allowed_namespaces: ['mutation_execution', 'manifest_ingest'],
        parent_depth_limit: 0,
      },
      metadata: { plan_id: input.plan_id, cluster_signature: input.cluster_signature },
    });
    if (reg.permitted) {
      phase23WorkerId = reg.envelope.worker_id;
      markRunning(phase23WorkerId);
    }
  } catch { /* Phase 23 instrumentation never blocks Phase 14. */ }

  // 1. Re-check isolation (someone may have isolated this signature
  //    between approval and handoff).
  if (isIsolated(input.project_id, input.cluster_signature)) {
    publishBlocked(input, 'isolation_active');
    return finalize(input, 'isolated', `Cluster ${input.cluster_signature} is currently isolated.`, undefined, undefined, null, 0, phase23WorkerId);
  }

  // 2. Rate limit (per-project).
  const allowed = allowByRateLimit({
    key: `autonomy_handoff_${input.project_id}`,
    window_ms: 60_000,
    max_per_window: HANDOFF_RATE_LIMIT_MAX_PER_MIN,
  });
  if (!allowed) {
    publishBlocked(input, 'rate_limit');
    return finalize(input, 'rate_limited', `Project ${input.project_id} hit ${HANDOFF_RATE_LIMIT_MAX_PER_MIN}/min handoff cap.`, undefined, undefined, null, 0, phase23WorkerId);
  }

  // 3. Re-run sandbox validation (state may have shifted since approval).
  const sandbox = runSandboxValidation({
    cluster_signature: input.cluster_signature,
    cluster_type: input.cluster_type,
    issue_count: input.issue_count,
    historical_success_rate: input.historical_success_rate,
    initial_pressure: input.initial_pressure,
    initial_cognition: input.initial_cognition,
  });

  // 4. Re-run guardrails.
  const guardrail = evaluateSafeExecutionGuardrails({
    confidence: input.confidence,
    confidence_floor: input.confidence_floor,
    sandbox,
    rank_delta_abs_max: input.rank_delta_abs_max,
    proposed_rank_delta_abs: input.proposed_rank_delta_abs,
    proposed_queue_mutation_count: input.proposed_queue_mutation_count,
    queue_mutation_max: input.queue_mutation_max,
  });
  if (guardrail.action !== 'apply') {
    publishBlocked(input, `guardrail:${guardrail.reason}`);
    return finalize(input, 'guardrail_blocked', guardrail.reason, sandbox, undefined, null, 0, phase23WorkerId);
  }

  // 5. Blast radius check (independent of guardrail; high-tier hard-blocks).
  const blast = assessBlastRadius({
    affected_components_count: input.affected_components_count,
    proposed_queue_mutation_count: input.proposed_queue_mutation_count,
    proposed_rank_delta_abs: input.proposed_rank_delta_abs,
    cluster_severity: input.cluster_severity,
    dependency_fanout: input.dependency_fanout,
    neighbouring_routes: input.neighbouring_routes,
  });
  const blastGate = evaluateBlastRadiusGate(blast);
  if (blastGate.action !== 'apply') {
    publishBlocked(input, `blast:${blastGate.reason}`);
    return finalize(input, 'blast_blocked', blastGate.reason, sandbox, blast, null, 0, phase23WorkerId);
  }

  // 6. Optimistic plan-flip: only the first caller wins. If rowCount=0,
  //    operator already approved manually OR another tick already fired.
  const flipped = await optimisticPlanFlip(input.plan_id);
  if (!flipped) {
    publishCognitiveEvent({
      kind: 'autonomy.execution.preempted',
      project_id: input.project_id,
      severity: 'info',
      payload: { plan_id: input.plan_id, reason: 'optimistic_lock_lost' },
    });
    return finalize(input, 'preempted', 'Plan was already taken by another path.', sandbox, blast, null, 0, phase23WorkerId);
  }

  // 7. Generate the prompt (NOT execution).
  let prompt_text: string | null = null;
  try {
    const { generateImprovementPrompt } = await import('../../promptGenerator');
    const r = await generateImprovementPrompt(input.capability_id, 'ui_fix_adaptive', { /* extraContext is fed by caller into plan_payload before this point */ });
    prompt_text = r.prompt_text;
  } catch (err: any) {
    publishCognitiveEvent({
      kind: 'autonomy.execution.failed',
      project_id: input.project_id,
      severity: 'warning',
      payload: { plan_id: input.plan_id, reason: `prompt_generation_failed: ${err?.message}` },
    });
    return finalize(input, 'prompt_failed', `Prompt generation failed: ${err?.message}`, sandbox, blast, null, 0, phase23WorkerId);
  }

  const prompt_text_hash = prompt_text ? simpleHash(prompt_text) : null;

  // 8. Audit row + start event.
  await writeStartedAudit({
    project_id: input.project_id,
    plan_id: input.plan_id,
    cluster_signature: input.cluster_signature,
    sandbox,
    blast,
    prompt_text_hash,
    prompt_text_length: prompt_text?.length ?? 0,
  });

  publishCognitiveEvent({
    kind: 'autonomy.execution.started',
    project_id: input.project_id,
    severity: 'info',
    payload: {
      plan_id: input.plan_id,
      cluster_signature: input.cluster_signature,
      blast_score: blast.blast_score,
      prompt_text_length: prompt_text?.length ?? 0,
      prompt_text_hash,
    },
  });

  noteHandoffFired(input.project_id, input.plan_id);

  return finalize(input, 'fired', 'Handoff fired; prompt queued for operator/Cory.', sandbox, blast, prompt_text_hash, prompt_text?.length ?? 0, phase23WorkerId);
}

async function optimisticPlanFlip(plan_id: string): Promise<boolean> {
  try {
    const { default: PreparedRemediationPlan } = await import('../../../models/PreparedRemediationPlan');
    const [affected] = await PreparedRemediationPlan.update(
      { direct_executed_at: new Date(), execution_verification_status: 'pending' } as any,
      { where: { id: plan_id, status: 'approved', direct_executed_at: null } as any },
    );
    return affected > 0;
  } catch (err: any) {
    console.warn('[autonomousHandoffEngine] optimistic flip failed:', err?.message);
    return false;
  }
}

async function writeStartedAudit(opts: {
  project_id: string;
  plan_id: string;
  cluster_signature: string;
  sandbox: SandboxValidationResult;
  blast: BlastRadiusProfile;
  prompt_text_hash: string | null;
  prompt_text_length: number;
}): Promise<void> {
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: opts.project_id,
      kind: 'autonomy_execution_started',
      subject_id: opts.plan_id,
      payload: {
        cluster_signature: opts.cluster_signature,
        prompt_text_hash: opts.prompt_text_hash,
        prompt_text_length: opts.prompt_text_length,
        sandbox_passed: opts.sandbox.passed,
        sandbox_summary: { queue_impact: opts.sandbox.queue_impact, ux_regression_probability: opts.sandbox.ux_regression_probability },
        blast_score: opts.blast.blast_score,
        blast_risk_tier: opts.blast.risk_tier,
      },
      operator_id: null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[autonomousHandoffEngine] audit write failed:', err?.message);
  }
}

function publishBlocked(input: HandoffInput, reason: string): void {
  publishCognitiveEvent({
    kind: 'autonomy.execution.blocked',
    project_id: input.project_id,
    severity: 'info',
    payload: { plan_id: input.plan_id, cluster_signature: input.cluster_signature, reason },
  });
}

function finalize(
  input: HandoffInput,
  outcome: HandoffResult['outcome'],
  reason: string,
  sandbox?: SandboxValidationResult,
  blast?: BlastRadiusProfile,
  prompt_text_hash: string | null = null,
  prompt_text_length = 0,
  phase23WorkerId: string | null = null,
): HandoffResult {
  const sb = sandbox ?? {
    queue_impact: 0, pressure_evolution: 0, contradiction_growth: 0,
    ux_regression_probability: 0, governance_instability_signal: 0,
    passed: false, blocking_reasons: [reason],
  };
  const br = blast ?? {
    affected_components_count: 0, dependency_propagation_score: 0, ux_collateral_risk: 0,
    orchestration_instability_risk: 0, contradiction_amplification_probability: 0,
    blast_score: 0, risk_tier: 'low' as const, contributing_factors: [],
  };
  const summary = outcome === 'fired'
    ? `HANDOFF FIRED: ${input.plan_id} (cluster ${input.cluster_signature}, blast ${br.blast_score}/100). Prompt awaiting operator/Cory pickup.`
    : `HANDOFF ${outcome.toUpperCase()}: ${input.plan_id} — ${reason}`;

  // Phase 23 — mark the registered worker's lifecycle. Best-effort only.
  if (phase23WorkerId) {
    void (async () => {
      try {
        const { markCompleted, markFailed } = await import('../executionSubstrate/executionRuntimeCoordinator');
        if (outcome === 'fired') {
          markCompleted(phase23WorkerId, `handoff_fired:${input.plan_id}`);
        } else {
          markFailed(phase23WorkerId, `handoff_${outcome}:${reason}`);
        }
      } catch { /* never block on instrumentation */ }
    })();
  }

  return {
    handoff_fired: outcome === 'fired',
    outcome,
    reason,
    sandbox: sb,
    blast: br,
    prompt_text_hash,
    prompt_text_length,
    summary,
  };
}

function simpleHash(s: string): string {
  // Tiny djb2-style hash; sufficient for "did the same prompt get generated"
  // diagnostics — not security-grade.
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & h;
  }
  return (h >>> 0).toString(16);
}

/** Test-only entry that skips DB calls + rate limit. */
export async function _testFireHandoffPure(input: HandoffInput): Promise<HandoffResult> {
  // Pure path: skip optimistic flip + audit write but still run all the
  // gates so test inputs see realistic blocked/fired outcomes.
  if (isIsolated(input.project_id, input.cluster_signature)) {
    return finalize(input, 'isolated', `Cluster ${input.cluster_signature} isolated.`);
  }
  const sandbox = runSandboxValidation({
    cluster_signature: input.cluster_signature, cluster_type: input.cluster_type,
    issue_count: input.issue_count, historical_success_rate: input.historical_success_rate,
    initial_pressure: input.initial_pressure, initial_cognition: input.initial_cognition,
  });
  const guardrail = evaluateSafeExecutionGuardrails({
    confidence: input.confidence, confidence_floor: input.confidence_floor, sandbox,
    rank_delta_abs_max: input.rank_delta_abs_max, proposed_rank_delta_abs: input.proposed_rank_delta_abs,
    proposed_queue_mutation_count: input.proposed_queue_mutation_count, queue_mutation_max: input.queue_mutation_max,
  });
  if (guardrail.action !== 'apply') return finalize(input, 'guardrail_blocked', guardrail.reason, sandbox);
  const blast = assessBlastRadius({
    affected_components_count: input.affected_components_count,
    proposed_queue_mutation_count: input.proposed_queue_mutation_count,
    proposed_rank_delta_abs: input.proposed_rank_delta_abs,
    cluster_severity: input.cluster_severity,
    dependency_fanout: input.dependency_fanout,
    neighbouring_routes: input.neighbouring_routes,
  });
  const blastGate = evaluateBlastRadiusGate(blast);
  if (blastGate.action !== 'apply') return finalize(input, 'blast_blocked', blastGate.reason, sandbox, blast);
  return finalize(input, 'fired', 'Pure-path handoff (test).', sandbox, blast, 'test-hash', 100);
}
