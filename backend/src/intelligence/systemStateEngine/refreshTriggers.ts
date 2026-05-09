/**
 * refreshTriggers — fire-and-forget engine rebuilds in response to
 * state-changing endpoints.
 *
 * Use after:
 *   - validation report submitted
 *   - kickoff sync applied
 *   - user_status / applicability_status changed
 *   - visual review completed
 *   - frontend_route attached
 *   - manual cap added
 *   - target mode changed
 *
 * The rebuild persists a fresh snapshot. Subsequent reads via
 * /system-state pick up the new state.
 *
 * IMPORTANT: this is fire-and-forget. Callers must not await it. If the
 * rebuild fails, it logs a warning — never throws to the request handler.
 */
import { buildAuthoritativeState } from './systemStateEngine';

export type RefreshTriggerKind =
  | 'validation_report'
  | 'kickoff_sync'
  | 'kickoff_reset'
  | 'user_status_change'
  | 'lifecycle_change'
  | 'visual_review'
  | 'frontend_route_change'
  | 'capability_added'
  | 'target_mode_change'
  | 'brownfield_discovery'
  // Phase 3 telemetry triggers
  | 'manifest_ingested'
  | 'validation_telemetry_ingested'
  | 'snapshot_swept'
  // Phase 10.5 — UX remediation orchestration triggers
  | 'remediation_cluster_detected'
  | 'remediation_regression_detected'
  | 'remediation_pressure_changed'
  | 'remediation_outcome_recorded'
  // Phase 12 — governed decision automation triggers
  | 'governance_recommendation_created'
  | 'governance_recommendation_decided'
  | 'operator_override_recorded'
  | 'automation_state_changed'
  | 'prepared_plan_status_changed'
  // Phase 13 — supervised autonomous decision approval triggers.
  | 'autonomy_execution_prepared'
  | 'autonomy_execution_applied'
  | 'autonomy_execution_rolled_back'
  | 'autonomy_trust_changed'
  // Phase 14 — autonomous handoff + closed-loop verification triggers.
  | 'autonomy_execution_started'
  | 'autonomy_execution_verified'
  | 'autonomy_execution_failed'
  | 'autonomy_rollback_completed'
  // Phase 15 — governed direct autonomous mutation triggers.
  | 'mutation_executed'
  | 'mutation_verified'
  | 'mutation_failed'
  | 'mutation_rolled_back'
  // Phase 16 — causality replay + distributed validation.
  | 'root_cause_detected'
  | 'arbitration_completed'
  // Phase 17 — adaptive governance triggers.
  | 'governance_calibration_updated'
  | 'recovery_chain_generated'
  // Phase 18 — operator-calibrated governance evolution triggers.
  | 'governance_calibration_approved'
  | 'recovery_step_executed'
  | 'forecast_calibration_updated'
  // Phase 19 — federated organizational governance triggers.
  | 'federation_consent_updated'
  | 'archetype_federated'
  // Phase 20 — bounded federated learning refinement triggers.
  | 'archetype_reliability_evolved'
  | 'federation_policy_approved'
  // Phase 21 — distributed organizational cognition runtime triggers.
  | 'distributed_broker_isolation_triggered'
  | 'distributed_replay_restored'
  // Phase 22 — within-partition cognition topology orchestration triggers.
  | 'topology_fragmented'
  | 'topology_recovery_orchestrated'
  // Phase 23 — bounded operational execution substrate triggers.
  | 'execution_worker_failed'
  | 'execution_isolated'
  // Phase 24 — deterministic operational cognition compression triggers.
  | 'cognitive_load_overloaded'
  | 'cognitive_guidance_generated'
  // Phase 25 — deterministic counterfactual operational projection triggers.
  | 'experimentation_sandbox_completed'
  | 'experimentation_rehearsal_executed'
  // Phase 26 — bounded live operational rehearsal substrate triggers.
  | 'live_sandbox_runtime_completed'
  | 'live_sandbox_runtime_expired'
  // Phase 27 — bounded delegated operational execution substrate triggers.
  | 'delegation_executed'
  | 'delegation_expired'
  // Phase 28 — execution resource governance + operational economics.
  | 'quota_exhausted'
  | 'pressure_changed'
  // Phase 29 — stabilization playbook intelligence + recovery governance.
  | 'stabilization_archetype_changed'
  | 'recovery_pressure_changed'
  // Phase 30 — recovery foresight UX + stabilization decision cognition.
  | 'decision_compared'
  | 'archaeology_replayed'
  // Phase 31 — operator cognition continuity + governance memory.
  | 'memory_persisted'
  | 'timeline_updated'
  // Phase 32 — multi-operator governance continuity + handoff cognition.
  | 'handoff_persisted'
  | 'transfer_generated'
  | 'manual';

// ── Phase 4 stability protection ─────────────────────────────────────────
// Prevents recursive refresh loops, telemetry storms, and queue thrashing.
// Each project can be rebuilt at most once per DEBOUNCE_MS window. While a
// rebuild is in-flight, additional refresh requests coalesce into a single
// trailing rebuild that fires after the in-flight one completes.

const DEBOUNCE_MS = 1500;        // collapse calls within 1.5s into one rebuild
const COOLDOWN_MS = 500;         // minimum gap between consecutive rebuilds

interface RefreshState {
  inFlight: boolean;
  lastCompletedAt: number;       // ms timestamp
  trailingTimer: NodeJS.Timeout | null;
  trailingTrigger: RefreshTriggerKind | null;
}

const refreshState = new Map<string, RefreshState>();

function getState(projectId: string): RefreshState {
  let s = refreshState.get(projectId);
  if (!s) {
    s = { inFlight: false, lastCompletedAt: 0, trailingTimer: null, trailingTrigger: null };
    refreshState.set(projectId, s);
  }
  return s;
}

async function runRebuild(projectId: string, trigger: RefreshTriggerKind): Promise<void> {
  const state = getState(projectId);
  state.inFlight = true;
  try {
    const t0 = Date.now();
    const result = await buildAuthoritativeState(projectId, { persist: true });
    const elapsed = Date.now() - t0;
    console.log(`[SystemStateEngine] refresh (${trigger}) for ${projectId}: ${elapsed}ms`);
    state.lastCompletedAt = Date.now();

    // Phase 8: publish cognitive events so SSE subscribers + persistent
    // memory + live pressure engine can react.
    try {
      const { publishCognitiveEvent } = await import('./realtime/cognitiveEventBus');
      const { tickPressure } = await import('./realtime/livePressureEngine');
      const { recordRerank } = await import('./realtime/operationalCostGovernance');

      recordRerank();

      publishCognitiveEvent({
        kind: 'queue.reranked',
        project_id: projectId,
        severity: 'info',
        payload: {
          trigger,
          elapsed_ms: elapsed,
          queue_length: result.queue.length,
          next_task_id: result.next_task?.id ?? null,
          contradiction_count: result.contradictions.length,
          sync_health: result.sync_health.score,
        },
      });

      // Coarse pressure derivation: contradiction count + (100 - sync_health).
      // The dedicated pressure engine in §6 takes this and applies decay.
      const rawPressure = Math.min(100,
        Math.round((100 - result.sync_health.score) * 0.6) +
        Math.min(40, result.contradictions.length * 5),
      );
      tickPressure({ project_id: projectId, new_raw_pressure: rawPressure });
    } catch (err: any) {
      console.warn('[SystemStateEngine] cognitive event publish failed:', err?.message);
    }
  } catch (err: any) {
    console.warn(`[SystemStateEngine] refresh (${trigger}) failed for ${projectId}: ${err?.message}`);
  } finally {
    state.inFlight = false;
  }

  // If a trailing trigger was queued while we were running, fire it now
  // (after a short cooldown to avoid back-to-back rebuilds).
  const trailingTrigger = state.trailingTrigger;
  state.trailingTrigger = null;
  state.trailingTimer = null;
  if (trailingTrigger) {
    setTimeout(() => runRebuild(projectId, trailingTrigger), COOLDOWN_MS);
  }
}

/**
 * Schedule a snapshot rebuild for the given project. Non-blocking —
 * returns immediately; rebuild happens after the debounce window.
 *
 * Phase 4 stability: rapid-fire calls within 1.5s coalesce into a single
 * trailing rebuild. Concurrent rebuilds for the same project are
 * impossible — at most one runs at a time.
 */
export function refreshSystemState(projectId: string, trigger: RefreshTriggerKind): void {
  const state = getState(projectId);

  // Already rebuilding → record this as the trailing trigger (later trigger
  // wins, since callers usually want the newest one represented).
  if (state.inFlight) {
    state.trailingTrigger = trigger;
    return;
  }

  // Within cooldown of the last completion → debounce.
  const sinceLast = Date.now() - state.lastCompletedAt;
  if (sinceLast < COOLDOWN_MS) {
    if (state.trailingTimer) clearTimeout(state.trailingTimer);
    state.trailingTrigger = trigger;
    state.trailingTimer = setTimeout(() => {
      const t = state.trailingTrigger;
      state.trailingTrigger = null;
      state.trailingTimer = null;
      if (t) runRebuild(projectId, t);
    }, DEBOUNCE_MS);
    return;
  }

  // Cold path: start the rebuild on the next tick so the calling endpoint
  // returns immediately.
  setImmediate(() => runRebuild(projectId, trigger));
}

/** Test helper: clear all in-memory refresh state. */
export function _resetRefreshStateForTests(): void {
  for (const s of refreshState.values()) {
    if (s.trailingTimer) clearTimeout(s.trailingTimer);
  }
  refreshState.clear();
}
