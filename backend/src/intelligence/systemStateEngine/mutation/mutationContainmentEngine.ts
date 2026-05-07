/**
 * mutationContainmentEngine — Phase 15. Orchestrated containment
 * workflows that bundle the existing Phase 14 self-heal primitives
 * (isolation + cooldown + automation downgrade + circuit breaker)
 * into named, replay-able workflows.
 *
 * The flagship workflow is `containMutationCascade(project)` which:
 *   1. Sets the project automation_mode to 'supervised'.
 *   2. Adds an isolation entry for any cluster_signature implicated.
 *   3. Sets a 30-min cooldown gate so the next handoff for that signature
 *      short-circuits.
 *   4. Freezes the offending intent class via the trust calibrator.
 *   5. Writes a `mutation_contained` audit chain so the workflow is
 *      replayable.
 *   6. Emits `mutation.containment.activated` with the workflow id.
 *
 * Phase 15's stress-test bias is "orchestrated, not uncontrolled" — every
 * containment workflow has bounded steps + idempotent guards + an audit
 * trail. There are no recursive auto-recoveries.
 */

import type { MutationIntent, MutationContainmentSnapshot } from './mutationTypes';
import { freezeIntentClass, unfreezeIntentClass, isIntentFrozen, getFrozenIntents } from './mutationTrustCalibrator';

interface WorkflowRecord {
  workflow_id: string;
  trigger: string;
  started_at: string;
  steps_completed: string[];
  contained_class: MutationIntent;
}

/** Active containment workflows keyed by project_id. */
const activeWorkflows = new Map<string, WorkflowRecord[]>();

/** Per-project set of intent classes currently in 'contained' state
 *  (distinct from 'frozen' — contained = transient quarantine; frozen
 *  = explicit operator/policy block). */
const containedClasses = new Map<string, Set<MutationIntent>>();

const CONTAIN_COOLDOWN_MS = 30 * 60 * 1000;

export interface ContainCascadeInput {
  readonly project_id: string;
  readonly intent_class: MutationIntent;
  readonly trigger_summary: string;
  readonly cluster_signature?: string;
  readonly operator_id?: string;
}

export interface ContainCascadeResult {
  readonly workflow_id: string;
  readonly steps_completed: ReadonlyArray<string>;
  readonly already_contained: boolean;
  readonly summary: string;
}

export async function containMutationCascade(input: ContainCascadeInput): Promise<ContainCascadeResult> {
  const setForProject = ensureSet(input.project_id);
  if (setForProject.has(input.intent_class)) {
    return {
      workflow_id: 'noop-already-contained',
      steps_completed: [],
      already_contained: true,
      summary: `Intent class ${input.intent_class} already contained for project ${input.project_id}.`,
    };
  }

  const workflow_id = `contain-${input.project_id.slice(0, 8)}-${Date.now()}`;
  const steps: string[] = [];

  // Step 1: automation mode → supervised (idempotent)
  try {
    const { setAutomationMode } = await import('../governance/decisionAutomationEngine');
    setAutomationMode(input.project_id, 'supervised');
    steps.push('automation_mode→supervised');
  } catch (err: any) {
    steps.push(`automation_mode_failed:${err?.message}`);
  }

  // Step 2: isolation entry (only when a cluster_signature is provided)
  if (input.cluster_signature) {
    try {
      const { recordIsolation } = await import('../autonomy/isolationRegistry');
      await recordIsolation({
        project_id: input.project_id,
        signature: input.cluster_signature,
        reason: `mutationContainment:${input.intent_class}:${input.trigger_summary}`,
        ttl_ms: 60 * 60 * 1000,
      });
      steps.push(`isolation_added:${input.cluster_signature}`);
    } catch (err: any) {
      steps.push(`isolation_failed:${err?.message}`);
    }
  }

  // Step 3: 30-min cooldown gate so the next mutation attempt for this
  //         class short-circuits via the same withCooldown primitive.
  try {
    const { withCooldown } = await import('../realtime/cognitiveStabilityProtection');
    withCooldown(`mutation_contain_${input.intent_class}_${input.project_id}`, CONTAIN_COOLDOWN_MS);
    steps.push('cooldown_gate_set');
  } catch (err: any) {
    steps.push(`cooldown_failed:${err?.message}`);
  }

  // Step 4: freeze the offending intent class so trust profile reflects it
  freezeIntentClass(input.project_id, input.intent_class);
  steps.push(`intent_frozen:${input.intent_class}`);

  // Track in the contained set + active workflows list
  setForProject.add(input.intent_class);
  const list = activeWorkflows.get(input.project_id) ?? [];
  list.push({
    workflow_id,
    trigger: input.trigger_summary,
    started_at: new Date().toISOString(),
    steps_completed: steps,
    contained_class: input.intent_class,
  });
  activeWorkflows.set(input.project_id, list);

  // Step 5: audit row
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: input.project_id,
      kind: 'mutation_contained',
      subject_id: workflow_id,
      payload: {
        intent_class: input.intent_class,
        cluster_signature: input.cluster_signature,
        trigger: input.trigger_summary,
        steps_completed: steps,
      },
      operator_id: input.operator_id ?? null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[mutationContainmentEngine] audit write failed:', err?.message);
  }

  // Step 6: event emission
  try {
    const { publishCognitiveEvent } = await import('../realtime/cognitiveEventBus');
    publishCognitiveEvent({
      kind: 'mutation.containment.activated',
      project_id: input.project_id,
      severity: 'warning',
      payload: { workflow_id, intent_class: input.intent_class, steps_completed: steps },
    });
  } catch { /* fail-soft */ }

  return {
    workflow_id,
    steps_completed: steps,
    already_contained: false,
    summary: `CONTAINED ${input.intent_class} for ${input.project_id}: ${steps.length} steps.`,
  };
}

export async function liftContainment(project_id: string, intent_class: MutationIntent, operator_id?: string): Promise<{ lifted: boolean }> {
  const set = ensureSet(project_id);
  if (!set.has(intent_class) && !isIntentFrozen(project_id, intent_class)) {
    return { lifted: false };
  }
  set.delete(intent_class);
  unfreezeIntentClass(project_id, intent_class);
  // Trim the active workflow record(s) for this class.
  const list = activeWorkflows.get(project_id);
  if (list) {
    activeWorkflows.set(project_id, list.filter(w => w.contained_class !== intent_class));
  }
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id,
      // Reuse mutation_contained kind with payload.action='lift' — keeps the
      // audit-kind enum minimal.
      kind: 'mutation_contained',
      subject_id: null,
      payload: { action: 'lift', intent_class },
      operator_id: operator_id ?? null,
      recorded_at: new Date(),
    } as any);
  } catch { /* fail-soft */ }
  return { lifted: true };
}

export function readContainmentSnapshot(project_id: string): MutationContainmentSnapshot {
  const set = ensureSet(project_id);
  const frozen = getFrozenIntents(project_id);
  const list = activeWorkflows.get(project_id) ?? [];
  return {
    project_id,
    contained_classes: Array.from(set),
    frozen_classes: frozen,
    active_workflows: list.map(w => ({
      workflow_id: w.workflow_id,
      trigger: w.trigger,
      started_at: w.started_at,
      steps_completed: w.steps_completed,
    })),
  };
}

export function isClassContained(project_id: string, intent_class: MutationIntent): boolean {
  return ensureSet(project_id).has(intent_class) || isIntentFrozen(project_id, intent_class);
}

function ensureSet(project_id: string): Set<MutationIntent> {
  let s = containedClasses.get(project_id);
  if (!s) {
    s = new Set();
    containedClasses.set(project_id, s);
  }
  return s;
}

export function _resetMutationContainment(): void {
  activeWorkflows.clear();
  containedClasses.clear();
}

export const _CONTAIN_COOLDOWN_MS_FOR_TESTS = CONTAIN_COOLDOWN_MS;
