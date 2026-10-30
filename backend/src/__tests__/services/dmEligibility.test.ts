/**
 * The one DM rule (dmEligibility.ts), as the campus asks it. dmService.test.ts proves POST /dm/open still behaves
 * exactly as before; this proves the pure rule and the batch form agree with it.
 */
jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn(), findAll: jest.fn() }));
jest.mock('../../services/access/staffAccess', () => ({ isStaffOrMgmt: jest.fn() }));
jest.mock('../../services/reese/reeseIdentitySeed', () => ({ getReeseEnrollmentId: jest.fn() }));
jest.mock('../../services/curriculum/daraIdentitySeed', () => ({ getDaraEnrollmentId: jest.fn() }));
// C87: the badge sections that decide whether Dara's Program floor is open to the sender
jest.mock('../../services/access/mgmtBridgeService', () => ({ getMgmtStatus: jest.fn() }));

import Enrollment from '../../models/Enrollment';
import { isStaffOrMgmt } from '../../services/access/staffAccess';
import { getReeseEnrollmentId } from '../../services/reese/reeseIdentitySeed';
import { getDaraEnrollmentId } from '../../services/curriculum/daraIdentitySeed';
import { getMgmtStatus } from '../../services/access/mgmtBridgeService';
import {
  dmBlockReason, dmBlockReasonFor, canDmMany, loadDmContext,
  DM_NOT_AVAILABLE, DM_COHORT_ONLY, DM_NO_COHORT, DM_DARA_FLOOR, DmContext, agentFloorBlockFor,
} from '../../services/communityRooms/dmEligibility';

const ME = 'me-1', REESE = 'reese-1', DARA = 'dara-1';
const ctx = (over: Partial<DmContext> = {}): DmContext => ({ meIsStaffOrMgmt: false, reeseId: REESE, daraId: DARA, daraFloorOpen: true, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  (isStaffOrMgmt as jest.Mock).mockResolvedValue(false);
  (getReeseEnrollmentId as jest.Mock).mockResolvedValue(REESE);
  (getDaraEnrollmentId as jest.Mock).mockResolvedValue(DARA);
  (getMgmtStatus as jest.Mock).mockResolvedValue({ is_mgmt: true, role: 'curriculum', label: 'Curriculum', sections: ['dashboard', 'program'] });
});

describe('dmBlockReason (pure)', () => {
  it.each([
    ['same cohort', { id: 'o', cohort_id: 'c1' }, 'c1', ctx(), null],
    ['other cohort', { id: 'o', cohort_id: 'c2' }, 'c1', ctx(), DM_COHORT_ONLY],
    ['I have no cohort', { id: 'o', cohort_id: 'c2' }, null, ctx(), DM_NO_COHORT],
    ['other person missing', null, 'c1', ctx(), DM_NOT_AVAILABLE],
    ['staff or management sender, other cohort', { id: 'o', cohort_id: 'c2' }, 'c1', ctx({ meIsStaffOrMgmt: true }), null],
    ['staff with no cohort of their own', { id: 'o', cohort_id: 'c2' }, null, ctx({ meIsStaffOrMgmt: true }), null],
    ['the other person is Reese', { id: REESE, cohort_id: null }, 'c1', ctx(), null],
    ['the other person is Dara', { id: DARA, cohort_id: null }, 'c1', ctx(), null],
    ['two students, null cohorts on both sides', { id: 'o', cohort_id: null }, null, ctx(), DM_NO_COHORT],
    ['Reese lookup failed (null): no bypass', { id: REESE, cohort_id: null }, 'c1', ctx({ reeseId: null }), DM_COHORT_ONLY],
  ])('%s', (_n, other, cohort, c, want) => {
    expect(dmBlockReason(ME, other as never, cohort as string | null, c)).toBe(want);
  });

  it('I am Reese: I can reach a student in any cohort', () => {
    expect(dmBlockReason(REESE, { id: 'o', cohort_id: 'c9' }, null, ctx())).toBeNull();
  });
});

describe('loadDmContext fails closed', () => {
  it('a throwing Reese or Dara lookup becomes "no bypass" and is logged, never thrown', async () => {
    (getReeseEnrollmentId as jest.Mock).mockRejectedValue(new TypeError('db down'));
    (getDaraEnrollmentId as jest.Mock).mockRejectedValue(new TypeError('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(loadDmContext(ME)).resolves.toEqual({ meIsStaffOrMgmt: false, reeseId: null, daraId: null, daraFloorOpen: true });
    expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toEqual(['reese_enrollment_lookup_failed', 'dara_enrollment_lookup_failed']);
    warn.mockRestore();
  });
});

describe('dmBlockReasonFor (what POST /dm/open asks)', () => {
  it('same cohort is allowed (C87: the lookups now run first, because the Dara floor check applies to everyone)', async () => {
    (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'o', cohort_id: 'c1' });
    await expect(dmBlockReasonFor(ME, 'o', 'c1')).resolves.toBeNull();
  });
  it('a missing person is "no longer available"', async () => {
    (Enrollment.findByPk as jest.Mock).mockResolvedValue(null);
    await expect(dmBlockReasonFor(ME, 'gone', 'c1')).resolves.toBe(DM_NOT_AVAILABLE);
  });
});

describe('canDmMany (the campus presence list)', () => {
  it('answers each id with the same rule, using ONE Enrollment query', async () => {
    (Enrollment.findAll as jest.Mock).mockResolvedValue([
      { id: 'mate', cohort_id: 'c1' }, { id: 'stranger', cohort_id: 'c2' }, { id: REESE, cohort_id: null },
    ]);
    const got = await canDmMany(ME, 'c1', ['mate', 'stranger', REESE, 'gone']);
    expect(Object.fromEntries(got)).toEqual({ mate: true, stranger: false, [REESE]: true, gone: false });
    expect(Enrollment.findAll).toHaveBeenCalledTimes(1);
  });
  it('a staff viewer can message everyone named', async () => {
    (isStaffOrMgmt as jest.Mock).mockResolvedValue(true);
    (Enrollment.findAll as jest.Mock).mockResolvedValue([{ id: 'stranger', cohort_id: 'c2' }]);
    expect((await canDmMany(ME, null, ['stranger'])).get('stranger')).toBe(true);
  });
  it('an empty list makes no query', async () => {
    expect((await canDmMany(ME, 'c1', [])).size).toBe(0);
    expect(Enrollment.findAll).not.toHaveBeenCalled();
  });
});

describe('C87: Dara stays on the Program floor; no badge for it, no conversation', () => {
  it.each([
    ['a student, even in a cohort', { id: DARA, cohort_id: null }, 'c1', ctx({ daraFloorOpen: false }), DM_DARA_FLOOR],
    ['staff without the floor (the staff bypass does not apply)', { id: DARA, cohort_id: null }, 'c1', ctx({ daraFloorOpen: false, meIsStaffOrMgmt: true }), DM_DARA_FLOOR],
    ['a badge with the Program floor', { id: DARA, cohort_id: null }, 'c1', ctx({ daraFloorOpen: true }), null],
    ['Reese is not affected', { id: REESE, cohort_id: null }, 'c1', ctx({ daraFloorOpen: false }), null],
  ])('%s', (_n, other, cohort, c, want) => {
    expect(dmBlockReason(ME, other, cohort, c)).toBe(want);
  });
  it('Dara writing to someone is not limited', () => {
    expect(dmBlockReason(DARA, { id: ME, cohort_id: 'c1' }, null, ctx({ daraFloorOpen: false }))).toBeNull();
  });
  it('loadDmContext reads the floor from the badge, and a failed lookup closes it', async () => {
    expect((await loadDmContext(ME)).daraFloorOpen).toBe(true);
    (getMgmtStatus as jest.Mock).mockResolvedValue({ is_mgmt: true, role: 'marketing', label: null, sections: ['dashboard', 'campaigns'] });
    expect((await loadDmContext(ME)).daraFloorOpen).toBe(false);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (getMgmtStatus as jest.Mock).mockRejectedValue(new TypeError('db down'));
    expect((await loadDmContext(ME)).daraFloorOpen).toBe(false);
    warn.mockRestore();
  });
  it('dmBlockReasonFor (POST /dm/open) refuses Dara for a sender without the floor', async () => {
    (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: DARA, cohort_id: null });
    (getMgmtStatus as jest.Mock).mockResolvedValue({ is_mgmt: false, role: null, label: null, sections: [] });
    await expect(dmBlockReasonFor(ME, DARA, 'c1')).resolves.toBe(DM_DARA_FLOOR);
  });
  it('agentFloorBlockFor (sending in an existing thread): only Dara, only without the floor', async () => {
    await expect(agentFloorBlockFor(ME, DARA)).resolves.toBeNull();
    (getMgmtStatus as jest.Mock).mockResolvedValue({ is_mgmt: false, role: null, label: null, sections: [] });
    await expect(agentFloorBlockFor(ME, DARA)).resolves.toBe(DM_DARA_FLOOR);
    await expect(agentFloorBlockFor(ME, 'someone-else')).resolves.toBeNull();
    await expect(agentFloorBlockFor(DARA, ME)).resolves.toBeNull();
    await expect(agentFloorBlockFor(ME, null)).resolves.toBeNull();
  });
});
