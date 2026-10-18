jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/PresentationRecordingView', () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) },
}));

import { sequelize } from '../../../config/database';
import Enrollment from '../../../models/Enrollment';
import PresentationRecordingView from '../../../models/PresentationRecordingView';
import { resolveDemoPlayback, recordingIdFromRef } from '../demoPostPlayback';

const q = sequelize.query as unknown as jest.Mock;
const findEnrollment = (Enrollment as unknown as { findByPk: jest.Mock }).findByPk;
const views = PresentationRecordingView as unknown as { findAll: jest.Mock };

/**
 * WHOSE FEED GETS A PLAYER.
 *
 * A published demo produced a community post and nothing could play it: the
 * recording ref sat in `ritual_meta` unread. Resolving it is what finally connects
 * the two halves — and it is also the moment a mistake stops being cosmetic, because
 * minting a URL for the wrong viewer puts somebody's rehearsal in a stranger's feed.
 *
 * So the tests below are mostly refusals. The audience decision is `canView`, reused
 * rather than restated, and the cases here are about this module handing it the
 * right inputs and honouring the answer.
 */

const REC = '5ff8c1cd-0929-4ab4-8e3f-df32c338a931';
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PEER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const COHORT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER_COHORT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PROJ = '6e4bd9da-a22b-4b90-b5b2-55686487f39f';

const HASH = 'h1';
const row = (over: Record<string, unknown> = {}) => ({
  post_id: POST,
  recording_id: REC,
  duration_seconds: 71,
  project_id: PROJ,
  story_id: 'PREP-4',
  owner_enrollment_id: OWNER,
  cohort_id: COHORT,
  showcase_id: 's1',
  audience: 'cohort',
  content_hash: HASH,
  current_content_hash: HASH,
  author_approved_at: new Date('2026-10-01'),
  staff_approved_at: new Date('2026-10-02'),
  published_at: new Date('2026-10-03'),
  withdrawn_at: null,
  ...over,
});

const POST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
  q.mockResolvedValue([[row()], {}]);
  findEnrollment.mockResolvedValue({ cohort_id: COHORT });
  views.findAll.mockResolvedValue([]);
});

describe('reading the ref', () => {
  it('accepts recording:<uuid>', () => {
    expect(recordingIdFromRef(`recording:${REC}`)).toBe(REC);
  });

  it('rejects an ATTEMPT ref, which older posts carry', () => {
    // Attempt refs point at a rehearsal that may hold several takes. Resolving one
    // would mean guessing which take was published, and under per-recording sharing
    // the guess would usually be wrong.
    expect(recordingIdFromRef(`attempt:${REC}`)).toBeNull();
  });

  it('rejects junk, a bare uuid, and a non-string', () => {
    expect(recordingIdFromRef(REC)).toBeNull();
    expect(recordingIdFromRef('recording:not-a-uuid')).toBeNull();
    expect(recordingIdFromRef(null)).toBeNull();
    expect(recordingIdFromRef(undefined)).toBeNull();
    expect(recordingIdFromRef({ recording: REC })).toBeNull();
  });
});

describe('a cohort-mate gets a player', () => {
  it('returns a signed url keyed by post id', async () => {
    const out = await resolveDemoPlayback(PEER, [POST]);
    expect(out[POST]).toBeDefined();
    expect(out[POST].playbackUrl).toContain(`/recordings/${REC}/file?t=`);
    expect(out[POST].recordingId).toBe(REC);
  });

  it('builds the url on the OWNER\'s project and task, not the viewer\'s', async () => {
    // The route resolves the recording against the task it belongs to. Using the
    // viewer's own project would 404 for every peer.
    const out = await resolveDemoPlayback(PEER, [POST]);
    expect(out[POST].playbackUrl).toContain(`/projects/${PROJ}/tasks/PREP-4/`);
  });

  it('carries the duration and the view sentence', async () => {
    const out = await resolveDemoPlayback(PEER, [POST]);
    expect(out[POST].durationSeconds).toBe(71);
    expect(out[POST].viewLabel).toBe('No views yet');
  });

  it('reads the viewer cohort FRESH, never from a claim', async () => {
    // Otherwise someone removed from a cohort keeps seeing its demos.
    await resolveDemoPlayback(PEER, [POST]);
    expect(findEnrollment).toHaveBeenCalledWith(PEER);
  });
});

describe('every way a viewer must be refused', () => {
  const refused = async () => {
    const out = await resolveDemoPlayback(PEER, [POST]);
    // ABSENT, not null: the card then renders as an ordinary post, and the page
    // never has to decide what a half-resolved demo looks like.
    expect(out[POST]).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(0);
  };

  it('PRIVATE is nobody, however approved', async () => {
    q.mockResolvedValue([[row({ audience: 'private' })], {}]);
    await refused();
  });

  it('a different cohort cannot watch a cohort demo', async () => {
    findEnrollment.mockResolvedValue({ cohort_id: OTHER_COHORT });
    await refused();
  });

  it('NOT PUBLISHED is refused', async () => {
    q.mockResolvedValue([[row({ published_at: null })], {}]);
    await refused();
  });

  it('a STALE approval is not an approval', async () => {
    q.mockResolvedValue([[row({ current_content_hash: 'h2' })], {}]);
    await refused();
  });

  it('missing the staff approval is refused', async () => {
    q.mockResolvedValue([[row({ staff_approved_at: null })], {}]);
    await refused();
  });

  it('a viewer who is not a real enrollment gets nothing', async () => {
    findEnrollment.mockResolvedValue(null);
    await refused();
  });

  it('never confers staff on a feed reader', async () => {
    // If this path passed isStaff:true, every learner scrolling the feed would be
    // handed a player for every private rehearsal on the platform.
    q.mockResolvedValue([[row({ audience: 'private', published_at: null })], {}]);
    await refused();
  });

  it('a withdrawn showcase is gone — the JOIN excludes it', async () => {
    // The query only joins live showcases, so a withdrawn one returns no row at all.
    q.mockResolvedValue([[], {}]);
    await refused();
  });
});

describe('the owner sees their own demo', () => {
  it('resolves for the author even though they are not a peer', async () => {
    const out = await resolveDemoPlayback(OWNER, [POST]);
    expect(out[POST]).toBeDefined();
  });
});

describe('the query, and the cost of a feed', () => {
  it('asks ONCE for a page of many demos, not once per post', async () => {
    await resolveDemoPlayback(PEER, [POST, 'ffffffff-ffff-4fff-8fff-ffffffffffff']);
    expect(q).toHaveBeenCalledTimes(1);
  });

  it('only considers INGESTED recordings and LIVE showcases', async () => {
    await resolveDemoPlayback(PEER, [POST]);
    const sql = String(q.mock.calls[0][0]);
    expect(sql).toContain("r.ingest_status = 'ingested'");
    expect(sql).toContain('s.withdrawn_at IS NULL');
    expect(sql).toContain('s.recording_id = r.id');
    // THE REGRESSION THIS FILE NOW EXISTS FOR. The ref is read from
    // `community_posts`, not from an object the caller passed in: the feed builds
    // an explicit DTO via `toFeedItem` that does not carry `ritual_meta`, so the
    // first version resolved nothing on every real request while twenty unit
    // tests passed against hand-made objects that did carry it.
    expect(sql).toContain('FROM community_posts');
    expect(sql).toContain("p.ritual_meta->>'recording_ref'");
    // Matched as TEXT. A legacy `recording:<attempt_id>` casts to uuid perfectly
    // well, so a cast protects nothing, while a malformed ref would abort the
    // whole query instead of simply matching no row.
    expect(sql).toContain("'recording:' || r.id::text");
    expect(sql).not.toMatch(/recording_ref'\)::uuid|::uuid\s*=\s*r\.id/);
  });

  it('queries nothing at all for an empty page', async () => {
    expect(await resolveDemoPlayback(PEER, [])).toEqual({});
    expect(q).not.toHaveBeenCalled();
  });

  it('drops non-uuid post ids rather than passing them to the database', async () => {
    await resolveDemoPlayback(PEER, [POST, 'not-a-uuid']);
    expect(q.mock.calls[0][1].replacements.ids).toEqual([POST]);
  });

  it('a post with no demo ref simply yields nothing — the JOIN finds no row', async () => {
    // An ordinary text post is in the same page as a demo. The join matches on the
    // ref, so a post without one contributes no row and no card.
    q.mockResolvedValue([[], {}]);
    expect(await resolveDemoPlayback(PEER, [POST])).toEqual({});
  });

  it('passes ids as replacements, never interpolated', async () => {
    await resolveDemoPlayback(PEER, [POST]);
    expect(String(q.mock.calls[0][0])).not.toContain(POST);
    expect(q.mock.calls[0][1].replacements.ids).toEqual([POST]);
  });
});
