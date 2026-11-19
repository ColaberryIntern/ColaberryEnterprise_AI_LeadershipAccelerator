/**
 * OH1k: one kill switch for both systems. `system_kill_switch` already stops every send
 * (emailService, communicationSafetyService), the Open House countdown included. The governor
 * hard-coded `killSwitch: false`, so Explorer Growth kept deciding while everything else was
 * stopped. It now reads the same switch, STRICTLY: an unreadable switch is treated as ON
 * (an unknown is not permission), unlike the lenient reader that ordinary sends use.
 */
export interface KillSwitchDeps {
  readStrict: () => Promise<boolean>;
}

// Read straight from system_settings (the same row launchSafety.isKillSwitchActiveStrict reads):
// the governor's import whitelist (noSendPaths.test.ts) admits models, not launchSafety.
// No row = the default, which is off.
function defaultDeps(): KillSwitchDeps {
  return {
    readStrict: async () => {
      const { SystemSetting } = await import('../../../models');
      const row = await SystemSetting.findOne({ where: { key: 'system_kill_switch' } });
      const v = (row as any)?.value;
      return v === true || v === 'true';
    },
  };
}

export async function governorKillSwitch(deps: KillSwitchDeps = defaultDeps()): Promise<boolean> {
  try {
    return (await deps.readStrict()) === true;
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'explorer-governor', event: 'kill_switch_read_failed',
      outcome: 'failure', error_class: err instanceof Error ? err.name : 'UnknownError', context: { treated_as: 'on' },
    }));
    return true;
  }
}
