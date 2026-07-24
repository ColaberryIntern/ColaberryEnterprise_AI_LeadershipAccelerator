import {
  getPeoplePanel,
  toPanelPresence,
  sortOnlineThenRecent,
  sortOnlineThenName,
  StaffPanel,
  StudentPanel,
} from '../peoplePanelService';
import { Enrollment, Cohort, CommunityMember, Sponsor } from '../../models';
import { isStaffEnrollment } from '../access/staffAccess';

// Models are mocked (no DB). derivePresence is mocked with a faithful copy of the real
// staleness thresholds (communityService: online <=90s, away <=10min, else offline) so
// the presence-sorting assertions exercise the real bucketing without loading the whole
// communityService module graph.
jest.mock('../../models', () => ({
  Enrollment: { findAll: jest.fn() },
  Cohort: { findAll: jest.fn() },
  CommunityMember: { findAll: jest.fn(), findOne: jest.fn() },
  Sponsor: { findAll: jest.fn() },
  SponsorSeat: {},
}));
jest.mock('../access/staffAccess', () => ({ isStaffEnrollment: jest.fn() }));
jest.mock('../communityService', () => ({
  derivePresence: (last: Date | null, now: Date = new Date()) => {
    if (!last) return 'offline';
    const age = now.getTime() - new Date(last).getTime();
    if (age < 0) return 'online';
    if (age <= 90_000) return 'online';
    if (age <= 600_000) return 'away';
    return 'offline';
  },
}));

const NOW = new Date('2026-07-21T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ONLINE = ago(10_000); // 10s -> online
const IDLE = ago(300_000); // 5min -> away/idle

// A community_members row shaped as the include-nested result the service reads.
function memberRow(opts: {
  id: string;
  enrollmentId: string;
  name: string;
  cohortId: string | null;
  cohortName: string | null;
  last: Date | null;
  role?: string;
}) {
  return {
    id: opts.id,
    enrollment_id: opts.enrollmentId,
    display_name: opts.name,
    avatar_url: null,
    role: opts.role ?? 'student',
    last_active_at: opts.last,
    enrollment: {
      id: opts.enrollmentId,
      full_name: opts.name,
      avatar_data_url: null,
      cohort_id: opts.cohortId,
      cohort: opts.cohortName ? { name: opts.cohortName } : null,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (CommunityMember.findOne as jest.Mock).mockResolvedValue(null); // mgmt_role lookup
});

describe('pure helpers', () => {
  it('maps community presence to the rail vocabulary (away -> idle)', () => {
    expect(toPanelPresence('online')).toBe('online');
    expect(toPanelPresence('away')).toBe('idle');
    expect(toPanelPresence('offline')).toBe('offline');
  });

  it('sortOnlineThenRecent orders online < idle < offline, then most-recent, then name', () => {
    const rows = [
      { presence: 'idle' as const, last: 500, name: 'Bob' },
      { presence: 'online' as const, last: 100, name: 'Zed' },
      { presence: 'online' as const, last: 900, name: 'Ann' },
      { presence: 'offline' as const, last: 999, name: 'Cy' },
    ];
    expect(sortOnlineThenRecent(rows).map((r) => r.name)).toEqual(['Ann', 'Zed', 'Bob', 'Cy']);
  });

  it('sortOnlineThenName orders online-first then alphabetical', () => {
    const rows = [
      { presence: 'offline' as const, name: 'Ann' },
      { presence: 'online' as const, name: 'Dan' },
      { presence: 'online' as const, name: 'Bea' },
      { presence: 'idle' as const, name: 'Cy' },
    ];
    expect(sortOnlineThenName(rows).map((r) => r.name)).toEqual(['Bea', 'Dan', 'Cy', 'Ann']);
  });
});

describe('getPeoplePanel — staff viewer', () => {
  beforeEach(() => {
    (isStaffEnrollment as jest.Mock).mockResolvedValue(true);
  });

  it('returns cross-cohort online (online-first then most-recent) + classes + businesses', async () => {
    // Recently-active scan, returned DB-desc by last_active_at.
    (CommunityMember.findAll as jest.Mock).mockResolvedValue([
      memberRow({ id: 'm3', enrollmentId: 'e3', name: 'Cara', cohortId: 'cb', cohortName: 'Nov 2026', last: ago(5_000) }),
      memberRow({ id: 'm1', enrollmentId: 'e1', name: 'Alice', cohortId: 'ca', cohortName: 'July 2026', last: ONLINE }),
      memberRow({ id: 'm2', enrollmentId: 'e2', name: 'Bob', cohortId: 'ca', cohortName: 'July 2026', last: IDLE }),
    ]);
    (Cohort.findAll as jest.Mock).mockResolvedValue([
      { id: 'ca', name: 'July 2026' },
      { id: 'cb', name: 'Nov 2026' },
    ]);
    // Grouped active-enrollment counts (raw rows).
    (Enrollment.findAll as jest.Mock).mockResolvedValue([
      { cohort_id: 'ca', n: 5 },
      { cohort_id: 'cb', n: 3 },
    ]);
    (Sponsor.findAll as jest.Mock).mockResolvedValue([
      { id: 's1', company_name: 'Acme', seats: [{ assigned_enrollment_id: 'e1' }, { assigned_enrollment_id: 'e9' }] },
    ]);

    const panel = (await getPeoplePanel('staff-me', 'ca', NOW)) as StaffPanel;

    expect(panel.viewer_role).toBe('staff');
    // Online-first then most-recent: Cara (online, most recent) -> Alice (online) -> Bob (idle).
    expect(panel.online.map((p) => p.display_name)).toEqual(['Cara', 'Alice', 'Bob']);
    expect(panel.online[0].presence).toBe('online');
    expect(panel.online[2].presence).toBe('idle');
    // Person carries the cross-cohort context.
    expect(panel.online[0].cohort_name).toBe('Nov 2026');

    // Classes: member counts from the grouped query, online from the scan; busiest first.
    expect(panel.classes[0]).toMatchObject({ cohort_id: 'ca', name: 'July 2026', members: 5, online: 2 });
    expect(panel.classes[1]).toMatchObject({ cohort_id: 'cb', name: 'Nov 2026', members: 3, online: 1 });

    // Businesses: 2 redeemed seats, 1 of them (e1) currently online.
    expect(panel.businesses).toEqual([{ sponsor_id: 's1', company: 'Acme', seats: 2, online: 1 }]);
  });

  it('treats a non-null mgmt_role as staff even when isStaffEnrollment is false', async () => {
    (isStaffEnrollment as jest.Mock).mockResolvedValue(false);
    (CommunityMember.findOne as jest.Mock).mockResolvedValue({ mgmt_role: 'admissions' });
    (CommunityMember.findAll as jest.Mock).mockResolvedValue([]);
    (Cohort.findAll as jest.Mock).mockResolvedValue([]);
    (Enrollment.findAll as jest.Mock).mockResolvedValue([]);
    (Sponsor.findAll as jest.Mock).mockResolvedValue([]);

    const panel = await getPeoplePanel('mgr-me', null, NOW);
    expect(panel.viewer_role).toBe('staff');
  });

  it('degrades businesses to [] when the sponsor join fails (best-effort)', async () => {
    (CommunityMember.findAll as jest.Mock).mockResolvedValue([]);
    (Cohort.findAll as jest.Mock).mockResolvedValue([]);
    (Enrollment.findAll as jest.Mock).mockResolvedValue([]);
    (Sponsor.findAll as jest.Mock).mockRejectedValue(new Error('sponsors table unavailable'));

    const panel = (await getPeoplePanel('staff-me', 'ca', NOW)) as StaffPanel;
    expect(panel.businesses).toEqual([]);
    expect(panel.online).toEqual([]);
  });
});

describe('getPeoplePanel — student viewer', () => {
  beforeEach(() => {
    (isStaffEnrollment as jest.Mock).mockResolvedValue(false);
  });

  it('returns cohort-mates (online-first then name) + top-10 outside-cohort active', async () => {
    // My class roster (Enrollment.findAll) — includes online, idle, and offline members.
    (Enrollment.findAll as jest.Mock).mockResolvedValue([
      { id: 'e1', full_name: 'Alice', avatar_data_url: null, communityMember: { id: 'm1', avatar_url: null, role: 'student', last_active_at: ONLINE }, cohort: { name: 'July 2026' } },
      { id: 'e4', full_name: 'Dan', avatar_data_url: null, communityMember: { id: 'm4', avatar_url: null, role: 'student', last_active_at: ONLINE }, cohort: { name: 'July 2026' } },
      { id: 'e2', full_name: 'Bob', avatar_data_url: null, communityMember: { id: 'm2', avatar_url: null, role: 'student', last_active_at: IDLE }, cohort: { name: 'July 2026' } },
      { id: 'e5', full_name: 'Zed', avatar_data_url: null, communityMember: null, cohort: { name: 'July 2026' } },
    ]);
    // Recently-active scan (DB-desc) — a mix of the viewer's cohort and outside cohorts.
    (CommunityMember.findAll as jest.Mock).mockResolvedValue([
      memberRow({ id: 'm3', enrollmentId: 'e3', name: 'Cara', cohortId: 'cb', cohortName: 'Nov 2026', last: ago(5_000) }),
      memberRow({ id: 'm1', enrollmentId: 'e1', name: 'Alice', cohortId: 'ca', cohortName: 'July 2026', last: ONLINE }),
      memberRow({ id: 'm6', enrollmentId: 'e6', name: 'Eve', cohortId: 'cb', cohortName: 'Nov 2026', last: IDLE }),
    ]);

    const panel = (await getPeoplePanel('me', 'ca', NOW)) as StudentPanel;

    expect(panel.viewer_role).toBe('student');
    // My class: online-first (Alice, Dan alphabetical) then idle (Bob) then offline (Zed).
    expect(panel.my_class.map((p) => p.display_name)).toEqual(['Alice', 'Dan', 'Bob', 'Zed']);
    expect(panel.my_class[0].presence).toBe('online');
    expect(panel.my_class[3].presence).toBe('offline');
    // Active now: only OUTSIDE the viewer's cohort (cb), most-recent first — Alice (ca) dropped.
    expect(panel.active_now.map((p) => p.display_name)).toEqual(['Cara', 'Eve']);
    expect(panel.active_now.every((p) => p.cohort_name === 'Nov 2026')).toBe(true);
  });

  it('empty-cohort student: my_class is empty (no roster query), active_now surfaces everyone else', async () => {
    (CommunityMember.findAll as jest.Mock).mockResolvedValue([
      memberRow({ id: 'm3', enrollmentId: 'e3', name: 'Cara', cohortId: 'cb', cohortName: 'Nov 2026', last: ago(5_000) }),
      memberRow({ id: 'm1', enrollmentId: 'e1', name: 'Alice', cohortId: 'ca', cohortName: 'July 2026', last: ONLINE }),
    ]);

    const panel = (await getPeoplePanel('me', null, NOW)) as StudentPanel;

    expect(panel.my_class).toEqual([]);
    // No cohort roster query for a cohortless viewer.
    expect(Enrollment.findAll as jest.Mock).not.toHaveBeenCalled();
    // Everyone recently active (minus the viewer) is "outside" -> the discovery value.
    expect(panel.active_now.map((p) => p.display_name)).toEqual(['Cara', 'Alice']);
  });

  it('excludes the viewer from active_now', async () => {
    (Enrollment.findAll as jest.Mock).mockResolvedValue([]);
    (CommunityMember.findAll as jest.Mock).mockResolvedValue([
      memberRow({ id: 'me', enrollmentId: 'me', name: 'Me', cohortId: 'ca', cohortName: 'July 2026', last: ago(1_000) }),
      memberRow({ id: 'm3', enrollmentId: 'e3', name: 'Cara', cohortId: 'cb', cohortName: 'Nov 2026', last: ago(5_000) }),
    ]);

    const panel = (await getPeoplePanel('me', 'ca', NOW)) as StudentPanel;
    expect(panel.active_now.map((p) => p.enrollment_id)).toEqual(['e3']);
  });
});
