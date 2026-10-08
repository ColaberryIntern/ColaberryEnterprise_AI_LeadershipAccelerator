// The models barrel and subscriptionService both reach for a database at import time.
// Stubbed for the same reason the entitlement suite stubs them: without this, importing the
// module under test pulls in the model layer and the suite goes from seconds to minutes.
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/Cohort', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../access/staffAccess', () => ({ isStaffEnrollment: jest.fn() }));
jest.mock('../../subscriptionService', () => ({ activeCompEnrollmentIds: jest.fn() }));

import Enrollment from '../../../models/Enrollment';
import Cohort from '../../../models/Cohort';
import { isStaffEnrollment } from '../../access/staffAccess';
import { activeCompEnrollmentIds } from '../../subscriptionService';
import { broadcastAccessDeps, loadViewerAccessFacts } from '../broadcastAccessDeps';
import type { ResolveDeps } from '../broadcastEntitlement';

/**
 * The loaders behind the entitlement decision.
 *
 * WHY THIS SUITE EXISTS, which is the uncomfortable part. `broadcastController.test.ts` mocks
 * `loadViewerAccessFacts` wholesale, so it only ever asserted that the controller forwards a
 * mock's return value. An independent check proved the consequence by mutation: reinstating
 * the original `null, null, null` defect INSIDE this loader left all 19 backend broadcast
 * suites green — 337 passing tests, and the bug that treated every paying student as unpaid
 * was back with nothing to show it.
 *
 * So these tests are about the shape of what the loader returns, and about the one property a
 * mocked loader can never demonstrate: that it actually loads something.
 */

const findEnrollment = (Enrollment as unknown as { findByPk: jest.Mock }).findByPk;
const findCohort = (Cohort as unknown as { findByPk: jest.Mock }).findByPk;
const staff = isStaffEnrollment as jest.Mock;
const comps = activeCompEnrollmentIds as jest.Mock;

const ENROLLMENT = {
  id: 'enr-1', payment_status: 'paid', cohort_id: 'coh-7', access_starts_at: new Date(0),
};
const COHORT = { id: 'coh-7', cohort_type: 'standard' };

beforeEach(() => {
  jest.clearAllMocks();
  findEnrollment.mockResolvedValue(ENROLLMENT);
  findCohort.mockResolvedValue(COHORT);
  staff.mockResolvedValue(false);
  comps.mockResolvedValue(new Set<string>());
});

describe('it actually loads the facts, rather than returning nulls', () => {
  it('returns the enrollment, the cohort and the role info', async () => {
    const facts = await loadViewerAccessFacts('enr-1');

    // The exact assertion the controller suite cannot make, because it mocks this away.
    expect(facts.enrollment).toBe(ENROLLMENT);
    expect(facts.cohort).toBe(COHORT);
    expect(facts.roleInfo).toEqual({ isStaff: false, hasActiveComp: false });
    expect(facts.enrollment).not.toBeNull();
    expect(facts.cohort).not.toBeNull();
    expect(facts.roleInfo).not.toBeNull();
  });

  it('reads the cohort id OFF the enrollment, not from the caller', async () => {
    await loadViewerAccessFacts('enr-1');
    expect(findCohort).toHaveBeenCalledWith('coh-7', { attributes: ['id', 'cohort_type'] });
  });

  it('selects the four columns hasFullCurriculumAccess reads, and no more', async () => {
    // Mirrors contentEntitlement.resolveContentPageAccess attribute for attribute, so the two
    // surfaces cannot disagree about what "has paid" means.
    await loadViewerAccessFacts('enr-1');
    expect(findEnrollment).toHaveBeenCalledWith('enr-1', {
      attributes: ['id', 'payment_status', 'cohort_id', 'access_starts_at'],
    });
  });

  it('does not query a cohort when the enrollment has none', async () => {
    findEnrollment.mockResolvedValue({ ...ENROLLMENT, cohort_id: null });
    const facts = await loadViewerAccessFacts('enr-1');
    expect(findCohort).not.toHaveBeenCalled();
    expect(facts.cohort).toBeNull();
  });

  it('reports an active comp for this enrollment', async () => {
    comps.mockResolvedValue(new Set(['enr-1']));
    const facts = await loadViewerAccessFacts('enr-1');
    expect(facts.roleInfo).toEqual({ isStaff: false, hasActiveComp: true });
  });

  it('does not credit a comp belonging to someone else', async () => {
    comps.mockResolvedValue(new Set(['enr-OTHER']));
    const facts = await loadViewerAccessFacts('enr-1');
    expect(facts.roleInfo).toMatchObject({ hasActiveComp: false });
  });

  it('reports staff', async () => {
    staff.mockResolvedValue(true);
    const facts = await loadViewerAccessFacts('enr-1');
    expect(facts.roleInfo).toMatchObject({ isStaff: true });
  });
});

describe('a missing enrollment is reported as missing, not papered over', () => {
  it('returns null and asks for no cohort', async () => {
    findEnrollment.mockResolvedValue(null);
    const facts = await loadViewerAccessFacts('enr-gone');

    expect(facts.enrollment).toBeNull();
    expect(facts.cohort).toBeNull();
    // decideBroadcastAccess then treats the viewer as unentitled, which is the correct answer
    // for someone with no enrollment row — unlike the old defect, which gave that answer to
    // everybody.
    expect(findCohort).not.toHaveBeenCalled();
  });
});

describe('a rejection propagates, so the fail-closed wrapper can deny', () => {
  // resolveBroadcastAccess catches and returns { grant: 'denied' }. That only works if the
  // loader lets the rejection out instead of swallowing it into a null — which would be
  // indistinguishable from "this viewer has not paid" and would fail OPEN for a free event.
  it('lets an enrollment read rejection out', async () => {
    findEnrollment.mockRejectedValue(new Error('connection reset'));
    await expect(loadViewerAccessFacts('enr-1')).rejects.toThrow('connection reset');
  });

  it('lets a comp lookup rejection out', async () => {
    comps.mockRejectedValue(new Error('timeout'));
    await expect(loadViewerAccessFacts('enr-1')).rejects.toThrow('timeout');
  });
});

describe('the deps object satisfies the contract resolveBroadcastAccess expects', () => {
  it('provides all four members', () => {
    const required: Array<keyof ResolveDeps> = ['loadEnrollment', 'loadCohort', 'loadRoleInfo', 'cohortIdOf'];
    for (const key of required) {
      expect(typeof broadcastAccessDeps[key]).toBe('function');
    }
  });

  it('cohortIdOf survives a null enrollment rather than throwing', async () => {
    expect(broadcastAccessDeps.cohortIdOf(null)).toBeNull();
    expect(broadcastAccessDeps.cohortIdOf(undefined)).toBeNull();
    expect(broadcastAccessDeps.cohortIdOf({})).toBeNull();
    expect(broadcastAccessDeps.cohortIdOf({ cohort_id: 'coh-7' })).toBe('coh-7');
  });

  it('loadCohort short-circuits a null id without a query', async () => {
    await broadcastAccessDeps.loadCohort(null);
    expect(findCohort).not.toHaveBeenCalled();
  });
});
