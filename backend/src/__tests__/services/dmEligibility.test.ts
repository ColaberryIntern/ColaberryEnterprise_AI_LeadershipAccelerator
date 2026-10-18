/**
 * The one DM rule (dmEligibility.ts), as the campus asks it. dmService.test.ts proves POST /dm/open still behaves
 * exactly as before; this proves the pure rule and the batch form agree with it.
 */
jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn(), findAll: jest.fn() }));
jest.mock('../../services/access/staffAccess', () => ({ isStaffOrMgmt: jest.fn() }));
jest.mock('../../services/reese/reeseIdentitySeed', () => ({ getReeseEnrollmentId: jest.fn() }));
jest.mock('../../services/curriculum/daraIdentitySeed', () => ({ getDaraEnrollmentId: jest.fn() }));

import Enrollment from '../../models/Enrollment';
import { isStaffOrMgmt } from '../../services/access/staffAccess';
import { getReeseEnrollmentId } from '../../services/reese/reeseIdentitySeed';
import { getDaraEnrollmentId } from '../../services/curriculum/daraIdentitySeed';
import {
  dmBlockReason, dmBlockReasonFor, canDmMany, loadDmContext,
  DM_NOT_AVAILABLE, DM_COHORT_ONLY, DM_NO_COHORT, DmContext,
} from '../../services/communityRooms/dmEligibility';

const ME = 'me-1', REESE = 'reese-1', DARA = 'dara-1';
const ctx = (over: Partial<DmContext> = {}): DmContext => ({ meIsStaffOrMgmt: false, reeseId: REESE, daraId: DARA, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  (isStaffOrMgmt as jest.Mock).mockResolvedValue(false);
  (getReeseEnrollmentId as jest.Mock).mockResolvedValue(REESE);
  (getDaraEnrollmentId as jest.Mock).mockResolvedValue(DARA);
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
    await expect(loadDmContext(ME)).resolves.toEqual({ meIsStaffOrMgmt: false, reeseId: null, daraId: null });
    expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toEqual(['reese_enrollment_lookup_failed', 'dara_enrollment_lookup_failed']);
    warn.mockRestore();
  });
});

describe('dmBlockReasonFor (what POST /dm/open asks)', () => {
  it('same cohort is decided without touching the staff or agent lookups', async () => {
    (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'o', cohort_id: 'c1' });
    await expect(dmBlockReasonFor(ME, 'o', 'c1')).resolves.toBeNull();
    expect(isStaffOrMgmt).not.toHaveBeenCalled();
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
