/**
 * The "Campaign approved" executive event must be written before approveCampaign returns.
 * It used to be fire-and-forget, so a script that exited right after approving (how the Open
 * House follow-up was approved on 2026-11-21) closed the DB first and the event was lost.
 */
const emit = jest.fn();
const update = jest.fn();
const reload = jest.fn();
jest.mock('../executiveAwarenessService', () => ({ emitExecutiveEvent: (...a: unknown[]) => emit(...a) }));
jest.mock('../campaignLinkService', () => ({ generateTrackedLink: jest.fn().mockResolvedValue(undefined), validateCampaignForPublish: jest.fn() }));
jest.mock('../../models/Campaign', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));

import Campaign from '../../models/Campaign';
import { approveCampaign, recordApprovalEvent } from '../campaignApprovalService';

const row = () => ({ name: 'Open House Follow-up (Maya)', approval_status: 'pending_approval', channel: 'email', destination_path: '/open-house', update, reload: reload.mockResolvedValue('reloaded') });

beforeEach(() => {
  jest.clearAllMocks();
  (Campaign.findByPk as jest.Mock).mockResolvedValue(row());
});

describe('approval events are awaited, not fire-and-forget', () => {
  it('has written the approved event by the time approveCampaign resolves', async () => {
    let written = false;
    emit.mockImplementation(() => new Promise((r) => setTimeout(() => { written = true; r(null); }, 20)));
    await approveCampaign('c1', 'admin-1');
    expect(written).toBe(true);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Campaign approved', entityId: 'c1' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ approval_status: 'approved', approved_by: 'admin-1' }));
  });

  it('a feed failure is logged and never undoes or blocks the approval', async () => {
    emit.mockRejectedValue(Object.assign(new Error('connection closed'), { name: 'ConnectionError' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(approveCampaign('c1', 'admin-1')).resolves.toBe('reloaded');
    expect(update).toHaveBeenCalled();
    const logged = warn.mock.calls.map((c) => String(c[0])).find((s) => s.includes('campaign_approval_event_failed'));
    expect(logged).toContain('ConnectionError');
    warn.mockRestore();
  });

  it('recordApprovalEvent never throws', async () => {
    emit.mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(recordApprovalEvent({ category: 'campaign', severity: 'info', title: 't', description: 'd' } as any)).resolves.toBeUndefined();
  });
});
