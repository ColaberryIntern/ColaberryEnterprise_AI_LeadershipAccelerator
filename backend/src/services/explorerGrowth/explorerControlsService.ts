/**
 * OH1k: one front door for Maya's outreach (Ali, 2026-11-18: "where will the controls be? Both places
 * or merged? or connected?" -> connected, one front door, one kill switch).
 *
 * A READ of every switch that decides what reaches a learner, in one place, for the Explorer Growth
 * settings tab:
 *   - the global kill switch (system_kill_switch): emailService and communicationSafetyService already
 *     stop every send under it, including the Open House countdown, and the Explorer Growth governor
 *     now treats it as a hard stop (runGovernor.ts);
 *   - the Open House countdown, shown as an event rule with a link to its own campaign page, where it
 *     is approved, activated and paused;
 *   - the switches this build added, each OFF until Ali turns it on: Maya's email auto-reply, the GHL
 *     mirror, countdown calls (ENABLE_VOICE_CALLS + the Open House agent id);
 *   - what is on the brain's approval shelves.
 *
 * Read only. Every part fails on its own and says so (`readable: false`), never a guessed "off".
 */
import { env } from '../../config/env';

export interface ExplorerControls {
  killSwitch: { active: boolean | null; readable: boolean };
  countdown: { campaignId: string | null; status: string | null; adminUrl: string | null; readable: boolean };
  switches: {
    mayaEmailAutoReply: boolean | null;
    ghlMirror: boolean | null;
    voiceCalls: boolean;
    openHouseAgentConfigured: boolean;
  };
  shelves: Record<string, { servable: number; draft: number }> | null;
}

export interface ControlsDeps {
  getSetting: (key: string) => Promise<unknown>;
  findCountdown: () => Promise<{ id: string; status: string } | null>;
  shelfCounts: () => Promise<Record<string, { servable: number; draft: number }>>;
  voiceEnabled: boolean;
  openHouseAgentId: string;
}

const truthy = (v: unknown) => v === true || v === 'true';

function defaultDeps(): ControlsDeps {
  return {
    getSetting: async (key) => (await import('../settingsService')).getSetting(key),
    findCountdown: async () => (await import('../openHouseCountdown')).findOpenHouseCountdownCampaign(),
    shelfCounts: async () => (await import('../mayaBrain/mayaBrainItems')).shelfCounts(),
    voiceEnabled: env.enableVoiceCalls,
    openHouseAgentId: env.synthflowOpenHouseAgentId,
  };
}

async function settle<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try { return { ok: true, value: await fn() }; } catch { return { ok: false }; }
}

export async function getExplorerControls(deps: ControlsDeps = defaultDeps()): Promise<ExplorerControls> {
  const [kill, countdown, autoReply, mirror, shelves] = await Promise.all([
    settle(() => deps.getSetting('system_kill_switch')),
    settle(() => deps.findCountdown()),
    settle(() => deps.getSetting('maya_email_autoreply_enabled')),
    settle(() => deps.getSetting('ghl_mirror_enabled')),
    settle(() => deps.shelfCounts()),
  ]);
  const c = countdown.ok ? countdown.value : null;
  return {
    killSwitch: kill.ok ? { active: truthy(kill.value), readable: true } : { active: null, readable: false },
    countdown: {
      campaignId: c?.id ?? null,
      status: c?.status ?? null,
      adminUrl: c ? `/admin/campaigns/${c.id}` : null,
      readable: countdown.ok,
    },
    switches: {
      mayaEmailAutoReply: autoReply.ok ? truthy(autoReply.value) : null,
      ghlMirror: mirror.ok ? truthy(mirror.value) : null,
      voiceCalls: deps.voiceEnabled,
      openHouseAgentConfigured: !!deps.openHouseAgentId,
    },
    shelves: shelves.ok ? shelves.value : null,
  };
}
