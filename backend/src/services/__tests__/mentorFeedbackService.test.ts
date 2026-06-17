// Unit tests for mentorFeedbackService
// Tests the pure confidence heuristic and the idempotency + routing logic.
// OpenAI and DB calls are mocked — no network, no database required.

jest.mock('openai', () => {
  const mockCreate = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
    _mockCreate: mockCreate,
  };
});

jest.mock('../../models/AssignmentSubmission', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));

jest.mock('../../models/MentorReviewItem', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

import {
  estimateConfidence,
  processSubmissionForMentor,
  getFeedbackForSubmission,
} from '../mentorFeedbackService';
import AssignmentSubmission from '../../models/AssignmentSubmission';
import MentorReviewItem from '../../models/MentorReviewItem';

const mockSubmission = require('../../models/AssignmentSubmission').default;
const mockReviewItem = require('../../models/MentorReviewItem').default;
const openaiMock = require('openai');

function getCreateMock() {
  return openaiMock._mockCreate as jest.Mock;
}

// ─── estimateConfidence (pure function) ───────────────────────────────────────

describe('estimateConfidence', () => {
  it('returns base score 0.85 for normal content with no hedging', () => {
    const content = { answer: 'A'.repeat(200) };
    const feedback = 'Great work on the architecture section. The governance framework is solid.';
    expect(estimateConfidence('build_lab', content, feedback)).toBeCloseTo(0.85);
  });

  it('reduces score by 0.35 when content is empty', () => {
    const feedback = 'Good effort.';
    expect(estimateConfidence('build_lab', null, feedback)).toBeCloseTo(0.5);
  });

  it('reduces score by 0.35 when content JSON stringifies to < 100 chars', () => {
    const feedback = 'Good effort.';
    expect(estimateConfidence('build_lab', { x: 'hi' }, feedback)).toBeCloseTo(0.5);
  });

  it('reduces score by 0.2 for prework_upload with no content_json', () => {
    const feedback = 'Reviewed the file.';
    // Short content (-0.35) + upload with no content (-0.20) = 0.85 - 0.35 - 0.20 = 0.30
    expect(estimateConfidence('prework_upload', null, feedback)).toBeCloseTo(0.30);
  });

  it('reduces score by 0.15 when feedback contains hedging phrase', () => {
    const content = { answer: 'A'.repeat(200) };
    const feedback = 'I cannot determine the quality from this submission.';
    expect(estimateConfidence('build_lab', content, feedback)).toBeCloseTo(0.70);
  });

  it('applies multiple deductions and clamps to 0', () => {
    // Short content (-0.35) + upload (-0.20) + hedging (-0.15) = 0.85 - 0.70 = 0.15
    const feedback = 'This is unclear and hard to say without more detail.';
    const result = estimateConfidence('prework_upload', null, feedback);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(0.3);
  });
});

// ─── processSubmissionForMentor ────────────────────────────────────────────────

describe('processSubmissionForMentor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.MENTOR_CONFIDENCE_THRESHOLD = '0.8';
  });

  it('creates a review item with status auto_approved when confidence >= 0.8', async () => {
    mockReviewItem.findOne.mockResolvedValue(null); // not yet processed
    mockSubmission.findByPk.mockResolvedValue({
      id: 'sub-1',
      enrollment_id: 'enroll-1',
      assignment_type: 'build_lab',
      title: 'AI Strategy Doc',
      content_json: { text: 'A'.repeat(300) },
    });
    getCreateMock().mockResolvedValue({
      choices: [{ message: { content: 'Strengths: solid plan. Gaps: missing governance.' } }],
    });
    mockReviewItem.create.mockResolvedValue({});

    await processSubmissionForMentor('sub-1');

    expect(mockReviewItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'auto_approved' })
    );
  });

  it('creates a review item with status pending_review when confidence < 0.8', async () => {
    mockReviewItem.findOne.mockResolvedValue(null);
    mockSubmission.findByPk.mockResolvedValue({
      id: 'sub-2',
      enrollment_id: 'enroll-1',
      assignment_type: 'prework_upload',
      title: 'Upload',
      content_json: null, // file-only → low confidence
    });
    getCreateMock().mockResolvedValue({
      choices: [{ message: { content: 'Cannot determine the quality without more context.' } }],
    });
    mockReviewItem.create.mockResolvedValue({});

    await processSubmissionForMentor('sub-2');

    expect(mockReviewItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending_review' })
    );
  });

  it('is idempotent — does not create a second item if one already exists', async () => {
    mockReviewItem.findOne.mockResolvedValue({ id: 'existing' }); // already processed

    await processSubmissionForMentor('sub-3');

    expect(mockReviewItem.create).not.toHaveBeenCalled();
    expect(getCreateMock()).not.toHaveBeenCalled();
  });

  it('does not throw and does not create item when OpenAI fails', async () => {
    mockReviewItem.findOne.mockResolvedValue(null);
    mockSubmission.findByPk.mockResolvedValue({
      id: 'sub-4',
      enrollment_id: 'enroll-1',
      assignment_type: 'build_lab',
      title: 'Test',
      content_json: { x: 'A'.repeat(200) },
    });
    getCreateMock().mockRejectedValue(new Error('OpenAI 500'));

    await expect(processSubmissionForMentor('sub-4')).resolves.not.toThrow();
    expect(mockReviewItem.create).not.toHaveBeenCalled();
  });

  it('does nothing when the submission does not exist', async () => {
    mockReviewItem.findOne.mockResolvedValue(null);
    mockSubmission.findByPk.mockResolvedValue(null);

    await processSubmissionForMentor('nonexistent');

    expect(getCreateMock()).not.toHaveBeenCalled();
    expect(mockReviewItem.create).not.toHaveBeenCalled();
  });
});

// ─── getFeedbackForSubmission (human-review gate) ─────────────────────────────

describe('getFeedbackForSubmission', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns feedback for auto_approved items', async () => {
    mockReviewItem.findOne.mockResolvedValue({
      ai_feedback: 'Solid work.',
      status: 'auto_approved',
      reviewer_notes: null,
    });
    const res = await getFeedbackForSubmission('sub-1', 'enroll-1');
    expect(res).toEqual({ ai_feedback: 'Solid work.', status: 'auto_approved', reviewer_notes: null });
  });

  it('returns feedback plus reviewer_notes for approved items', async () => {
    mockReviewItem.findOne.mockResolvedValue({
      ai_feedback: 'Reviewed feedback.',
      status: 'approved',
      reviewer_notes: 'Tightened the gaps section.',
    });
    const res = await getFeedbackForSubmission('sub-2', 'enroll-1');
    expect(res).toEqual({
      ai_feedback: 'Reviewed feedback.',
      status: 'approved',
      reviewer_notes: 'Tightened the gaps section.',
    });
  });

  it('hides pending_review feedback from the student (returns null)', async () => {
    mockReviewItem.findOne.mockResolvedValue({
      ai_feedback: 'Unvetted low-confidence feedback.',
      status: 'pending_review',
      reviewer_notes: null,
    });
    expect(await getFeedbackForSubmission('sub-3', 'enroll-1')).toBeNull();
  });

  it('hides dismissed feedback from the student (returns null)', async () => {
    mockReviewItem.findOne.mockResolvedValue({
      ai_feedback: 'Feedback a human rejected.',
      status: 'dismissed',
      reviewer_notes: 'Off-base, not shown.',
    });
    expect(await getFeedbackForSubmission('sub-4', 'enroll-1')).toBeNull();
  });

  it('returns null when no review item exists', async () => {
    mockReviewItem.findOne.mockResolvedValue(null);
    expect(await getFeedbackForSubmission('sub-5', 'enroll-1')).toBeNull();
  });
});
