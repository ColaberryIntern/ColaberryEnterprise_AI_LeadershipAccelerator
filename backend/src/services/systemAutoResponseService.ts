import { getSystemHealthMetrics } from './systemHealthService';
import { enableSafeMode, disableSafeMode, isSafeModeActive } from './systemControlService';
import { logAiEvent } from './aiEventService';

// ─── Module-level state (ephemeral, resets on deploy) ────────────────────────
let isRunning = false;
let lastActionTimestamp = 0;
let lastAction: string | null = null;

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between toggles

function isCooldownActive(): boolean {
  return Date.now() - lastActionTimestamp < COOLDOWN_MS;
}

// ─── Status getter (for admin visibility) ────────────────────────────────────
export function getAutoResponseStatus() {
  return {
    last_action: lastAction,
    last_action_time: lastActionTimestamp ? new Date(lastActionTimestamp).toISOString() : null,
    cooldown_active: isCooldownActive(),
  };
}

// ─── Main evaluation loop ────────────────────────────────────────────────────
export async function evaluateAndRespond(): Promise<void> {
  if (isRunning) return; // overlap guard
  isRunning = true;

  try {
    const health = await getSystemHealthMetrics();
    const safeModeActive = await isSafeModeActive();
    const { health_status, metrics } = health;
    const { failure_rate } = metrics;

    // Rule 1 — Critical / High failure: auto-enable safe mode
    if (health_status === 'critical' || failure_rate > 0.10) {
      if (!safeModeActive && !isCooldownActive()) {
        const reason = `Auto-response: failure rate ${(failure_rate * 100).toFixed(1)}% (${health_status})`;
        await enableSafeMode(reason, 'system:auto-response');
        await logAiEvent('AutoResponse', 'AUTO_SAFE_MODE_TRIGGERED', 'system', undefined, {
          failure_rate: Number(failure_rate.toFixed(4)),
          health_status,
        }).catch(() => {});

        lastAction = 'AUTO_SAFE_MODE_TRIGGERED';
        lastActionTimestamp = Date.now();
        console.warn(`[AutoResponse] Safe mode ENABLED — failure rate ${(failure_rate * 100).toFixed(1)}%`);
      }
      return;
    }

    // Rule 2 — Warning: observe only
    if (health_status === 'warning') {
      return;
    }

    // Rule 3 — Recovery: auto-disable safe mode when stable
    if (failure_rate < 0.05 && safeModeActive && !isCooldownActive()) {
      await disableSafeMode('system:auto-response');
      await logAiEvent('AutoResponse', 'AUTO_SAFE_MODE_RECOVERY', 'system', undefined, {
        failure_rate: Number(failure_rate.toFixed(4)),
      }).catch(() => {});

      lastAction = 'AUTO_SAFE_MODE_RECOVERY';
      lastActionTimestamp = Date.now();
      console.log(`[AutoResponse] Safe mode DISABLED — failure rate ${(failure_rate * 100).toFixed(1)}%, system recovered`);
    }
  } catch (err: any) {
    console.error('[AutoResponse] Evaluation failed:', err.message);
  } finally {
    isRunning = false;
  }
}
