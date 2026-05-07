/**
 * selfHealingOrchestrator — Phase 14 §A.3.
 *
 * Listener auto-started in `index.ts`. Subscribes to `pressure.escalated`
 * and `autonomy.trust.changed`. Two real branches:
 *
 *   Branch 1: pressure.escalated to critical AND active autonomy →
 *             emit `autonomy_self_heal_triggered` audit + warning event,
 *             call setAutomationMode(project, 'supervised').
 *
 *   Branch 2: autonomy.trust.changed warning →
 *             set 30-min cooldown gate (`self_heal_trust_<pid>`) so the
 *             handoff engine short-circuits the next attempt.
 *
 * Per-project circuit breaker: more than 5 self-heal cycles within 30s
 * for one project → suspend the listener for that project for 60s and
 * emit a tripped event. Mirrors `remediationOrchestrationListener`.
 *
 * The other 2 branches from the original prompt (regression → rollback,
 * 3× failure → isolation) live in `autonomousRollbackEngine.ts` —
 * NOT here, per stress-test guidance.
 */

import { cognitiveEventBus, publishCognitiveEvent, type CognitiveEvent } from '../realtime/cognitiveEventBus';
import { withCooldown } from '../realtime/cognitiveStabilityProtection';
import { noteSelfHeal } from './executionSummaryCounters';

const CB_THRESHOLD = 5;
const CB_WINDOW_MS = 30_000;
const CB_SUSPEND_MS = 60_000;
const TRUST_COOLDOWN_MS = 30 * 60 * 1000;

const cycleTimes = new Map<string, number[]>();
const suspendedUntil = new Map<string, number>();

let started = false;
const unsubscribers: Array<() => void> = [];

export function startSelfHealingOrchestrator(): { stop: () => void; alreadyStarted: boolean } {
  if (started) return { stop: stopAll, alreadyStarted: true };
  started = true;

  unsubscribers.push(
    cognitiveEventBus.subscribeToKind('pressure.escalated', (event: CognitiveEvent) => {
      void handlePressureEscalated(event);
    }),
  );
  unsubscribers.push(
    cognitiveEventBus.subscribeToKind('autonomy.trust.changed', (event: CognitiveEvent) => {
      void handleTrustChanged(event);
    }),
  );

  return { stop: stopAll, alreadyStarted: false };
}

function stopAll(): void {
  for (const u of unsubscribers) u();
  unsubscribers.length = 0;
  started = false;
}

function circuitBreakerTrip(project_id: string): boolean {
  const now = Date.now();
  const suspended = suspendedUntil.get(project_id);
  if (suspended && now < suspended) return true;
  const times = (cycleTimes.get(project_id) || []).filter(t => now - t < CB_WINDOW_MS);
  times.push(now);
  cycleTimes.set(project_id, times);
  if (times.length > CB_THRESHOLD) {
    suspendedUntil.set(project_id, now + CB_SUSPEND_MS);
    cycleTimes.set(project_id, []);
    publishCognitiveEvent({
      kind: 'autonomy.self_heal.triggered',
      project_id,
      severity: 'warning',
      payload: {
        action: 'circuit_breaker_tripped',
        reason: `${times.length} self-heal cycles in ${CB_WINDOW_MS / 1000}s`,
        suspend_ms: CB_SUSPEND_MS,
      },
    });
    return true;
  }
  return false;
}

async function handlePressureEscalated(event: CognitiveEvent): Promise<void> {
  const project_id = event.project_id;
  if (circuitBreakerTrip(project_id)) return;
  const payload = (event.payload || {}) as any;
  // Trigger ONLY when the new tier is critical (skip elevated/urgent).
  if (payload.tier !== 'critical') return;

  try {
    const { readAutomationMode, setAutomationMode } = await import('../governance/decisionAutomationEngine');
    const currentMode = await readAutomationMode(project_id);
    if (currentMode !== 'autonomous') {
      // Already supervised/frozen — nothing to do.
      return;
    }
    setAutomationMode(project_id, 'supervised');
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id,
      kind: 'autonomy_self_heal_triggered',
      subject_id: null,
      payload: {
        action: 'downgrade_mode',
        previous_mode: 'autonomous',
        new_mode: 'supervised',
        triggered_by: 'pressure_escalation',
        pressure_tier: payload.tier,
      },
      operator_id: null,
      recorded_at: new Date(),
    } as any);
    publishCognitiveEvent({
      kind: 'autonomy.self_heal.triggered',
      project_id,
      severity: 'warning',
      payload: { action: 'downgrade_mode', new_mode: 'supervised', triggered_by: 'pressure_escalation' },
    });
    noteSelfHeal(project_id);
  } catch (err: any) {
    console.warn('[selfHealingOrchestrator] pressure-escalated handler failed:', err?.message);
  }
}

async function handleTrustChanged(event: CognitiveEvent): Promise<void> {
  const project_id = event.project_id;
  if (event.severity !== 'warning') return;
  if (circuitBreakerTrip(project_id)) return;
  // Set the trust cooldown so the next forward handoff sees it via
  // the same withCooldown gate — handoff engine would consult it
  // before firing.
  withCooldown(`self_heal_trust_${project_id}`, TRUST_COOLDOWN_MS);
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id,
      kind: 'autonomy_self_heal_triggered',
      subject_id: null,
      payload: {
        action: 'apply_trust_cooldown',
        cooldown_ms: TRUST_COOLDOWN_MS,
        triggered_by: 'trust_changed',
      },
      operator_id: null,
      recorded_at: new Date(),
    } as any);
    publishCognitiveEvent({
      kind: 'autonomy.self_heal.triggered',
      project_id,
      severity: 'info',
      payload: { action: 'apply_trust_cooldown', cooldown_ms: TRUST_COOLDOWN_MS, triggered_by: 'trust_changed' },
    });
    noteSelfHeal(project_id);
  } catch (err: any) {
    console.warn('[selfHealingOrchestrator] trust-changed handler failed:', err?.message);
  }
}

/** Test-only: directly invoke the pressure-escalated branch. */
export async function _testHandlePressureEscalated(event: CognitiveEvent): Promise<void> {
  await handlePressureEscalated(event);
}

/** Test-only: directly invoke the trust-changed branch. */
export async function _testHandleTrustChanged(event: CognitiveEvent): Promise<void> {
  await handleTrustChanged(event);
}

/** Test-only reset. */
export function _resetSelfHealingOrchestrator(): void {
  for (const u of unsubscribers) u();
  unsubscribers.length = 0;
  started = false;
  cycleTimes.clear();
  suspendedUntil.clear();
}

export const _SELF_HEAL_CB_THRESHOLD_FOR_TESTS = CB_THRESHOLD;
