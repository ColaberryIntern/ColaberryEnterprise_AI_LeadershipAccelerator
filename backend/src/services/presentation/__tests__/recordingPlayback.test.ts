jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../projects/projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
jest.mock('../../../config/upload', () => ({ ROOM_RECORDING_DIR: '/fake/recordings' }));
jest.mock('fs', () => ({ existsSync: jest.fn(), statSync: jest.fn() }));

import fs from 'fs';
import { sequelize } from '../../../config/database';
import { getOwnedProjectTree } from '../../projects/projectReadService';
import { resolvePlayableRecording } from '../recordingPlayback';

const q = sequelize.query as unknown as jest.Mock;
const owned = getOwnedProjectTree as unknown as jest.Mock;
const existsSync = fs.existsSync as unknown as jest.Mock;
const statSync = fs.statSync as unknown as jest.Mock;

/**
 * THIS IS THE FUNCTION THAT STOPS ONE LEARNER WATCHING ANOTHER'S REHEARSAL.
 *
 * It had no tests. A mutation run on 2026-10-15 replaced the whole call with a stub
 * and every test still passed, because the only thing watching it was a source-text
 * assertion that the identifier appeared somewhere in the file — which a stub of the
 * same name satisfies. The gap was not the regex; it was that the resolver's
 * behaviour was never exercised at all.
 *
 * The signed ticket is the other half of this. The ticket proves a link was issued to
 * this viewer; these checks prove the recording is actually theirs. Either one alone
 * would serve the wrong video, so neither gets to be the only one tested.
 */

const REC = '5ff8c1cd-0929-4ab4-8e3f-df32c338a931';
const ENROL = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROJ = '6e4bd9da-a22b-4b90-b5b2-55686487f39f';
const STORY = 'PREP-4';

const row = (over: Record<string, unknown> = {}) => ({
  recording_id: REC,
  storage_key: 'abc.mp4',
  size_bytes: 1234,
  mime_type: 'video/mp4',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  owned.mockResolvedValue({ id: PROJ });
  q.mockResolvedValue([[row()], {}]);
  existsSync.mockReturnValue(true);
  statSync.mockReturnValue({ size: 4242 });
});

describe('ownership is proved before anything is served', () => {
  it('serves the file when the project is owned and the recording matches', async () => {
    const r = await resolvePlayableRecording(ENROL, PROJ, STORY, REC);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recording.recordingId).toBe(REC);
      expect(r.recording.filePath).toContain('abc.mp4');
    }
  });

  it('REFUSES when the project is not owned — and never reaches the query', async () => {
    // The ownership check is first on purpose. If it ran after, a crafted recording
    // id could be probed against projects the caller cannot see.
    owned.mockResolvedValue(null);
    const r = await resolvePlayableRecording(ENROL, PROJ, STORY, REC);
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(q).not.toHaveBeenCalled();
  });

  it('scopes the query to the project AND the task from the caller, not from the recording', async () => {
    // Resolving the project FROM the recording would let a valid ticket for one task
    // open a recording attached to another.
    await resolvePlayableRecording(ENROL, PROJ, STORY, REC);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements).toMatchObject({ projectId: PROJ, storyId: STORY, recordingId: REC });
    // THE CLAUSES, not just the bindings. A mutation run caught this: deleting
    // `AND asg.story_id = :storyId` from the SQL leaves the replacement in place, so
    // asserting on `replacements` alone passes against a query that no longer
    // filters by task at all.
    expect(String(sql)).toContain('asg.project_id = :projectId');
    expect(String(sql)).toContain('asg.story_id   = :storyId');
    expect(String(sql)).toContain('r.id           = :recordingId');
  });

  it('only serves an INGESTED recording', async () => {
    // One parked in review belongs to nobody yet and could be another cohort
    // member's take. The filter lives in the SQL, so assert it is there.
    await resolvePlayableRecording(ENROL, PROJ, STORY, REC);
    expect(String(q.mock.calls[0][0])).toContain("ingest_status = 'ingested'");
  });

  it('returns not_found when the join matches nothing', async () => {
    q.mockResolvedValue([[], {}]);
    expect(await resolvePlayableRecording(ENROL, PROJ, STORY, REC)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rejects a non-uuid recording id without touching the database', async () => {
    const r = await resolvePlayableRecording(ENROL, PROJ, STORY, 'not-a-uuid');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(owned).not.toHaveBeenCalled();
  });
});

describe('file_missing is distinct from not_found, deliberately', () => {
  it('reports file_missing when the recording has no linked resource', async () => {
    // The row is real and theirs; the bytes were never linked. Telling a learner
    // "not found" about a rehearsal they remember doing destroys trust in the
    // feature, so the operator-facing answer is different.
    q.mockResolvedValue([[row({ storage_key: null })], {}]);
    expect(await resolvePlayableRecording(ENROL, PROJ, STORY, REC)).toEqual({ ok: false, reason: 'file_missing' });
  });

  it('reports file_missing when the file is gone from disk', async () => {
    existsSync.mockReturnValue(false);
    expect(await resolvePlayableRecording(ENROL, PROJ, STORY, REC)).toEqual({ ok: false, reason: 'file_missing' });
  });
});

describe('the path is built safely', () => {
  it('basenames the storage key, so a corrupted row cannot traverse', () => {
    // storage_key is a uuid filename this codebase generates, never user input —
    // but a bad row must not be able to read /etc/passwd regardless.
    q.mockResolvedValue([[row({ storage_key: '../../../../etc/passwd' })], {}]);
    return resolvePlayableRecording(ENROL, PROJ, STORY, REC).then((r) => {
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.recording.filePath).not.toContain('..');
        expect(r.recording.filePath).toContain('passwd');
        // Separator-agnostic: path.join yields backslashes on Windows, so comparing
        // against a literal '/fake/recordings' fails on the dev machine and passes on
        // CI — a test that only works on one platform is worse than none.
        expect(r.recording.filePath.replace(/\\/g, '/').startsWith('/fake/recordings/')).toBe(true);
      }
    });
  });

  it('takes the size from the FILE, not the database row', async () => {
    // Ranges are computed against this number. A row that has drifted from the file
    // would produce a Content-Range describing bytes that do not exist.
    q.mockResolvedValue([[row({ size_bytes: 999999 })], {}]);
    const r = await resolvePlayableRecording(ENROL, PROJ, STORY, REC);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recording.sizeBytes).toBe(4242);
  });

  it('defaults the content type rather than serving an empty one', async () => {
    q.mockResolvedValue([[row({ mime_type: null })], {}]);
    const r = await resolvePlayableRecording(ENROL, PROJ, STORY, REC);
    if (r.ok) expect(r.recording.mimeType).toBe('video/mp4');
  });

  it('names the download after the task, never after the stored key', async () => {
    const r = await resolvePlayableRecording(ENROL, PROJ, STORY, REC);
    if (r.ok) expect(r.recording.downloadName).toBe('PREP-4-rehearsal.mp4');
  });
});
