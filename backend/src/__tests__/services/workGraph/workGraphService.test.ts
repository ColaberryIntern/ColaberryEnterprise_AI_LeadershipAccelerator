import {
  createWorkUnit,
  listWorkUnitsForTicket,
  addWorkUnitDependency,
  getWorkGraphForTicket,
  WorkGraphValidationError,
} from '../../../services/workGraph/workGraphService';
import { TicketWorkUnit, WorkUnitDependency, ResourceLease } from '../../../models';

jest.mock('../../../models', () => ({
  TicketWorkUnit: { create: jest.fn(), findAll: jest.fn() },
  WorkUnitDependency: { create: jest.fn(), findAll: jest.fn() },
  ResourceLease: { findAll: jest.fn() },
}));

const workUnitCreate = TicketWorkUnit.create as unknown as jest.Mock;
const workUnitFindAll = TicketWorkUnit.findAll as unknown as jest.Mock;
const dependencyCreate = WorkUnitDependency.create as unknown as jest.Mock;
const dependencyFindAll = WorkUnitDependency.findAll as unknown as jest.Mock;
const leaseFindAll = ResourceLease.findAll as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// dependsOnWorkUnitId is Zod-validated as a real UUID (createWorkUnitDependencySchema),
// so every fixture below uses UUID-shaped ids, not short labels — this caught a real
// gap in an earlier draft of this file (short labels like 'wu-A' failed Zod's uuid()
// check before the cycle-detection logic under test was ever reached).
const WU_A = '11111111-1111-4111-8111-111111111111';
const WU_B = '22222222-2222-4222-8222-222222222222';
const WU_C = '33333333-3333-4333-8333-333333333333';
const WU_D = '44444444-4444-4444-8444-444444444444';

describe('createWorkUnit', () => {
  it('creates a work unit with defaults applied for a minimal valid input', async () => {
    workUnitCreate.mockResolvedValue({ id: 'wu-1', title: 'x' });
    await createWorkUnit('ticket-1', { title: 'Design the schema', requiredCapability: 'curriculum.design_module' });

    expect(workUnitCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: 'ticket-1',
        title: 'Design the schema',
        required_capability: 'curriculum.design_module',
        status: 'pending',
        risk_tier: 'R0',
        approval_policy: 'auto',
        eligible_parallelism: 1,
      })
    );
  });

  it('rejects malformed input (missing requiredCapability) before any write', async () => {
    await expect(createWorkUnit('ticket-1', { title: 'x' } as any)).rejects.toThrow(WorkGraphValidationError);
    expect(workUnitCreate).not.toHaveBeenCalled();
  });
});

describe('listWorkUnitsForTicket', () => {
  it('returns work units ordered by creation', async () => {
    workUnitFindAll.mockResolvedValue([{ id: 'wu-1' }]);
    const result = await listWorkUnitsForTicket('ticket-1');
    expect(result).toEqual([{ id: 'wu-1' }]);
    expect(workUnitFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ticket_id: 'ticket-1' } })
    );
  });
});

describe('addWorkUnitDependency', () => {
  it('creates a dependency edge for a valid, non-cyclic input', async () => {
    dependencyFindAll.mockResolvedValue([]); // no existing edges anywhere in the graph
    dependencyCreate.mockResolvedValue({ id: 'dep-1' });

    await addWorkUnitDependency(WU_A, { dependsOnWorkUnitId: WU_B });

    expect(dependencyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ work_unit_id: WU_A, depends_on_work_unit_id: WU_B, dependency_type: 'blocks' })
    );
  });

  it('rejects a self-referential dependency before any write', async () => {
    await expect(addWorkUnitDependency(WU_A, { dependsOnWorkUnitId: WU_A })).rejects.toThrow(
      WorkGraphValidationError
    );
    expect(dependencyCreate).not.toHaveBeenCalled();
  });

  it('rejects malformed input (non-uuid dependsOnWorkUnitId) before any write', async () => {
    await expect(addWorkUnitDependency(WU_A, { dependsOnWorkUnitId: 'not-a-uuid' } as any)).rejects.toThrow(
      WorkGraphValidationError
    );
    expect(dependencyCreate).not.toHaveBeenCalled();
  });

  it('rejects a dependency that would create a 2-node cycle (A->B, then B->A)', async () => {
    // Existing edge: A depends_on B (A -> B). Adding B depends_on A (B -> A)
    // would close the cycle.
    dependencyFindAll.mockImplementation(async (opts: any) => {
      if (opts.where.work_unit_id === WU_A) return [{ depends_on_work_unit_id: WU_B }];
      return [];
    });

    await expect(addWorkUnitDependency(WU_B, { dependsOnWorkUnitId: WU_A })).rejects.toThrow(
      /cycle/i
    );
    expect(dependencyCreate).not.toHaveBeenCalled();
  });

  it('rejects a dependency that would create a longer, 3-node cycle (A->B->C, then C->A)', async () => {
    // Existing: A depends_on B, B depends_on C. Adding C depends_on A closes the cycle.
    dependencyFindAll.mockImplementation(async (opts: any) => {
      if (opts.where.work_unit_id === WU_A) return [{ depends_on_work_unit_id: WU_B }];
      if (opts.where.work_unit_id === WU_B) return [{ depends_on_work_unit_id: WU_C }];
      return [];
    });

    await expect(addWorkUnitDependency(WU_C, { dependsOnWorkUnitId: WU_A })).rejects.toThrow(
      WorkGraphValidationError
    );
    expect(dependencyCreate).not.toHaveBeenCalled();
  });

  it('allows a valid diamond shape (A depends on B and C, both depend on D) — not a cycle', async () => {
    // Existing: B depends_on D, C depends_on D. Adding A depends_on B is fine.
    dependencyFindAll.mockImplementation(async (opts: any) => {
      if (opts.where.work_unit_id === WU_B) return [{ depends_on_work_unit_id: WU_D }];
      if (opts.where.work_unit_id === WU_C) return [{ depends_on_work_unit_id: WU_D }];
      return [];
    });
    dependencyCreate.mockResolvedValue({ id: 'dep-new' });

    await addWorkUnitDependency(WU_A, { dependsOnWorkUnitId: WU_B });
    expect(dependencyCreate).toHaveBeenCalled();
  });
});

describe('getWorkGraphForTicket', () => {
  it('returns an empty graph for a ticket with no work units (no DB calls beyond the initial lookup)', async () => {
    workUnitFindAll.mockResolvedValue([]);

    const result = await getWorkGraphForTicket('ticket-empty');

    expect(result).toEqual({ workUnits: [], dependencies: [] });
    expect(dependencyFindAll).not.toHaveBeenCalled();
    expect(leaseFindAll).not.toHaveBeenCalled();
  });

  it('attaches each work unit\'s active lease and includes dependency edges', async () => {
    workUnitFindAll.mockResolvedValue([
      { id: 'wu-1', title: 'Unit 1', status: 'in_progress', required_capability: 'bug.platform_fix', risk_tier: 'R0', assigned_agent_name: 'PlatformFixAgent', assigned_run_id: 'run-1' },
      { id: 'wu-2', title: 'Unit 2', status: 'pending', required_capability: 'curriculum.qa_check', risk_tier: 'R0', assigned_agent_name: null, assigned_run_id: null },
    ]);
    dependencyFindAll.mockResolvedValue([
      { id: 'dep-1', work_unit_id: 'wu-2', depends_on_work_unit_id: 'wu-1', dependency_type: 'blocks' },
    ]);
    leaseFindAll.mockResolvedValue([
      { id: 'lease-1', work_unit_id: 'wu-1', lease_owner: 'PlatformFixAgent', expires_at: new Date('2026-08-03T00:00:00Z') },
    ]);

    const result = await getWorkGraphForTicket('ticket-1');

    expect(result.workUnits).toHaveLength(2);
    expect(result.workUnits[0].activeLease).toMatchObject({ id: 'lease-1', lease_owner: 'PlatformFixAgent' });
    expect(result.workUnits[1].activeLease).toBeNull();
    expect(result.dependencies).toEqual([
      { id: 'dep-1', work_unit_id: 'wu-2', depends_on_work_unit_id: 'wu-1', dependency_type: 'blocks' },
    ]);
  });
});
