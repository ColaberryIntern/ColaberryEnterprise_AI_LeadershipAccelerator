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
  | 'stabilization.branch_isolated';

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
