import Department from '../../models/Department';
import { emitToolCall } from '../../services/aiEventService';
import { executeGetDepartmentContext, executeSearchKnowledge } from '../../intelligence/assistant/coryAgenticEngine';
import { runCoryHealthCanary } from '../../services/observability/coryHealthCanaryService';

jest.mock('../../models/Department', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../../services/aiEventService', () => ({ emitToolCall: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../intelligence/assistant/coryAgenticEngine', () => ({
  executeGetDepartmentContext: jest.fn(),
  executeSearchKnowledge: jest.fn(),
}));

const findOne = Department.findOne as unknown as jest.Mock;
const mockEmitToolCall = emitToolCall as unknown as jest.Mock;
const mockGetDeptContext = executeGetDepartmentContext as unknown as jest.Mock;
const mockSearchKnowledge = executeSearchKnowledge as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runCoryHealthCanary', () => {
  it('emits a tool.call event with the shape trustRubric expects when a department exists', async () => {
    findOne.mockResolvedValue({ name: 'Security' });
    mockGetDeptContext.mockResolvedValue({ health_score: 91 });
    mockSearchKnowledge.mockResolvedValue({ results: [], count: 2 });

    const result = await runCoryHealthCanary();

    expect(mockEmitToolCall).toHaveBeenCalledTimes(1);
    const call = mockEmitToolCall.mock.calls[0][0];
    expect(call.tool).toBe('get_department_context');
    expect(call.workflowId).toBe('cory_health_canary');
    expect(call.agentId).toBe('Cory');
    expect(call.ok).toBe(true);
    expect(call.args).toEqual({ department_name: 'Security' });
    // PII scoping: only arg keys are logged by emitToolCall itself; this call site
    // must never pass raw prompt/response text as resultSummary.
    expect(typeof call.resultSummary).toBe('string');
    expect(call.resultSummary).not.toMatch(/@/);

    expect(mockSearchKnowledge).toHaveBeenCalledWith('trust score observability initiative', 3);
    expect(result.ranDepartmentCheck).toBe(true);
    expect(result.ranKnowledgeSearch).toBe(true);
    expect(result.knowledgeHits).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it('skips the department leg (no crash) when no Department rows exist', async () => {
    findOne.mockResolvedValue(null);
    mockSearchKnowledge.mockResolvedValue({ results: [], count: 0 });

    const result = await runCoryHealthCanary();

    expect(mockEmitToolCall).not.toHaveBeenCalled();
    expect(result.ranDepartmentCheck).toBe(false);
    expect(result.errors).toEqual(['No Department rows found — skipped department-context leg.']);
    expect(result.ranKnowledgeSearch).toBe(true);
  });

  it('calls each read-only executor exactly once per run (no duplicate side-effect risk)', async () => {
    findOne.mockResolvedValue({ name: 'Security' });
    mockGetDeptContext.mockResolvedValue({ health_score: 91 });
    mockSearchKnowledge.mockResolvedValue({ results: [], count: 1 });

    await runCoryHealthCanary();

    expect(mockGetDeptContext).toHaveBeenCalledTimes(1);
    expect(mockSearchKnowledge).toHaveBeenCalledTimes(1);
  });

  it('records both legs independently — a department-check failure does not block the knowledge search', async () => {
    findOne.mockRejectedValue(new Error('db unavailable'));
    mockSearchKnowledge.mockResolvedValue({ results: [], count: 1 });

    const result = await runCoryHealthCanary();

    expect(result.ranDepartmentCheck).toBe(false);
    expect(result.ranKnowledgeSearch).toBe(true);
    expect(result.errors[0]).toContain('db unavailable');
  });
});
