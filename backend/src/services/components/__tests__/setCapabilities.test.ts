/**
 * Tests for setCapabilities — the instant-save side-channel behind the Experience
 * Studio "Parts" toggle. Contract: (1) persist a validated set with a single plain
 * update and NO version bump (unlike updateComponent), (2) drop unknown/duplicate
 * ids so a stale client can't write garbage, (3) be idempotent (same set in => same
 * set persisted), (4) 404 when the component does not exist. Validation runs against
 * the REAL capabilityRegistry (left unmocked) so the id whitelist is genuinely tested.
 */

// Keep real DB + models out of the module graph; setCapabilities only needs findOne.
jest.mock('../../../config/database', () => ({
  sequelize: { transaction: jest.fn(), fn: jest.fn(), col: jest.fn(), query: jest.fn() },
}));
jest.mock('../../../models/CurriculumTypeDefinition', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/ComponentVersion', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/ComponentAnalytics', () => ({ __esModule: true, default: {} }));

import { setCapabilities } from '../componentService';
import CurriculumTypeDefinition from '../../../models/CurriculumTypeDefinition';

const findOne = CurriculumTypeDefinition.findOne as jest.Mock;

describe('componentService.setCapabilities', () => {
  let update: jest.Mock;
  beforeEach(() => {
    update = jest.fn(async () => {});
    findOne.mockReset();
    findOne.mockResolvedValue({ update });
  });

  it('persists a valid set and returns it (happy path)', async () => {
    const out = await setCapabilities('video-card', ['ai_chat', 'quiz']);
    expect(out).toEqual(['ai_chat', 'quiz']);
    expect(update).toHaveBeenCalledWith({ capabilities: ['ai_chat', 'quiz'] });
  });

  it('drops unknown ids and de-dupes (garbage/boundary input)', async () => {
    const out = await setCapabilities('video-card', ['ai_chat', 'ai_chat', 'not_a_real_cap', 'quiz', '']);
    expect(out).toEqual(['ai_chat', 'quiz']);
    expect(update).toHaveBeenCalledWith({ capabilities: ['ai_chat', 'quiz'] });
  });

  it('accepts clearing all parts (empty set)', async () => {
    const out = await setCapabilities('video-card', []);
    expect(out).toEqual([]);
    expect(update).toHaveBeenCalledWith({ capabilities: [] });
  });

  it('writes a single plain update with NO version bump', async () => {
    await setCapabilities('video-card', ['reflection']);
    expect(update).toHaveBeenCalledTimes(1);
    expect(Object.keys(update.mock.calls[0][0])).toEqual(['capabilities']); // no component_version, no snapshot
  });

  it('is idempotent — replaying the same set persists the same set', async () => {
    await setCapabilities('video-card', ['reflection']);
    await setCapabilities('video-card', ['reflection']);
    expect(update).toHaveBeenNthCalledWith(1, { capabilities: ['reflection'] });
    expect(update).toHaveBeenNthCalledWith(2, { capabilities: ['reflection'] });
  });

  it('404s when the component does not exist (failure path, no write)', async () => {
    findOne.mockResolvedValueOnce(null);
    await expect(setCapabilities('nope', ['quiz'])).rejects.toMatchObject({ status: 404 });
    expect(update).not.toHaveBeenCalled();
  });
});
