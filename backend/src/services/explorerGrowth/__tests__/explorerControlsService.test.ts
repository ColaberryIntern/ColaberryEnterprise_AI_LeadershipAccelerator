/**
 * OH1k: the one front door reads every switch that decides what reaches a learner, and says
 * "unreadable" rather than guessing "off" when a read fails.
 */
import { getExplorerControls, type ControlsDeps } from '../explorerControlsService';

function deps(over: Partial<ControlsDeps> = {}): ControlsDeps {
  const settings: Record<string, unknown> = { system_kill_switch: 'false', maya_email_autoreply_enabled: false, ghl_mirror_enabled: false };
  return {
    getSetting: async (k) => settings[k],
    findCountdown: async () => ({ id: '45c68da0-4a07-4f10-a38a-a5920fda213c', status: 'draft' }),
    shelfCounts: async () => ({ ai_fact: { servable: 0, draft: 2 }, build_prompt: { servable: 1, draft: 3 } }),
    voiceEnabled: false,
    openHouseAgentId: '',
    ...over,
  };
}

describe('getExplorerControls', () => {
  it('shows the kill switch, the countdown as an event rule with its link, every switch OFF, and the shelves', async () => {
    const c = await getExplorerControls(deps());
    expect(c.killSwitch).toEqual({ active: false, readable: true });
    expect(c.countdown).toEqual({
      campaignId: '45c68da0-4a07-4f10-a38a-a5920fda213c', status: 'draft',
      adminUrl: '/admin/campaigns/45c68da0-4a07-4f10-a38a-a5920fda213c', readable: true,
    });
    // OH1o: Explorer Growth sending (via Outbound approvals) is a switch too, OFF.
    expect(c.switches).toEqual({ explorerGrowthSend: false, mayaEmailAutoReply: false, ghlMirror: false, voiceCalls: false, openHouseAgentConfigured: false });
    expect(c.shelves?.build_prompt).toEqual({ servable: 1, draft: 3 });
  });
  it('reads a string "true" kill switch as active', async () => {
    const c = await getExplorerControls(deps({ getSetting: async (k) => (k === 'system_kill_switch' ? 'true' : false) }));
    expect(c.killSwitch.active).toBe(true);
  });
  it('says unreadable instead of guessing off when a read fails', async () => {
    const c = await getExplorerControls(deps({
      getSetting: async () => { throw new Error('db down'); },
      findCountdown: async () => { throw new Error('db down'); },
      shelfCounts: async () => { throw new Error('db down'); },
    }));
    expect(c.killSwitch).toEqual({ active: null, readable: false });
    expect(c.switches.mayaEmailAutoReply).toBeNull();
    expect(c.switches.ghlMirror).toBeNull();
    expect(c.countdown.readable).toBe(false);
    expect(c.shelves).toBeNull();
  });
  it('reports no countdown campaign plainly', async () => {
    const c = await getExplorerControls(deps({ findCountdown: async () => null }));
    expect(c.countdown).toEqual({ campaignId: null, status: null, adminUrl: null, readable: true });
  });
});
