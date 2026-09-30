/**
 * agentUncertaintyIntentService — Reese Agentic AI Employee mission,
 * Capability 7's "What are you uncertain about?" Pins the deterministic
 * trigger detection and that the real answer is built from real
 * StudentAssessment rows (requires_human_review / unanswered_questions),
 * deduped to the most recent assessment per enrollment.
 */
const mockAssessmentFindAll = jest.fn();
jest.mock('../../models/StudentAssessment', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockAssessmentFindAll(...a) },
}));

const mockEnrollmentFindAll = jest.fn();
jest.mock('../../models/Enrollment', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockEnrollmentFindAll(...a) },
}));

import { detectUncertaintyQuery, buildUncertaintyReply } from '../agentUncertaintyIntentService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('detectUncertaintyQuery', () => {
  it.each([
    'What are you uncertain about?',
    "What're you uncertain about",
    'What are you unsure about',
    "What don't you know",
    'What do you not know',
    'What are you unclear on',
  ])('detects: %p', (message) => {
    expect(detectUncertaintyQuery(message)).toBe(true);
  });

  it('honesty boundary: an unrelated message is not detected', () => {
    expect(detectUncertaintyQuery('How is Victor doing this week?')).toBe(false);
  });

  it('boundary: empty message', () => {
    expect(detectUncertaintyQuery('')).toBe(false);
  });
});

describe('buildUncertaintyReply', () => {
  it('honesty path: an agent without the assess_student_health tool never queries assessment data at all', async () => {
    const agent = { id: 'agent-2', agent_name: 'CoryBrain', tools_granted: ['create_tickets'] } as any;

    const reply = await buildUncertaintyReply(agent);

    expect(reply).toContain("doesn't run health assessments");
    expect(mockAssessmentFindAll).not.toHaveBeenCalled();
  });

  describe('an agent that runs assessments', () => {
    const agent = { id: 'agent-1', agent_name: 'Reese', tools_granted: ['respond_to_dm', 'assess_student_health'] } as any;

    it('boundary: zero recent assessments needing review is an honest "nothing" answer', async () => {
      mockAssessmentFindAll.mockResolvedValue([]);

      const reply = await buildUncertaintyReply(agent);

      expect(reply).toBe("Nothing I'm currently uncertain about — every recent assessment came back with a clear picture.");
      expect(mockEnrollmentFindAll).not.toHaveBeenCalled();
    });

    it('happy path: surfaces real student names for assessments needing human review, with the first unanswered question', async () => {
      mockAssessmentFindAll.mockResolvedValue([
        { enrollment_id: 'e1', requires_human_review: true, unanswered_questions: ['Has the student scheduled a practice exam?'] },
      ]);
      mockEnrollmentFindAll.mockResolvedValue([{ id: 'e1', full_name: 'Victor Chukwukere' }]);

      const reply = await buildUncertaintyReply(agent);

      expect(reply).toContain("1 I'm uncertain about:");
      expect(reply).toContain('Victor Chukwukere — Has the student scheduled a practice exam?');
    });

    it('a non-empty unanswered_questions list surfaces even when requires_human_review is false', async () => {
      mockAssessmentFindAll.mockResolvedValue([
        { enrollment_id: 'e1', requires_human_review: false, unanswered_questions: ['Is the project blocker resolved?'] },
      ]);
      mockEnrollmentFindAll.mockResolvedValue([{ id: 'e1', full_name: 'Katy C' }]);

      const reply = await buildUncertaintyReply(agent);

      expect(reply).toContain('Katy C');
    });

    it('dedupes to the most recent assessment per enrollment — an old resolved assessment is not counted if a newer clear one superseded it', async () => {
      mockAssessmentFindAll.mockResolvedValue([
        { enrollment_id: 'e1', requires_human_review: false, unanswered_questions: [] }, // newest (DESC order) — resolved
        { enrollment_id: 'e1', requires_human_review: true, unanswered_questions: ['stale question'] }, // older — superseded
      ]);

      const reply = await buildUncertaintyReply(agent);

      expect(reply).toBe("Nothing I'm currently uncertain about — every recent assessment came back with a clear picture.");
    });

    it('a missing enrollment record falls back to the raw id rather than throwing', async () => {
      mockAssessmentFindAll.mockResolvedValue([
        { enrollment_id: 'e-missing', requires_human_review: true, unanswered_questions: [] },
      ]);
      mockEnrollmentFindAll.mockResolvedValue([]);

      const reply = await buildUncertaintyReply(agent);

      expect(reply).toContain('e-missing');
    });

    it('caps the listed students at 5 and discloses the remainder', async () => {
      mockAssessmentFindAll.mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => ({ enrollment_id: `e${i}`, requires_human_review: true, unanswered_questions: [] })),
      );
      mockEnrollmentFindAll.mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, full_name: `Student ${i}` })),
      );

      const reply = await buildUncertaintyReply(agent);

      expect(reply).toContain("7 I'm uncertain about:");
      expect(reply).toContain('Student 0');
      expect(reply).toContain('Student 4');
      expect(reply).not.toContain('Student 5');
      expect(reply).toContain('...and 2 more.');
    });
  });
});
