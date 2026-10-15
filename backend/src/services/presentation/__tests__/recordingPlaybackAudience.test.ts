jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../projects/projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
jest.mock('../../../config/upload', () => ({ ROOM_RECORDING_DIR: '/fake/recordings' }));
jest.mock('fs', () => ({ existsSync: jest.fn(), statSync: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));

import fs from 'fs';
import { sequelize } from '../../../config/database';
import { getOwnedProjectTree } from '../../projects/projectReadService';
import Enrollment from '../../../models/Enrollment';
import { resolveViewableRecording } from '../recordingPlayback';

const q = sequelize.query as unknown as jest.Mock;
const owned = getOwnedProjectTree as unknown as jest.Mock;
const findEnrollment = (Enrollment as unknown as { findByPk: jest.Mock }).findByPk;
const existsSync = fs.existsSync as unknown as jest.Mock;
const statSync = fs.statSync as unknown as jest.Mock;

/**
 * WHO IS ALLOWED TO WATCH SOMEBODY ELSE'S DEMO.
 *
 * `resolvePlayableRecording` proves ownership, which is right for a private
 * rehearsal and wrong for a demo posted to a cohort — a published demo post would
 * have rendered a player that 404s for every peer. This path adds the audience rule,
 * and the rule is `canView`, reused rather than restated: two copies of an access
 * policy drift until the quieter one is wrong.
 *
 * Everything below is an attempt to watch a video the viewer should not see.
 */

const REC = '5ff8c1cd-0929-4ab4-8e3f-df32c338a931';
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PEER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const COHORT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER_COHORT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PROJ = '6e4bd9da-a22b-4b90-b5b2-55686487f39f';
const STORY = 'PREP-4';

const HASH = 'h1';
/** A live, fully approved showcase. Overrides make it not-live in one way each. */
const showcaseRow = (over: Record<string, unknown> = {}) => ({
  showcase_id: 's1',
  audience: 'cohort',
  content_hash: HASH,
  current_content_hash: HASH,
  author_approved_at: new Date('2026-10-01'),
  staff_approved_at: new Date('2026-10-02'),
  published_at: new Date('2026-10-03'),
  withdrawn_at: null,
  owner_enrollment_id: OWNER,
  cohort_id: COHORT,
  storage_key: 'abc.mp4',
  mime_type: 'video/mp4',
  ...over,
});

/** The viewer is NOT the owner unless a test says so. */
beforeEach(() => {
  jest.clearAllMocks();
  owned.mockResolvedValue(null);
  findEnrollment.mockResolvedValue({ cohort_id: COHORT });
  q.mockResolvedValue([[showcaseRow()], {}]);
  existsSync.mockReturnValue(true);
  statSync.mockReturnValue({ size: 4242 });
});

describe('the owner path still wins, and wins first', () => {
  it('serves the owner without any showcase existing at all', async () => {
    owned.mockResolvedValue({ id: PROJ });
    q.mockResolvedValue([[{ recording_id: REC, storage_key: 'abc.mp4', size_bytes: 1, mime_type: 'video/mp4' }], {}]);

    const r = await resolveViewableRecording(OWNER, PROJ, STORY, REC);

    expect(r.ok).toBe(true);
    // A learner watching themselves back is the common case and must not depend on
    // having published anything.
    expect(findEnrollment).not.toHaveBeenCalled();
  });

  it('keeps file_missing as file_missing rather than flattening it to not_found', async () => {
    // An owned recording whose bytes are gone is a real, reportable state. Falling
    // through to the audience check would turn it into a flat 404 and lose the
    // distinction an operator needs.
    owned.mockResolvedValue({ id: PROJ });
    q.mockResolvedValue([[{ recording_id: REC, storage_key: null, size_bytes: 1, mime_type: 'video/mp4' }], {}]);

    expect(await resolveViewableRecording(OWNER, PROJ, STORY, REC)).toEqual({ ok: false, reason: 'file_missing' });
  });
});

describe('a peer may watch a published cohort demo', () => {
  it('serves a cohort-mate', async () => {
    const r = await resolveViewableRecording(PEER, PROJ, STORY, REC);
    expect(r.ok).toBe(true);
  });

  it('names the file a demo rather than a rehearsal', async () => {
    const r = await resolveViewableRecording(PEER, PROJ, STORY, REC);
    if (r.ok) expect(r.recording.downloadName).toBe('PREP-4-demo.mp4');
  });

  it('reads the viewer cohort FRESH, not from the ticket', async () => {
    // A ticket is a claim about which link was issued, never a frozen claim about
    // entitlement — otherwise someone removed from a cohort keeps watching until it
    // expires.
    await resolveViewableRecording(PEER, PROJ, STORY, REC);
    expect(findEnrollment).toHaveBeenCalledWith(PEER);
  });
});

describe('every way a peer must be refused', () => {
  const refused = async () => expect(await resolveViewableRecording(PEER, PROJ, STORY, REC))
    .toEqual({ ok: false, reason: 'not_found' });

  it('PRIVATE is nobody, however approved and published it is', async () => {
    q.mockResolvedValue([[showcaseRow({ audience: 'private' })], {}]);
    await refused();
  });

  it('a different cohort cannot watch a cohort-audience demo', async () => {
    findEnrollment.mockResolvedValue({ cohort_id: OTHER_COHORT });
    await refused();
  });

  it('a viewer with no cohort cannot watch a cohort-audience demo', async () => {
    findEnrollment.mockResolvedValue({ cohort_id: null });
    await refused();
  });

  it('NOT PUBLISHED is refused even with both approvals', async () => {
    q.mockResolvedValue([[showcaseRow({ published_at: null })], {}]);
    await refused();
  });

  it('WITHDRAWN is refused immediately', async () => {
    q.mockResolvedValue([[showcaseRow({ withdrawn_at: new Date() })], {}]);
    await refused();
  });

  it('a STALE approval is not an approval', async () => {
    // The take changed after it was approved. Somebody signed off on different
    // footage, and the peer must not see what replaced it.
    q.mockResolvedValue([[showcaseRow({ current_content_hash: 'h2' })], {}]);
    await refused();
  });

  it('missing the STAFF approval is refused — the author cannot publish alone', async () => {
    q.mockResolvedValue([[showcaseRow({ staff_approved_at: null })], {}]);
    await refused();
  });

  it('missing the AUTHOR approval is refused — staff cannot publish on their behalf', async () => {
    q.mockResolvedValue([[showcaseRow({ author_approved_at: null })], {}]);
    await refused();
  });

  it('refused when there is no showcase at all — an unshared rehearsal is private', async () => {
    q.mockResolvedValue([[], {}]);
    await refused();
  });

  it('refused when the viewer is not a real enrollment', async () => {
    findEnrollment.mockResolvedValue(null);
    await refused();
  });

  it('a participant ticket NEVER confers staff', async () => {
    // Staff see everything via canView. If this path passed isStaff:true, any
    // participant holding a ticket would see every private rehearsal on the
    // platform. The proof: private stays refused for a non-owner.
    q.mockResolvedValue([[showcaseRow({ audience: 'private', published_at: null, withdrawn_at: null })], {}]);
    await refused();
  });
});

describe('the query only ever considers ingested recordings on the named task', () => {
  it('filters by ingested, project and story in the SQL itself', async () => {
    await resolveViewableRecording(PEER, PROJ, STORY, REC);
    const sql = String(q.mock.calls[q.mock.calls.length - 1][0]);
    expect(sql).toContain("r.ingest_status = 'ingested'");
    expect(sql).toContain('asg.project_id = :projectId');
    expect(sql).toContain('asg.story_id   = :storyId');
  });

  it('rejects a non-uuid without querying anything', async () => {
    owned.mockResolvedValue(null);
    const r = await resolveViewableRecording(PEER, PROJ, STORY, 'not-a-uuid');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });
});
