/**
 * brokerIsolationEngine — Phase 21. Per-namespace circuit breaker
 * around the active broker adapter.
 *
 * Architectural commitment:
 *   - Failures are PARTITION-LOCAL. A namespace can be isolated
 *     without affecting other namespaces. An organization's data
 *     is never contaminated by a different organization's failures.
 *   - Isolation triggers AUTOMATICALLY (5 consecutive failures within
 *     30s, OR sustained latency > 2s, OR connection loss).
 *   - Lifting isolation is OPERATOR-CLICKED. No silent auto-recovery.
 *   - Operator quarantine is the strictest tier — overrides automatic
 *     lifting until explicitly cleared.
 */

import type {
  BrokerAdapterKind, BrokerIsolationProfile, BrokerIsolationReason,
} from './distributedRuntimeTypes';
import {
  ISOLATION_FAILURE_THRESHOLD, ISOLATION_FAILURE_WINDOW_MS,
} from './distributedRuntimeTypes';

interface IsolationKey {
  namespace: string;
  organization_id: string | null;  // null = global namespace isolation
}

interface IsolationState {
  isolated_since: number;          // ms timestamp
  reason: BrokerIsolationReason;
  consecutive_failures: number;
  fallback_active: boolean;
  operator_quarantined: boolean;   // true → automatic lifts cannot reopen
}

interface FailureWindow {
  recent_failures: number[];       // ms timestamps
  last_failure_at: number | null;
}

const isolations = new Map<string, IsolationState>();
const failureWindows = new Map<string, FailureWindow>();
const isolationEvents24h: number[] = [];   // ms timestamps

function keyOf(k: IsolationKey): string {
  return `${k.namespace}::${k.organization_id ?? '*'}`;
}

function pruneFailureWindow(window: FailureWindow, now: number): void {
  const cutoff = now - ISOLATION_FAILURE_WINDOW_MS;
  while (window.recent_failures.length > 0 && window.recent_failures[0] < cutoff) {
    window.recent_failures.shift();
  }
}

function pruneIsolationEvents(now: number): void {
  const cutoff = now - 24 * 60 * 60_000;
  while (isolationEvents24h.length > 0 && isolationEvents24h[0] < cutoff) {
    isolationEvents24h.shift();
  }
}

/** Record a successful broker op → resets the failure window. */
export function recordSuccess(namespace: string, organization_id: string | null): void {
  const k = keyOf({ namespace, organization_id });
  failureWindows.delete(k);
}

/**
 * Record a broker failure. If the failure threshold is crossed, an
 * isolation is triggered automatically (unless already isolated).
 * Returns true if an isolation was newly triggered.
 */
export function recordFailure(
  namespace: string,
  organization_id: string | null,
  reason: BrokerIsolationReason = 'consecutive_failures',
): boolean {
  const now = Date.now();
  const k = keyOf({ namespace, organization_id });

  let window = failureWindows.get(k);
  if (!window) {
    window = { recent_failures: [], last_failure_at: null };
    failureWindows.set(k, window);
  }
  window.recent_failures.push(now);
  window.last_failure_at = now;
  pruneFailureWindow(window, now);

  // Already isolated → just keep the failure count up to date.
  if (isolations.has(k)) {
    const s = isolations.get(k)!;
    s.consecutive_failures = window.recent_failures.length;
    return false;
  }

  // Connection-loss / sustained-latency reasons trigger immediately.
  // Consecutive-failures requires the threshold within the window.
  const shouldIsolate =
    reason !== 'consecutive_failures' ||
    window.recent_failures.length >= ISOLATION_FAILURE_THRESHOLD;

  if (!shouldIsolate) return false;

  isolations.set(k, {
    isolated_since: now,
    reason,
    consecutive_failures: window.recent_failures.length,
    fallback_active: true,
    operator_quarantined: false,
  });
  isolationEvents24h.push(now);
  pruneIsolationEvents(now);
  return true;
}

/** Check if a namespace+org pair is currently isolated. */
export function isIsolated(namespace: string, organization_id: string | null): boolean {
  return isolations.has(keyOf({ namespace, organization_id }));
}

/** Returns the isolation state for a namespace+org (or null). */
export function getIsolationState(
  namespace: string,
  organization_id: string | null,
): {
  isolated_since: string;
  reason: BrokerIsolationReason;
  consecutive_failures: number;
  fallback_active: boolean;
  operator_quarantined: boolean;
} | null {
  const s = isolations.get(keyOf({ namespace, organization_id }));
  if (!s) return null;
  return {
    isolated_since: new Date(s.isolated_since).toISOString(),
    reason: s.reason,
    consecutive_failures: s.consecutive_failures,
    fallback_active: s.fallback_active,
    operator_quarantined: s.operator_quarantined,
  };
}

/**
 * Operator-clicked: lift an isolation. Quarantined isolations cannot
 * be lifted by automatic recovery — operator must explicitly call this.
 * Returns true if an isolation was actually lifted.
 */
export function liftIsolation(namespace: string, organization_id: string | null): boolean {
  const k = keyOf({ namespace, organization_id });
  if (!isolations.has(k)) return false;
  isolations.delete(k);
  failureWindows.delete(k);
  return true;
}

/**
 * Operator-clicked: quarantine a namespace+org. This is stricter than
 * automatic isolation — it serves no ops until explicitly lifted, even
 * if the broker recovers.
 */
export function quarantine(namespace: string, organization_id: string | null): void {
  const now = Date.now();
  const k = keyOf({ namespace, organization_id });
  isolations.set(k, {
    isolated_since: now,
    reason: 'operator_quarantine',
    consecutive_failures: isolations.get(k)?.consecutive_failures ?? 0,
    fallback_active: true,
    operator_quarantined: true,
  });
  isolationEvents24h.push(now);
  pruneIsolationEvents(now);
}

export function buildIsolationProfile(adapter_kind: BrokerAdapterKind): BrokerIsolationProfile {
  const now = Date.now();
  pruneIsolationEvents(now);
  const isolated_namespaces = Array.from(isolations.entries()).map(([k, s]) => {
    const [namespace, orgPart] = k.split('::');
    const organization_id = orgPart === '*' ? null : orgPart;
    const explanation = explanationFor(s.reason, s.consecutive_failures, namespace, organization_id);
    return {
      namespace,
      organization_id,
      reason: s.reason,
      isolated_since: new Date(s.isolated_since).toISOString(),
      consecutive_failures: s.consecutive_failures,
      fallback_active: s.fallback_active,
      explanation,
    };
  });
  return {
    adapter_kind,
    isolated_namespaces,
    total_isolation_events_24h: isolationEvents24h.length,
    active_isolation_count: isolated_namespaces.length,
    built_at: new Date().toISOString(),
  };
}

function explanationFor(
  reason: BrokerIsolationReason,
  consecutive_failures: number,
  namespace: string,
  organization_id: string | null,
): string {
  const scope = organization_id ? `org=${organization_id} namespace=${namespace}` : `namespace=${namespace}`;
  switch (reason) {
    case 'consecutive_failures':
      return `${scope}: isolated after ${consecutive_failures} consecutive failures within window`;
    case 'sustained_latency':
      return `${scope}: isolated due to sustained broker latency above threshold`;
    case 'connection_lost':
      return `${scope}: isolated due to broker connection loss`;
    case 'operator_quarantine':
      return `${scope}: operator-quarantined; serves no ops until explicitly lifted`;
  }
}

export function _resetIsolationForTests(): void {
  isolations.clear();
  failureWindows.clear();
  isolationEvents24h.length = 0;
}

export const _ISOLATION_FAILURE_THRESHOLD_FOR_TESTS = ISOLATION_FAILURE_THRESHOLD;
