import { getSetting, setSetting } from './settingsService';
import { logAiEvent } from './aiEventService';

const SAFE_MODE_KEY = 'llm_safe_mode';

export async function isSafeModeActive(): Promise<boolean> {
  try {
    const val = await getSetting(SAFE_MODE_KEY);
    return val === true || val === 'true';
  } catch {
    return false;
  }
}

export async function enableSafeMode(reason: string, enabledBy: string): Promise<void> {
  await setSetting(SAFE_MODE_KEY, true);
  await logAiEvent('SystemControl', 'SAFE_MODE_ENABLED', 'system', undefined, {
    reason,
    enabled_by: enabledBy,
  }).catch(() => {});
  console.warn(`[SAFE MODE] ENABLED by ${enabledBy}: ${reason}`);
}

export async function disableSafeMode(disabledBy: string): Promise<void> {
  await setSetting(SAFE_MODE_KEY, false);
  await logAiEvent('SystemControl', 'SAFE_MODE_DISABLED', 'system', undefined, {
    disabled_by: disabledBy,
  }).catch(() => {});
  console.log(`[SAFE MODE] Disabled by ${disabledBy}`);
}
