/**
 * architectPoints: the Architect Time Machine has no "Collect points" button, so
 * the finish screen is the student's only proof they were paid (2026-10-29 report:
 * "I don't have a way to get my points after completing"). These pin what it says
 * and that reopening a completed card retries a missed award without doubling it.
 */
jest.mock('../../progression/cardPointsService', () => ({
  resolveCardEngagementPoints: jest.fn(),
  awardCardCompletionPoints: jest.fn(),
}));

import { architectPointsView } from '../architectPoints';
import { resolveCardEngagementPoints, awardCardCompletionPoints } from '../../progression/cardPointsService';

const mockResolve = resolveCardEngagementPoints as jest.Mock;
const mockAward = awardCardCompletionPoints as jest.Mock;
const card = { id: 'c1', type: 'architect_mindset', points: { learning: 100, builder: 40, community: 20 } };

beforeEach(() => { jest.clearAllMocks(); mockResolve.mockResolvedValue(160); });

describe('architectPointsView', () => {
  it('reports the card worth and does not award while the experience is unfinished', async () => {
    await expect(architectPointsView('e1', card, false)).resolves.toEqual({ value: 160, awarded_now: 0 });
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('a completed card retries the idempotent award (heals a missed first award)', async () => {
    mockAward.mockResolvedValue(160);
    await expect(architectPointsView('e1', card, true)).resolves.toEqual({ value: 160, awarded_now: 160 });
    expect(mockAward).toHaveBeenCalledWith('e1', card);
  });

  it('a completed card already on the ledger reports 0 newly awarded (no double pay)', async () => {
    mockAward.mockResolvedValue(0);
    await expect(architectPointsView('e1', card, true)).resolves.toEqual({ value: 160, awarded_now: 0 });
  });

  it('a points-config failure degrades to 0 instead of breaking the card', async () => {
    mockResolve.mockRejectedValue(new Error('db down'));
    mockAward.mockResolvedValue(0);
    await expect(architectPointsView('e1', card, true)).resolves.toEqual({ value: 0, awarded_now: 0 });
  });
});
