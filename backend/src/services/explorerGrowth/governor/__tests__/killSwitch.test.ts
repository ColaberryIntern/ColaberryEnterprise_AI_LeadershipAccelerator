/** OH1k: Explorer Growth honors the one global kill switch, and an unreadable switch holds. */
import { governorKillSwitch } from '../killSwitch';
import { hardStopReason } from '../candidates/hardStop';

const base = { converted: false, unsubscribed: false, dnc: false, consentRevoked: false, campaignInactive: false };

describe('governorKillSwitch', () => {
  it('is on when system_kill_switch is on, and the decision stops with kill_switch', async () => {
    const on = await governorKillSwitch({ readStrict: async () => true });
    expect(on).toBe(true);
    expect(hardStopReason({ hardStop: { ...base, killSwitch: on } })).toBe('kill_switch');
  });
  it('is off when the switch is off, and nothing stops', async () => {
    const on = await governorKillSwitch({ readStrict: async () => false });
    expect(on).toBe(false);
    expect(hardStopReason({ hardStop: { ...base, killSwitch: on } })).toBeNull();
  });
  it('fails closed: an unreadable switch counts as on', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await governorKillSwitch({ readStrict: async () => { throw new Error('db down'); } })).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
