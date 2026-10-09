/**
 * Publishing once, withdrawing immediately, and never conflating a click with a
 * presentation.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import { publishShowcase, withdrawShowcase, contentHash, rebindContent } from '../showcaseService';
import { cohortMetrics, concerns, MIN_ATTENDANCE_SECONDS, type CohortRow } from '../instructorMetrics';
import { checkGrounding } from '../presentationGrounding';
import type { ShowcaseRow } from '../showcaseAccess';

const q = sequelize.query as unknown as jest.Mock;

const approved = (over: Partial<ShowcaseRow> = {}): ShowcaseRow => ({
  id: 's1',
  ownerEnrollmentId: 'owner-1',
  cohortId: 'c1',
  audience: 'cohort',
  contentHash: 'h1',
  currentContentHash: 'h1',
  authorApprovedAt: new Date(),
  staffApprovedAt: new Date(),
  publishedAt: null,
  withdrawnAt: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  q.mockReset();
});
afterEach(() => { (console.log as jest.Mock).mockRestore?.(); });

/**
 * A student double-clicks publish; the first request is slow; both run. Without a
 * constraint that is two rows, two gallery entries and two notifications.
 */
describe('publishing happens exactly once', () => {
  it('publishes an approved showcase', async () => {
    q.mockResolvedValueOnce([[{ id: 's1', publication_ref: 'showcase:s1' }], {}]);
    const r = await publishShowcase(approved(), 'cohort');
    expect(r).toMatchObject({ ok: true, alreadyPublished: false, publicationRef: 'showcase:s1' });
  });

  it('guards the write with published_at IS NULL, not a prior read', async () => {
    q.mockResolvedValueOnce([[{ id: 's1', publication_ref: 'showcase:s1' }], {}]);
    await publishShowcase(approved(), 'cohort');
    expect(String(q.mock.calls[0][0])).toContain('published_at IS NULL');
  });

  // The loser of the race updates nothing. That is the correct outcome: there is
  // exactly one publication and it exists.
  it('a lost race reports already-published rather than minting a second', async () => {
    q.mockResolvedValueOnce([[], {}]);
    const r = await publishShowcase(approved(), 'cohort');
    expect(r).toMatchObject({ ok: true, alreadyPublished: true });
  });

  // The student pressed a button and the thing they wanted is true. An error would
  // make them press it again.
  it('re-publishing something already live is a no-op, not an error', async () => {
    const r = await publishShowcase(approved({ publishedAt: new Date() }), 'cohort');
    expect(r).toMatchObject({ ok: true, alreadyPublished: true });
    expect(q).not.toHaveBeenCalled();
  });

  it('refuses to publish when the approval went stale, and writes nothing', async () => {
    const r = await publishShowcase(approved({ currentContentHash: 'h2' }), 'cohort');
    expect(r.ok).toBe(false);
    expect(q).not.toHaveBeenCalled();
  });

  it('refuses without staff approval', async () => {
    const r = await publishShowcase(approved({ staffApprovedAt: null }), 'cohort');
    expect(r.ok).toBe(false);
    expect(q).not.toHaveBeenCalled();
  });
});

describe('withdrawal is immediate and keeps the record', () => {
  it('withdraws once', async () => {
    q.mockResolvedValueOnce([[{ id: 's1' }], {}]);
    expect(await withdrawShowcase('s1', 'wrong take')).toEqual({ ok: true, alreadyWithdrawn: false });
  });

  it('withdrawing twice is a no-op', async () => {
    q.mockResolvedValueOnce([[], {}]);
    expect(await withdrawShowcase('s1', 'again')).toEqual({ ok: true, alreadyWithdrawn: true });
  });

  // "Published then withdrawn" and "never published" are different facts, and
  // somebody will need to know which.
  it('keeps the row and records the reason rather than deleting it', async () => {
    q.mockResolvedValueOnce([[{ id: 's1' }], {}]);
    await withdrawShowcase('s1', 'wrong take');
    const sql = String(q.mock.calls[0][0]);
    expect(sql).toContain('UPDATE presentation_showcases');
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).toContain('withdrawn_reason');
  });
});

describe('the approval is tied to what it approved', () => {
  it('changes when the recording changes', () => {
    const base = { attemptId: 'a1', recordingIds: ['r1'], draftSummary: 'A courier demo.' };
    expect(contentHash(base)).toBe(contentHash({ ...base, recordingIds: ['r1'] }));
    expect(contentHash(base)).not.toBe(contentHash({ ...base, recordingIds: ['r2'] }));
  });

  it('changes when the summary the audience would read changes', () => {
    const base = { attemptId: 'a1', recordingIds: ['r1'], draftSummary: 'A courier demo.' };
    expect(contentHash(base)).not.toBe(contentHash({ ...base, draftSummary: 'Something else entirely.' }));
  });

  it('does not change on recording order, which the audience cannot see', () => {
    const a = contentHash({ attemptId: 'a1', recordingIds: ['r1', 'r2'], draftSummary: 's' });
    const b = contentHash({ attemptId: 'a1', recordingIds: ['r2', 'r1'], draftSummary: 's' });
    expect(a).toBe(b);
  });

  // The approval is a fact that happened; deleting it would lose the audit trail.
  // approvalState compares hashes and reports `stale`, which is reversible.
  it('rebinding records the new hash without erasing the approval', async () => {
    q.mockResolvedValueOnce([[], {}]);
    await rebindContent('s1', 'h2');
    const sql = String(q.mock.calls[0][0]);
    expect(sql).toContain('current_content_hash');
    expect(sql).not.toMatch(/author_approved_at\s*=\s*NULL/i);
    expect(sql).not.toMatch(/staff_approved_at\s*=\s*NULL/i);
  });
});

/**
 * The admin health view already counted clicks as attendance once in this build.
 * An instructor reading "18 presented" and finding six never spoke loses the
 * dashboard, not just the number.
 */
describe('intent, attendance and presented are three different facts', () => {
  const rows: CohortRow[] = [
    // Pressed join, left immediately, never presented.
    { enrollmentId: 'a', joinedAt: new Date(), attendedSeconds: 11 },
    // Was genuinely in the room, still has not presented.
    { enrollmentId: 'b', joinedAt: new Date(), attendedSeconds: 1800, rehearsalsWithRecording: 2, hasSlot: true },
    // Actually presented, staff-verified.
    { enrollmentId: 'c', joinedAt: new Date(), attendedSeconds: 900, presentedVerifiedAt: new Date(), hasSlot: true },
    // Never showed up at all.
    { enrollmentId: 'd' },
  ];

  it('counts a click as intent and NOT as attendance', () => {
    const m = cohortMetrics(rows);
    expect(m.intent).toBe(3);
    expect(m.attended).toBe(2);   // 'a' bounced after 11 seconds
  });

  it('counts only staff-verified tasks as presented', () => {
    const m = cohortMetrics(rows);
    expect(m.presented).toBe(1);
    // Having a slot, attending, and rehearsing are each NOT presenting.
    expect(m.withSlot).toBe(2);
    expect(m.rehearsed).toBe(1);
  });

  it('states where every number came from, so nobody has to guess', () => {
    const m = cohortMetrics(rows);
    expect(m.sources.intent).toMatch(/click, not attendance/i);
    expect(m.sources.presented).toMatch(/verified by a member of staff/i);
    expect(Object.keys(m.sources).sort()).toEqual(
      ['attended', 'awaitingApproval', 'intent', 'missingRecordings', 'presented', 'rehearsed', 'withSlot'],
    );
  });

  it('a long join alone is still not a presentation', () => {
    const m = cohortMetrics([{ enrollmentId: 'x', joinedAt: new Date(), attendedSeconds: 3600 }]);
    expect(m.attended).toBe(1);
    expect(m.presented).toBe(0);
  });

  it('the attendance floor is stated rather than hidden', () => {
    expect(MIN_ATTENDANCE_SECONDS).toBeGreaterThan(0);
    const m = cohortMetrics([{ enrollmentId: 'x', attendedSeconds: MIN_ATTENDANCE_SECONDS - 1 }]);
    expect(m.attended).toBe(0);
  });
});

describe('the instructor is told who to chase, and why', () => {
  it('flags a booked learner who has never rehearsed, as high', () => {
    const c = concerns([{ enrollmentId: 'a', hasSlot: true, rehearsalsWithRecording: 0 }]);
    expect(c[0]).toMatchObject({ enrollmentId: 'a', severity: 'high' });
    expect(c[0].reason).toMatch(/never rehearsed/i);
  });

  // The student thinks they have a recording. They do not.
  it('flags a missing recording as high, because the student may not know', () => {
    const c = concerns([{ enrollmentId: 'b', missingRecordings: 1 }]);
    expect(c[0].severity).toBe('high');
    expect(c[0].reason).toMatch(/never arrived/i);
  });

  it('gives a reason an instructor can act on, not a ranking', () => {
    const c = concerns([{ enrollmentId: 'c', hasSlot: false, rehearsalsWithRecording: 3 }]);
    expect(c[0].reason).toMatch(/has not booked/i);
    expect(c[0]).not.toHaveProperty('score');
  });

  it('puts the urgent ones first', () => {
    const c = concerns([
      { enrollmentId: 'low', hasSlot: false, rehearsalsWithRecording: 1 },
      { enrollmentId: 'high', hasSlot: true, rehearsalsWithRecording: 0 },
    ]);
    expect(c[0].severity).toBe('high');
  });

  it('says nothing about a learner who is on track', () => {
    expect(concerns([{ enrollmentId: 'ok', hasSlot: true, rehearsalsWithRecording: 2 }])).toEqual([]);
  });
});

/**
 * T2: a showcase draft describes a real take. The same guard as the deck, applied to
 * the summary a stranger will read in the gallery.
 */
describe('a showcase draft cannot invent a metric', () => {
  const STUDENT = ['We cut manual routing from 4 hours to 20 minutes a day.'];

  it('accepts a summary built from what the student said', () => {
    const draft = 'Cut manual routing from 4 hours to 20 minutes a day.';
    expect(checkGrounding(draft, STUDENT).clean).toBe(true);
  });

  it('flags an invented figure in the summary a stranger would read', () => {
    const draft = 'Saved the business $90,000 a year and cut routing by 4 hours.';
    const r = checkGrounding(draft, STUDENT);
    expect(r.clean).toBe(false);
    expect(r.unsupported.map((u) => u.normalized)).toContain('90000');
  });
});
