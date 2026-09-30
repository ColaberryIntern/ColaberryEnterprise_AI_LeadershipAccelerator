/**
 * Reese Phase 2 — real signal evaluation tests. Covers the boundary values the
 * task brief and plan require (exactly-at-threshold on both sides), and the
 * "returns null cleanly, never throws" contract for a student with zero data.
 */
jest.mock('../../../models/Enrollment', () => ({ findAll: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../../models/TimelineCardProgress', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/StudentNavigationEvent', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/CurriculumLesson', () => ({ findByPk: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findOne: jest.fn() }));

import Enrollment from '../../../models/Enrollment';
import TimelineCardProgress from '../../../models/TimelineCardProgress';
import StudentNavigationEvent from '../../../models/StudentNavigationEvent';
import CurriculumLesson from '../../../models/CurriculumLesson';
import AiAgent from '../../../models/AiAgent';
import {
  getPilotCohortStudentEnrollmentIds,
  evaluateInactivitySignal,
  evaluateBehaviorAnomalySignal,
} from '../reeseSignalService';

const mockEnrollmentFindAll = Enrollment.findAll as unknown as jest.Mock;
const mockEnrollmentFindByPk = Enrollment.findByPk as unknown as jest.Mock;
const mockProgressFindAll = TimelineCardProgress.findAll as unknown as jest.Mock;
const mockNavEventFindAll = StudentNavigationEvent.findAll as unknown as jest.Mock;
const mockLessonFindByPk = CurriculumLesson.findByPk as unknown as jest.Mock;
const mockAiAgentFindOne = AiAgent.findOne as unknown as jest.Mock;

const NOW = new Date('2026-08-09T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const ENROLLMENT_ID = 'student-1';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('getPilotCohortStudentEnrollmentIds', () => {
  it('lists active students in the configured pilot cohort(s)', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: { pilot_cohort_ids: ['cohort-a'] } });
    mockEnrollmentFindAll.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);

    const ids = await getPilotCohortStudentEnrollmentIds();

    expect(ids).toEqual(['s1', 's2']);
    expect(mockEnrollmentFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'active' }) }),
    );
  });

  it('fail-closed: returns [] with no query at all when no pilot cohort is configured', async () => {
    mockAiAgentFindOne.mockResolvedValue({ config: {} });
    const ids = await getPilotCohortStudentEnrollmentIds();
    expect(ids).toEqual([]);
    expect(mockEnrollmentFindAll).not.toHaveBeenCalled();
  });
});

describe('evaluateInactivitySignal — boundary values', () => {
  it('exactly 7 days inactive -> fires', async () => {
    mockProgressFindAll.mockResolvedValue([
      { status: 'in_progress', updated_at: new Date(NOW.getTime() - 7 * DAY_MS) },
    ]);
    const result = await evaluateInactivitySignal(ENROLLMENT_ID);
    expect(result).not.toBeNull();
    expect(result!.reasons.some((r) => r.includes('No activity'))).toBe(true);
  });

  it('6 days 23 hours inactive (just under 7 days) -> does not fire on inactivity alone', async () => {
    mockProgressFindAll.mockResolvedValue([
      // 1 of 1 cards completed -> 100% completion, so ONLY the inactivity
      // reason is in play for this boundary check.
      { status: 'completed', updated_at: new Date(NOW.getTime() - (7 * DAY_MS - 60 * 60 * 1000)) },
    ]);
    const result = await evaluateInactivitySignal(ENROLLMENT_ID);
    expect(result).toBeNull();
  });

  it('exactly 20% completion -> does NOT fire (threshold is strictly < 20)', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      status: i === 0 ? 'completed' : 'in_progress', // 1/5 = 20%
      updated_at: NOW, // active right now, so inactivity reason can't fire either
    }));
    mockProgressFindAll.mockResolvedValue(rows);
    const result = await evaluateInactivitySignal(ENROLLMENT_ID);
    expect(result).toBeNull();
  });

  it('completion just under the 20% threshold (1/6 ≈ 17%) -> fires', async () => {
    const rows = [
      { status: 'completed', updated_at: NOW },
      ...Array.from({ length: 5 }, () => ({ status: 'in_progress', updated_at: NOW })), // 1/6 ≈ 16.7% < 20
    ];
    mockProgressFindAll.mockResolvedValue(rows);
    const result = await evaluateInactivitySignal(ENROLLMENT_ID);
    expect(result).not.toBeNull();
    expect(result!.completionPct).toBeLessThan(20);
    expect(result!.reasons.some((r) => r.includes('Low progress'))).toBe(true);
  });

  it('zero progress rows -> falls back to Enrollment.enrolled_at, never throws', async () => {
    mockProgressFindAll.mockResolvedValue([]);
    mockEnrollmentFindByPk.mockResolvedValue({ id: ENROLLMENT_ID, enrolled_at: new Date(NOW.getTime() - 10 * DAY_MS) });

    const result = await evaluateInactivitySignal(ENROLLMENT_ID);

    expect(result).not.toBeNull();
    expect(result!.totalCards).toBe(0);
    // 0 total cards must never be reported as "low progress" (nothing assigned yet)
    expect(result!.reasons.some((r) => r.includes('Low progress'))).toBe(false);
    expect(result!.reasons.some((r) => r.includes('No activity'))).toBe(true);
  });

  it('no signal at all -> returns null cleanly (recently active, well-progressed student)', async () => {
    mockProgressFindAll.mockResolvedValue([
      { status: 'completed', updated_at: NOW },
      { status: 'completed', updated_at: NOW },
    ]);
    const result = await evaluateInactivitySignal(ENROLLMENT_ID);
    expect(result).toBeNull();
  });
});

describe('evaluateBehaviorAnomalySignal — boundary values', () => {
  it('exactly 3 idle events -> fires (threshold is >= 3)', async () => {
    mockNavEventFindAll.mockResolvedValue([
      { lesson_id: 'lesson-1', created_at: NOW },
      { lesson_id: 'lesson-1', created_at: NOW },
      { lesson_id: 'lesson-1', created_at: NOW },
    ]);
    mockLessonFindByPk.mockResolvedValue({ id: 'lesson-1', title: 'Intro to Agents' });

    const result = await evaluateBehaviorAnomalySignal(ENROLLMENT_ID);

    expect(result).not.toBeNull();
    expect(result!.idleCount).toBe(3);
    expect(result!.lessonTitle).toBe('Intro to Agents');
  });

  it('2 idle events (just under threshold) -> returns null', async () => {
    mockNavEventFindAll.mockResolvedValue([
      { lesson_id: 'lesson-1', created_at: NOW },
      { lesson_id: 'lesson-1', created_at: NOW },
    ]);
    const result = await evaluateBehaviorAnomalySignal(ENROLLMENT_ID);
    expect(result).toBeNull();
    expect(mockLessonFindByPk).not.toHaveBeenCalled();
  });

  it('zero events -> returns null cleanly, never throws', async () => {
    mockNavEventFindAll.mockResolvedValue([]);
    const result = await evaluateBehaviorAnomalySignal(ENROLLMENT_ID);
    expect(result).toBeNull();
  });

  it('no lesson_id on the events -> lessonTitle is null, not a crash, no lookup attempted', async () => {
    mockNavEventFindAll.mockResolvedValue([
      { lesson_id: null, created_at: NOW },
      { lesson_id: null, created_at: NOW },
      { lesson_id: null, created_at: NOW },
    ]);
    const result = await evaluateBehaviorAnomalySignal(ENROLLMENT_ID);
    expect(result).not.toBeNull();
    expect(result!.lessonTitle).toBeNull();
    expect(mockLessonFindByPk).not.toHaveBeenCalled();
  });
});
