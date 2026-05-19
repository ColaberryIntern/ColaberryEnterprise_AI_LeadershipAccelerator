// Mock dependencies before importing the service.
jest.mock('../../models', () => ({
  NextAction: { findOne: jest.fn(), update: jest.fn(), create: jest.fn() },
  ArtifactDefinition: { findAll: jest.fn().mockResolvedValue([]) },
  AssignmentSubmission: { findAll: jest.fn().mockResolvedValue([]) },
  RequirementsMap: { findOne: jest.fn() },
  Project: { findByPk: jest.fn() },
}));
jest.mock('../../services/projectService', () => ({
  getProjectByEnrollment: jest.fn().mockResolvedValue({ id: 'proj-1' }),
}));
jest.mock('../../services/requirementsMatchingService', () => ({
  getRequirementsStatus: jest.fn().mockResolvedValue({
    requirements: [{ requirement_key: 'REQ-X', status: 'unmatched', requirement_text: 'do thing' }],
  }),
}));
jest.mock('../../services/githubService', () => ({
  getFileTree: jest.fn().mockResolvedValue({ tree: [] }),
}));
jest.mock('../../services/nextAction/requirementPriorityService', () => ({
  prioritizeRequirements: jest.fn().mockResolvedValue([{
    requirement: { id: 'r1', requirement_key: 'REQ-X', requirement_text: 'do thing', status: 'unmatched' },
    priorityScore: 5, statusWeight: 3, dependencyWeight: 1, systemRuleWeight: 1,
  }]),
}));
jest.mock('../../services/nextAction/actionGeneratorService', () => ({
  generateAction: jest.fn().mockResolvedValue({
    title: 'Fresh action', action_type: 'create_artifact', reason: 'r',
    confidence_score: 0.9, files_suggested: [], related_artifacts: [],
    requirement_key: 'REQ-X',
  }),
}));

import { NextAction, RequirementsMap } from '../../models';
import { getNextAction } from '../../services/nextAction/nextActionService';

const naFindOne = (NextAction as any).findOne as jest.MockedFunction<any>;
const naUpdate = (NextAction as any).update as jest.MockedFunction<any>;
const naCreate = (NextAction as any).create as jest.MockedFunction<any>;
const reqFindOne = (RequirementsMap as any).findOne as jest.MockedFunction<any>;

describe('getNextAction — stale-cache check (2026-05-18 audit fix)', () => {
  beforeEach(() => {
    naFindOne.mockReset();
    naUpdate.mockReset().mockResolvedValue([0]);
    naCreate.mockReset().mockImplementation((data: any) => Promise.resolve({ ...data, id: 'new-id' }));
    reqFindOne.mockReset();
  });

  test('cached pending action whose req is MATCHED is auto-completed + fresh generated', async () => {
    const staleSave = jest.fn().mockResolvedValue(undefined);
    const staleAction = {
      id: 'stale-1', title: 'Create artifact for REQ-122',
      project_id: 'proj-1', status: 'pending',
      created_at: new Date(),       // FRESH (< 1hr) — would normally be returned
      metadata: { requirement_key: 'REQ-122' },
      save: staleSave,
    };
    naFindOne.mockResolvedValue(staleAction);
    reqFindOne.mockResolvedValue({ status: 'matched' });

    const result = await getNextAction('enr-1');

    // Stale action got auto-completed
    expect(staleAction.status).toBe('completed');
    expect(staleSave).toHaveBeenCalled();
    // Fresh action was generated
    expect(naCreate).toHaveBeenCalled();
    expect(result?.title).toBe('Fresh action');
  });

  test('cached pending action whose req is STILL UNMATCHED is returned (cache hit)', async () => {
    const staleSave = jest.fn();
    const cached = {
      id: 'cached-1', title: 'Cached action',
      project_id: 'proj-1', status: 'pending',
      created_at: new Date(),
      metadata: { requirement_key: 'REQ-Y' },
      save: staleSave,
    };
    naFindOne.mockResolvedValue(cached);
    reqFindOne.mockResolvedValue({ status: 'unmatched' });

    const result = await getNextAction('enr-1');

    expect(staleSave).not.toHaveBeenCalled();
    expect(naCreate).not.toHaveBeenCalled();
    expect(result?.title).toBe('Cached action');
  });

  test('cached action older than 1hr is replaced even if req is still unmatched (existing TTL behavior)', async () => {
    const cached = {
      id: 'old-1', title: 'Old action',
      project_id: 'proj-1', status: 'pending',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      metadata: { requirement_key: 'REQ-Z' },
      save: jest.fn(),
    };
    naFindOne.mockResolvedValue(cached);
    reqFindOne.mockResolvedValue({ status: 'unmatched' });

    const result = await getNextAction('enr-1');

    // TTL kicked in → fresh action generated
    expect(naCreate).toHaveBeenCalled();
    expect(result?.title).toBe('Fresh action');
  });
});
