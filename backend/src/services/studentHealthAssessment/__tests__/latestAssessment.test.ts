const mockFindOne = jest.fn();
const mockFindAll = jest.fn();
jest.mock('../../../models/StudentAssessment', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockFindOne(...a), findAll: (...a: any[]) => mockFindAll(...a) },
}));

const mockAssessStudentHealth = jest.fn();
jest.mock('../assessStudentHealth', () => ({ assessStudentHealth: (...a: any[]) => mockAssessStudentHealth(...a) }));

import { getAssessmentHistory, getLatestStudentAssessment, maybeRefreshStudentAssessment } from '../latestAssessment';

function row(overrides: any = {}) {
  return {
    id: 'assessment-1', enrollment_id: 'enrollment-1', status: 'watch', confidence_score: 60,
    confidence_band: 'moderate', primary_root_cause: 'time_management_problem', secondary_root_cause: null,
    supporting_evidence: [], contradicting_evidence: [], excluded_evidence: [], positive_momentum_signals: [],
    unanswered_questions: [], recommended_intervention: null, requires_human_review: false,
    reassessment_date: new Date('2026-09-20T00:00:00Z'), rules_version: 'checkpoint-d-v1', model: 'gpt-4o-mini',
    llm_cost_usd: 0.0002, createdAt: new Date('2026-09-05T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getLatestStudentAssessment', () => {
  it('happy path: returns the most recent row mapped to the API shape', async () => {
    mockFindOne.mockResolvedValue(row());

    const result = await getLatestStudentAssessment('enrollment-1');

    expect(mockFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { enrollment_id: 'enrollment-1' }, order: [['created_at', 'DESC']],
    }));
    expect(result?.status).toBe('watch');
    expect(result?.llmCostUsd).toBe(0.0002);
    expect(result?.reassessmentDate).toBe('2026-09-20T00:00:00.000Z');
  });

  it('honesty boundary: no assessment has ever been run returns null, not a fabricated default', async () => {
    mockFindOne.mockResolvedValue(null);

    const result = await getLatestStudentAssessment('enrollment-1');

    expect(result).toBeNull();
  });
});

describe('getAssessmentHistory', () => {
  it('happy path: returns every run for this student, most recent first', async () => {
    mockFindAll.mockResolvedValue([row({ id: 'a2', status: 'critical' }), row({ id: 'a1', status: 'on_track' })]);

    const result = await getAssessmentHistory('enrollment-1');

    expect(mockFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { enrollment_id: 'enrollment-1' }, order: [['created_at', 'DESC']], limit: 20,
    }));
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a2');
    expect(result[1].status).toBe('on_track');
  });

  it('honesty boundary: no assessment has ever been run returns an empty array, not a fabricated entry', async () => {
    mockFindAll.mockResolvedValue([]);

    const result = await getAssessmentHistory('enrollment-1');

    expect(result).toEqual([]);
  });
});

describe('maybeRefreshStudentAssessment', () => {
  it('no assessment exists yet: runs a real assessment', async () => {
    mockFindOne.mockResolvedValue(null);

    await maybeRefreshStudentAssessment('enrollment-1');

    expect(mockAssessStudentHealth).toHaveBeenCalledWith('enrollment-1');
  });

  it('existing assessment is past its own reassessment_date: runs a fresh one', async () => {
    mockFindOne.mockResolvedValue({ reassessment_date: new Date('2000-01-01T00:00:00Z') });

    await maybeRefreshStudentAssessment('enrollment-1');

    expect(mockAssessStudentHealth).toHaveBeenCalledWith('enrollment-1');
  });

  it('cost-safety boundary: an existing assessment not yet due does NOT trigger another LLM call', async () => {
    mockFindOne.mockResolvedValue({ reassessment_date: new Date('2099-01-01T00:00:00Z') });

    await maybeRefreshStudentAssessment('enrollment-1');

    expect(mockAssessStudentHealth).not.toHaveBeenCalled();
  });
});
