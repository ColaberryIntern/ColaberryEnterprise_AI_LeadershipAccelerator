/**
 * architectEvaluationAgent tests (BC #10088637794): wiring the AI Mock
 * Interview's weekly total_score into the Architect Evaluation Agent's
 * readiness aggregate. Model layer + chatCompletion are mocked; no DB/LLM I/O.
 */

jest.mock('../../models/Enrollment', () => ({ findAll: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../models/Cohort', () => ({}));
jest.mock('../../models/ProjectDna', () => ({ findOne: jest.fn() }));
jest.mock('../../models/StudentGithubActivity', () => ({ findOne: jest.fn() }));
jest.mock('../../models/LessonInstance', () => ({ findAll: jest.fn() }));
jest.mock('../../models/InterviewSession', () => ({ findOne: jest.fn() }));
jest.mock('../../models/ArchitectEvaluation', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../../intelligence/assistant/openaiHelper', () => ({ chatCompletion: jest.fn() }));

import { evaluateOneEnrollment, blendOverallScore, curriculumWeekNumber } from '../../services/agents/architectEvaluationAgent';
import Enrollment from '../../models/Enrollment';
import ProjectDna from '../../models/ProjectDna';
import StudentGithubActivity from '../../models/StudentGithubActivity';
import LessonInstance from '../../models/LessonInstance';
import InterviewSession from '../../models/InterviewSession';
import ArchitectEvaluation from '../../models/ArchitectEvaluation';
import { chatCompletion } from '../../intelligence/assistant/openaiHelper';

const findByPkEnrollment = Enrollment.findByPk as jest.Mock;
const findOneDna = ProjectDna.findOne as jest.Mock;
const findOneGithub = StudentGithubActivity.findOne as jest.Mock;
const findAllLessons = LessonInstance.findAll as jest.Mock;
const findOneInterview = InterviewSession.findOne as jest.Mock;
const findOneEval = ArchitectEvaluation.findOne as jest.Mock;
const createEval = ArchitectEvaluation.create as jest.Mock;
const chatCompletionMock = chatCompletion as jest.Mock;

const enrollmentId = '11111111-1111-1111-1111-111111111111';
const weekNumber = 4;

beforeEach(() => {
  jest.clearAllMocks();
  findOneDna.mockResolvedValue(null);
  findOneGithub.mockResolvedValue(null);
  findAllLessons.mockResolvedValue([
    { status: 'completed' }, { status: 'completed' }, { status: 'completed' }, { status: 'completed' }, { status: 'completed' },
    { status: 'pending' }, { status: 'pending' }, { status: 'pending' }, { status: 'pending' }, { status: 'pending' },
  ]); // 5/10 = 50%
  findOneEval.mockResolvedValue(null);
  chatCompletionMock.mockResolvedValue(null); // fallback path by default
});

describe('blendOverallScore (pure)', () => {
  it('happy path: blends lesson completion and interview score 70/30', () => {
    expect(blendOverallScore(80, 90)).toBe(83); // round(56 + 27)
  });

  it('boundary path: no interview data degrades cleanly to lesson percentage alone', () => {
    expect(blendOverallScore(50, null)).toBe(50);
  });

  it('boundary path: 0/0 and 100/100 stay at their extremes', () => {
    expect(blendOverallScore(0, 0)).toBe(0);
    expect(blendOverallScore(100, 100)).toBe(100);
  });

  it('boundary path: rounds a fractional blend to the nearest integer', () => {
    expect(blendOverallScore(50, 51)).toBe(50); // round(35 + 15.3) = round(50.3)
  });
});

describe('curriculumWeekNumber (BC #10088637794 fix — not the calendar week)', () => {
  it('happy path: computes the curriculum week from the cohort start_date, not today\'s calendar week', async () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
    findByPkEnrollment.mockResolvedValue({ cohort: { start_date: daysAgo(22) } }); // 22 days in = week 4

    const week = await curriculumWeekNumber(enrollmentId);

    expect(week).toBe(4);
  });

  it('boundary path: clamps to week 1 for a cohort that just started (day 0)', async () => {
    findByPkEnrollment.mockResolvedValue({ cohort: { start_date: new Date().toISOString() } });

    expect(await curriculumWeekNumber(enrollmentId)).toBe(1);
  });

  it('boundary path: clamps to week 12 for a cohort well past the 12-week program', async () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
    findByPkEnrollment.mockResolvedValue({ cohort: { start_date: daysAgo(400) } });

    expect(await curriculumWeekNumber(enrollmentId)).toBe(12);
  });

  it('failure/boundary path: an enrollment with no cohort on record defaults to week 1 rather than throwing', async () => {
    findByPkEnrollment.mockResolvedValue({ cohort: null });

    expect(await curriculumWeekNumber(enrollmentId)).toBe(1);
  });
});

describe('evaluateOneEnrollment — interview join (fallback/no-LLM path)', () => {
  it('happy path: a completed interview session blends into overall_score and is stored as interview_score', async () => {
    findOneInterview.mockResolvedValue({ total_score: 90, status: 'completed' });

    await evaluateOneEnrollment(enrollmentId, weekNumber);

    expect(findOneInterview).toHaveBeenCalledWith({
      where: { enrollment_id: enrollmentId, week_number: weekNumber, status: 'completed' },
    });
    expect(createEval).toHaveBeenCalledWith(
      expect.objectContaining({ overall_score: 62, interview_score: 90 }) // blendOverallScore(50, 90)
    );
  });

  it('boundary path (missing-session): no interview session — interview_score null, overall_score is lesson percentage alone', async () => {
    findOneInterview.mockResolvedValue(null);

    await evaluateOneEnrollment(enrollmentId, weekNumber);

    expect(createEval).toHaveBeenCalledWith(
      expect.objectContaining({ overall_score: 50, interview_score: null })
    );
    const payload = createEval.mock.calls[0][0];
    expect(payload.next_steps).toContain(`Complete the week ${weekNumber} mock interview`);
  });

  it('boundary path: an in-progress (not yet completed) session is treated the same as missing', async () => {
    // The real query already filters status:'completed', so an in-progress session simply
    // never matches — this asserts the code path degrades safely when findOne resolves null.
    findOneInterview.mockResolvedValue(null);

    await evaluateOneEnrollment(enrollmentId, weekNumber);

    expect(createEval).toHaveBeenCalledWith(expect.objectContaining({ interview_score: null }));
  });

  it('boundary path: a fractional total_score is rounded before storage and blending', async () => {
    findOneInterview.mockResolvedValue({ total_score: 87.6, status: 'completed' });

    await evaluateOneEnrollment(enrollmentId, weekNumber);

    expect(createEval).toHaveBeenCalledWith(
      expect.objectContaining({ interview_score: 88, overall_score: blendOverallScore(50, 88) })
    );
  });

  it('idempotency: re-running for the same week reads the same interview score and updates rather than duplicates the row', async () => {
    findOneInterview.mockResolvedValue({ total_score: 90, status: 'completed' });
    const existingRow = { update: jest.fn() };
    findOneEval.mockResolvedValue(existingRow);

    await evaluateOneEnrollment(enrollmentId, weekNumber);
    await evaluateOneEnrollment(enrollmentId, weekNumber);

    expect(createEval).not.toHaveBeenCalled();
    expect(existingRow.update).toHaveBeenCalledTimes(2);
    expect(existingRow.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ interview_score: 90 }));
    expect(existingRow.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ interview_score: 90 }));
  });
});

describe('evaluateOneEnrollment — interview join (LLM path)', () => {
  it('happy path: the interview score is passed as prompt context to the LLM and still stored even when the LLM succeeds', async () => {
    findOneInterview.mockResolvedValue({ total_score: 75, status: 'completed' });
    chatCompletionMock.mockResolvedValue(JSON.stringify({
      overall_score: 70,
      progress_summary: 'Solid week.',
      strengths: ['Good pacing'],
      next_steps: ['Keep going'],
      technical_gaps: [],
    }));

    await evaluateOneEnrollment(enrollmentId, weekNumber);

    const [, userPrompt] = chatCompletionMock.mock.calls[0];
    expect(userPrompt).toContain('Mock Interview (week 4): scored 75/100.');
    expect(createEval).toHaveBeenCalledWith(
      expect.objectContaining({ overall_score: 70, interview_score: 75 })
    );
  });

  it('boundary path: missing interview data is flagged in the LLM prompt rather than omitted', async () => {
    findOneInterview.mockResolvedValue(null);
    chatCompletionMock.mockResolvedValue(JSON.stringify({
      overall_score: 40, progress_summary: 'Early.', strengths: [], next_steps: [], technical_gaps: [],
    }));

    await evaluateOneEnrollment(enrollmentId, weekNumber);

    const [, userPrompt] = chatCompletionMock.mock.calls[0];
    expect(userPrompt).toContain('No mock interview completed for this week.');
  });
});
