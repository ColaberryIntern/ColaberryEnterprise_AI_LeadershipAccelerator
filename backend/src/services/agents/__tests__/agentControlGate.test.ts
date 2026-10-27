/**
 * Whether an operator's controls actually contain an agent.
 *
 * The defect these pin: Pause writes `status: 'paused'` and leaves `enabled` TRUE, and two of
 * the four run wrappers checked `enabled` only. So pause did nothing for AutonomousEngine,
 * AICOOStrategicCycle, MetaAgentLoop, CoryEvolutionCycle and CampaignHealthScanner. Found by
 * Quincy Ninying while building Ellis (his finding 32), with the mid-run overwrite as 33.
 */

const mockUpdate = jest.fn(async (..._a: unknown[]): Promise<any> => [1]);

// Mocks the model file directly, matching how the gate imports it. Mocking the `models` barrel
// instead would not intercept it, and importing the barrel is what broke agentRunTracker's suite.
jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { update: (...a: unknown[]) => mockUpdate(...a) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  agentControlDecision, logControlSkip, completeRunPreservingControls,
} = require('../agentControlGate');

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue([1]);
});

describe('agentControlDecision', () => {
  it('runs an enabled, idle agent', () => {
    expect(agentControlDecision({ enabled: true, status: 'idle' })).toEqual({ run: true });
  });

  it('stops a disabled agent', () => {
    expect(agentControlDecision({ enabled: false, status: 'idle' }))
      .toEqual({ run: false, reason: 'disabled' });
  });

  it('stops a PAUSED agent even though enabled is still true', () => {
    // The whole defect in one assertion. Pause leaves enabled true, so a gate reading only
    // `enabled` lets a paused agent run.
    expect(agentControlDecision({ enabled: true, status: 'paused' }))
      .toEqual({ run: false, reason: 'paused' });
  });

  it('reports disabled rather than paused when both are true', () => {
    // Disable is the stronger statement and the one an operator should be told about.
    expect(agentControlDecision({ enabled: false, status: 'paused' }))
      .toEqual({ run: false, reason: 'disabled' });
  });

  it('runs an agent whose status is running, so a wrapper does not block its own retry', () => {
    expect(agentControlDecision({ enabled: true, status: 'running' })).toEqual({ run: true });
  });

  it('runs an agent with a null or missing status rather than guessing', () => {
    expect(agentControlDecision({ enabled: true, status: null })).toEqual({ run: true });
    expect(agentControlDecision({ enabled: true })).toEqual({ run: true });
  });

  it('treats an error status as runnable, since error is not a control', () => {
    // Only an operator's disable or pause contains an agent. A failed previous run does not.
    expect(agentControlDecision({ enabled: true, status: 'error' })).toEqual({ run: true });
  });
});

describe('logControlSkip', () => {
  it('emits structured JSON naming the agent and the reason', () => {
    // A silent skip produces no signal anywhere, because the missed-run detector only
    // evaluates enabled agents. Before this was shared, two wrappers logged a plain line and
    // one logged nothing.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    logControlSkip('MetaAgentLoop', { enabled: true, status: 'paused' }, { run: false, reason: 'paused' });

    const payload = JSON.parse(warn.mock.calls[0][0] as string);
    expect(payload).toMatchObject({
      level: 'warn',
      // Keeps the name cronInstrumentation already emitted. It is asserted three times in
      // agentDomain/capabilities/platform.json as a published platform capability, so renaming
      // it to suit three non-cron callers would break a documented contract.
      event: 'cron_job_skipped_disabled',
      outcome: 'partial',
      context: { agent_name: 'MetaAgentLoop', enabled: true, status: 'paused', reason: 'paused' },
    });
    warn.mockRestore();
  });
});

describe('completeRunPreservingControls', () => {
  it('writes the status when the row is still running', async () => {
    const out = await completeRunPreservingControls('a1', { status: 'idle', run_count: 5 });

    expect(out).toEqual({ statusWritten: true });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][1]).toMatchObject({
      where: { id: 'a1', status: 'running' },
    });
  });

  it('gates the status write on status = running, not on the id alone', async () => {
    // Without that predicate the write is unconditional and erases a mid-run pause, which is
    // the whole of finding 33.
    await completeRunPreservingControls('a1', { status: 'idle', run_count: 5 });

    expect((mockUpdate.mock.calls[0][1] as any).where.status).toBe('running');
  });

  it('keeps a pause set mid-run, and still records the bookkeeping', async () => {
    mockUpdate.mockResolvedValueOnce([0]).mockResolvedValueOnce([1]);

    const out = await completeRunPreservingControls('a1', {
      status: 'idle', run_count: 5, avg_duration_ms: 120,
    });

    expect(out).toEqual({ statusWritten: false });
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    // Second write carries the counts but NOT the status.
    const second = mockUpdate.mock.calls[1][0] as any;
    expect(second).toEqual({ run_count: 5, avg_duration_ms: 120 });
    expect(second.status).toBeUndefined();
  });

  it('does not lose an error count when the status write is refused', async () => {
    // A failed run whose row was paused mid-flight must still register the failure.
    mockUpdate.mockResolvedValueOnce([0]).mockResolvedValueOnce([1]);

    await completeRunPreservingControls('a1', {
      status: 'error', error_count: 3, last_error: 'boom',
    });

    expect(mockUpdate.mock.calls[1][0]).toEqual({ error_count: 3, last_error: 'boom' });
  });

  it('writes unconditionally when no status is supplied', async () => {
    const out = await completeRunPreservingControls('a1', { run_count: 2 });

    expect(out).toEqual({ statusWritten: false });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect((mockUpdate.mock.calls[0][1] as any).where).toEqual({ id: 'a1' });
  });
});
