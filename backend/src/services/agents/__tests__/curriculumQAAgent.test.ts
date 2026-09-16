/**
 * scanCurriculumIntegrity / runCurriculumQAAgent — AI Employee Consolidation
 * Program, Employee #1 (Curriculum/Dara), Phase 4. Per CLAUDE.md's mandatory
 * test types: happy path, failure path, boundary, and a regression test
 * pinning the exact bug this refactor fixes (the tool used to open `bug`
 * tickets at PlatformFixAgent — mis-routed, and blocked by Discovery F1
 * regardless; this proves it never does that again).
 */
jest.mock('../../../models', () => ({
  CurriculumModule: { findAll: jest.fn() },
  CurriculumLesson: {},
  ArtifactDefinition: {},
  MiniSection: {},
}));
jest.mock('../../ticketService', () => ({ createTicket: jest.fn() }));
jest.mock('../../agentBlueprint/agentActivityLogService', () => ({ logAgentActivity: jest.fn() }));
jest.mock('../../curriculum/daraIdentitySeed', () => ({ getDaraAgentId: jest.fn() }));

import { CurriculumModule } from '../../../models';
import { createTicket } from '../../ticketService';
import { logAgentActivity } from '../../agentBlueprint/agentActivityLogService';
import { getDaraAgentId } from '../../curriculum/daraIdentitySeed';
import { scanCurriculumIntegrity, runCurriculumQAAgent } from '../curriculumQAAgent';

const mockFindAll = CurriculumModule.findAll as unknown as jest.Mock;
const mockCreateTicket = createTicket as unknown as jest.Mock;
const mockLogAgentActivity = logAgentActivity as unknown as jest.Mock;
const mockGetDaraAgentId = getDaraAgentId as unknown as jest.Mock;

function makeModule(overrides: Record<string, any> = {}) {
  return {
    id: 'module-1',
    title: 'Intro to AI Systems',
    lessons: [
      { id: 'lesson-1', title: 'Lesson One', sort_order: 1, miniSections: [{ id: 'ms-1' }], artifactDefinitions: [] },
      { id: 'lesson-2', title: 'Lesson Two', sort_order: 2, miniSections: [], artifactDefinitions: [{ id: 'art-1' }] },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDaraAgentId.mockResolvedValue('dara-real-agent-id');
});

describe('scanCurriculumIntegrity', () => {
  it('happy path: a clean module produces zero findings', async () => {
    mockFindAll.mockResolvedValue([makeModule()]);

    const { findings } = await scanCurriculumIntegrity();

    expect(findings).toEqual([]);
  });

  it('happy path: a module with no lessons produces one warn finding', async () => {
    mockFindAll.mockResolvedValue([makeModule({ lessons: [] })]);

    const { findings } = await scanCurriculumIntegrity();

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'warn', location: 'curriculum_module:module-1' });
    expect(findings[0].description).toContain('has no lessons');
  });

  it('happy path: a lesson missing a title and a lesson with no content both produce warn findings', async () => {
    mockFindAll.mockResolvedValue([makeModule({
      lessons: [
        { id: 'lesson-1', title: '', sort_order: 1, miniSections: [], artifactDefinitions: [] },
      ],
    })]);

    const { findings } = await scanCurriculumIntegrity();

    // Missing title AND no content both fire for the same lesson — 2 real findings.
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === 'warn')).toBe(true);
    expect(findings.some((f) => f.description.includes('missing a title'))).toBe(true);
    expect(findings.some((f) => f.description.includes('no content'))).toBe(true);
  });

  it('boundary: out-of-order lesson index produces an info (not warn) finding', async () => {
    mockFindAll.mockResolvedValue([makeModule({
      lessons: [
        { id: 'lesson-1', title: 'One', sort_order: 2, miniSections: [{ id: 'ms-1' }], artifactDefinitions: [] },
        { id: 'lesson-2', title: 'Two', sort_order: 1, miniSections: [{ id: 'ms-2' }], artifactDefinitions: [] },
      ],
    })]);

    const { findings } = await scanCurriculumIntegrity();

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].description).toContain('out-of-order index');
  });

  it('boundary: scoping to one moduleId passes it through to the real query, not filtered client-side', async () => {
    mockFindAll.mockResolvedValue([]);

    await scanCurriculumIntegrity('module-specific-id');

    expect(mockFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'module-specific-id' } }));
  });

  // A real dev-instance run (2026-09-16) threw "column CurriculumModule.order_index
  // does not exist" — the mock above used the same wrong field name as the bug, so
  // this went unnoticed through 13/13 passing tests. This test pins the REAL model
  // field names (CurriculumModule.module_number, CurriculumLesson.sort_order) so a
  // future regression back to the wrong names fails here, not against a live DB.
  it('regression: the order clause sorts by the real model columns, not a field that does not exist on either table', async () => {
    mockFindAll.mockResolvedValue([]);

    await scanCurriculumIntegrity();

    const orderArg = mockFindAll.mock.calls[0][0].order;
    expect(orderArg).toEqual(
      expect.arrayContaining([
        ['module_number', 'ASC'],
        expect.arrayContaining(['sort_order', 'ASC']),
      ]),
    );
  });

  it('failure path: a DB error surfaces to the caller, not swallowed', async () => {
    mockFindAll.mockRejectedValue(new Error('connection lost'));

    await expect(scanCurriculumIntegrity()).rejects.toThrow('connection lost');
  });

  // The exact regression this Phase 4 change fixes: the scanner used to
  // create a `bug` ticket at PlatformFixAgent for every issue — mis-routed,
  // and blocked by Discovery F1 anyway. This is the checkable proof it never
  // does that again, per TOOL_CAPABILITY_DESIGN_v1.md B3.3 item 14.
  it('regression: createTicket is NEVER called, even when real findings exist', async () => {
    mockFindAll.mockResolvedValue([makeModule({ lessons: [] })]);

    await scanCurriculumIntegrity();

    expect(mockCreateTicket).not.toHaveBeenCalled();
  });
});

describe('runCurriculumQAAgent (capabilityRegistry.ts backward-compat wrapper)', () => {
  it('happy path: adapts scanCurriculumIntegrity findings into AgentExecutionResult, creates no ticket', async () => {
    mockFindAll.mockResolvedValue([makeModule({ lessons: [] })]);

    const result = await runCurriculumQAAgent();

    expect(result.agent_name).toBe('CurriculumQAAgent');
    expect(result.errors).toEqual([]);
    expect(result.actions_taken.some((a) => a.action === 'qa_scan_completed')).toBe(true);
    expect(result.actions_taken.some((a) => a.action === 'qa_finding')).toBe(true);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it('failure path: a scan error is captured in errors[], not thrown out of the agent runner', async () => {
    mockFindAll.mockRejectedValue(new Error('connection lost'));

    const result = await runCurriculumQAAgent();

    expect(result.errors).toEqual(['connection lost']);
  });

  it('boundary: zero findings still returns a clean success result, not an error', async () => {
    mockFindAll.mockResolvedValue([makeModule()]);

    const result = await runCurriculumQAAgent();

    expect(result.errors).toEqual([]);
    expect(result.actions_taken.filter((a) => a.action === 'qa_finding')).toHaveLength(0);
  });

  it('real activity evidence: logs success under Dara\'s real agent id, not a generic/omitted one', async () => {
    mockFindAll.mockResolvedValue([makeModule({ lessons: [] })]);

    await runCurriculumQAAgent();

    expect(mockLogAgentActivity).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'dara-real-agent-id', action: 'scan_curriculum_integrity', result: 'success' }),
    );
  });

  it('real activity evidence: logs failure (not just success) under Dara\'s real agent id', async () => {
    mockFindAll.mockRejectedValue(new Error('connection lost'));

    await runCurriculumQAAgent();

    expect(mockLogAgentActivity).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'dara-real-agent-id', action: 'scan_curriculum_integrity', result: 'failed', reason: 'connection lost' }),
    );
  });

  it('boundary: Dara\'s identity not yet seeded (getDaraAgentId returns null) — the scan still runs and returns real results, logging is skipped rather than throwing', async () => {
    mockGetDaraAgentId.mockResolvedValue(null);
    mockFindAll.mockResolvedValue([makeModule({ lessons: [] })]);

    const result = await runCurriculumQAAgent();

    expect(result.errors).toEqual([]);
    expect(mockLogAgentActivity).not.toHaveBeenCalled();
  });
});
