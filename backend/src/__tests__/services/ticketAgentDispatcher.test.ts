import { Ticket, AgentRun } from '../../models';
import { updateTicketStatus, assignTicket, addAgentOutput, addTicketComment } from '../../services/ticketService';
import { emitEvent } from '../../services/workLedger/workLedgerService';
import { selectAgent } from '../../services/workGraph/capabilityRouter';
import { authorizeTicketDispatch } from '../../services/workLedger/agentActionAuthorizationBridge';
import { checkSeparationOfDuty, recordSeparationOfDutyFlag } from '../../services/workLedger/separationOfDutyService';
import { dispatchTicketToAgent } from '../../services/ticketAgentDispatcher';

// ProofDesk Work Graph (Milestone 3, T009): dispatchTicketToAgent() now looks up
// the agent via capabilityRouter.selectAgent() instead of a local AGENT_MAPPINGS
// array (moved to capabilityRegistry.ts + capabilityRouter.ts, both already
// independently tested in T005/T006). This suite mocks selectAgent() itself at
// that seam, the same "mock at the service boundary" convention this file already
// used for ticketService/workLedgerService — dispatchTicketToAgent's OWN behavior
// (AgentRun bookkeeping, status transitions, ledger events, error handling) is
// what this suite verifies; the router's internal scoring is T006's job.

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models', () => ({
  Ticket: { findByPk: jest.fn() },
  AgentRun: { create: jest.fn() },
}));
jest.mock('../../services/ticketService', () => ({
  updateTicketStatus: jest.fn(),
  assignTicket: jest.fn(),
  addAgentOutput: jest.fn(),
  addTicketComment: jest.fn(),
}));
jest.mock('../../services/reporting/coryDecisionEngine', () => ({ trackExecutionOutcome: jest.fn() }));
jest.mock('../../services/workLedger/workLedgerService', () => ({ emitEvent: jest.fn() }));
jest.mock('../../services/workGraph/capabilityRouter', () => ({ selectAgent: jest.fn() }));
// ProofDesk Governance (Milestone 4, T006): mocked at the same service boundary as
// selectAgent/emitEvent above, per this file's own established convention — without
// this, the existing (pre-T006) tests below would incidentally exercise the REAL,
// unmocked authorizeAgentAction() chain (AiAgent/SystemSetting lookups against the
// mocked-away `sequelize.query`), relying on its fail-open behavior by accident
// rather than by explicit test design.
jest.mock('../../services/workLedger/agentActionAuthorizationBridge', () => ({ authorizeTicketDispatch: jest.fn() }));
jest.mock('../../services/workLedger/separationOfDutyService', () => ({
  checkSeparationOfDuty: jest.fn(),
  recordSeparationOfDutyFlag: jest.fn(),
}));

const ticketFindByPk = Ticket.findByPk as unknown as jest.Mock;
const agentRunCreate = AgentRun.create as unknown as jest.Mock;
const mockSelectAgent = selectAgent as unknown as jest.Mock;
const mockEmit = emitEvent as unknown as jest.Mock;
const mockAddTicketComment = addTicketComment as unknown as jest.Mock;
const mockAddAgentOutput = addAgentOutput as unknown as jest.Mock;
const mockAuthorizeTicketDispatch = authorizeTicketDispatch as unknown as jest.Mock;
const mockCheckSeparationOfDuty = checkSeparationOfDuty as unknown as jest.Mock;
const mockRecordSeparationOfDutyFlag = recordSeparationOfDutyFlag as unknown as jest.Mock;

function makeAgentRun(id: string) {
  return { id, update: jest.fn().mockResolvedValue(undefined) };
}

/** Builds a selectAgent() resolution matching capabilityRouter.ts's real return
 * shape, so this suite exercises dispatchTicketToAgent's real consumption of it
 * (selection?.mapping ?? null, then mapping.agent_name / mapping.execute). */
function makeSelection(agentName: string, execute: jest.Mock) {
  return {
    mapping: { match: () => true, agent_name: agentName, execute },
    agentName,
    score: 0.9,
    breakdown: {},
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEmit.mockResolvedValue({ event_id: 'evt-mock' });
  (updateTicketStatus as jest.Mock).mockResolvedValue(undefined);
  (assignTicket as jest.Mock).mockResolvedValue(undefined);
  mockAddAgentOutput.mockResolvedValue(undefined);
  mockAddTicketComment.mockResolvedValue(undefined);
  // Default: would_allow, no decision row — matches the vast majority (R0/undefined
  // risk_tier) of real tickets today, so every pre-existing test above keeps passing
  // unmodified with this as the implicit default.
  mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: null, verdict: 'would_allow', reason: 'ok' });
  mockCheckSeparationOfDuty.mockResolvedValue({ flagged: false, priorEventIds: [] });
  mockRecordSeparationOfDutyFlag.mockResolvedValue(undefined);
});

describe('dispatchTicketToAgent — matched mapping, agent succeeds', () => {
  it('returns the unchanged AgentExecutionResult and records a successful AgentRun + ledger event', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk1', type: 'bug', status: 'todo', metadata: {}, title: 'T', description: 'D' });
    const run = makeAgentRun('run1');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));

    const result = await dispatchTicketToAgent('tk1');

    expect(result).toBe(agentResult); // return value unchanged from today's behavior
    expect(mockSelectAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'tk1' }));
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(agentRunCreate).toHaveBeenCalledWith(expect.objectContaining({ ticket_id: 'tk1', agent_name: 'PlatformFixAgent', status: 'running' }));
    expect(run.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', result: 'success' }));
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      ticketId: 'tk1',
      runId: 'run1',
      idempotencyKey: 'ticket-dispatch:run1',
      result: 'success',
    });
  });
});

describe('dispatchTicketToAgent — no matching mapping', () => {
  it('returns null (unchanged), records an unmapped/skipped AgentRun + ledger event, when the router finds nothing eligible', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk2', type: 'strategic', status: 'todo', metadata: {} });
    const run = makeAgentRun('run2');
    agentRunCreate.mockResolvedValue(run);
    mockSelectAgent.mockResolvedValue(null); // router's own "no eligible agent" result

    const result = await dispatchTicketToAgent('tk2');

    expect(result).toBeNull();
    expect(mockAddTicketComment).toHaveBeenCalledTimes(1);
    expect(agentRunCreate).toHaveBeenCalledWith(expect.objectContaining({ agent_name: 'unmapped' }));
    expect(run.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', result: 'skipped' }));
    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      ticketId: 'tk2',
      result: 'skipped',
      reasonCode: 'no_agent_mapping',
    });
  });
});

describe('dispatchTicketToAgent — agent throws', () => {
  it('returns the same synthesized error result as today, records a failed AgentRun + ledger event', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk3', type: 'bug', status: 'todo', metadata: {} });
    const run = makeAgentRun('run3');
    agentRunCreate.mockResolvedValue(run);
    const mockExecute = jest.fn().mockRejectedValue(new Error('boom'));
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));

    const result = await dispatchTicketToAgent('tk3');

    expect(result).toMatchObject({ agent_name: 'PlatformFixAgent', errors: ['boom'] });
    expect(mockAddAgentOutput).toHaveBeenCalledWith('tk3', 'PlatformFixAgent', expect.objectContaining({ errors: ['boom'] }));
    expect(mockAddTicketComment).toHaveBeenCalledWith('tk3', 'Agent error: boom', 'agent', 'PlatformFixAgent');
    expect(run.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', result: 'failure' }));
    expect(mockEmit.mock.calls[0][0]).toMatchObject({ result: 'failure', reasonCode: 'agent_threw' });
  });
});

describe('dispatchTicketToAgent — ticket not found', () => {
  it('still throws the same error and never touches the router, AgentRun, or the ledger', async () => {
    ticketFindByPk.mockResolvedValue(null);

    await expect(dispatchTicketToAgent('missing')).rejects.toThrow('Ticket missing not found');
    expect(mockSelectAgent).not.toHaveBeenCalled();
    expect(agentRunCreate).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe('ledger-write failure isolation (regression: must never break dispatch)', () => {
  it('still returns the agent result normally when AgentRun.create and emitEvent both reject', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk4', type: 'bug', status: 'todo', metadata: {} });
    agentRunCreate.mockRejectedValue(new Error('agent_runs insert failed'));
    mockEmit.mockRejectedValue(new Error('ledger DB unavailable'));
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));

    await expect(dispatchTicketToAgent('tk4')).resolves.toBe(agentResult);
  });
});

// ProofDesk Work Graph (Milestone 3, T008) — retry/handoff lineage. Only
// createAgentRunSafe()'s AgentRun.create() call and dispatchTicketToAgent()'s new
// optional second parameter changed; the mapping-lookup mechanism itself (now the
// Capability Router, T009) is exercised the same way as the tests above.
describe('dispatchTicketToAgent — retry lineage (T008)', () => {
  it('sets retry_of_run_id on the new AgentRun when a retryOfRunId is passed', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk5', type: 'bug', status: 'todo', metadata: {} });
    const run = makeAgentRun('run5-retry');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));

    await dispatchTicketToAgent('tk5', { retryOfRunId: 'run5-original-failed' });

    expect(agentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 'tk5', retry_of_run_id: 'run5-original-failed' })
    );
  });

  it('a normal (non-retry) dispatch still sets retry_of_run_id to null — no regression to the existing path', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk6', type: 'bug', status: 'todo', metadata: {} });
    const run = makeAgentRun('run6');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));

    // Called exactly as every pre-existing call site in this repo calls it today —
    // no second argument at all.
    const result = await dispatchTicketToAgent('tk6');

    expect(result).toBe(agentResult);
    expect(agentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 'tk6', retry_of_run_id: null })
    );
  });
});

// ProofDesk Governance (Milestone 4, T006). This is the hard guarantee this task's
// acceptance criteria are built around: authorization is evaluated and RECORDED, but
// NEVER changes what dispatchTicketToAgent actually does. Every test below asserts
// the real action still happened exactly as it would have under M1-M3, alongside the
// new (additive-only) governance fields now present on the ledger event.
describe('dispatchTicketToAgent — ProofDesk Governance (Milestone 4, shadow mode)', () => {
  it('R0/R1/R2 (would_allow): control flow is byte-for-byte identical to before this milestone', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk7', type: 'bug', status: 'todo', metadata: {}, risk_tier: 'R1' });
    const run = makeAgentRun('run7');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: null, verdict: 'would_allow', reason: 'ok' });

    const result = await dispatchTicketToAgent('tk7');

    expect(result).toBe(agentResult); // same object, unchanged
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(updateTicketStatus).toHaveBeenCalledWith('tk7', 'in_review', 'agent', 'PlatformFixAgent');
    expect(mockAuthorizeTicketDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'tk7', agentName: 'PlatformFixAgent', action: 'ticket_dispatch', riskTier: 'R1' }),
    );
    // The only observable difference: the ledger event now carries riskTier + a null
    // (would_allow) authorizationDecisionId — additive fields, nothing removed/changed.
    expect(mockEmit.mock.calls[0][0]).toMatchObject({ riskTier: 'R1', authorizationDecisionId: null });
  });

  it('THE critical case — R4/would_require_approval: mapping.execute() STILL RUNS and the ticket STILL transitions, unblocked', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk8', type: 'bug', status: 'todo', metadata: {}, risk_tier: 'R4' });
    const run = makeAgentRun('run8');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));
    mockAuthorizeTicketDispatch.mockResolvedValue({
      decisionId: 'approval-row-r4',
      verdict: 'would_require_approval',
      reason: 'requires_approval:high_risk_tier',
    });

    const result = await dispatchTicketToAgent('tk8');

    // Identical control flow to the R0 case above and to the pre-T006 baseline test
    // at the top of this file: execute() ran, status transitioned, same return shape.
    expect(result).toBe(agentResult);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(updateTicketStatus).toHaveBeenCalledWith('tk8', 'in_review', 'agent', 'PlatformFixAgent');
    expect(assignTicket).toHaveBeenCalledWith('tk8', 'agent', 'PlatformFixAgent', 'cory', 'ticket_dispatcher');
    // The ONLY difference vs. the R0 case: the ledger event now records the decision.
    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      riskTier: 'R4',
      authorizationDecisionId: 'approval-row-r4',
      result: 'success',
    });
  });

  it('a bridge failure (authorizeTicketDispatch rejects) does not change dispatch outcome at all', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk9', type: 'bug', status: 'todo', metadata: {}, risk_tier: 'R3' });
    const run = makeAgentRun('run9');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));
    mockAuthorizeTicketDispatch.mockRejectedValue(new Error('bridge exploded'));

    const result = await dispatchTicketToAgent('tk9');

    expect(result).toBe(agentResult);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    // Degrades to null decisionId, exactly like the bridge's own internal safe default.
    expect(mockEmit.mock.calls[0][0]).toMatchObject({ authorizationDecisionId: null });
  });

  it('same dispatchLedgerEventId is used for the authorization call AND the ledger event it correlates to', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk10', type: 'bug', status: 'todo', metadata: {}, risk_tier: 'R2' });
    const run = makeAgentRun('run10');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', jest.fn().mockResolvedValue(agentResult)));
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: null, verdict: 'would_allow', reason: 'ok' });

    await dispatchTicketToAgent('tk10');

    const authorizedEventId = mockAuthorizeTicketDispatch.mock.calls[0][0].eventId;
    const ledgerEventId = mockEmit.mock.calls[0][0].eventId;
    expect(authorizedEventId).toBeDefined();
    expect(authorizedEventId).toBe(ledgerEventId);
  });
});

// ProofDesk Governance (Milestone 4, T007). Separation-of-duty is only checked when
// this dispatch IS a verification action (agent_name === 'CurriculumQAAgent'), and —
// same hard guarantee as T006 — a flag NEVER blocks the QA dispatch itself.
describe('dispatchTicketToAgent — separation of duty (Milestone 4, shadow mode)', () => {
  it('non-QA dispatch never calls checkSeparationOfDuty at all', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk11', type: 'bug', status: 'todo', metadata: {} });
    const run = makeAgentRun('run11');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', jest.fn().mockResolvedValue(agentResult)));

    await dispatchTicketToAgent('tk11');

    expect(mockCheckSeparationOfDuty).not.toHaveBeenCalled();
  });

  it('QA dispatch with NO prior conflicting work: checks, finds nothing, dispatch proceeds normally', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk12', type: 'curriculum', status: 'todo', metadata: { action: 'qa_check' } });
    const run = makeAgentRun('run12');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'CurriculumQAAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('CurriculumQAAgent', mockExecute));
    mockCheckSeparationOfDuty.mockResolvedValue({ flagged: false, priorEventIds: [] });

    const result = await dispatchTicketToAgent('tk12');

    expect(mockCheckSeparationOfDuty).toHaveBeenCalledWith('tk12', 'CurriculumQAAgent');
    expect(mockRecordSeparationOfDutyFlag).not.toHaveBeenCalled();
    expect(result).toBe(agentResult);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('THE critical case — QA dispatch WITH a violation: flag is recorded but mapping.execute() STILL RUNS, unblocked', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk13', type: 'curriculum', status: 'todo', metadata: { action: 'qa_check' } });
    const run = makeAgentRun('run13');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'CurriculumQAAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('CurriculumQAAgent', mockExecute));
    mockCheckSeparationOfDuty.mockResolvedValue({ flagged: true, priorEventIds: ['evt-prior-1'] });

    const result = await dispatchTicketToAgent('tk13');

    // The flag was recorded...
    expect(mockRecordSeparationOfDutyFlag).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'tk13', agentName: 'CurriculumQAAgent', priorEventIds: ['evt-prior-1'] }),
    );
    // ...but dispatch proceeded completely unblocked, identical to the no-flag case.
    expect(result).toBe(agentResult);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(updateTicketStatus).toHaveBeenCalledWith('tk13', 'in_review', 'agent', 'CurriculumQAAgent');
  });

  it('a separation-of-duty check failure does not change dispatch outcome at all', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk14', type: 'curriculum', status: 'todo', metadata: { action: 'qa_check' } });
    const run = makeAgentRun('run14');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'CurriculumQAAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('CurriculumQAAgent', mockExecute));
    mockCheckSeparationOfDuty.mockRejectedValue(new Error('sod check exploded'));

    const result = await dispatchTicketToAgent('tk14');

    expect(result).toBe(agentResult);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

// ProofDesk Governance (Milestone 4, T010) — idempotency + malformed-input sweep at
// the full dispatcher level (T003/T005 already covered these at the unit level;
// this proves the SAME guarantees hold end to end through the real call chain).
describe('dispatchTicketToAgent — Milestone 4 idempotency + malformed-input sweep (T010)', () => {
  it('a ticket with NO risk_tier field at all (the majority real-world case today) dispatches with would_allow, no crash', async () => {
    // Deliberately omits risk_tier entirely, unlike the R1/R4 fixtures above -
    // exercises ticketAgentDispatcher's `(ticket as any).risk_tier ?? 'R0'` default.
    ticketFindByPk.mockResolvedValue({ id: 'tk15', type: 'bug', status: 'todo', metadata: {} });
    const run = makeAgentRun('run15');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: null, verdict: 'would_allow', reason: 'ok' });

    const result = await dispatchTicketToAgent('tk15');

    expect(result).toBe(agentResult);
    expect(mockAuthorizeTicketDispatch).toHaveBeenCalledWith(expect.objectContaining({ riskTier: 'R0' }));
    expect(mockEmit.mock.calls[0][0]).toMatchObject({ riskTier: 'R0' });
  });

  it('a ticket with a garbage risk_tier string dispatches without crashing, unaffected control flow', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk16', type: 'bug', status: 'todo', metadata: {}, risk_tier: 'not-a-real-tier' });
    const run = makeAgentRun('run16');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));
    // The bridge itself is mocked here (its own malformed-input safety is T003/T005's
    // job) - what THIS test proves is that the dispatcher passes the raw string
    // through unmodified and never crashes handling it either way.
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: null, verdict: 'would_allow', reason: 'ok' });

    const result = await dispatchTicketToAgent('tk16');

    expect(result).toBe(agentResult);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockAuthorizeTicketDispatch).toHaveBeenCalledWith(expect.objectContaining({ riskTier: 'not-a-real-tier' }));
  });

  it('dispatching the SAME ticket twice produces two independent real dispatch attempts (two AgentRuns, two eventIds) - not treated as a duplicate of one decision', async () => {
    // Distinguishes "retry of the SAME write" (T005's findOrCreate-on-event_id
    // idempotency, already proven) from "two genuinely separate dispatch attempts"
    // (the pre-existing, unchanged M1-M3 behavior - each is its own real action and
    // gets its own real ledger event / AgentRun / authorization decision).
    ticketFindByPk.mockResolvedValue({ id: 'tk17', type: 'bug', status: 'todo', metadata: {}, risk_tier: 'R4' });
    const run1 = makeAgentRun('run17-a');
    const run2 = makeAgentRun('run17-b');
    agentRunCreate.mockResolvedValueOnce(run1).mockResolvedValueOnce(run2);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', jest.fn().mockResolvedValue(agentResult)));
    mockAuthorizeTicketDispatch
      .mockResolvedValueOnce({ decisionId: 'approval-attempt-1', verdict: 'would_require_approval', reason: 'requires_approval:high_risk_tier' })
      .mockResolvedValueOnce({ decisionId: 'approval-attempt-2', verdict: 'would_require_approval', reason: 'requires_approval:high_risk_tier' });

    await dispatchTicketToAgent('tk17');
    await dispatchTicketToAgent('tk17');

    expect(agentRunCreate).toHaveBeenCalledTimes(2);
    expect(mockAuthorizeTicketDispatch).toHaveBeenCalledTimes(2);
    const firstEventId = mockAuthorizeTicketDispatch.mock.calls[0][0].eventId;
    const secondEventId = mockAuthorizeTicketDispatch.mock.calls[1][0].eventId;
    expect(firstEventId).not.toBe(secondEventId); // two real, independent decisions
    expect(mockEmit).toHaveBeenCalledTimes(2);
    expect(mockEmit.mock.calls[0][0].authorizationDecisionId).toBe('approval-attempt-1');
    expect(mockEmit.mock.calls[1][0].authorizationDecisionId).toBe('approval-attempt-2');
  });
});
