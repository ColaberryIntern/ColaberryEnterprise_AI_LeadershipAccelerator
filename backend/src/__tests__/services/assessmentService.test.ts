/**
 * Assessment engine unit tests — BC #9985689581
 *
 * Tests three layers:
 *   1. computeQuizScore() — pure function, deterministic scoring
 *   2. SurveyResponseSchema / QuizProgressSchema — Zod input validation
 *   3. saveSurveyResponse() / saveQuizProgress() — service functions (DB mocked)
 *
 * No DB I/O. All Sequelize model files and external services are mocked.
 */

const mockLessonInstanceFindOne = jest.fn();
const mockLessonInstanceUpdate = jest.fn().mockResolvedValue(undefined);

// Mock all Sequelize model files to avoid Model.init() calls during module load.
jest.mock('../../config/database', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn(), query: jest.fn(), define: jest.fn() },
  connectDatabase: jest.fn(),
}));

jest.mock('../../models/LessonInstance', () => ({
  __esModule: true,
  default: { findOne: mockLessonInstanceFindOne, findByPk: jest.fn() },
}));

// Stub all other model files used by curriculumService
const stubModel = { findAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() };
jest.mock('../../models/CurriculumModule', () => ({ __esModule: true, default: stubModel }));
jest.mock('../../models/CurriculumLesson', () => ({ __esModule: true, default: stubModel }));
jest.mock('../../models/UserCurriculumProfile', () => ({ __esModule: true, default: stubModel }));
jest.mock('../../models/SessionGate', () => ({ __esModule: true, default: stubModel }));
jest.mock('../../models/MiniSection', () => ({ __esModule: true, default: stubModel }));
jest.mock('../../models', () => ({
  Enrollment: stubModel,
  Cohort: stubModel,
  SectionConfig: stubModel,
  ArtifactDefinition: stubModel,
  PromptTemplate: stubModel,
  AssignmentSubmission: stubModel,
}));

// Stub service dependencies
jest.mock('../../services/openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../services/courseLinkService', () => ({ getCourseLinkMap: jest.fn().mockResolvedValue({}) }));
jest.mock('../../services/contentGenerationService', () => ({ generateLessonContent: jest.fn() }));
jest.mock('../../services/variableService', () => ({}));
jest.mock('../../services/artifactService', () => ({}));

import { computeQuizScore, QuizProgressSchema, SurveyResponseSchema } from '../../schemas/assessmentSchemas';
import { saveSurveyResponse, saveQuizProgress } from '../../services/curriculumService';

beforeEach(() => jest.clearAllMocks());

/* ------------------------------------------------------------------ */
/*  computeQuizScore — pure scoring function                           */
/* ------------------------------------------------------------------ */

describe('computeQuizScore', () => {
  it('returns 100 when all 5 answers are correct', () => {
    const input: Record<string, { answer: string; correct: boolean }> = {};
    for (let i = 0; i < 5; i++) input[String(i)] = { answer: '0', correct: true };
    expect(computeQuizScore(input)).toBe(100);
  });

  it('returns 0 when all answers are wrong', () => {
    const input = {
      '0': { answer: '1', correct: false },
      '1': { answer: '2', correct: false },
    };
    expect(computeQuizScore(input)).toBe(0);
  });

  it('returns 70 for 7 correct out of 10', () => {
    const input: Record<string, { answer: string; correct: boolean }> = {};
    for (let i = 0; i < 10; i++) input[String(i)] = { answer: '0', correct: i < 7 };
    expect(computeQuizScore(input)).toBe(70);
  });

  it('is deterministic — same input always produces same score', () => {
    const input = {
      '0': { answer: '0', correct: true },
      '1': { answer: '1', correct: false },
      '2': { answer: '0', correct: true },
    };
    expect(computeQuizScore(input)).toBe(computeQuizScore(input));
    expect(computeQuizScore(input)).toBe(67); // Math.round(2/3 * 100)
  });

  it('returns 0 for empty input (boundary: no questions answered)', () => {
    expect(computeQuizScore({})).toBe(0);
  });

  it('rounds correctly — 3 of 5 correct = 60 not 66.7', () => {
    const input: Record<string, { answer: string; correct: boolean }> = {};
    for (let i = 0; i < 5; i++) input[String(i)] = { answer: '0', correct: i < 3 };
    expect(computeQuizScore(input)).toBe(60);
  });

  it('handles 10-question post-quiz: 10/10 = 100', () => {
    const input: Record<string, { answer: string; correct: boolean }> = {};
    for (let i = 0; i < 10; i++) input[String(i)] = { answer: '0', correct: true };
    expect(computeQuizScore(input)).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/*  Zod schema validation                                              */
/* ------------------------------------------------------------------ */

describe('QuizProgressSchema', () => {
  it('accepts valid quiz progress payload', () => {
    const result = QuizProgressSchema.safeParse({
      '0': { answer: '2', correct: true },
      '1': { answer: '0', correct: false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-numeric keys', () => {
    const result = QuizProgressSchema.safeParse({ 'abc': { answer: '0', correct: true } });
    expect(result.success).toBe(false);
  });

  it('rejects missing correct field', () => {
    const result = QuizProgressSchema.safeParse({ '0': { answer: '1' } });
    expect(result.success).toBe(false);
  });

  it('rejects empty answer string (boundary)', () => {
    const result = QuizProgressSchema.safeParse({ '0': { answer: '', correct: true } });
    expect(result.success).toBe(false);
  });
});

describe('SurveyResponseSchema', () => {
  it('accepts Likert (1-5) and open-text responses', () => {
    const result = SurveyResponseSchema.safeParse({
      content_usefulness: 4,
      top_learning: 'Learned about MCP server patterns.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects Likert value > 5', () => {
    expect(SurveyResponseSchema.safeParse({ content_usefulness: 6 }).success).toBe(false);
  });

  it('rejects Likert value < 1 (boundary: 0)', () => {
    expect(SurveyResponseSchema.safeParse({ content_usefulness: 0 }).success).toBe(false);
  });

  it('rejects open-text longer than 2000 chars', () => {
    expect(SurveyResponseSchema.safeParse({ top_learning: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('rejects empty object (at least one answer required)', () => {
    expect(SurveyResponseSchema.safeParse({}).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  saveSurveyResponse — service layer (DB mocked)                    */
/* ------------------------------------------------------------------ */

describe('saveSurveyResponse', () => {
  it('saves responses to reflection_responses_json (happy path)', async () => {
    const responses = { content_usefulness: 4, top_learning: 'Great stuff' };
    mockLessonInstanceFindOne.mockResolvedValue({ update: mockLessonInstanceUpdate });

    const result = await saveSurveyResponse('enrollment-1', 'lesson-1', responses);

    expect(result).toEqual({ saved: true });
    expect(mockLessonInstanceUpdate).toHaveBeenCalledWith({ reflection_responses_json: responses });
  });

  it('is idempotent — second call with same data overwrites cleanly', async () => {
    const responses = { content_usefulness: 5, top_learning: 'Same answer' };
    mockLessonInstanceFindOne.mockResolvedValue({ update: mockLessonInstanceUpdate });

    await saveSurveyResponse('enrollment-1', 'lesson-1', responses);
    await saveSurveyResponse('enrollment-1', 'lesson-1', responses);

    expect(mockLessonInstanceUpdate).toHaveBeenCalledTimes(2);
    expect(mockLessonInstanceUpdate).toHaveBeenNthCalledWith(2, { reflection_responses_json: responses });
  });

  it('throws when lesson instance not found (failure path)', async () => {
    mockLessonInstanceFindOne.mockResolvedValue(null);
    await expect(saveSurveyResponse('bad-enrollment', 'bad-lesson', { rating: 3 })).rejects.toThrow(
      'Lesson instance not found'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  saveQuizProgress — service layer (DB mocked)                      */
/* ------------------------------------------------------------------ */

describe('saveQuizProgress', () => {
  it('merges new response with existing (partial save — happy path)', async () => {
    mockLessonInstanceFindOne.mockResolvedValue({
      quiz_responses_json: { '0': { answer: '1', correct: true } },
      update: mockLessonInstanceUpdate,
    });

    await saveQuizProgress('enrollment-1', 'lesson-1', { '1': { answer: '2', correct: false } } as any);

    expect(mockLessonInstanceUpdate).toHaveBeenCalledWith({
      quiz_responses_json: {
        '0': { answer: '1', correct: true },
        '1': { answer: '2', correct: false },
      },
    });
  });

  it('handles null existing quiz_responses_json (first question — boundary)', async () => {
    mockLessonInstanceFindOne.mockResolvedValue({
      quiz_responses_json: null,
      update: mockLessonInstanceUpdate,
    });

    await saveQuizProgress('enrollment-1', 'lesson-1', { '0': { answer: '0', correct: true } } as any);

    expect(mockLessonInstanceUpdate).toHaveBeenCalledWith({
      quiz_responses_json: { '0': { answer: '0', correct: true } },
    });
  });

  it('throws when lesson instance not found (failure path)', async () => {
    mockLessonInstanceFindOne.mockResolvedValue(null);
    await expect(saveQuizProgress('bad-enrollment', 'bad-lesson', {} as any)).rejects.toThrow(
      'Lesson instance not found'
    );
  });
});
