/**
 * executionIsolationEngine — Phase 23. Per-(worker_kind, organization_id)
 * circuit breaker.
 *
 * Architectural commitment:
 *   - Failures are WORKER-BOUNDED + ORGANIZATION-LOCAL. A `briefing_send`
 *     isolation in `org-a` does not affect `briefing_send` in `org-b`
 *     and does not affect `email_send` in `org-a`.
 *   - Triggers automatically on 5 consecutive failures within 30s OR
 *     `envelope_breach`/`depth_limit_exceeded`/`operator_quarantine`.
 *   - Lifting is OPERATOR-CLICKED. No silent auto-recovery.
 *   - Operator quarantine is the strictest — survives auto-lift attempts.
 */

import type {
  ExecutionWorkerKind, ExecutionIsolationProfile, ExecutionIsolationReason,
} from './executionSubstrateTypes';
import {
  ISOLATION_FAILURE_THRESHOLD, ISOLATION_FAILURE_WINDOW_MS,
} from './executionSubstrateTypes';

interface IsolationKey {
  kind: ExecutionWorkerKind;
  organization_id: string;
}

interface IsolationState {
  isolated_since: number;
  reason: ExecutionIsolationReason;
  consecutive_failures: number;
  operator_quarantined: boolean;
}

interface FailureWindow {
  recent_failures: number[];
  last_failure_at: number | null;
}

const isolations = new Map<string, IsolationState>();
const failureWindows = new Map<string, FailureWindow>();
const isolationEvents24h: number[] = [];

function keyOf(k: IsolationKey): string {
  return `${k.kind}::${k.organization_id}`;
}

function pruneWindow(w: FailureWindow, now: number): void {
  const cutoff = now - ISOLATION_FAILURE_WINDOW_MS;
  while (w.recent_failures.length > 0 && w.recent_failures[0] < cutoff) {
    w.recent_failures.shift();
  }
}

function pruneIsolationEvents(now: number): void {
  const cutoff = now - 24 * 60 * 60_000;
  while (isolationEvents24h.length > 0 && isolationEvents24h[0] < cutoff) {
    isolationEvents24h.shift();
  }
}

export function recordSuccess(kind: ExecutionWorkerKind, organization_id: string): void {
  failureWindows.delete(keyOf({ kind, organization_id }));
}

export function recordFailure(
  kind: ExecutionWorkerKind,
  organization_id: string,
  reason: ExecutionIsolationReason = 'consecutive_failures',
): boolean {
  const now = Date.now();
  const k = keyOf({ kind, organization_id });

  let w = failureWindows.get(k);
  if (!w) {
    w = { recent_failures: [], last_failure_at: null };
    failureWindows.set(k, w);
  }
  w.recent_failures.push(now);
  w.last_failure_at = now;
  pruneWindow(w, now);

  if (isolations.has(k)) {
    const s = isolations.get(k)!;
    s.consecutive_failures = w.recent_failures.length;
    return false;
  }

  const shouldIsolate =
    reason !== 'consecutive_failures' ||
    w.recent_failures.length >= ISOLATION_FAILURE_THRESHOLD;
  if (!shouldIsolate) return false;

  isolations.set(k, {
    isolated_since: now,
    reason,
    consecutive_failures: w.recent_failures.length,
    operator_quarantined: false,
  });
  isolationEvents24h.push(now);
  pruneIsolationEvents(now);
  return true;
}

export function isIsolated(kind: ExecutionWorkerKind, organization_id: string): boolean {
  return isolations.has(keyOf({ kind, organization_id }));
}

export function liftIsolation(kind: ExecutionWorkerKind, organization_id: string): boolean {
  const k = keyOf({ kind, organization_id });
  if (!isolations.has(k)) return false;
  isolations.delete(k);
  failureWindows.delete(k);
  return true;
}

export function quarantine(kind: ExecutionWorkerKind, organization_id: string): void {
  const now = Date.now();
  const k = keyOf({ kind, organization_id });
  isolations.set(k, {
    isolated_since: now,
    reason: 'operator_quarantine',
    consecutive_failures: isolations.get(k)?.consecutive_failures ?? 0,
    operator_quarantined: true,
  });
  isolationEvents24h.push(now);
  pruneIsolationEvents(now);
}

export function buildIsolationProfile(): ExecutionIsolationProfile {
  const now = Date.now();
  pruneIsolationEvents(now);
  const isolated_kinds = Array.from(isolations.entries()).map(([k, s]) => {
    const [kind, organization_id] = k.split('::') as [ExecutionWorkerKind, string];
    return {
      kind,
      organization_id,
      reason: s.reason,
      isolated_since: new Date(s.isolated_since).toISOString(),
      consecutive_failures: s.consecutive_failures,
      explanation: explanationFor(s.reason, s.consecutive_failures, kind, organization_id),
    };
  });
  return {
    isolated_kinds,
    active_isolation_count: isolated_kinds.length,
    total_isolation_events_24h: isolationEvents24h.length,
    built_at: new Date().toISOString(),
  };
}

function explanationFor(
  reason: ExecutionIsolationReason,
  consecutive_failures: number,
  kind: ExecutionWorkerKind,
  organization_id: string,
): string {
  const scope = `org=${organization_id} kind=${kind}`;
  switch (reason) {
    case 'consecutive_failures':
      return `${scope}: isolated after ${consecutive_failures} consecutive failures within window`;
    case 'envelope_breach':
      return `${scope}: isolated due to bounded envelope breach (worker exceeded duration cap)`;
    case 'depth_limit_exceeded':
      return `${scope}: isolated because parent depth limit was exceeded`;
    case 'operator_quarantine':
      return `${scope}: operator-quarantined; serves no registrations until explicitly lifted`;
  }
}

export function _resetIsolationForTests(): void {
  isolations.clear();
  failureWindows.clear();
  isolationEvents24h.length = 0;
}
