/**
 * The coach may only say what the recording could support, and it is never a grade.
 *
 * The failure this defends against: a student uploads an audio-only rehearsal and the
 * review says "your slides were cluttered and you rarely made eye contact." Both are
 * invented. The student cannot tell which of the other sentences were real, so the
 * whole review becomes worthless — and worse, they may act on it.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

const mockCreate = jest.fn();
const mockFactory = jest.fn(() => ({ chat: { completions: { create: mockCreate } } }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: (...a: any[]) => mockFactory(...a) }));

import { sequelize } from '../../../config/database';
import {
  reviewAttempt, buildCoachPrompt, parseCoachJson, constraintBlock, MAX_IMPROVEMENTS,
} from '../presentationCoachService';
import { modalitiesFor, findModalityViolations, describeMissing } from '../presentationModalities';
import {
  canRead, isOfficialGrade, visibleTo, canWriteFeedback,
  type FeedbackRow,
} from '../presentationFeedbackVisibility';

const q = sequelize.query as unknown as jest.Mock;

const RUBRIC = [
  { dimension: 'Clarity', weight: 40, lookFor: 'One idea per slide.' },
  { dimension: 'Evidence', weight: 60, lookFor: 'Shows the moment live.' },
];

const modelJson = (body: any) => ({ choices: [{ message: { content: JSON.stringify(body) } }] });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  q.mockReset();
  q.mockResolvedValue([[], {}]);
  mockCreate.mockReset();
});
afterEach(() => { (console.log as jest.Mock).mockRestore?.(); });

describe('what the recording actually contains', () => {
  it('reads an explicit flag over anything inferred', () => {
    const m = modalitiesFor({ hasAudio: false, recordingType: 'shared_screen_with_speaker_view' });
    expect(m.missing).toContain('audio');
  });

  it('derives video and screen from the Zoom recording type', () => {
    expect(modalitiesFor({ recordingType: 'audio_only' }).missing).toEqual(expect.arrayContaining(['video', 'screen']));
    expect(modalitiesFor({ recordingType: 'shared_screen_with_speaker_view' }).available)
      .toEqual(expect.arrayContaining(['video', 'screen']));
  });

  // NULL IS NOT FALSE, the same rule as everywhere else in this subsystem.
  it('reports what nobody told us as unknown, never as missing', () => {
    const m = modalitiesFor({});
    expect(m.unknown).toEqual(expect.arrayContaining(['audio', 'video', 'screen', 'transcript']));
    expect(m.missing).toEqual([]);
  });

  it('says out loud what was not assessed', () => {
    expect(describeMissing('video')).toContain('no video');
    expect(describeMissing('screen')).toContain('slides');
  });
});

describe('the constraint is in the prompt AND checked on the way back', () => {
  it('names each missing modality as a thing not to comment on', () => {
    const block = constraintBlock(['audio', 'transcript'], ['video', 'screen']);
    expect(block).toContain('There is no video');
    expect(block).toContain('There is no screen');
    expect(block).toContain('Never fill a gap with a plausible guess');
  });

  it('puts the constraint in the built prompt', () => {
    const p = buildCoachPrompt({
      transcript: 'hello', rubric: RUBRIC, available: ['audio'], missing: ['video', 'screen'], targetSeconds: 300,
    });
    expect(p).toContain('There is no video');
    expect(p).toContain(`AT MOST ${MAX_IMPROVEMENTS}`);
  });

  it('flags a visual claim when there is no video', () => {
    const bad = findModalityViolations('Your slides were cluttered. You spoke clearly.', ['audio']);
    expect(bad).toHaveLength(1);
    expect(bad[0].modality).toBe('video');
  });

  // Saying the modality was unavailable is exactly the phrasing we want. Flagging it
  // would make honesty impossible.
  it('does not flag a sentence that says the modality was unavailable', () => {
    expect(findModalityViolations('We could not see your slides.', ['audio'])).toEqual([]);
    expect(findModalityViolations('There is no video, so nothing here comments on eye contact.', ['audio'])).toEqual([]);
  });

  it('flags an audio claim when there is no audio', () => {
    const bad = findModalityViolations('Your pace was rushed.', ['video']);
    expect(bad[0].modality).toBe('audio');
  });
});

/** THE HEADLINE CASE. */
describe('a transcript-only run makes no visual claims', () => {
  const AUDIO_ONLY = { hasAudio: true, recordingType: 'audio_only', hasTranscript: true };

  it('removes the invented visual findings and keeps the real ones', async () => {
    mockCreate.mockResolvedValue(modelJson({
      scores: [{ dimension: 'Clarity', score: 4 }],
      findings: [
        { atSeconds: 30, text: 'Your slides were cluttered and hard to read.' },
        { atSeconds: 70, text: 'You explained the guardrail clearly.' },
      ],
      improvements: ['Make more eye contact with the room.', 'Slow down on the metric.'],
    }));

    const r = await reviewAttempt({
      attemptId: 'a1', facts: AUDIO_ONLY, transcript: 'words', rubric: RUBRIC,
      rubricVersion: 'v2', promptVersion: 'coach@1',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const all = JSON.stringify(r.review.findings) + JSON.stringify(r.review.improvements);
    expect(all).not.toMatch(/slides|eye contact/i);
    expect(all).toContain('guardrail');
    expect(r.review.removed.length).toBeGreaterThan(0);
  });

  it('tells the student what was not assessed, so silence is not read as approval', async () => {
    mockCreate.mockResolvedValue(modelJson({ scores: [], findings: [], improvements: [] }));
    const r = await reviewAttempt({
      attemptId: 'a1', facts: AUDIO_ONLY, transcript: 'words', rubric: RUBRIC,
      rubricVersion: 'v2', promptVersion: 'coach@1',
    });
    if (!r.ok) return;
    expect(r.review.notAssessed.join(' ')).toMatch(/no video|slides/i);
  });

  it('refuses to review at all when nothing is observable', async () => {
    const r = await reviewAttempt({
      attemptId: 'a1', facts: { hasAudio: false, recordingType: 'audio_only', hasTranscript: false },
      transcript: null, rubric: RUBRIC, rubricVersion: 'v2', promptVersion: 'coach@1',
    });
    expect(r).toEqual({ ok: false, reason: 'no_modalities' });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('the shape of a review', () => {
  const FULL = { hasAudio: true, hasSharedScreen: true, recordingType: 'shared_screen_with_speaker_view', hasTranscript: true };

  it('caps improvements at three, in the order given', async () => {
    mockCreate.mockResolvedValue(modelJson({
      scores: [], findings: [],
      improvements: ['one', 'two', 'three', 'four', 'five'],
    }));
    const r = await reviewAttempt({
      attemptId: 'a1', facts: FULL, transcript: 't', rubric: RUBRIC, rubricVersion: 'v2', promptVersion: 'coach@1',
    });
    if (!r.ok) return;
    expect(r.review.improvements).toEqual(['one', 'two', 'three']);
  });

  it('keeps timestamps on findings, and tolerates one without', () => {
    const p = parseCoachJson('{"scores":[],"findings":[{"atSeconds":12,"text":"a"},{"text":"b"}],"improvements":[]}')!;
    expect(p.findings).toEqual([{ atSeconds: 12, text: 'a' }, { atSeconds: null, text: 'b' }]);
  });

  it('reads JSON out of a fenced response', () => {
    const p = parseCoachJson('```json\n{"scores":[],"findings":[],"improvements":["x"]}\n```');
    expect(p?.improvements).toEqual(['x']);
  });

  it('returns unusable rather than inventing a review from unparseable output', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'I am afraid I cannot help.' } }] });
    const r = await reviewAttempt({
      attemptId: 'a1', facts: FULL, transcript: 't', rubric: RUBRIC, rubricVersion: 'v2', promptVersion: 'coach@1',
    });
    expect(r).toMatchObject({ ok: false, reason: 'unusable_response' });
  });

  it('records provenance, because the rubric will have changed in six weeks', async () => {
    mockCreate.mockResolvedValue(modelJson({ scores: [], findings: [], improvements: [] }));
    const r = await reviewAttempt({
      attemptId: 'a1', facts: FULL, transcript: 't', rubric: RUBRIC, rubricVersion: 'v7', promptVersion: 'coach@3',
    });
    if (!r.ok) return;
    expect(r.review.provenance).toMatchObject({ rubricVersion: 'v7', promptVersion: 'coach@3' });
    expect(r.review.provenance.model).toBeTruthy();
  });

  it('goes through the instrumented client, so the call is costed and traced', async () => {
    mockCreate.mockResolvedValue(modelJson({ scores: [], findings: [], improvements: [] }));
    await reviewAttempt({
      attemptId: 'a1', facts: FULL, transcript: 't', rubric: RUBRIC, rubricVersion: 'v2', promptVersion: 'coach@1',
    });
    expect(mockFactory).toHaveBeenCalledWith({ workflow_id: 'presentation_coach', prompt_version: 'coach@1' });
  });

  it('stores the row as a PRIVATE ai draft, never as a grade', async () => {
    mockCreate.mockResolvedValue(modelJson({ scores: [], findings: [], improvements: [] }));
    await reviewAttempt({
      attemptId: 'a1', facts: FULL, transcript: 't', rubric: RUBRIC, rubricVersion: 'v2', promptVersion: 'coach@1',
    });
    const insert = String(q.mock.calls[0][0]);
    expect(insert).toContain("'ai'");
    expect(insert).toContain("'private'");
    expect(insert).toContain("'draft'");
  });
});

/**
 * A student rehearses badly on purpose — that is what rehearsal is for. If a
 * classmate can read the coach's score from attempt two, they stop rehearsing
 * honestly, and the most useful part of the Studio dies quietly.
 */
describe('private practice scores stay private', () => {
  const OWNER = { enrollmentId: 'owner-1' };
  const aiPrivate: FeedbackRow = { attemptId: 'a1', evaluatorRole: 'ai', visibility: 'private', reviewState: 'draft' };

  it('the owner reads their own private review', () => {
    expect(canRead(aiPrivate, OWNER, { enrollmentId: 'owner-1' })).toBe(true);
  });

  it('a peer cannot read it', () => {
    expect(canRead(aiPrivate, OWNER, { enrollmentId: 'peer-1' })).toBe(false);
  });

  // Being on the same team does not entitle someone to another person's rehearsal.
  it('a TEAMMATE cannot read it either', () => {
    expect(canRead(aiPrivate, OWNER, { enrollmentId: 'peer-1', teammateOf: ['owner-1'] })).toBe(false);
  });

  /**
   * A PUBLISHED private row. The draft-based tests above pass on the draft rule and
   * never reach the visibility switch at all — a mutation that made `private` readable
   * broke none of them. This is the case that actually exercises the rule.
   */
  const aiPrivatePublished: FeedbackRow = {
    attemptId: 'a1', evaluatorRole: 'ai', visibility: 'private', reviewState: 'published',
  };

  it('a peer cannot read a PUBLISHED private score either', () => {
    expect(canRead(aiPrivatePublished, OWNER, { enrollmentId: 'peer-1' })).toBe(false);
  });

  it('a teammate cannot read a PUBLISHED private score', () => {
    expect(canRead(aiPrivatePublished, OWNER, { enrollmentId: 'peer-1', teammateOf: ['owner-1'] })).toBe(false);
  });

  it('shared_with_instructor is not readable by a peer, published or not', () => {
    const row: FeedbackRow = {
      attemptId: 'a1', evaluatorRole: 'self', visibility: 'shared_with_instructor', reviewState: 'published',
    };
    expect(canRead(row, OWNER, { enrollmentId: 'peer-1' })).toBe(false);
    expect(canRead(row, OWNER, { enrollmentId: 'staff-1', isStaff: true })).toBe(true);
  });

  it('visibleTo hides a published private row from a peer', () => {
    expect(visibleTo([aiPrivatePublished], OWNER, { enrollmentId: 'peer-1' })).toEqual([]);
  });

  it('staff can, because they are the ones who have to help', () => {
    expect(canRead(aiPrivate, OWNER, { enrollmentId: 'staff-1', isStaff: true })).toBe(true);
  });

  it('a draft is not readable by anyone else, whatever its visibility claims', () => {
    const draftCohort: FeedbackRow = { attemptId: 'a1', evaluatorRole: 'instructor', visibility: 'cohort', reviewState: 'draft' };
    expect(canRead(draftCohort, OWNER, { enrollmentId: 'peer-1' })).toBe(false);
  });

  it('a published cohort review is readable by the cohort', () => {
    const published: FeedbackRow = { attemptId: 'a1', evaluatorRole: 'instructor', visibility: 'cohort', reviewState: 'published' };
    expect(canRead(published, OWNER, { enrollmentId: 'peer-1' })).toBe(true);
  });

  // An unrecognised visibility must fail CLOSED.
  it('an unknown visibility is not readable', () => {
    const weird = { attemptId: 'a1', evaluatorRole: 'peer', visibility: 'something_new', reviewState: 'published' } as any;
    expect(canRead(weird, OWNER, { enrollmentId: 'peer-1' })).toBe(false);
  });

  it('filters a mixed list down to what the viewer may actually see', () => {
    const rows: FeedbackRow[] = [
      aiPrivate,
      { attemptId: 'a1', evaluatorRole: 'instructor', visibility: 'cohort', reviewState: 'published' },
    ];
    expect(visibleTo(rows, OWNER, { enrollmentId: 'peer-1' })).toHaveLength(1);
    expect(visibleTo(rows, OWNER, { enrollmentId: 'owner-1' })).toHaveLength(2);
  });
});

describe('final grading stays human-controlled', () => {
  it('an AI review is never the official grade', () => {
    expect(isOfficialGrade({ attemptId: 'a1', evaluatorRole: 'ai', visibility: 'private', reviewState: 'published' })).toBe(false);
  });

  it('a peer review is never the official grade', () => {
    expect(isOfficialGrade({ attemptId: 'a1', evaluatorRole: 'peer', visibility: 'cohort', reviewState: 'published' })).toBe(false);
  });

  it('only a PUBLISHED instructor review grades', () => {
    expect(isOfficialGrade({ attemptId: 'a1', evaluatorRole: 'instructor', visibility: 'cohort', reviewState: 'draft' })).toBe(false);
    expect(isOfficialGrade({ attemptId: 'a1', evaluatorRole: 'instructor', visibility: 'cohort', reviewState: 'published' })).toBe(true);
  });

  it('a peer may leave a note but cannot write as an instructor', () => {
    const owner = { enrollmentId: 'owner-1' };
    expect(canWriteFeedback('peer', { enrollmentId: 'peer-1' }, owner)).toBe(true);
    expect(canWriteFeedback('instructor', { enrollmentId: 'peer-1' }, owner)).toBe(false);
    expect(canWriteFeedback('instructor', { enrollmentId: 'staff-1', isStaff: true }, owner)).toBe(true);
    // Nobody writes a self-review on someone else's attempt.
    expect(canWriteFeedback('self', { enrollmentId: 'peer-1' }, owner)).toBe(false);
    // The server writes ai rows; a request carrying a viewer never does.
    expect(canWriteFeedback('ai', { enrollmentId: 'staff-1', isStaff: true }, owner)).toBe(false);
  });
});
