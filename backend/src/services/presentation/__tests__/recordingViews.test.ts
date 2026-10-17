jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
// The count reads through the model; only the upsert is raw, because it needs
// `RETURNING (xmax = 0)` to tell an INSERT from an ON CONFLICT update.
jest.mock('../../../models/PresentationRecordingView', () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) },
}));

import { sequelize } from '../../../config/database';
import PresentationRecordingView from '../../../models/PresentationRecordingView';
import { recordView, viewCounts, describeViews } from '../recordingViews';

const q = sequelize.query as unknown as jest.Mock;
const views = PresentationRecordingView as unknown as { findAll: jest.Mock };

/**
 * A NUMBER A STUDENT WILL BELIEVE.
 *
 * "9 people watched your demo" is the one figure on this page nobody can check. If
 * it counts requests, a single viewing reports as dozens, because an MP4 player
 * issues a probe, a tail read for the moov atom, and one request per seek. If it
 * counts the owner, a learner who rehearses six times believes their cohort showed
 * up. Both failures are invisible and both are lies told to a student about their
 * own work, so the tests here are mostly about what must NOT be counted.
 */

const REC = '5ff8c1cd-0929-4ab4-8e3f-df32c338a931';
const REC2 = '7aa1b2c3-0929-4ab4-8e3f-df32c338a931';
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VIEWER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
  // `clearAllMocks` wipes the resolved value set in the module factory above.
  views.findAll.mockResolvedValue([]);
});

describe('the owner is never a view', () => {
  it('does not count the owner watching themselves, and writes NOTHING', async () => {
    expect(await recordView(REC, OWNER, OWNER)).toBe(false);
    // Not merely uncounted — not even a row. A row would make `last_viewed_at`
    // claim an audience member who is the author.
    expect(q).not.toHaveBeenCalled();
  });

  it('DOES count a peer when an owner is known', async () => {
    q.mockResolvedValueOnce([[{ inserted: true }], {}]);
    expect(await recordView(REC, VIEWER, OWNER)).toBe(true);
  });

  it('counts the viewer when the owner is UNKNOWN rather than dropping the view', async () => {
    // A null owner means the caller could not resolve one. Dropping every view in
    // that case would silently zero the count; counting one extra is the smaller,
    // and visible, error.
    q.mockResolvedValueOnce([[{ inserted: true }], {}]);
    expect(await recordView(REC, VIEWER, null)).toBe(true);
  });
});

describe('one person watching is one view, however many requests they make', () => {
  it('UPSERTS on (recording, viewer) so a rewatch cannot add a second', async () => {
    q.mockResolvedValueOnce([[{ inserted: false }], {}]);
    await recordView(REC, VIEWER, OWNER);

    const sql = String(q.mock.calls[0][0]);
    expect(sql).toContain('ON CONFLICT (recording_id, viewer_enrollment_id)');
    // DO UPDATE, not DO NOTHING: the row must survive and `last_viewed_at` move, so
    // "watched once in September" and "watched again today" are distinguishable.
    expect(sql).toContain('DO UPDATE SET last_viewed_at');
    // It is an INSERT ... ON CONFLICT, never a read-then-write, which under two
    // concurrent range requests from the same player would double-insert.
    expect(sql).toContain('INSERT INTO presentation_recording_views');
    expect(sql).not.toMatch(/SELECT[\s\S]*FROM presentation_recording_views/);
  });

  it('reports the SECOND watch as not-a-new-viewer', async () => {
    q.mockResolvedValueOnce([[{ inserted: false }], {}]);
    expect(await recordView(REC, VIEWER, OWNER)).toBe(false);
  });

  it('asks Postgres which path ran via xmax, not a second round trip', async () => {
    // `xmax = 0` is true only on a genuine INSERT. Anything else — a follow-up
    // SELECT, a rowCount check — races the other requests of the same playback.
    q.mockResolvedValueOnce([[{ inserted: true }], {}]);
    await recordView(REC, VIEWER, OWNER);
    expect(String(q.mock.calls[0][0])).toContain('(xmax = 0)');
  });
});

describe('junk never reaches the database', () => {
  it('refuses a non-uuid recording id', async () => {
    expect(await recordView('not-a-uuid', VIEWER, OWNER)).toBe(false);
    expect(q).not.toHaveBeenCalled();
  });

  it('refuses a non-uuid viewer id', async () => {
    expect(await recordView(REC, 'nope', OWNER)).toBe(false);
    expect(q).not.toHaveBeenCalled();
  });

  it('passes ids as REPLACEMENTS, never interpolated into the SQL', async () => {
    q.mockResolvedValueOnce([[{ inserted: true }], {}]);
    await recordView(REC, VIEWER, OWNER);
    const [sql, opts] = q.mock.calls[0];
    expect(String(sql)).not.toContain(REC);
    expect(opts.replacements).toEqual({ rec: REC, viewer: VIEWER });
  });
});

describe('counting them back', () => {
  it('answers for EVERY id asked about, zero included', async () => {
    // A recording nobody watched must come back as 0, not absent. An absent key
    // reads as `undefined` at the call site and renders as a blank where a number
    // belongs.
    views.findAll.mockResolvedValue([{ recording_id: REC, n: 3 }]);
    expect(await viewCounts([REC, REC2])).toEqual({ [REC]: 3, [REC2]: 0 });
  });

  it('counts a Postgres bigint string rather than rendering NaN', async () => {
    // `COUNT(*)` comes back from pg as a STRING, because a bigint does not fit a
    // JS number safely. Reading it without coercion puts "3" through arithmetic
    // and the page shows nonsense.
    views.findAll.mockResolvedValue([{ recording_id: REC, n: '3' }]);
    expect(await viewCounts([REC])).toEqual({ [REC]: 3 });
  });

  it('groups by recording rather than returning one lump', async () => {
    await viewCounts([REC]);
    const opts = views.findAll.mock.calls[0][0];
    expect(opts.group).toEqual(['recording_id']);
    // `raw` matters: without it Sequelize returns model instances and the aggregate
    // alias is not a plain property, so every count reads as undefined.
    expect(opts.raw).toBe(true);
  });

  it('queries nothing at all for an empty list', async () => {
    expect(await viewCounts([])).toEqual({});
    expect(views.findAll).not.toHaveBeenCalled();
    expect(q).not.toHaveBeenCalled();
  });

  it('drops non-uuids before querying, and does not invent keys for them', async () => {
    const out = await viewCounts([REC, 'garbage']);
    expect(out).toEqual({ [REC]: 0 });
    expect(views.findAll.mock.calls[0][0].where.recording_id).toEqual([REC]);
  });
});

describe('the sentence a student reads', () => {
  it('says no views rather than showing a zero', () => {
    expect(describeViews(0)).toBe('No views yet');
  });

  it('is singular for one person', () => {
    // "1 people have watched this" is the kind of detail that makes a student
    // distrust the number next to it.
    expect(describeViews(1)).toBe('1 person has watched this');
  });

  it('is plural beyond one', () => {
    expect(describeViews(9)).toBe('9 people have watched this');
  });

  it('treats nonsense as no views rather than printing NaN', () => {
    expect(describeViews(NaN)).toBe('No views yet');
    expect(describeViews(-4)).toBe('No views yet');
  });
});
