/**
 * TimelineCard's afterCreate/afterUpdate CAPE stamp hook (`capeSkillMappingHook`,
 * design doc §7). Tests the exported handler function DIRECTLY, bypassing Sequelize's
 * own hook-execution machinery entirely — this is what a plain-object mock instance
 * (not a live Sequelize model instance) is testing: the actual code every publish
 * path runs, without requiring a live database connection.
 *
 * The critical property under test: a stamp failure must NEVER surface as a thrown
 * error from the hook, or Sequelize would abort the `create`/`update` transaction it
 * is attached to — a card publish/edit must never fail because of a CAPE bookkeeping
 * problem (Failure-First Design, same non-fatal contract as
 * capeTimelineEvidenceBridge.ts).
 */
jest.mock('../../services/cape/capeCardSkillMappingService', () => ({
  stampIfPublished: jest.fn(),
}));

import { stampIfPublished } from '../../services/cape/capeCardSkillMappingService';
import { capeSkillMappingHook } from '../TimelineCard';

const mockStamp = stampIfPublished as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('capeSkillMappingHook', () => {
  it('happy path: delegates to stampIfPublished with the instance\'s id/type/week/visibility', async () => {
    mockStamp.mockResolvedValue(undefined);
    const instance: any = { id: 'c1', type: 'knowledge_check', week: 4, visibility: 'published' };
    await capeSkillMappingHook(instance);
    expect(mockStamp).toHaveBeenCalledWith({ id: 'c1', type: 'knowledge_check', week: 4, visibility: 'published' });
  });

  it('failure: a thrown error inside stampIfPublished never propagates out of the hook — the create/update transaction the hook is attached to must never abort', async () => {
    mockStamp.mockRejectedValue(new Error('unexpected failure'));
    const instance: any = { id: 'c1', type: 'knowledge_check', week: 4, visibility: 'published' };
    await expect(capeSkillMappingHook(instance)).resolves.toBeUndefined();
  });

  it('failure: even a synchronous throw (e.g. a broken dynamic import) is caught, not just a rejected promise', async () => {
    mockStamp.mockImplementation(() => { throw new Error('sync failure'); });
    const instance: any = { id: 'c1', type: 'knowledge_check', week: 4, visibility: 'published' };
    await expect(capeSkillMappingHook(instance)).resolves.toBeUndefined();
  });
});
