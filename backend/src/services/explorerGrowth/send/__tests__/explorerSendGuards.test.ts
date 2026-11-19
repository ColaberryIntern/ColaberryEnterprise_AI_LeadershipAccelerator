/**
 * OH1o: the moment an approved Explorer email would leave, every guard is checked again, and any
 * unreadable answer blocks. Nothing here sends.
 */
import {
  ExplorerSendBlockedError, explorerSendBlock, isExplorerGrowthRow, leadIdOf, type ExplorerSendGuardDeps,
} from '../explorerSendGuards';

const row = { composed_by: 'explorer_growth:d1', recipient_ref: 'lead:42', correlation_id: 'se1' };

function deps(over: Partial<ExplorerSendGuardDeps> = {}): ExplorerSendGuardDeps {
  return {
    sendEnabled: async () => true,
    killSwitchOn: async () => false,
    sendable: async () => ({ sendable: true }),
    inCountdown: async () => false,
    recentTouches: async () => ({ outbound24h: 0, countdownNear: 0 }),
    hoursSinceLastExplorerSend: async () => null,
    minHours: async () => 72,
    draftCurrent: async () => true,
    ...over,
  };
}

describe('explorerSendBlock', () => {
  it('passes when every guard passes', async () => {
    expect(await explorerSendBlock(row, deps())).toBeNull();
  });
  it.each([
    ['send_disabled', { sendEnabled: async () => false }],
    ['kill_switch', { killSwitchOn: async () => true }],
    ['not_current_draft', { draftCurrent: async () => false }],
    ['not_sendable', { sendable: async () => ({ sendable: false, reason: 'lead_unsubscribed' }) }],
    ['open_house_hold', { inCountdown: async () => true }],
    ['within_24h', { recentTouches: async () => ({ outbound24h: 1, countdownNear: 0 }) }],
    ['within_24h', { recentTouches: async () => ({ outbound24h: 0, countdownNear: 1 }) }],
    ['cadence', { hoursSinceLastExplorerSend: async () => 50 }],
  ] as Array<[string, Partial<ExplorerSendGuardDeps>]>)('blocks: %s', async (block, over) => {
    expect(await explorerSendBlock(row, deps(over))).toBe(block);
  });
  it('the cadence floor is 24 hours whatever the rule says', async () => {
    expect(await explorerSendBlock(row, deps({ minHours: async () => 1, hoursSinceLastExplorerSend: async () => 10 }))).toBe('cadence');
    expect(await explorerSendBlock(row, deps({ minHours: async () => 24, hoursSinceLastExplorerSend: async () => 30 }))).toBeNull();
  });
  it('fails closed when a guard cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await explorerSendBlock(row, deps({ sendable: async () => { throw new Error('db down'); } }))).toBe('kill_switch');
    warn.mockRestore();
  });
  it('refuses a row with no lead or no draft id', async () => {
    expect(await explorerSendBlock({ ...row, recipient_ref: 'lead:abc' }, deps())).toBe('bad_row');
    expect(await explorerSendBlock({ ...row, correlation_id: '' }, deps())).toBe('bad_row');
  });
});

describe('helpers', () => {
  it('recognizes an Explorer row and its lead', () => {
    expect(isExplorerGrowthRow(row)).toBe(true);
    expect(isExplorerGrowthRow({ composed_by: 'maya_reply:42' })).toBe(false);
    expect(leadIdOf(row)).toBe(42);
  });
  it('a blocked approval records its reason as the failure class', () => {
    expect(new ExplorerSendBlockedError('within_24h').name).toBe('ExplorerSendBlocked:within_24h');
  });
});
