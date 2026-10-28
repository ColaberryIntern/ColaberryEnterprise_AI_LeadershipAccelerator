jest.mock('../../../db/ensureCampusPresenceSchema', () => ({ ensureCampusPresenceSchema: jest.fn(async () => undefined) }));
jest.mock('../../../models/CampusPresence', () => ({ __esModule: true, default: { upsert: jest.fn(async () => undefined), destroy: jest.fn(async () => 0) } }));
jest.mock('../../communityService', () => ({ touchPresence: jest.fn(async () => ({ presence: 'online' })) }));
jest.mock('../campusPresenceService', () => ({ clearCampusArea: jest.fn(async () => undefined) }));

import fs from 'fs';
import path from 'path';
import CampusPresence from '../../../models/CampusPresence';
import { touchPresence } from '../../communityService';
import { clearCampusArea } from '../campusPresenceService';
import { HQ_PATH, staffEnrollmentOf, touchHqPresence } from '../hqPresence';

const upsert = CampusPresence.upsert as unknown as jest.Mock;
const clear = clearCampusArea as unknown as jest.Mock;
const touch = touchPresence as unknown as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('HQ_PATH: sidebar paths only', () => {
  it('accepts every internal path in the real admin sidebar (frontend adminNav.ts)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../../../frontend/src/components/Layout/adminNav.ts'), 'utf8');
    const head = src.slice(0, src.indexOf('export const ALL_LINKS'));
    const paths = [...head.matchAll(/path: '(\/admin\/[^']+)'/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(40);
    expect(paths.filter((p) => !HQ_PATH.test(p))).toEqual([]);
  });

  it.each([
    ['a detail route with a number', '/admin/leads/123'],
    ['a detail route with a uuid', '/admin/people/550e8400-e29b-41d4-a716-446655440000'],
    ['a query string', '/admin/growth-journey?tab=handoffs'],
    ['a traversal', '/admin/../portal'],
    ['outside admin', '/portal/today'],
    ['an absolute URL', 'https://evil.example/admin/x'],
    ['too deep', '/admin/a/b/c/d'],
    ['bare admin', '/admin'],
  ])('refuses %s', (_n, p) => {
    expect(HQ_PATH.test(p)).toBe(false);
  });
});

describe('staffEnrollmentOf', () => {
  it('a bridge-minted token: sub is the enrollment', () => {
    expect(staffEnrollmentOf({ sub: 'enr-1', mgmt_role: 'marketing' })).toBe('enr-1');
  });
  it('a direct admin login linked to a staff account: portal_enrollment_id', () => {
    expect(staffEnrollmentOf({ sub: 'admin-user-7', portal_enrollment_id: 'enr-2' })).toBe('enr-2');
  });
  it('a legacy admin with no staff account has no campus identity', () => {
    expect(staffEnrollmentOf({ sub: 'admin-user-7' })).toBeNull();
    expect(staffEnrollmentOf(undefined)).toBeNull();
  });
});

describe('touchHqPresence', () => {
  it('marks the employee online AND places them in the HQ on their page', async () => {
    await touchHqPresence('enr-1', '/admin/marketing/brands');
    expect(touch).toHaveBeenCalledWith('enr-1');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({ enrollment_id: 'enr-1', area: 'career', hq_path: '/admin/marketing/brands' });
  });

  it('a page with no sidebar entry is the lobby (null)', async () => {
    await touchHqPresence('enr-1', null);
    expect(upsert.mock.calls[0][0]).toMatchObject({ area: 'career', hq_path: null });
  });

  it('is idempotent: the same beat twice writes the same row twice', async () => {
    await touchHqPresence('enr-1', '/admin/leads');
    await touchHqPresence('enr-1', '/admin/leads');
    const rows = upsert.mock.calls.map((c) => ({ ...c[0], updated_at: undefined }));
    expect(rows[0]).toEqual(rows[1]);
  });

  it('"Show which building I am in" off: still online, building forgotten, nothing placed', async () => {
    await touchHqPresence('enr-1', '/admin/leads', false);
    expect(touch).toHaveBeenCalledWith('enr-1');
    expect(clear).toHaveBeenCalledWith('enr-1');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses a detail path before writing anything', async () => {
    await expect(touchHqPresence('enr-1', '/admin/leads/42')).rejects.toBeInstanceOf(TypeError);
    expect(touch).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('a failed online write surfaces (no silent swallow) and places nothing', async () => {
    touch.mockRejectedValueOnce(new Error('db down'));
    await expect(touchHqPresence('enr-1', '/admin/leads')).rejects.toThrow('db down');
    expect(upsert).not.toHaveBeenCalled();
  });
});
