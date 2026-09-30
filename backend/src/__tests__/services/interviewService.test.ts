/**
 * Interview service unit tests — BC #9985688999 (Classroom Week View, Epic 3)
 *
 * Tests:
 *   1. scoreAnswer() — pure function
 *   2. computeInterviewScore() — pure function, deterministic scoring
 *   3. startInterview() — idempotency (find-or-create)
 *   4. submitInterview() — idempotency (no double-score on retry)
 *
 * No real DB or LLM I/O. All models and Anthropic client are mocked.
 */

const mockFindOrCreate = jest.fn();
const mockFindOne = jest.fn();
const mockSessionUpdate = jest.fn();
const mockEnrollmentFindByPk = jest.fn();
const mockRubricFindOne = jest.fn();
const mockMessagesCreate = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn(), query: jest.fn(), define: jest.fn() },
  connectDatabase: jest.fn(),
}));

const stubModel = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
  findOrCreate: jest.fn(),
  update: jest.fn(),
};

jest.mock('../../models/InterviewSession', () => ({
  __esModule: true,
  default: {
    findOrCreate: mockFindOrCreate,
    findOne: mockFindOne,
  },
}));

jest.mock('../../models/InterviewRubric', () => ({
  __esModule: true,
  default: { findOne: mockRubricFindOne },
}));

jest.mock('../../models/Enrollment', () => ({
  __esModule: true,
  default: { findByPk: mockEnrollmentFindByPk },
}));

jest.mock('../../models/WeekItemVisibility', () => ({ __esModule: true, default: stubModel }));

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

jest.mock('../../services/emailService', () => ({
  sendInterviewResult: jest.fn().mockResolvedValue(undefined),
}));

import { scoreAnswer, computeInterviewScore, startInterview, submitInterview, _resetClientForTesting } from '../../services/interviewService';
import type { RubricQuestion } from '../../models/InterviewRubric';

beforeEach(() => {
  jest.clearAllMocks();
  _resetClientForTesting();
  mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Good work overall.' }] });
});

/* ─── scoreAnswer — pure function ──────────────────────────────────────────── */

describe('scoreAnswer', () => {
  it('returns max_points when all expected topics are present', () => {
    expect(scoreAnswer('I ran npx claude init and set up claude.md', ['claude', 'init', 'claude.md'], 20)).toBe(20);
  });

  it('returns 0 when no expected topics match', () => {
    expect(scoreAnswer('I do not know', ['claude', 'init', 'build'], 20)).toBe(0);
  });

  it('returns proportional score for partial matches', () => {
    // 2 of 4 topics → 50%
    expect(scoreAnswer('I used claude and ran init', ['claude', 'init', 'commit', 'diff'], 20)).toBe(10);
  });

  it('returns 0 when expectedTopics is empty', () => {
    expect(scoreAnswer('any answer', [], 20)).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(scoreAnswer('CLAUDE.MD INIT BUILD', ['claude.md', 'init', 'build'], 30)).toBe(30);
  });
});

/* ─── computeInterviewScore — pure function ─────────────────────────────────  */

describe('computeInterviewScore', () => {
  const questions: RubricQuestion[] = [
    { id: 'q1', text: 'Q1', expected_topics: ['claude', 'init'], max_points: 20 },
    { id: 'q2', text: 'Q2', expected_topics: ['commit', 'diff', 'push'], max_points: 30 },
  ];

  it('scores 100 when all topics are covered', () => {
    const answers = [
      { question_id: 'q1', answer: 'I used claude and ran init' },
      { question_id: 'q2', answer: 'I did a commit, saw the diff, and pushed to GitHub' },
    ];
    const { total_score } = computeInterviewScore(answers, questions);
    expect(total_score).toBe(100);
  });

  it('scores 0 when no answers are provided', () => {
    const { total_score } = computeInterviewScore([], questions);
    expect(total_score).toBe(0);
  });

  it('includes points_earned on each scored answer', () => {
    const answers = [{ question_id: 'q1', answer: 'I used claude' }];
    const { scoredAnswers } = computeInterviewScore(answers, questions);
    const q1 = scoredAnswers.find((a) => a.question_id === 'q1')!;
    expect(q1.points_earned).toBe(10); // 1 of 2 topics → 50% of 20
  });

  it('gives 0 points for a question with no submitted answer', () => {
    const answers = [{ question_id: 'q1', answer: 'claude and init' }];
    const { scoredAnswers } = computeInterviewScore(answers, questions);
    const q2 = scoredAnswers.find((a) => a.question_id === 'q2')!;
    expect(q2.points_earned).toBe(0);
    expect(q2.answer).toBe('');
  });
});

/* ─── startInterview — idempotency ─────────────────────────────────────────── */

describe('startInterview', () => {
  const rubric = {
    id: 'rubric-1',
    week_number: 1,
    questions: [{ id: 'q1', text: 'Q1', expected_topics: ['claude'], max_points: 20 }],
  };

  it('creates a new session on first call', async () => {
    mockRubricFindOne.mockResolvedValue(rubric);
    const session = { id: 'session-1', status: 'in_progress', update: jest.fn() };
    mockFindOrCreate.mockResolvedValue([session, true]);

    const result = await startInterview('enrollment-1', 1);

    expect(result.session_id).toBe('session-1');
    expect(result.already_completed).toBe(false);
    expect(result.questions).toHaveLength(1);
  });

  it('returns the existing session without creating a duplicate', async () => {
    mockRubricFindOne.mockResolvedValue(rubric);
    const session = { id: 'session-1', status: 'completed', update: jest.fn() };
    mockFindOrCreate.mockResolvedValue([session, false]); // created = false

    const result = await startInterview('enrollment-1', 1);

    expect(result.already_completed).toBe(true);
    expect(mockFindOrCreate).toHaveBeenCalledTimes(1);
  });

  it('throws ValidationError when no rubric exists for the week', async () => {
    mockRubricFindOne.mockResolvedValue(null);

    await expect(startInterview('enrollment-1', 99)).rejects.toMatchObject({
      error_class: 'ValidationError',
    });
  });
});

/* ─── submitInterview — idempotency ─────────────────────────────────────────── */

describe('submitInterview', () => {
  const rubric = {
    id: 'rubric-1',
    week_number: 1,
    questions: [{ id: 'q1', text: 'Q1', expected_topics: ['claude', 'init'], max_points: 20 }],
  };

  it('scores and returns result on first submit', async () => {
    const session = {
      id: 'session-1',
      enrollment_id: 'enrollment-1',
      week_number: 1,
      status: 'in_progress',
      total_score: null,
      feedback: null,
      emailed_at: null,
      get: (key: string) => (key === 'rubric' ? rubric : undefined),
      update: mockSessionUpdate,
    };
    mockFindOne.mockResolvedValue(session);
    mockEnrollmentFindByPk.mockResolvedValue({ email: 'a@b.com', full_name: 'Alice' });
    mockSessionUpdate.mockResolvedValue(undefined);

    const result = await submitInterview('session-1', 'enrollment-1', [
      { question_id: 'q1', answer: 'I used claude and init' },
    ]);

    expect(result.total_score).toBe(100);
    expect(typeof result.feedback).toBe('string');
  });

  it('returns stored result without re-scoring on duplicate submit (idempotent)', async () => {
    const session = {
      id: 'session-1',
      enrollment_id: 'enrollment-1',
      week_number: 1,
      status: 'completed',
      total_score: 85,
      feedback: 'Great work.',
      emailed_at: new Date(),
      get: jest.fn(),
      update: mockSessionUpdate,
    };
    mockFindOne.mockResolvedValue(session);

    const result = await submitInterview('session-1', 'enrollment-1', [
      { question_id: 'q1', answer: 'any answer' },
    ]);

    expect(result.total_score).toBe(85);
    expect(result.feedback).toBe('Great work.');
    expect(mockSessionUpdate).not.toHaveBeenCalled(); // no re-scoring
  });

  it('throws ValidationError when session is not found', async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(
      submitInterview('bad-id', 'enrollment-1', [{ question_id: 'q1', answer: 'x' }])
    ).rejects.toMatchObject({ error_class: 'ValidationError' });
  });
});
