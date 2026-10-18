/**
 * C5 staff desks: who sees which desk, decided from the SAME sources as the frontend's audience, and the on-duty rule.
 */
const mockEntitlement = { isStaff: false, explorer: false };
let mockManager = false;
jest.mock('../../access/contentEntitlement', () => ({
  resolveContentPageAccess: jest.fn(async () => ({ isStaff: mockEntitlement.isStaff, hasFullAccess: true })),
  isFreePreviewTier: jest.fn(async () => mockEntitlement.explorer),
}));
jest.mock('../../portalSettingsService', () => ({ isOrgManager: jest.fn(async () => mockManager) }));
jest.mock('../../reese/reeseIdentitySeed', () => ({ isReeseEnabled: jest.fn(), getReeseEnrollmentId: jest.fn() }));
jest.mock('../../curriculum/daraIdentitySeed', () => ({ isDaraEnabled: jest.fn(), getDaraEnrollmentId: jest.fn() }));
// The thing NOT to use: a broader staff test (staff role OR mgmt_role). Mocked to say "yes" so a regression to it shows.
jest.mock('../../access/staffAccess', () => ({ isStaffOrMgmt: jest.fn(async () => true), isStaffEnrollment: jest.fn(async () => true) }));

import fs from 'fs';
import path from 'path';
import { isReeseEnabled, getReeseEnrollmentId } from '../../reese/reeseIdentitySeed';
import { isDaraEnabled, getDaraEnrollmentId } from '../../curriculum/daraIdentitySeed';
import { getStaffDesks, campusAudienceFor, mayaVisibleTo } from '../campusStaffDesks';

const set = (o: { staff?: boolean; manager?: boolean; explorer?: boolean }) => {
  mockEntitlement.isStaff = !!o.staff; mockEntitlement.explorer = !!o.explorer; mockManager = !!o.manager;
};
const ids = async () => (await getStaffDesks('enr-1')).desks.map((d) => d.id);

beforeEach(() => {
  jest.clearAllMocks();
  set({});
  (isReeseEnabled as jest.Mock).mockResolvedValue(true);
  (getReeseEnrollmentId as jest.Mock).mockResolvedValue('reese-1');
  (isDaraEnabled as jest.Mock).mockResolvedValue(true);
  (getDaraEnrollmentId as jest.Mock).mockResolvedValue('dara-1');
});

describe('audience: the frontend\'s sources, the frontend\'s precedence', () => {
  it.each([
    ['member', {}, 'member'],
    ['someone with only a management role (isStaffOrMgmt would say yes): still a member', {}, 'member'],
    ['org manager', { manager: true }, 'business'],
    ['Explorer', { explorer: true }, 'explorer'],
    ['org manager on an Explorer account', { manager: true, explorer: true }, 'business'],
    ['staff', { staff: true }, 'staff'],
    ['staff who also manages an org', { staff: true, manager: true }, 'staff'],
  ])('%s', async (_n, o, want) => {
    set(o);
    await expect(campusAudienceFor('enr-1')).resolves.toBe(want);
  });

  it('pins the frontend precedence line, so a change on either side fails here', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'components', 'campus', 'campusAudience.ts'), 'utf8');
    expect(src).toContain("s.isStaff ? 'staff' : s.isOrgManager ? 'business' : s.isExplorer ? 'explorer' : 'member'");
  });
});

describe('Maya: staff and Explorers only', () => {
  it.each([
    [{}, ['reese', 'dara']],
    [{ manager: true }, ['reese', 'dara']],
    [{ manager: true, explorer: true }, ['reese', 'dara']],
    [{ explorer: true }, ['reese', 'dara', 'maya']],
    [{ staff: true }, ['reese', 'dara', 'maya']],
  ])('%j -> %j', async (o, want) => {
    set(o);
    expect(await ids()).toEqual(want);
  });

  it('mayaVisibleTo is exactly staff and explorer', () => {
    expect(['staff', 'business', 'explorer', 'member'].filter((a) => mayaVisibleTo(a as never))).toEqual(['staff', 'explorer']);
  });

  it('her desk is listed as not yet open (C6), with no prompts and no enrollment', async () => {
    set({ explorer: true });
    const maya = (await getStaffDesks('enr-1')).desks.find((d) => d.id === 'maya')!;
    expect(maya).toMatchObject({ building: 'gate', title: 'Welcome desk', ai: true, on_duty: false, opens: 'C6', enrollment_id: null, prompts: [] });
  });
});

describe('on duty', () => {
  it('Reese and Dara on duty: their buildings, enrollment ids and three questions each', async () => {
    const { desks } = await getStaffDesks('enr-1');
    expect(desks.map((d) => [d.id, d.building, d.on_duty, d.enrollment_id, d.prompts.length])).toEqual([
      ['reese', 'commons', true, 'reese-1', 3], ['dara', 'library', true, 'dara-1', 3],
    ]);
    expect(desks.every((d) => d.ai === true)).toBe(true);
  });

  it('a disabled Reese is off duty, with no enrollment id and no questions', async () => {
    (isReeseEnabled as jest.Mock).mockResolvedValue(false);
    const reese = (await getStaffDesks('enr-1')).desks.find((d) => d.id === 'reese')!;
    expect(reese).toMatchObject({ on_duty: false, enrollment_id: null, prompts: [] });
  });

  it('an unseeded Dara (no identity) is off duty even when enabled', async () => {
    (getDaraEnrollmentId as jest.Mock).mockResolvedValue(null);
    const dara = (await getStaffDesks('enr-1')).desks.find((d) => d.id === 'dara')!;
    expect(dara).toMatchObject({ on_duty: false, enrollment_id: null });
  });

  it('a failing lookup rejects (the route answers 500; the UI hides desks)', async () => {
    (isDaraEnabled as jest.Mock).mockRejectedValue(new TypeError('db down'));
    await expect(getStaffDesks('enr-1')).rejects.toThrow('db down');
  });
});
