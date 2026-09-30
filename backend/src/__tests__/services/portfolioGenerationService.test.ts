/**
 * Weekly Tier-A artifact + readiness score additions to generatePortfolio()
 * (BC #9985689951). No DB I/O — all models mocked. The pre-existing legacy
 * category logic (ProjectArtifact/ArtifactDefinition/AssignmentSubmission) is
 * untouched by this change and is exercised here only enough to keep it at
 * zero artifacts, so the LLM executive-summary branch never fires.
 */

const mockProjectFindOne = jest.fn();
const mockProjectArtifactFindAll = jest.fn();
const mockAssignmentSubmissionFindAll = jest.fn();
const mockArtifactFindAll = jest.fn();
const mockArchitectEvaluationFindAll = jest.fn();
const mockCurriculumModuleFindAll = jest.fn();
const mockEnrollmentFindByPk = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn(), query: jest.fn(), define: jest.fn() },
  connectDatabase: jest.fn(),
}));

jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { findOne: mockProjectFindOne },
}));

jest.mock('../../models/ProjectArtifact', () => ({
  __esModule: true,
  default: { findAll: mockProjectArtifactFindAll },
}));

jest.mock('../../models/Artifact', () => ({
  __esModule: true,
  default: { findAll: mockArtifactFindAll },
}));

jest.mock('../../models', () => ({
  ArtifactDefinition: {},
  AssignmentSubmission: { findAll: mockAssignmentSubmissionFindAll },
  ArchitectEvaluation: { findAll: mockArchitectEvaluationFindAll },
  CurriculumModule: { findAll: mockCurriculumModuleFindAll },
  Enrollment: { findByPk: mockEnrollmentFindByPk },
}));

jest.mock('../../services/openaiInstrumented', () => ({
  getInstrumentedOpenAI: jest.fn(() => ({ chat: { completions: { create: jest.fn() } } })),
}));

import { generatePortfolio } from '../../services/portfolioGenerationService';

const PROJECT = { id: 'proj-1', enrollment_id: 'enr-1', organization_name: 'Acme', project_stage: 'discovery', project_variables: {} };

beforeEach(() => {
  jest.clearAllMocks();
  mockProjectArtifactFindAll.mockResolvedValue([]);
  mockAssignmentSubmissionFindAll.mockResolvedValue([]);
});

describe('generatePortfolio — weekly artifacts + readiness score', () => {
  it('returns 12 not_started weeks and a null readiness score when no data exists yet (boundary)', async () => {
    mockProjectFindOne.mockResolvedValue(PROJECT);
    mockArtifactFindAll.mockResolvedValue([]);
    mockArchitectEvaluationFindAll.mockResolvedValue([]);
    mockEnrollmentFindByPk.mockResolvedValue({ cohort_id: 'cohort-1' });
    mockCurriculumModuleFindAll.mockResolvedValue([]);

    const result = await generatePortfolio('enr-1');

    expect(result.portfolio_structure.weekly_artifacts).toHaveLength(12);
    expect(result.portfolio_structure.weekly_artifacts.every((w) => w.status === 'not_started')).toBe(true);
    expect(result.portfolio_structure.weekly_artifacts.every((w) => w.url === null)).toBe(true);
    expect(result.portfolio_structure.readiness_score).toBeNull();
  });

  it('populates week entries from Artifact + CurriculumModule (happy path)', async () => {
    mockProjectFindOne.mockResolvedValue(PROJECT);
    mockArtifactFindAll.mockResolvedValue([
      { week_number: 1, url: 'https://github.com/x/week1', status: 'submitted' },
    ]);
    mockArchitectEvaluationFindAll.mockResolvedValue([]);
    mockEnrollmentFindByPk.mockResolvedValue({ cohort_id: 'cohort-1' });
    mockCurriculumModuleFindAll.mockResolvedValue([
      { module_number: 1, title: 'Architect Workspace + Repo' },
    ]);

    const result = await generatePortfolio('enr-1');
    const week1 = result.portfolio_structure.weekly_artifacts.find((w) => w.week_number === 1)!;
    const week2 = result.portfolio_structure.weekly_artifacts.find((w) => w.week_number === 2)!;

    expect(week1.module_title).toBe('Architect Workspace + Repo');
    expect(week1.url).toBe('https://github.com/x/week1');
    expect(week1.status).toBe('submitted');
    expect(week2.module_title).toBeNull();
    expect(week2.status).toBe('not_started');
  });

  it('sets readiness_score to the most advanced week\'s evaluation, not just the last one queried (happy path)', async () => {
    mockProjectFindOne.mockResolvedValue(PROJECT);
    mockArtifactFindAll.mockResolvedValue([]);
    mockArchitectEvaluationFindAll.mockResolvedValue([
      { week_number: 5, overall_score: 82, progress_summary: 'On track' },
      { week_number: 1, overall_score: 60, progress_summary: 'Getting started' },
    ]);
    mockEnrollmentFindByPk.mockResolvedValue({ cohort_id: 'cohort-1' });
    mockCurriculumModuleFindAll.mockResolvedValue([]);

    const result = await generatePortfolio('enr-1');

    expect(result.portfolio_structure.readiness_score).toBe(82);
    const week5 = result.portfolio_structure.weekly_artifacts.find((w) => w.week_number === 5)!;
    expect(week5.evaluation_summary).toBe('On track');
    expect(week5.evaluation_score).toBe(82);
  });

  it('does not crash and defaults module titles to null when the enrollment has no cohort (boundary)', async () => {
    mockProjectFindOne.mockResolvedValue(PROJECT);
    mockArtifactFindAll.mockResolvedValue([]);
    mockArchitectEvaluationFindAll.mockResolvedValue([]);
    mockEnrollmentFindByPk.mockResolvedValue(null);

    const result = await generatePortfolio('enr-1');

    expect(result.portfolio_structure.weekly_artifacts).toHaveLength(12);
    expect(mockCurriculumModuleFindAll).not.toHaveBeenCalled();
    expect(result.portfolio_structure.weekly_artifacts.every((w) => w.module_title === null)).toBe(true);
  });

  it('returns an empty weekly_artifacts array and null readiness when the project does not exist (failure path)', async () => {
    mockProjectFindOne.mockResolvedValue(null);

    const result = await generatePortfolio('bad-enrollment');

    expect(result.portfolio_structure.weekly_artifacts).toEqual([]);
    expect(result.portfolio_structure.readiness_score).toBeNull();
    expect(mockArtifactFindAll).not.toHaveBeenCalled();
  });
});
