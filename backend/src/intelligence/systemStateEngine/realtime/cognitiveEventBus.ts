/**
 * cognitiveEventBus — in-process pub/sub for real-time orchestration events.
 *
 * Producers (engine, contradiction detector, pressure engine, etc.) publish
 * typed events. Subscribers (SSE handlers, persistent memory, alerters) react.
 *
 * Single global bus per Node process. For multi-process deployments, swap the
 * backing store with Redis pub/sub (Phase 9 — interface kept narrow).
 *
 * Phase 8 §1.
 */

export type CognitiveEventKind =
  | 'queue.reranked'                  // a project's queue order changed
  | 'pressure.changed'                // UX pressure tier or value shifted
  | 'pressure.escalated'              // tier moved upward
  | 'pressure.decayed'                // tier moved downward
  | 'contradiction.detected'          // new contradiction surfaced
  | 'contradiction.resolved'          // contradiction cleared on next snapshot
  | 'regression.detected'             // autonomous regression detector fired
  | 'cognition.score_changed'         // worst_cognition_score moved materially
  | 'telemetry.ingested'              // manifest accepted
  | 'manifest.rejected'               // ingestion 4xx — useful for live alerts
  | 'visual_review.session_opened'
  | 'visual_review.prompt_generated'
  | 'awareness.heartbeat'             // periodic alive marker
  | 'incident.opened'
  | 'incident.updated'
  | 'incident.resolved'
  // Phase 10.5 — UX remediation orchestration.
  | 'remediation.cluster.detected'
  | 'remediation.cluster.reranked'
  | 'remediation.cluster.resolved'
  | 'remediation.regression.detected'
  | 'remediation.pressure.changed'
  // Phase 12 — governed decision automation.
  | 'governance.recommendation.created'
  | 'governance.recommendation.decided'
  | 'automation.blocked'
  | 'automation.ready'
  | 'operator.override'
  | 'remediation.plan.prepared'
  | 'governance.policy.changed'
  | 'governance.escalation_dispatched'
  // Phase 13 — supervised autonomous decision approval.
  | 'autonomy.execution.prepared'
  | 'autonomy.execution.approved'
  | 'autonomy.execution.blocked'
  | 'autonomy.execution.applied'
  | 'autonomy.execution.rolled_back'
  | 'autonomy.trust.changed'
  | 'autonomy.supervision.required'
  // Phase 14 — autonomous handoff + closed-loop verification.
  | 'autonomy.execution.started'
  | 'autonomy.execution.verified'
  | 'autonomy.execution.failed'
  | 'autonomy.execution.preempted'
  | 'autonomy.rollback.started'
  | 'autonomy.rollback.completed'
  | 'autonomy.self_heal.triggered'
  // Phase 15 — governed direct autonomous mutation.
  | 'mutation.execution.started'
  | 'mutation.execution.verified'
  | 'mutation.execution.failed'
  | 'mutation.rollback.started'
  | 'mutation.rollback.completed'
  | 'mutation.containment.activated'
  | 'mutation.empirical.validation'
  | 'mutation.trust.changed'
  // Phase 16 — causality + distributed validation.
  | 'causality.lineage.updated'
  | 'contradiction.propagation.detected'
  | 'trust.propagation.shifted'
  | 'root_cause.detected'
  | 'validation.disagreement'
  | 'arbitration.completed'
  | 'stabilization.branch_isolated'
  // Phase 17 — adaptive validator intelligence.
  | 'validator.reliability.shifted'
  | 'validator.specialization.detected'
  | 'validator.drift.detected'
  | 'causal.forecast.generated'
  | 'ancestry.rollback.recommended'
  | 'recovery.chain.generated'
  | 'governance.calibration.updated'
  // Phase 18 — operator-calibrated governance evolution.
  | 'governance.calibration.proposed'
  | 'governance.calibration.approved'
  | 'governance.calibration.rejected'
  | 'specialization.routing.updated'
  | 'forecast.calibration.updated'
  | 'recovery.step.executed'
  | 'governance.topology.changed'
  // Phase 19 — federated organizational governance intelligence.
  | 'federation.enabled'
  | 'federation.disabled'
  | 'archetype.federated'
  | 'recovery.archetype.detected'
  | 'calibration.impact.replayed'
  | 'governance.drift.detected'
  | 'federation.visibility.updated'
  // Phase 20 — bounded federated learning refinement.
  | 'archetype.effectiveness.updated'
  | 'stabilization.insight.generated'
  | 'federation.diffusion.replayed'
  | 'archetype.reliability.evolved'
  | 'federation.drift.detected'
  | 'federation.visibility.replayed'
  | 'federation.policy.proposed'
  // Phase 21 — distributed organizational cognition runtime.
  | 'broker.connected'
  | 'broker.disconnected'
  | 'broker.isolation.triggered'
  | 'partition.recovered'
  | 'replay.restored'
  | 'synchronization.degraded'
  | 'runtime.topology.changed'
  // Phase 22 — within-partition cognition topology orchestration.
  | 'topology.fragmented'
  | 'topology.stabilized'
  | 'propagation.detected'
  | 'dependency.degraded'
  | 'recovery.orchestrated'
  | 'continuity.amplified'
  | 'topology.forecast.updated'
  // Phase 23 — bounded operational execution substrate.
  | 'worker.started'
  | 'worker.interrupted'
  | 'worker.recovered'
  | 'rollback.orchestrated'
  | 'execution.isolated'
  | 'execution.degraded'
  | 'execution.replayed'
  // Phase 24 — deterministic operational cognition compression.
  | 'narrative.generated'
  | 'replay.compressed'
  | 'rollback.explained'
  | 'continuity.restored'
  | 'topology.explained'
  | 'guidance.generated'
  | 'cognitive_load.detected'
  // Phase 25 — deterministic counterfactual operational projection.
  | 'sandbox.started'
  | 'sandbox.completed'
  | 'rollback.simulated'
  | 'propagation.previewed'
  | 'rehearsal.executed'
  | 'experiment.isolated'
  | 'experimentation.replayed'
  // Phase 26 — bounded live operational rehearsal substrate.
  | 'sandbox.runtime.started'
  | 'sandbox.runtime.completed'
  | 'sandbox.runtime.expired'
  | 'sandbox.rollback.rehearsed'
  | 'sandbox.preview.generated'
  | 'sandbox.isolation.verified'
  | 'sandbox.replay.generated'
  // Phase 27 — bounded delegated operational execution substrate.
  | 'delegation.issued'
  | 'delegation.executed'
  | 'delegation.expired'
  | 'delegation.rejected'
  | 'rollback.protected'
  | 'containment.verified'
  | 'delegation.replayed'
  // Phase 28 — execution resource governance + operational economics.
  | 'quota.exhausted'
  | 'runtime.pressure.changed'
  | 'rollback.cost.forecasted'
  | 'topology.load.classified'
  | 'delegated.pressure.detected'
  | 'execution.budget.replayed'
  | 'economics.replay.generated'
  // Phase 29 — stabilization playbook intelligence + recovery governance.
  | 'stabilization.playbook.loaded'
  | 'rollback.sequence.generated'
  | 'continuity.forecast.updated'
  | 'stabilization.pressure.detected'
  | 'recovery.replay.generated'
  | 'stabilization.trust.updated'
  | 'recovery.governance.verified'
  // Phase 30 — recovery foresight UX + stabilization decision cognition.
  | 'stabilization.decision.generated'
  | 'rollback.survivability.compared'
  | 'continuity.tradeoff.analyzed'
  | 'recovery.archaeology.replayed'
  | 'stabilization.guidance.updated'
  | 'recovery.walkthrough.generated'
  | 'decision.governance.verified'
  // Phase 31 — operator cognition continuity + governance memory.
  | 'governance.memory.persisted'
  | 'stabilization.timeline.updated'
  | 'archaeology.replay.generated'
  | 'cognition.timeline.updated'
  | 'reasoning.continuity.replayed'
  | 'continuity.narrative.generated'
  | 'governance.memory.verified'
  // Phase 32 — multi-operator governance continuity + handoff cognition.
  | 'governance.handoff.persisted'
  | 'continuity.transfer.generated'
  | 'shared.timeline.updated'
  | 'handoff.archaeology.replayed'
  | 'collaborative.continuity.replayed'
  | 'continuity.transfer.narrated'
  | 'handoff.governance.verified';

export interface CognitiveEvent<T = unknown> {
  readonly id: string;
  readonly kind: CognitiveEventKind;
  readonly project_id: string;
  readonly emitted_at: string;        // ISO-8601
  readonly severity?: 'info' | 'warning' | 'error';
  readonly payload: T;
}

export type CognitiveEventListener = (event: CognitiveEvent) => void;

class CognitiveEventBus {
  private readonly subscribers = new Set<CognitiveEventListener>();
  private readonly perKindSubscribers = new Map<CognitiveEventKind, Set<CognitiveEventListener>>();
  private published = 0;
  private dropped = 0;

  /** Subscribe to ALL events. Returns an unsubscribe function. */
  subscribe(listener: CognitiveEventListener): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  /** Subscribe to a specific event kind. */
  subscribeToKind(kind: CognitiveEventKind, listener: CognitiveEventListener): () => void {
    let set = this.perKindSubscribers.get(kind);
    if (!set) {
      set = new Set();
      this.perKindSubscribers.set(kind, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  /**
   * Publish an event. Any listener errors are caught + logged; one bad
   * subscriber doesn't break the rest.
   */
  publish(event: CognitiveEvent): void {
    this.published++;
    for (const fn of this.subscribers) {
      try { fn(event); } catch (err: any) {
        this.dropped++;
        console.warn('[cognitiveEventBus] subscriber error:', err?.message);
      }
    }
    const set = this.perKindSubscribers.get(event.kind);
    if (set) {
      for (const fn of set) {
        try { fn(event); } catch (err: any) {
          this.dropped++;
          console.warn('[cognitiveEventBus] kind-subscriber error:', err?.message);
        }
      }
    }
  }

  stats() {
    return {
      total_subscribers: this.subscribers.size,
      kind_subscriber_groups: this.perKindSubscribers.size,
      published: this.published,
      dropped: this.dropped,
    };
  }

  /** Test helper: drop everything. */
  _resetForTests(): void {
    this.subscribers.clear();
    this.perKindSubscribers.clear();
    this.published = 0;
    this.dropped = 0;
  }
}

export const cognitiveEventBus = new CognitiveEventBus();

/** Convenience: build + publish in one call. */
export function publishCognitiveEvent<T>(input: {
  kind: CognitiveEventKind;
  project_id: string;
  payload: T;
  severity?: 'info' | 'warning' | 'error';
}): CognitiveEvent<T> {
  const evt: CognitiveEvent<T> = Object.freeze({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    project_id: input.project_id,
    emitted_at: new Date().toISOString(),
    severity: input.severity,
    payload: input.payload,
  });
  cognitiveEventBus.publish(evt);
  return evt;
}
