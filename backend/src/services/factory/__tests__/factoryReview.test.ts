/**
 * requestChanges records a 'changes_requested' review as a companion record (never touching the
 * immutable document). Mock the model (no DB): it writes the actor + trimmed reason against the
 * reviewed version, and refuses a blank reason before any write.
 */
const create = jest.fn();
jest.mock('../../../models/ContractProcessReview', () => ({ __esModule: true, default: { create: (...a: any[]) => create(...a) } }));

import { requestChanges, ReviewValidationError } from '../factoryReview';

beforeEach(() => jest.clearAllMocks());

describe('requestChanges', () => {
  it('records a changes_requested review with the actor and trimmed reason', async () => {
    create.mockResolvedValue({ id: 'rev-1', created_at: new Date('2026-09-21T00:00:00Z') });
    const dto = await requestChanges({
      deliveryProjectId: 'dp-1', trackType: 'solution_build', reviewedVersion: 2,
      reason: '  needs a clearer accountable owner  ', requestedBy: 'ali@colaberry.com',
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      delivery_project_id: 'dp-1', track_type: 'solution_build', reviewed_version: 2,
      decision: 'changes_requested', reason: 'needs a clearer accountable owner', requested_by: 'ali@colaberry.com',
    });
    expect(dto).toMatchObject({ id: 'rev-1', decision: 'changes_requested', reason: 'needs a clearer accountable owner' });
    expect(dto.created_at).toBe('2026-09-21T00:00:00.000Z');
  });

  it('refuses a blank reason with ReviewValidationError (400) and writes nothing', async () => {
    await expect(requestChanges({
      deliveryProjectId: 'dp-1', trackType: 'solution_build', reviewedVersion: 1, reason: '   ', requestedBy: 'ali',
    })).rejects.toBeInstanceOf(ReviewValidationError);
    expect(create).not.toHaveBeenCalled();
  });
});
