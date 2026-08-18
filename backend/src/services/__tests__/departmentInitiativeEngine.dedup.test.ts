/**
 * Coverage for the dedup-key fix in `createStrategicInitiative()`
 * (departmentInitiativeEngine.ts), part of the Agent Ticket Standard audit of the 16
 * department Strategy Architect agents (2026-08-18, session CC-20260818-a7d2). Confirmed live
 * root cause: exact-title-text dedup never matched an LLM-paraphrased re-statement of the same
 * finding, so a new `Initiative` row (and ticket) was created every 6h cycle, forever. See
 * departmentInitiativeDedupKey.test.ts for the pure key-derivation coverage; this file covers
 * the I/O function that consumes it.
 */
jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn(), authenticate: jest.fn(), close: jest.fn(), literal: jest.fn() },
}));
jest.mock('../../models', () => ({
  Department: { findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  Initiative: { findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() },
  DepartmentEvent: { create: jest.fn(), count: jest.fn(), findAll: jest.fn() },
  AiAgent: { findAll: jest.fn() },
  Ticket: {},
}));
jest.mock('../ticketService', () => ({ createTicket: jest.fn() }));

import { Op } from 'sequelize';
import { Initiative, DepartmentEvent } from '../../models';
import { createStrategicInitiative, type CreateInitiativeInput } from '../departmentInitiativeEngine';
import { deriveOpportunityDedupKey, toDedupKeyTag } from '../agents/strategy/departmentInitiativeDedupKey';

// Go through the SAME mocked barrel departmentInitiativeEngine.ts itself imports from
// ('../models' relative to that file == '../../models' relative to this test file) — never
// import a model class directly by its own file path, which would bypass the mock and run the
// real Sequelize Model.init() against a fake sequelize object (crashes with "Cannot read
// properties of undefined (reading 'define')").
const mockFindOne = Initiative.findOne as unknown as jest.Mock;
const mockCreate = Initiative.create as unknown as jest.Mock;
const mockEventCreate = DepartmentEvent.create as unknown as jest.Mock;

const baseInput: CreateInitiativeInput = {
  department_id: 'dept-1',
  title: 'AI-Driven Predictive Analytics for Student Retention',
  description: 'desc',
  priority: 'high',
  created_by_agent: 'StudentSuccessArchitect',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEventCreate.mockResolvedValue({});
});

describe('createStrategicInitiative — opportunity-key dedup (happy path)', () => {
  it('reuses an existing initiative found by dedup-key tag, even when the title text differs', async () => {
    const key = deriveOpportunityDedupKey('health_gap');
    const existingRow = { id: 'init-existing', title: 'Some earlier LLM phrasing of the same finding' };
    mockFindOne.mockResolvedValue(existingRow);

    const result = await createStrategicInitiative({
      ...baseInput,
      title: 'AI-Driven Predictive Analytics for Student Retention Enhancement', // different text
      opportunity_key: key,
    });

    expect(result).toBe(existingRow);
    expect(mockCreate).not.toHaveBeenCalled(); // no duplicate row created
    expect(mockFindOne).toHaveBeenCalledWith({
      where: {
        department_id: 'dept-1',
        status: { [Op.in]: ['planned', 'active'] },
        tags: { [Op.contains]: [toDedupKeyTag(key)] },
      },
    });
  });

  it('creates a new row and stamps the dedup-key tag when no existing match is found', async () => {
    mockFindOne.mockResolvedValue(null);
    const created = { id: 'init-new' };
    mockCreate.mockResolvedValue(created);
    const key = deriveOpportunityDedupKey('no_active_work');

    const result = await createStrategicInitiative({ ...baseInput, opportunity_key: key });

    expect(result).toBe(created);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.tags).toContain(toDedupKeyTag(key));
    expect(createArg.status).toBe('planned');
  });
});

describe('createStrategicInitiative — failure/boundary paths', () => {
  it('falls back to title-based dedup when opportunity_key is omitted (backward compatibility)', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'init-legacy' });

    await createStrategicInitiative({ ...baseInput }); // no opportunity_key

    expect(mockFindOne).toHaveBeenCalledWith({
      where: {
        department_id: 'dept-1',
        status: { [Op.in]: ['planned', 'active'] },
        title: baseInput.title,
      },
    });
  });

  it('does not crash and creates a fresh row when tags/description are empty (boundary)', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'init-empty' });
    const key = deriveOpportunityDedupKey('other');

    await createStrategicInitiative({
      department_id: 'dept-2',
      title: '',
      description: '',
      priority: 'low',
      created_by_agent: 'GrowthExperimentArchitect',
      opportunity_key: key,
      tags: [],
    });

    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg.tags).toEqual([toDedupKeyTag(key)]);
  });
});
