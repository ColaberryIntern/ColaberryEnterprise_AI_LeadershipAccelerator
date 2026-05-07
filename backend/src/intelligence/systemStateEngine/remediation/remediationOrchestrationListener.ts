/**
 * remediationOrchestrationListener — subscribes to cognitiveEventBus
 * for events that should trigger a remediation re-evaluation, then runs
 * the rerank → publish loop. This is what makes the system "continuous"
 * rather than poll-only.
 *
 * Subscribes to:
 *   - 'regression.detected' (Phase 8) → recompute pressure with boost,
 *      rerank, possibly emit `remediation.cluster.reranked`
 *   - 'remediation.cluster.detected'  → same flow, no boost
 *   - 'remediation.cluster.resolved'  → recompute pressure (decay-only),
 *      rerank
 *
 * Calls operationalCostGovernance.recordRerank() implicitly via
 * remediationPressureEngine.rerankClusterPriority().
 *
 * Phase 10.5 §G.
 */

import { cognitiveEventBus, publishCognitiveEvent, type CognitiveEvent } from '../realtime/cognitiveEventBus';
import { rerankClusterPriority, updateRemediationPressure } from './remediationPressureEngine';
import { buildRemediationIntelligenceReport } from './remediationIntelligenceEngine';

let started = false;
const unsubscribers: Array<() => void> = [];

// Phase 11 — circuit-breaker. Without this, resolved → refresh → detected
// → refresh ad infinitum is possible if the engine state recompute itself
// triggers cluster events. Track recompute timestamps per project; if more
// than CB_THRESHOLD fire within CB_WINDOW_MS, suspend recomputes for that
// project for CB_SUSPEND_MS and emit a single warning event.
const CB_THRESHOLD = 5;
const CB_WINDOW_MS = 30_000;
const CB_SUSPEND_MS = 60_000;
const recomputeTimes = new Map<string, number[]>();
const suspendedUntil = new Map<string, number>();

export function startRemediationOrchestrationListener(): { stop: () => void; alreadyStarted: boolean } {
  if (started) return { stop: stopAll, alreadyStarted: true };
  started = true;

  unsubscribers.push(
    cognitiveEventBus.subscribeToKind('regression.detected', (e) => handleRegressionEvent(e)),
  );
  unsubscribers.push(
    cognitiveEventBus.subscribeToKind('remediation.cluster.detected', (e) => handleClusterChange(e, false)),
  );
  unsubscribers.push(
    cognitiveEventBus.subscribeToKind('remediation.cluster.resolved', (e) => handleClusterChange(e, false)),
  );

  return { stop: stopAll, alreadyStarted: false };
}

function stopAll(): void {
  for (const u of unsubscribers) u();
  unsubscribers.length = 0;
  started = false;
}

/** Test-only: reset circuit-breaker bookkeeping. */
export function _resetRemediationListenerCircuitBreaker(): void {
  recomputeTimes.clear();
  suspendedUntil.clear();
}

/** Test-only: directly invoke recompute without going through SSE. */
export async function _testRunRecompute(projectId: string, capabilityId: string, regressionEvent = false): Promise<void> {
  await runRecompute(projectId, capabilityId, regressionEvent);
}

async function handleRegressionEvent(event: CognitiveEvent): Promise<void> {
  // Regression events from Phase 8 already include project_id. The
  // affected cluster signature is in the payload (best-effort).
  const projectId = event.project_id;
  const payload = (event.payload || {}) as any;
  const capabilityId = payload.capability_id || payload.bp_id;
  if (!capabilityId) return;
  await runRecompute(projectId, capabilityId, true);
}

async function handleClusterChange(event: CognitiveEvent, regressionEvent: boolean): Promise<void> {
  const projectId = event.project_id;
  const payload = (event.payload || {}) as any;
  const capabilityId = payload.capability_id || payload.bp_id;
  if (!capabilityId) return;
  await runRecompute(projectId, capabilityId, regressionEvent);
}

async function runRecompute(projectId: string, capabilityId: string, regressionEvent: boolean): Promise<void> {
  // Phase 11 circuit-breaker.
  const now = Date.now();
  const suspendedAt = suspendedUntil.get(projectId);
  if (suspendedAt && now < suspendedAt) return;
  const times = (recomputeTimes.get(projectId) || []).filter(t => now - t < CB_WINDOW_MS);
  times.push(now);
  recomputeTimes.set(projectId, times);
  if (times.length > CB_THRESHOLD) {
    suspendedUntil.set(projectId, now + CB_SUSPEND_MS);
    try {
      const { publishCognitiveEvent: pub } = await import('../realtime/cognitiveEventBus');
      pub({
        kind: 'remediation.pressure.changed',
        project_id: projectId,
        severity: 'warning',
        payload: {
          capability_id: capabilityId,
          circuit_breaker: 'tripped',
          reason: `${times.length} recompute cycles in ${CB_WINDOW_MS / 1000}s — suspending listener for ${CB_SUSPEND_MS / 1000}s.`,
        },
      });
    } catch { /* fail-soft */ }
    recomputeTimes.set(projectId, []);
    return;
  }
  try {
    const report = await buildRemediationIntelligenceReport({ project_id: projectId, capability_id: capabilityId });

    const pressureUpdate = updateRemediationPressure({
      project_id: projectId,
      clusters: report.clusters.map(c => ({
        severity: c.cluster.severity,
        issue_count: c.cluster.issue_count,
      })),
      regression_event: regressionEvent,
    });

    if (pressureUpdate.changed) {
      publishCognitiveEvent({
        kind: 'remediation.pressure.changed',
        project_id: projectId,
        severity: pressureUpdate.tier === 'critical' ? 'error' : pressureUpdate.tier === 'urgent' ? 'warning' : 'info',
        payload: { capability_id: capabilityId, pressure: pressureUpdate.pressure, tier: pressureUpdate.tier },
      });
    }

    const rerank = rerankClusterPriority({
      project_id: projectId,
      clusters: report.clusters.map(c => ({
        cluster_signature: c.cluster.cluster_signature,
        severity: c.cluster.severity,
        issue_count: c.cluster.issue_count,
        historical_success_rate: c.historical_success_rate,
        is_regression_prone: c.is_regression_prone,
      })),
    });

    if (rerank.changed) {
      publishCognitiveEvent({
        kind: 'remediation.cluster.reranked',
        project_id: projectId,
        severity: 'info',
        payload: {
          capability_id: capabilityId,
          ordered_signatures: rerank.ordered_signatures,
          reason: rerank.reason,
        },
      });
    }
  } catch (err: any) {
    console.warn('[remediationOrchestrationListener] recompute failed:', err?.message);
  }
}
