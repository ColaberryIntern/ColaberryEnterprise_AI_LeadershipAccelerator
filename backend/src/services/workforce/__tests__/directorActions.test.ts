/**
 * directorActions — verifies each director's tool reads the right (already
 * existing, already tested) signal and hands the runtime exactly one write,
 * including the boundary case (no signal -> no-op, not an error) and the
 * idempotency contract each `alreadyExists` callback implements.
 */

jest.mock('../../ops/schoolSignals', () => ({ gatherSignals: jest.fn() }));
jest.mock('../../ops/directors', () => ({ runDirectors: jest.fn(), rankRecommendations: jest.fn() }));
jest.mock('../../../models/WorkforceTask', () => ({ __esModule: true, default: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock('../../../models/WorkforceMessage', () => ({ __esModule: true, default: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock('../../../models/AiAgent', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../workforceAgentRuntime', () => ({
  runDirectorWrite: jest.fn().mockResolvedValue({ ran: true, wrote: true, recordId: 'rec-1', costUsd: 0 }),
  runDirectorProposal: jest.fn().mockResolvedValue({ ran: true, wrote: true, recordId: 'prop-1', costUsd: 0 }),
}));

import { gatherSignals } from '../../ops/schoolSignals';
import { runDirectors, rankRecommendations } from '../../ops/directors';
import WorkforceTask from '../../../models/WorkforceTask';
import WorkforceMessage from '../../../models/WorkforceMessage';
import AiAgent from '../../../models/AiAgent';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { runDirectorWrite, runDirectorProposal } from '../workforceAgentRuntime';
import {
  runStudentSuccessDirector,
  runTechnologyDirector,
  runResearchDirector,
  runMarketingDirector,
} from '../directorActions';

const gather = gatherSignals as jest.Mock;
const runDirs = runDirectors as jest.Mock;
const rank = rankRecommendations as jest.Mock;
const taskFindOne = WorkforceTask.findOne as jest.Mock;
const taskCreate = WorkforceTask.create as jest.Mock;
const msgFindOne = WorkforceMessage.findOne as jest.Mock;
const msgCreate = WorkforceMessage.create as jest.Mock;
const agentFindAll = AiAgent.findAll as jest.Mock;
const instrumented = getInstrumentedOpenAI as jest.Mock;
const write = runDirectorWrite as jest.Mock;
const proposal = runDirectorProposal as jest.Mock;

const rec = (over: any = {}) => ({
  key: 'student.intervene', domain: 'student_success', title: 'Intervene with 3 at-risk students',
  why: 'Attendance dropped', evidence: ['3 flagged'], impact: 'Reduce dropout', confidence: 0.8,
  action_type: 'create_tasks', severity: 'high', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  gather.mockResolvedValue({ students: {}, revenue: {}, learning: {}, employment: {}, certification: {}, curriculum: {}, portfolio: {} });
});

describe('runStudentSuccessDirector (domain-flag directors)', () => {
  it('happy path: hands the runtime exactly one WorkforceTask write from the top recommendation', async () => {
    runDirs.mockReturnValue([{ domain: 'student_success', recommendations: [rec()] }]);

    const result = await runStudentSuccessDirector();

    expect(result).toEqual({ ran: true, wrote: true, recordId: 'rec-1', costUsd: 0 });
    expect(write).toHaveBeenCalledTimes(1);
    const call = write.mock.calls[0][0];
    expect(call.slug).toBe('student_success');
    expect(call.agentName).toBe('WorkforceStudentSuccessDirector');
    expect(call.operation).toBe('flag_student_success');
    expect(call.targetTable).toBe('workforce_tasks');

    // Exercise the callbacks the runtime would call.
    taskFindOne.mockResolvedValue(null);
    await expect(call.alreadyExists()).resolves.toBeNull();

    taskCreate.mockResolvedValue({ id: 'task-99' });
    await expect(call.create()).resolves.toEqual({ id: 'task-99' });
    expect(taskCreate).toHaveBeenCalledWith(expect.objectContaining({
      employee_slug: 'student_success', title: rec().title, priority: 'high', source_rec_key: 'student.intervene',
    }));
  });

  it('boundary: no recommendation for the domain today is a no-op, not an error, and never calls the runtime', async () => {
    runDirs.mockReturnValue([{ domain: 'student_success', recommendations: [] }]);

    const result = await runStudentSuccessDirector();

    expect(result).toEqual({ ran: false, wrote: false, reason: 'no_signal_today', costUsd: 0 });
    expect(write).not.toHaveBeenCalled();
  });

  it('idempotency: alreadyExists reflects an existing open task for the same finding', async () => {
    runDirs.mockReturnValue([{ domain: 'student_success', recommendations: [rec()] }]);
    await runStudentSuccessDirector();
    const call = write.mock.calls[0][0];

    taskFindOne.mockResolvedValue({ id: 'existing-task-1' });
    await expect(call.alreadyExists()).resolves.toBe('existing-task-1');
  });
});

describe('runTechnologyDirector', () => {
  it('happy path: flags the worst unhealthy agent by error_count', async () => {
    agentFindAll.mockResolvedValue([{ id: 'a1', agent_name: 'SomeAgent', status: 'error', error_count: 12, last_error: 'boom' }]);

    await runTechnologyDirector();

    expect(write).toHaveBeenCalledTimes(1);
    const call = write.mock.calls[0][0];
    expect(call.operation).toBe('flag_agent_health_issue');
    taskCreate.mockResolvedValue({ id: 'task-1' });
    await call.create();
    expect(taskCreate).toHaveBeenCalledWith(expect.objectContaining({ employee_slug: 'technology', priority: 'high' }));
  });

  it('boundary: no unhealthy agent is a no-op', async () => {
    agentFindAll.mockResolvedValue([]);
    const result = await runTechnologyDirector();
    expect(result.ran).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('runResearchDirector', () => {
  it('happy path: synthesizes the top 3 ranked recommendations into one WorkforceMessage', async () => {
    runDirs.mockReturnValue([{ domain: 'student_success', recommendations: [rec()] }]);
    rank.mockReturnValue([rec(), rec({ key: 'career.close_gap', domain: 'career', title: 'Close readiness gap' })]);

    await runResearchDirector();

    const call = write.mock.calls[0][0];
    expect(call.targetTable).toBe('workforce_messages');
    msgCreate.mockResolvedValue({ id: 'msg-1' });
    await call.create();
    expect(msgCreate).toHaveBeenCalledWith(expect.objectContaining({ from_slug: 'research', to_slug: 'curriculum' }));
  });

  it('boundary: no recommendations anywhere is a no-op', async () => {
    runDirs.mockReturnValue([]);
    rank.mockReturnValue([]);
    const result = await runResearchDirector();
    expect(result.ran).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('runMarketingDirector', () => {
  it('happy path: builds one LLM-drafted proposal grounded in the top signal, only after the gate opens', async () => {
    runDirs.mockReturnValue([{ domain: 'finance', recommendations: [rec({ key: 'finance.collect', domain: 'finance', title: 'Collect unpaid tuition' })] }]);
    rank.mockReturnValue([rec({ key: 'finance.collect', domain: 'finance', title: 'Collect unpaid tuition' })]);
    const createFn = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Headline: ...' } }] });
    instrumented.mockReturnValue({ chat: { completions: { create: createFn } } });

    await runMarketingDirector();

    expect(proposal).toHaveBeenCalledTimes(1);
    const call = proposal.mock.calls[0][0];
    expect(call.slug).toBe('marketing');

    const built = await call.build('agent-uuid-9');
    expect(instrumented).toHaveBeenCalledWith({ agent_id: 'agent-uuid-9', workflow_id: 'workforce_marketing' });
    expect(built.actionType).toBe('propose_content_idea');
    expect(built.targetTable).toBe('proposed_agent_actions');
    expect(built.proposedChanges.content_idea).toBe('Headline: ...');
  });

  it('boundary: no ranked signal today is a no-op and never calls the LLM', async () => {
    runDirs.mockReturnValue([]);
    rank.mockReturnValue([]);

    const result = await runMarketingDirector();

    expect(result.ran).toBe(false);
    expect(proposal).not.toHaveBeenCalled();
    expect(instrumented).not.toHaveBeenCalled();
  });
});
