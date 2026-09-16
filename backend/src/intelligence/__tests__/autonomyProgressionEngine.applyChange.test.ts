/**
 * applyAutonomyChange writes provenance. Until 2026-09-15 it wrote
 * `triggered_by: 'admin'` for every caller, including the participant route
 * where a student adjusts their own process. These pin: the actor the caller
 * names is the actor recorded; a caller that names nobody is refused; the two
 * existing refusals (unknown process, invalid level) still hold.
 */
const mockFindByPk = jest.fn();
jest.mock('../../models/Capability', () => ({
  __esModule: true, default: { findByPk: (...a: any[]) => mockFindByPk(...a) },
}));
jest.mock('../../models/IntelligenceDecision', () => ({ __esModule: true, default: { findAll: jest.fn(async () => []) } }));
jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findAll: jest.fn(async () => []) } }));

import { applyAutonomyChange } from '../autonomyProgressionEngine';

const processRow = () => {
  const row: any = { autonomy_level: 'manual', autonomy_history: [], save: jest.fn(async () => undefined) };
  return row;
};

beforeEach(() => { jest.clearAllMocks(); });

describe('applyAutonomyChange', () => {
  it('records the actor the caller names, not a hardcoded one', async () => {
    const row = processRow();
    mockFindByPk.mockResolvedValue(row);
    await applyAutonomyChange('p1', 'assisted', 'User adjustment', 'participant:7c2e');
    expect(row.autonomy_level).toBe('assisted');
    expect(row.autonomy_history).toHaveLength(1);
    expect(row.autonomy_history[0]).toMatchObject({ from: 'manual', to: 'assisted', reason: 'User adjustment', triggered_by: 'participant:7c2e' });
    expect(row.autonomy_history[0].triggered_by).not.toBe('admin');
    expect(row.save).toHaveBeenCalledTimes(1);
  });

  it('an admin is recorded as that admin', async () => {
    const row = processRow();
    mockFindByPk.mockResolvedValue(row);
    await applyAutonomyChange('p1', 'supervised', 'Admin override', 'ali@colaberry.com');
    expect(row.autonomy_history[0].triggered_by).toBe('ali@colaberry.com');
  });

  it('refuses to write history with no actor, before touching the row', async () => {
    const row = processRow();
    mockFindByPk.mockResolvedValue(row);
    await expect(applyAutonomyChange('p1', 'assisted', 'x', '   ')).rejects.toThrow(/triggeredBy is required/);
    await expect(applyAutonomyChange('p1', 'assisted', 'x', undefined as unknown as string)).rejects.toThrow(/triggeredBy is required/);
    expect(row.autonomy_history).toEqual([]);
    expect(row.save).not.toHaveBeenCalled();
  });

  it('still refuses an unknown process and an invalid level', async () => {
    mockFindByPk.mockResolvedValue(null);
    await expect(applyAutonomyChange('missing', 'assisted', 'x', 'someone')).rejects.toThrow('Process not found');
    const row = processRow();
    mockFindByPk.mockResolvedValue(row);
    await expect(applyAutonomyChange('p1', 'godmode', 'x', 'someone')).rejects.toThrow('Invalid autonomy level');
    expect(row.save).not.toHaveBeenCalled();
  });

  it('appends to existing history rather than replacing it', async () => {
    const row = processRow();
    row.autonomy_history = [{ from: 'manual', to: 'assisted', reason: 'earlier', timestamp: '2026-09-01T00:00:00.000Z', triggered_by: 'ali@colaberry.com' }];
    row.autonomy_level = 'assisted';
    mockFindByPk.mockResolvedValue(row);
    await applyAutonomyChange('p1', 'supervised', 'next step', 'participant:7c2e');
    expect(row.autonomy_history.map((h: any) => h.triggered_by)).toEqual(['ali@colaberry.com', 'participant:7c2e']);
  });
});
