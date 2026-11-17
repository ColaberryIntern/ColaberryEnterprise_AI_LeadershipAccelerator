/**
 * govDemoVideos — the assigned intern's recorded demo videos for the gov cockpit. The SQL and the ticket mint are
 * mocked; these prove the owner resolve, the enrollment-scoped recording query, and the ticketed URL shaping.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../presentation/recordingTicket', () => ({
  createStaffRecordingTicket: jest.fn((id: string, who: string) => `TICKET(${id},${who})`),
}));

import { sequelize } from '../../../config/database';
import { resolveGovContractOwner, listGovDemoVideos } from '../govDemoVideos';

const query = sequelize.query as jest.Mock;
const DP = '3867b241-0761-4f1f-9a32-ffe3b47bf186';

beforeEach(() => { jest.clearAllMocks(); });

describe('resolveGovContractOwner', () => {
  it('returns the solution-build track owner enrollment + display name', async () => {
    query.mockResolvedValueOnce([{ enrollment_id: 'enr-9', name: 'Aki Wam' }]);
    expect(await resolveGovContractOwner(DP)).toEqual({ enrollmentId: 'enr-9', name: 'Aki Wam' });
    // scoped to THIS delivery project's solution_build track
    const call = query.mock.calls[0];
    expect(call[0]).toContain("track_type = 'solution_build'");
    expect(call[1].replacements).toEqual({ dp: DP });
  });

  it('returns null when no build track / owner is linked', async () => {
    query.mockResolvedValueOnce([]);
    expect(await resolveGovContractOwner(DP)).toBeNull();
    query.mockResolvedValueOnce([{ enrollment_id: null, name: null }]);
    expect(await resolveGovContractOwner(DP)).toBeNull();
  });
});

describe('listGovDemoVideos', () => {
  it('shapes ingested takes with a per-recording staff-ticketed file + thumbnail url', async () => {
    query.mockResolvedValueOnce([
      { recording_id: 'rec-1', story_id: 'PREP-2', presentation_type: 'working_system_demo', template_slug: null, duration_seconds: 95, created_at: '2026-11-15T00:00:00.000Z' },
      { recording_id: 'rec-2', story_id: null, presentation_type: null, template_slug: null, duration_seconds: null, created_at: '2026-11-14T00:00:00.000Z' },
    ]);
    const out = await listGovDemoVideos('enr-9', 'ali-id');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      recordingId: 'rec-1', storyId: 'PREP-2', durationSeconds: 95, recordedAt: '2026-11-15T00:00:00.000Z',
      fileUrl: `/api/internship-video/rec-1/file?t=${encodeURIComponent('TICKET(rec-1,ali-id)')}`,
      thumbnailUrl: `/api/internship-video/rec-1/thumbnail?t=${encodeURIComponent('TICKET(rec-1,ali-id)')}`,
    });
    expect(typeof out[0].typeLabel).toBe('string');
    expect(out[0].typeLabel.length).toBeGreaterThan(0);
    expect(out[1]).toMatchObject({ recordingId: 'rec-2', storyId: null, durationSeconds: null });
    // the query is scoped to the one enrollment and only ingested recordings
    const call = query.mock.calls[0];
    expect(call[0]).toContain("r.ingest_status = 'ingested'");
    expect(call[0]).toContain('asg.enrollment_id = :eid');
    expect(call[1].replacements).toEqual({ eid: 'enr-9' });
  });

  it('returns [] when the intern has recorded nothing', async () => {
    query.mockResolvedValueOnce([]);
    expect(await listGovDemoVideos('enr-9', 'ali-id')).toEqual([]);
  });
});
