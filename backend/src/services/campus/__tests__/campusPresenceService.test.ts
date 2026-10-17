const mockEnv = { peoplePanelRolesEnabled: true };
jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../db/ensureCampusPresenceSchema', () => ({ ensureCampusPresenceSchema: jest.fn() }));
jest.mock('../../../models/CampusPresence', () => ({ __esModule: true, default: { findAll: jest.fn(), upsert: jest.fn() } }));
jest.mock('../../peoplePanelService', () => ({ getPeoplePanel: jest.fn() }));
jest.mock('../../cohortPresenceService', () => ({ getCohortPresence: jest.fn() }));

import CampusPresence from '../../../models/CampusPresence';
import { ensureCampusPresenceSchema } from '../../../db/ensureCampusPresenceSchema';
import { getPeoplePanel } from '../../peoplePanelService';
import { getCohortPresence } from '../../cohortPresenceService';
import {
  getCampusPresence, touchCampusArea, visibleSetFor, CampusAreaError, FRESH_MS, VISIBLE_CACHE_MAX,
  __resetCampusPresenceCacheForTests, __campusPresenceCacheSize,
} from '../campusPresenceService';

const findAll = CampusPresence.findAll as unknown as jest.Mock;
const upsert = CampusPresence.upsert as unknown as jest.Mock;
const panel = getPeoplePanel as unknown as jest.Mock;
const cohort = getCohortPresence as unknown as jest.Mock;
const ensure = ensureCampusPresenceSchema as unknown as jest.Mock;

const NOW = new Date('2026-10-17T15:00:00Z');
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo);
const person = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ member_id: 'm-' + id, enrollment_id: id, display_name: name, avatar_url: null, role: 'student', presence: 'online', cohort_name: 'Cohort X', ...extra });

beforeEach(() => {
  jest.clearAllMocks(); // backend jest does not reset call counts between tests
  __resetCampusPresenceCacheForTests();
  ensure.mockResolvedValue(undefined);
  mockEnv.peoplePanelRolesEnabled = true;
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
      { enrollment_id: 'mate', display_name: 'Mia', avatar_url: null },
      { enrollment_id: 'active', display_name: 'Ana', avatar_url: null },
      { anonymous: true },
    ]);
    expect(areas.lecture!.people).toEqual([{ enrollment_id: 'mate2', display_name: 'Max', avatar_url: null }]);
    expect(panel).toHaveBeenCalledWith('me', 'coh-1');
    expect(cohort).not.toHaveBeenCalled();
  });

  it('staff, panel ON: names exactly panel.online', async () => {
    findAll.mockResolvedValue(rows);
    panel.mockResolvedValue({ viewer_role: 'staff', online: [person('stranger', 'Sam')], classes: [], businesses: [] });
    const { areas } = await getCampusPresence('me', null, NOW);
    expect(areas.library!.people).toEqual([{ anonymous: true }, { anonymous: true }, { enrollment_id: 'stranger', display_name: 'Sam', avatar_url: null }]);
  });

  it('panel OFF: names exactly the cohort-presence contacts (the rail fallback)', async () => {
    mockEnv.peoplePanelRolesEnabled = false;
    findAll.mockResolvedValue(rows);
    cohort.mockResolvedValue([{ id: 'mate', name: 'Mia', avatarUrl: 'data:image/png;base64,AA', presence: 'online', friendshipStatus: 'none' }]);
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(areas.library!.people).toEqual([
      { enrollment_id: 'mate', display_name: 'Mia', avatar_url: 'data:image/png;base64,AA' },
      { anonymous: true }, { anonymous: true },
    ]);
    expect(panel).not.toHaveBeenCalled();
  });

  it('a named person carries exactly three fields (no role, presence, cohort, member id)', async () => {
    findAll.mockResolvedValue([rows[1]]);
    panel.mockResolvedValue({ viewer_role: 'student', my_class: [person('mate', 'Mia')], active_now: [] });
    const { areas } = await getCampusPresence('me', 'coh-1', NOW);
    expect(Object.keys(areas.library!.people[0]).sort()).toEqual(['avatar_url', 'display_name', 'enrollment_id']);
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
