import {
  acquireLease,
  releaseLease,
  heartbeatLease,
  expireStaleLeases,
  findMostRecentFailedRun,
  retryFailedRun,
} from '../../../services/workGraph/workCoordinatorService';
import { ResourceLease, AgentRun } from '../../../models';
import { dispatchTicketToAgent } from '../../../services/ticketAgentDispatcher';

// ProofDesk Work Graph (Milestone 3) — Work Coordinator tests. Follows this repo's
// established convention for DB-touching services (see workLedgerService.test.ts):
// models are mocked, no real Postgres connection is made in local jest runs. The
// two-concurrent-acquireLease-calls boundary test uses Promise.all against a
// mocked ResourceLease.create that simulates Postgres's own unique-constraint
// behavior on the partial index (resource_key WHERE status='active') — the exact
// same split T002 already proved on the database side (a real throwaway
// postgres:15 container) is applied here on the application side.

jest.mock('../../../models', () => ({
  ResourceLease: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  AgentRun: { findOne: jest.fn() },
}));
jest.mock('../../../services/ticketAgentDispatcher', () => ({ dispatchTicketToAgent: jest.fn() }));

const findOne = ResourceLease.findOne as unknown as jest.Mock;
const findByPk = ResourceLease.findByPk as unknown as jest.Mock;
const create = ResourceLease.create as unknown as jest.Mock;
const update = ResourceLease.update as unknown as jest.Mock;
const agentRunFindOne = AgentRun.findOne as unknown as jest.Mock;
const mockDispatch = dispatchTicketToAgent as unknown as jest.Mock;

const baseInput = {
  resourceKey: 'file:backend/src/services/x.ts',
  leaseOwner: 'PlatformFixAgent',
  idempotencyKey: 'lease:ticket-1:x.ts',
};

beforeEach(() => {
  jest.clearAllMocks();
  update.mockResolvedValue([0]); // expireStaleLeases: nothing to expire by default
  findOne.mockResolvedValue(null); // no existing idempotency-key row by default
});

describe('acquireLease — happy path', () => {
  it('acquires successfully when the resource_key is free', async () => {
    create.mockResolvedValueOnce({ id: 'lease-1', status: 'active', resource_key: baseInput.resourceKey });

    const result = await acquireLease(baseInput);

    expect(result.acquired).toBe(true);
    expect(result.lease).toMatchObject({ id: 'lease-1', status: 'active' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      resource_key: baseInput.resourceKey,
      lease_owner: baseInput.leaseOwner,
      idempotency_key: baseInput.idempotencyKey,
      status: 'active',
    });
  });

  it('calls expireStaleLeases (via ResourceLease.update) before attempting to create', async () => {
    create.mockResolvedValueOnce({ id: 'lease-1', status: 'active' });
    await acquireLease(baseInput);
    expect(update).toHaveBeenCalledWith(
      { status: 'expired' },
      expect.objectContaining({
        where: expect.objectContaining({ resource_key: baseInput.resourceKey, status: 'active' }),
      })
    );
  });
});

describe('acquireLease — idempotency (duplicate key = no-op, not an error)', () => {
  it('returns the existing row unchanged and never calls create when the idempotency key already exists', async () => {
    const existing = { id: 'lease-existing', status: 'active', idempotency_key: baseInput.idempotencyKey };
    findOne.mockResolvedValueOnce(existing);

    const result = await acquireLease(baseInput);

    expect(result).toEqual({ acquired: true, lease: existing });
    expect(create).not.toHaveBeenCalled();
  });

  it('reflects the row\'s CURRENT (non-active) state honestly rather than claiming acquired', async () => {
    const existing = { id: 'lease-existing', status: 'released', idempotency_key: baseInput.idempotencyKey };
    findOne.mockResolvedValueOnce(existing);

    const result = await acquireLease(baseInput);

    expect(result).toEqual({ acquired: false, lease: existing });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('acquireLease — collision (boundary, mandatory per CLAUDE.md)', () => {
  it('two concurrent acquireLease calls on the same resource_key: exactly one acquired, one rejected with conflictWith — never both, never neither', async () => {
    // Simulates Postgres's own partial-unique-index behavior (proven for real in
    // T002): the first create() to actually run wins, the second throws a unique
    // constraint violation.
    const winnerLease = { id: 'lease-winner', status: 'active', resource_key: baseInput.resourceKey };
    const raceError = new Error('duplicate key value violates unique constraint "idx_resource_leases_active_resource_key"');
    raceError.name = 'SequelizeUniqueConstraintError';

    create.mockResolvedValueOnce(winnerLease).mockRejectedValueOnce(raceError);
    // Both calls use distinct idempotency keys (two different agents/attempts
    // racing for the same resource), so the idempotency-key lookup misses for
    // both, and the underlying resource_key collision is what's actually tested.
    findOne
      .mockResolvedValueOnce(null) // call A: idempotency-key lookup miss
      .mockResolvedValueOnce(null) // call B: idempotency-key lookup miss
      .mockResolvedValueOnce(winnerLease); // call B's post-race re-fetch of the winner

    const inputA = { ...baseInput, idempotencyKey: 'lease:agent-a:x.ts', leaseOwner: 'AgentA' };
    const inputB = { ...baseInput, idempotencyKey: 'lease:agent-b:x.ts', leaseOwner: 'AgentB' };

    const [resultA, resultB] = await Promise.all([acquireLease(inputA), acquireLease(inputB)]);

    const acquiredResults = [resultA, resultB].filter((r) => r.acquired);
    const rejectedResults = [resultA, resultB].filter((r) => !r.acquired);

    expect(acquiredResults).toHaveLength(1);
    expect(rejectedResults).toHaveLength(1);
    expect(rejectedResults[0].conflictWith).toEqual(winnerLease);
    expect(rejectedResults[0].lease).toBeNull();
  });

  it('does not throw the raw DB error to the caller on a collision', async () => {
    const raceError = new Error('duplicate key value violates unique constraint');
    raceError.name = 'SequelizeUniqueConstraintError';
    create.mockRejectedValueOnce(raceError);
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'winner', status: 'active' });

    await expect(acquireLease(baseInput)).resolves.toMatchObject({ acquired: false });
  });

  it('rethrows a non-unique-constraint DB error (not a collision, a real failure)', async () => {
    const dbError = new Error('connection terminated');
    create.mockRejectedValueOnce(dbError);

    await expect(acquireLease(baseInput)).rejects.toThrow('connection terminated');
  });
});

describe('expireStaleLeases', () => {
  it('marks active leases past their expiry as expired for the given resource_key', async () => {
    update.mockResolvedValueOnce([2]);
    const count = await expireStaleLeases('file:x.ts');
    expect(count).toBe(2);
    expect(update).toHaveBeenCalledWith(
      { status: 'expired' },
      expect.objectContaining({ where: expect.objectContaining({ resource_key: 'file:x.ts', status: 'active' }) })
    );
  });

  it('a lease with expires_at in the past does not block a new acquire on the same key', async () => {
    // expireStaleLeases (called internally at the top of acquireLease) reports it
    // expired 1 row; the subsequent create() then succeeds normally.
    update.mockResolvedValueOnce([1]);
    create.mockResolvedValueOnce({ id: 'lease-new', status: 'active' });

    const result = await acquireLease(baseInput);
    expect(result.acquired).toBe(true);
  });
});

describe('releaseLease', () => {
  it('releases an active lease', async () => {
    const leaseInstance = { id: 'lease-1', status: 'active', update: jest.fn().mockResolvedValue(undefined) };
    findByPk.mockResolvedValueOnce(leaseInstance);

    const result = await releaseLease('lease-1');

    expect(result.released).toBe(true);
    expect(leaseInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'released' })
    );
  });

  it('is a no-op (not an error) when releasing an already-released lease', async () => {
    findByPk.mockResolvedValueOnce({ id: 'lease-1', status: 'released' });
    const result = await releaseLease('lease-1');
    expect(result.released).toBe(false);
  });

  it('returns released:false for a non-existent lease id', async () => {
    findByPk.mockResolvedValueOnce(null);
    const result = await releaseLease('does-not-exist');
    expect(result.released).toBe(false);
  });

  it('rejects release with a mismatched cancellation token', async () => {
    const leaseInstance = { id: 'lease-1', status: 'active', cancellation_token: 'token-abc', update: jest.fn() };
    findByPk.mockResolvedValueOnce(leaseInstance);

    await expect(releaseLease('lease-1', { cancellationToken: 'wrong-token' })).rejects.toThrow(
      'Invalid cancellation token'
    );
    expect(leaseInstance.update).not.toHaveBeenCalled();
  });
});

describe('heartbeatLease', () => {
  it('extends expiry and records heartbeat_at for an active lease', async () => {
    const leaseInstance = { id: 'lease-1', status: 'active', update: jest.fn().mockResolvedValue(undefined) };
    findByPk.mockResolvedValueOnce(leaseInstance);

    const result = await heartbeatLease('lease-1');

    expect(result.heartbeat).toBe(true);
    expect(leaseInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({ heartbeat_at: expect.any(Date), expires_at: expect.any(Date) })
    );
  });

  it('cannot revive a non-active lease via heartbeat', async () => {
    findByPk.mockResolvedValueOnce({ id: 'lease-1', status: 'expired', update: jest.fn() });
    const result = await heartbeatLease('lease-1');
    expect(result.heartbeat).toBe(false);
  });
});

describe('findMostRecentFailedRun (retry lineage support)', () => {
  it('finds the most recent failed AgentRun for a ticket', async () => {
    agentRunFindOne.mockResolvedValueOnce({ id: 'run-1', status: 'failed' });
    const result = await findMostRecentFailedRun('ticket-1');
    expect(result).toMatchObject({ id: 'run-1' });
    expect(agentRunFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ticket_id: 'ticket-1', status: 'failed' } })
    );
  });

  it('returns null when the ticket has no failed runs', async () => {
    agentRunFindOne.mockResolvedValueOnce(null);
    const result = await findMostRecentFailedRun('ticket-1');
    expect(result).toBeNull();
  });
});

describe('retryFailedRun (T008)', () => {
  it('re-dispatches with retryOfRunId set to the most recent failed run\'s id', async () => {
    agentRunFindOne.mockResolvedValueOnce({ id: 'run-original-failed', status: 'failed' });
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    mockDispatch.mockResolvedValueOnce(agentResult);

    const result = await retryFailedRun('ticket-1');

    expect(mockDispatch).toHaveBeenCalledWith('ticket-1', { retryOfRunId: 'run-original-failed' });
    expect(result).toBe(agentResult);
  });

  it('does nothing and returns null when there is no failed run to retry', async () => {
    agentRunFindOne.mockResolvedValueOnce(null);
    const result = await retryFailedRun('ticket-1');
    expect(result).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
