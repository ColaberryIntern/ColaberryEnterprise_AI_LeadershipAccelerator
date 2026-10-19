const mockEnv = { peoplePanelRolesEnabled: true };
jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../db/ensureCampusPresenceSchema', () => ({ ensureCampusPresenceSchema: jest.fn() }));
jest.mock('../../../models/CampusPresence', () => ({ __esModule: true, default: { findAll: jest.fn(), upsert: jest.fn() } }));
jest.mock('../../peoplePanelService', () => ({ getPeoplePanel: jest.fn() }));
jest.mock('../../cohortPresenceService', () => ({ getCohortPresence: jest.fn() }));
jest.mock('../../communityRooms/dmEligibility', () => ({ canDmMany: jest.fn() }));
let mockAudience = 'member';
let mockTeam: Set<string> | 'throw' = new Set();
jest.mock('../campusAudience', () => ({ campusAudienceFor: jest.fn(async () => mockAudience) }));
// looksFor never throws (it logs and returns what it could); 'unread' models a read that returned nothing.
let mockLooks: Map<string, { rung_name?: string; gear?: Record<string, string> }> | 'unread' = new Map();
jest.mock('../campusLookService', () => ({ looksFor: jest.fn(async () => (mockLooks === 'unread' ? new Map() : mockLooks)) }));
jest.mock('../campusTeam', () => ({ teamEnrollmentIdsFor: jest.fn(async () => { if (mockTeam === 'throw') throw new TypeError('db down'); return mockTeam; }) }));

import CampusPresence from '../../../models/CampusPresence';
import { ensureCampusPresenceSchema } from '../../../db/ensureCampusPresenceSchema';
import { getPeoplePanel } from '../../peoplePanelService';
import { getCohortPresence } from '../../cohortPresenceService';
import { canDmMany } from '../../communityRooms/dmEligibility';
import {
  getCampusPresence, touchCampusArea, visibleSetFor, CampusAreaError, FRESH_MS, VISIBLE_CACHE_MAX, type CampusPersonOut,
  __resetCampusPresenceCacheForTests, __campusPresenceCacheSize,
} from '../campusPresenceService';

const findAll = CampusPresence.findAll as unknown as jest.Mock;
const upsert = CampusPresence.upsert as unknown as jest.Mock;
const panel = getPeoplePanel as unknown as jest.Mock;
const cohort = getCohortPresence as unknown as jest.Mock;
const ensure = ensureCampusPresenceSchema as unknown as jest.Mock;
const canDm = canDmMany as unknown as jest.Mock;
// The DM rule's answer per person (C5): classmates yes, the active-now person from another cohort no.
const DM_OK: Record<string, boolean> = { mate: true, mate2: true, active: false, stranger: true };

const NOW = new Date('2026-10-17T15:00:00Z');
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo);
const person = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ member_id: 'm-' + id, enrollment_id: id, display_name: name, avatar_url: null, role: 'student', presence: 'online', cohort_name: 'Cohort X', ...extra });

beforeEach(() => {
  jest.clearAllMocks(); // backend jest does not reset call counts between tests
  __resetCampusPresenceCacheForTests();
  ensure.mockResolvedValue(undefined);
  mockEnv.peoplePanelRolesEnabled = true;
  mockAudience = 'member';
  mockTeam = new Set();
  canDm.mockImplementation(async (_v: string, _c: string | null, ids: string[]) => new Map(ids.map((id) => [id, DM_OK[id] === true])));
});

describe('touchCampusArea', () => {
  it('rejects an unknown area before touching the database', async () => {
    await expect(touchCampusArea('enr-1', 'dungeon')).rejects.toBeInstanceOf(CampusAreaError);
    await expect(touchCampusArea('enr-1', 'dungeon')).rejects.toMatchObject({ error_class: 'UnknownCampusArea' });
    expect(ensure).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upserts one row keyed on the enrollment', async () => {
    await touchCampusArea('enr-1', 'library');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({ enrollment_id: 'enr-1', area: 'library' });
  });
});

describe('getCampusPresence visibility parity', () => {
  const rows = [
    { enrollment_id: 'me', area: 'library', updated_at: at(1000) },
    { enrollment_id: 'mate', area: 'library', updated_at: at(2000) },
    { enrollment_id: 'active', area: 'library', updated_at: at(3000) },
    { enrollment_id: 'stranger', area: 'library', updated_at: at(4000) },
    { enrollment_id: 'mate2', area: 'lecture', updated_at: at(5000) },
  ];

  it('student, panel ON: names exactly my_class + active_now; everyone else anonymous; viewer counted not listed', async () => {
    findAll.mockResolvedValue(rows);
    panel.mockResolvedValue({ viewer_role: 'student', my_class: [person('mate', 'Mia'), person('mate2', 'Max')], active_now: [person('active', 'Ana')] });
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(areas.library!.count).toBe(4);
    expect(areas.library!.people).toEqual([
      { enrollment_id: 'mate', display_name: 'Mia', avatar_url: null, can_message: true },
      { enrollment_id: 'active', display_name: 'Ana', avatar_url: null, can_message: false },
      { anonymous: true },
    ]);
    expect(areas.lecture!.people).toEqual([{ enrollment_id: 'mate2', display_name: 'Max', avatar_url: null, can_message: true }]);
    expect(panel).toHaveBeenCalledWith('me', 'coh-1');
    expect(cohort).not.toHaveBeenCalled();
  });

  it('staff, panel ON: names exactly panel.online', async () => {
    findAll.mockResolvedValue(rows);
    panel.mockResolvedValue({ viewer_role: 'staff', online: [person('stranger', 'Sam')], classes: [], businesses: [] });
    const { areas } = await getCampusPresence('me', null, NOW);
    expect(areas.library!.people).toEqual([{ anonymous: true }, { anonymous: true }, { enrollment_id: 'stranger', display_name: 'Sam', avatar_url: null, can_message: true }]);
  });

  it('panel OFF: names exactly the cohort-presence contacts (the rail fallback)', async () => {
    mockEnv.peoplePanelRolesEnabled = false;
    findAll.mockResolvedValue(rows);
    cohort.mockResolvedValue([{ id: 'mate', name: 'Mia', avatarUrl: 'data:image/png;base64,AA', presence: 'online', friendshipStatus: 'none' }]);
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(areas.library!.people).toEqual([
      { enrollment_id: 'mate', display_name: 'Mia', avatar_url: 'data:image/png;base64,AA', can_message: true },
      { anonymous: true }, { anonymous: true },
    ]);
    expect(panel).not.toHaveBeenCalled();
  });

  it('a named person carries exactly the three C4 fields plus can_message (no role, presence, cohort, member id)', async () => {
    findAll.mockResolvedValue([rows[1]]);
    panel.mockResolvedValue({ viewer_role: 'student', my_class: [person('mate', 'Mia')], active_now: [] });
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(Object.keys(areas.library!.people[0]).sort()).toEqual(['avatar_url', 'can_message', 'display_name', 'enrollment_id']);
  });

  it('anonymous entries are exactly {anonymous:true}', async () => {
    findAll.mockResolvedValue([rows[3]]);
    panel.mockResolvedValue({ viewer_role: 'student', my_class: [], active_now: [] });
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(areas.library!.people).toEqual([{ anonymous: true }]);
    expect(JSON.stringify(areas)).not.toContain('stranger');
  });

  it('asks the database only for rows inside the 90 s window, capped, and drops stale or unknown-area rows defensively', async () => {
    findAll.mockResolvedValue([
      { enrollment_id: 'old', area: 'library', updated_at: at(FRESH_MS + 1000) },
      { enrollment_id: 'retired', area: 'dungeon', updated_at: at(1000) },
    ]);
    panel.mockResolvedValue({ viewer_role: 'student', my_class: [], active_now: [] });
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(areas).toEqual({});
    const q = findAll.mock.calls[0][0];
    const gte = Object.getOwnPropertySymbols(q.where.updated_at).map((s) => q.where.updated_at[s])[0] as Date;
    expect(gte.getTime()).toBe(NOW.getTime() - FRESH_MS);
    expect(q.limit).toBe(500);
  });

  it('a database failure propagates (the UI shows the broken state, never an empty campus)', async () => {
    ensure.mockRejectedValue(new Error('pg_type race'));
    await expect(getCampusPresence('me', 'coh-1', NOW)).rejects.toThrow('pg_type race');
  });
});

describe('visible-set cache', () => {
  it('reuses the rail result for 60 s per viewer and cohort, then recomputes', async () => {
    panel.mockResolvedValue({ viewer_role: 'student', my_class: [], active_now: [] });
    await visibleSetFor('v', 'c', NOW);
    await visibleSetFor('v', 'c', new Date(NOW.getTime() + 59_000));
    expect(panel).toHaveBeenCalledTimes(1);
    await visibleSetFor('v', 'c', new Date(NOW.getTime() + 61_000));
    expect(panel).toHaveBeenCalledTimes(2);
  });

  it('a cohort change is a different key (never serves the old cohort set)', async () => {
    panel.mockResolvedValue({ viewer_role: 'student', my_class: [], active_now: [] });
    await visibleSetFor('v', 'c1', NOW);
    await visibleSetFor('v', 'c2', NOW);
    expect(panel).toHaveBeenCalledTimes(2);
  });

  it('is bounded', async () => {
    panel.mockResolvedValue({ viewer_role: 'student', my_class: [], active_now: [] });
    for (let i = 0; i < VISIBLE_CACHE_MAX + 25; i++) await visibleSetFor('v' + i, null, NOW);
    expect(__campusPresenceCacheSize()).toBe(VISIBLE_CACHE_MAX);
  });
});

describe('can_message (C5): the one DM rule, per viewer, fail closed', () => {
  const rows = [
    { enrollment_id: 'mate', area: 'library', updated_at: at(1000) },
    { enrollment_id: 'active', area: 'library', updated_at: at(2000) },
    { enrollment_id: 'mate', area: 'library', updated_at: at(2500) },
    { enrollment_id: 'ghost', area: 'lecture', updated_at: at(3000) },
  ];
  beforeEach(() => panel.mockResolvedValue({ viewer_role: 'student', my_class: [person('mate', 'Mia')], active_now: [person('active', 'Ana')] }));

  it('asks the DM rule once, for the viewer and cohort, with each named person once (anonymous people never asked)', async () => {
    findAll.mockResolvedValue(rows);
    await getCampusPresence('me', 'coh-1', NOW);
    expect(canDm).toHaveBeenCalledTimes(1);
    expect(canDm).toHaveBeenCalledWith('me', 'coh-1', ['mate', 'active']);
  });

  it('a classmate can be messaged; an active-now person from another cohort cannot', async () => {
    findAll.mockResolvedValue(rows.slice(0, 2));
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(areas.library!.people.map((p) => ('anonymous' in p ? 'anon' : p.enrollment_id + ':' + p.can_message))).toEqual(['mate:true', 'active:false']);
  });

  it('if the rule lookup fails, everyone named reads can_message false and the failure is logged', async () => {
    findAll.mockResolvedValue(rows.slice(0, 2));
    canDm.mockRejectedValue(new TypeError('db down'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(areas.library!.people.every((p) => !('anonymous' in p) && p.can_message === false)).toBe(true);
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({ event: 'campus_can_message_failed', error_class: 'TypeError' });
    err.mockRestore();
  });

  it('Reese, named by the rail, reads can_message true for a student in any cohort (her bypass in the one rule)', async () => {
    findAll.mockResolvedValue([{ enrollment_id: 'reese-1', area: 'commons', updated_at: at(1000) }]);
    panel.mockResolvedValue({ viewer_role: 'student', my_class: [], active_now: [person('reese-1', 'Reese')] });
    canDm.mockImplementation(async (_v: string, _c: string | null, ids: string[]) => new Map(ids.map((id) => [id, id === 'reese-1'])));
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(areas.commons!.people).toEqual([{ enrollment_id: 'reese-1', display_name: 'Reese', avatar_url: null, can_message: true }]);
  });

  it('an id the rule did not answer reads can_message false (never assumed allowed)', async () => {
    findAll.mockResolvedValue(rows.slice(0, 2));
    canDm.mockResolvedValue(new Map([['mate', true]])); // no answer for 'active'
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(areas.library!.people.map((p) => ('anonymous' in p ? 'anon' : p.enrollment_id + ':' + p.can_message))).toEqual(['mate:true', 'active:false']);
  });

  it('nobody named: the rule is not asked at all', async () => {
    findAll.mockResolvedValue([rows[3]]);
    await getCampusPresence('me', 'coh-1', NOW);
    expect(canDm).not.toHaveBeenCalled();
  });

  it('the shared visible-set cache never stores can_message (it is per viewer, added on output)', async () => {
    findAll.mockResolvedValue(rows.slice(0, 1));
    await getCampusPresence('me', 'coh-1', NOW);
    const cached = await visibleSetFor('me', 'coh-1', NOW);
    expect(Object.keys(cached.get('mate')!).sort()).toEqual(['avatar_url', 'display_name', 'enrollment_id']);
  });
});

describe('business viewers see their team only (C6)', () => {
  const rows = [
    { enrollment_id: 'mate', area: 'library', updated_at: at(1000) },
    { enrollment_id: 'teammate', area: 'library', updated_at: at(2000) },
    { enrollment_id: 'stranger', area: 'library', updated_at: at(3000) },
  ];
  beforeEach(() => panel.mockResolvedValue({ viewer_role: 'student', my_class: [person('mate', 'Mia'), person('teammate', 'Tom')], active_now: [person('stranger', 'Sam')] }));
  const names = (areas: Awaited<ReturnType<typeof getCampusPresence>>['areas']) => areas.library!.people.map((p) => ('anonymous' in p ? 'anon' : p.display_name));

  it('names only teammates the rail names; everyone else is anonymous', async () => {
    mockAudience = 'business'; mockTeam = new Set(['teammate', 'not-in-rail']);
    findAll.mockResolvedValue(rows);
    expect(names((await getCampusPresence('me', 'coh-1', NOW)).areas)).toEqual(['anon', 'Tom', 'anon']);
  });

  it('a teammate the rail does not name stays anonymous (never more than the rail)', async () => {
    mockAudience = 'business'; mockTeam = new Set(['ghost']);
    findAll.mockResolvedValue([...rows, { enrollment_id: 'ghost', area: 'library', updated_at: at(4000) }]);
    expect(names((await getCampusPresence('me', 'coh-1', NOW)).areas)).toEqual(['anon', 'anon', 'anon', 'anon']);
  });

  it('a failed team lookup names nobody (fail closed) and is logged', async () => {
    mockAudience = 'business'; mockTeam = 'throw';
    findAll.mockResolvedValue(rows);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(names((await getCampusPresence('me', 'coh-1', NOW)).areas)).toEqual(['anon', 'anon', 'anon']);
    expect(err.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toContain('campus_team_lookup_failed');
    err.mockRestore();
  });

  it.each(['member', 'explorer', 'staff'])('a %s viewer keeps the rail set unchanged', async (aud) => {
    mockAudience = aud;
    findAll.mockResolvedValue(rows);
    expect(names((await getCampusPresence('me', 'coh-1', NOW)).areas)).toEqual(['Mia', 'Tom', 'Sam']);
  });
});

describe('C9: level and gear on named people only', () => {
  const rows = [
    { enrollment_id: 'mate', area: 'library', updated_at: at(1000) },
    { enrollment_id: 'stranger', area: 'library', updated_at: at(2000) },
  ];
  beforeEach(() => {
    findAll.mockResolvedValue(rows);
    panel.mockResolvedValue({ viewer_role: 'student', my_class: [person('mate', 'Mia')], active_now: [] });
  });
  afterEach(() => { mockLooks = new Map(); });

  it('a named person carries rung_name and gear; the anonymous entry stays exactly {anonymous:true}', async () => {
    mockLooks = new Map([['mate', { rung_name: 'AI Enabled I', gear: { head: 'cap' } }], ['stranger', { rung_name: 'AI Aware I', gear: { head: 'cap' } }]]);
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    const people = areas.library!.people;
    expect(people.find((p) => 'enrollment_id' in p && p.enrollment_id === 'mate')).toMatchObject({ rung_name: 'AI Enabled I', gear: { head: 'cap' } });
    expect(people.filter((p) => 'anonymous' in p)).toEqual([{ anonymous: true }]);
  });

  it('only the NAMED ids are asked for (the stranger is never looked up)', async () => {
    const { looksFor } = jest.requireMock('../campusLookService') as { looksFor: jest.Mock };
    await getCampusPresence('me', 'coh-1', NOW);
    expect(looksFor).toHaveBeenLastCalledWith(['mate']);
  });

  it('a look that could not be read: the person stays named, with no level or gear', async () => {
    mockLooks = 'unread';
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    const mate = areas.library!.people.find((p): p is CampusPersonOut => 'enrollment_id' in p)!;
    expect(mate.display_name).toBe('Mia');
    expect(mate.rung_name).toBeUndefined();
    expect(mate.gear).toBeUndefined();
  });
});
