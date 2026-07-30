/**
 * workforceAgentRuntime — the hard gate every AI Workforce director action runs
 * through. Verifies the trust guarantee the plan promises: kill switch / safe
 * mode / disabled always actually block a write, independent of anything else,
 * and a duplicate finding never produces a second row.
 */

jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../../launchSafety', () => ({ isKillSwitchActive: jest.fn() }));
jest.mock('../../systemControlService', () => ({ isSafeModeActive: jest.fn() }));
jest.mock('../../agentPermissionService', () => ({
  validateAgentWrite: jest.fn(),
  createProposal: jest.fn(),
}));
jest.mock('../../aiEventService', () => ({
  logAgentActivity: jest.fn().mockResolvedValue(undefined),
  emitAiEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../utils/requestContext', () => ({ ensureTraceId: jest.fn(() => 'trace-1') }));

import AiAgent from '../../../models/AiAgent';
import { isKillSwitchActive } from '../../launchSafety';
import { isSafeModeActive } from '../../systemControlService';
import { validateAgentWrite, createProposal } from '../../agentPermissionService';
import { logAgentActivity, emitAiEvent } from '../../aiEventService';
import { runDirectorWrite, runDirectorProposal, isDirectorGateOpen } from '../workforceAgentRuntime';

const agentFindOne = AiAgent.findOne as jest.Mock;
const killSwitch = isKillSwitchActive as jest.Mock;
const safeMode = isSafeModeActive as jest.Mock;
const validateWrite = validateAgentWrite as jest.Mock;
const createProp = createProposal as jest.Mock;

function enabledAgent(over: any = {}) {
  return { id: 'agent-uuid-1', agent_name: 'WorkforceStudentSuccessDirector', enabled: true, status: 'idle', ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  killSwitch.mockResolvedValue(false);
  safeMode.mockResolvedValue(false);
});

describe('runDirectorWrite', () => {
  const baseParams = () => ({
    slug: 'student_success',
    agentName: 'WorkforceStudentSuccessDirector',
    operation: 'flag_student_success',
    targetTable: 'workforce_tasks',
    alreadyExists: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'task-1' }),
  });

  it('happy path: writes, logs activity, and emits a cost event when the gate is open', async () => {
    agentFindOne.mockResolvedValue(enabledAgent());
    validateWrite.mockResolvedValue({ allowed: true, tier: 'write_with_audit' });
    const params = baseParams();

    const result = await runDirectorWrite(params);

    expect(result).toEqual({ ran: true, wrote: true, recordId: 'task-1', costUsd: 0 });
    expect(params.create).toHaveBeenCalledTimes(1);
    expect(logAgentActivity).toHaveBeenCalledWith(expect.objectContaining({ agent_id: 'agent-uuid-1', result: 'success' }));
    expect(emitAiEvent).toHaveBeenCalledWith(expect.objectContaining({ agent_id: 'agent-uuid-1', event_type: 'agent.action', cost_usd: 0 }));
  });

  it('failure path: an active kill switch blocks the write before create() runs', async () => {
    agentFindOne.mockResolvedValue(enabledAgent());
    killSwitch.mockResolvedValue(true);
    const params = baseParams();

    const result = await runDirectorWrite(params);

    expect(result).toEqual({ ran: false, wrote: false, reason: 'kill_switch_active', costUsd: 0 });
    expect(params.create).not.toHaveBeenCalled();
    expect(validateWrite).not.toHaveBeenCalled();
  });

  it('failure path: safe mode blocks the write before create() runs', async () => {
    agentFindOne.mockResolvedValue(enabledAgent());
    safeMode.mockResolvedValue(true);
    const params = baseParams();

    const result = await runDirectorWrite(params);

    expect(result.reason).toBe('safe_mode_active');
    expect(params.create).not.toHaveBeenCalled();
  });

  it('failure path: a disabled agent never runs, even with kill switch and safe mode off', async () => {
    agentFindOne.mockResolvedValue(enabledAgent({ enabled: false }));
    const params = baseParams();

    const result = await runDirectorWrite(params);

    expect(result).toEqual({ ran: false, wrote: false, reason: 'agent_disabled', costUsd: 0 });
    expect(params.create).not.toHaveBeenCalled();
  });

  it('failure path: a paused agent never runs', async () => {
    agentFindOne.mockResolvedValue(enabledAgent({ status: 'paused' }));
    const params = baseParams();

    const result = await runDirectorWrite(params);

    expect(result.reason).toBe('agent_disabled');
    expect(params.create).not.toHaveBeenCalled();
  });

  it('boundary: an unregistered agent name never runs', async () => {
    agentFindOne.mockResolvedValue(null);
    const params = baseParams();

    const result = await runDirectorWrite(params);

    expect(result).toEqual({ ran: false, wrote: false, reason: 'agent_not_registered', costUsd: 0 });
  });

  it('idempotency: an already-flagged finding is not written twice', async () => {
    agentFindOne.mockResolvedValue(enabledAgent());
    const params = baseParams();
    params.alreadyExists = jest.fn().mockResolvedValue('existing-task-1');

    const result = await runDirectorWrite(params);

    expect(result).toEqual({ ran: true, wrote: false, reason: 'already_flagged', recordId: 'existing-task-1', costUsd: 0 });
    expect(params.create).not.toHaveBeenCalled();
    expect(validateWrite).not.toHaveBeenCalled();
  });

  it('permission tier blocks the write: create() is skipped and the skip is logged', async () => {
    agentFindOne.mockResolvedValue(enabledAgent());
    validateWrite.mockResolvedValue({ allowed: false, reason: 'table_not_in_allowlist: workforce_tasks', tier: 'read_only' });
    const params = baseParams();

    const result = await runDirectorWrite(params);

    expect(result.wrote).toBe(false);
    expect(result.reason).toContain('table_not_in_allowlist');
    expect(params.create).not.toHaveBeenCalled();
    expect(logAgentActivity).toHaveBeenCalledWith(expect.objectContaining({ result: 'skipped' }));
  });
});

describe('runDirectorProposal', () => {
  const baseParams = () => ({
    slug: 'marketing',
    agentName: 'WorkforceMarketingDirector',
    build: jest.fn().mockResolvedValue({
      actionType: 'propose_content_idea',
      targetTable: 'proposed_agent_actions',
      targetId: 'signal-key-1',
      proposedChanges: { content_idea: 'idea text' },
      reason: 'grounded in signal',
      confidence: 0.6,
    }),
  });

  it('happy path: builds after the gate opens, creates a proposal, and logs it', async () => {
    agentFindOne.mockResolvedValue(enabledAgent({ agent_name: 'WorkforceMarketingDirector' }));
    createProp.mockResolvedValue({ id: 'proposal-1' });
    const params = baseParams();

    const result = await runDirectorProposal(params);

    expect(result).toEqual({ ran: true, wrote: true, recordId: 'proposal-1', costUsd: 0 });
    expect(params.build).toHaveBeenCalledWith('agent-uuid-1');
    expect(createProp).toHaveBeenCalledWith(
      'agent-uuid-1', 'WorkforceMarketingDirector', 'propose_content_idea', 'proposed_agent_actions', 'signal-key-1',
      { content_idea: 'idea text' }, {}, 'grounded in signal', 0.6,
    );
  });

  it('failure path: an active kill switch blocks build() so no LLM call is ever made', async () => {
    agentFindOne.mockResolvedValue(enabledAgent({ agent_name: 'WorkforceMarketingDirector' }));
    killSwitch.mockResolvedValue(true);
    const params = baseParams();

    const result = await runDirectorProposal(params);

    expect(result).toEqual({ ran: false, wrote: false, reason: 'kill_switch_active', costUsd: 0 });
    expect(params.build).not.toHaveBeenCalled();
    expect(createProp).not.toHaveBeenCalled();
  });
});

describe('isDirectorGateOpen', () => {
  it('reports open when nothing blocks the agent', async () => {
    agentFindOne.mockResolvedValue(enabledAgent());
    await expect(isDirectorGateOpen('WorkforceStudentSuccessDirector')).resolves.toEqual({ open: true });
  });

  it('reports the blocking reason when the agent is disabled', async () => {
    agentFindOne.mockResolvedValue(enabledAgent({ enabled: false }));
    await expect(isDirectorGateOpen('WorkforceStudentSuccessDirector')).resolves.toEqual({ open: false, reason: 'agent_disabled' });
  });
});
