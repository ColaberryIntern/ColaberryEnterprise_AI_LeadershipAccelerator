/**
 * C96: the daily points smoke test signs up a real Explorer in production. It must never become an Explorer Growth
 * profile (which is how it reaches scoring, the Governor, drafts and every count), and must never be contactable.
 */
const enrollmentFindByPk = jest.fn();
const enrollmentFindAll = jest.fn();
const leadFindOne = jest.fn();
const leadFindByPk = jest.fn();
const profileFindByPk = jest.fn();
const profileCreate = jest.fn();
const evalConsent = jest.fn();

jest.mock('../../../models', () => ({
  Enrollment: {
    findByPk: (...a: unknown[]) => enrollmentFindByPk(...a),
    findAll: (...a: unknown[]) => enrollmentFindAll(...a),
  },
  Lead: {
    findOne: (...a: unknown[]) => leadFindOne(...a),
    findByPk: (...a: unknown[]) => leadFindByPk(...a),
    sequelize: { where: (...a: unknown[]) => a, fn: (...a: unknown[]) => a, col: (...a: unknown[]) => a },
  },
  CommunityMember: {},
  ExplorerJourneyProfile: {
    findByPk: (...a: unknown[]) => profileFindByPk(...a),
    create: (...a: unknown[]) => profileCreate(...a),
  },
}));
jest.mock('../../consentService', () => ({ evaluateConsent: (...a: unknown[]) => evalConsent(...a) }));

import { resolveExplorerLead, repairAllExplorerBridges } from '../explorerIdentityBridge';
import { resolveContactability } from '../explorerContactabilityService';

const SMOKE = 'e2e-points-1792589402578@colaberry-test.local';

beforeEach(() => {
  [enrollmentFindByPk, enrollmentFindAll, leadFindOne, leadFindByPk, profileFindByPk, profileCreate, evalConsent]
    .forEach((m) => m.mockReset());
  profileFindByPk.mockResolvedValue(null);
  profileCreate.mockResolvedValue({});
  leadFindOne.mockResolvedValue({ id: 7 });
  leadFindByPk.mockResolvedValue({ status: 'new' });
  evalConsent.mockResolvedValue({ verdict: 'allow', reason: 'ok' });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('the identity bridge never gives a fixture a profile', () => {
  it('a smoke-test Explorer: no lead lookup, no profile, flagged synthetic', async () => {
    enrollmentFindByPk.mockResolvedValue({ id: 'e1', email: SMOKE });
    const r = await resolveExplorerLead('e1');
    expect(r).toEqual({ enrollment_id: 'e1', lead_id: null, email_normalized: SMOKE, resolved: false, synthetic: true });
    expect(profileCreate).not.toHaveBeenCalled();
    expect(profileFindByPk).not.toHaveBeenCalled();
    expect(leadFindOne).not.toHaveBeenCalled();
  });

  it('a real Explorer is unchanged: profile written, linked, not flagged', async () => {
    enrollmentFindByPk.mockResolvedValue({ id: 'e2', email: 'Maria@Example.com' });
    const r = await resolveExplorerLead('e2');
    expect(r).toEqual({ enrollment_id: 'e2', lead_id: 7, email_normalized: 'maria@example.com', resolved: true });
    expect(profileCreate).toHaveBeenCalledTimes(1);
  });

  it('the nightly repair counts fixtures as skipped, not as broken links', async () => {
    enrollmentFindAll.mockResolvedValue([
      { id: 'real', email: 'maria@example.com' },
      { id: 'smoke1', email: SMOKE },
      { id: 'smoke2', email: 'e2e-points-2@colaberry-test.local' },
    ]);
    enrollmentFindByPk.mockImplementation(async (id: string) =>
      ({ real: { id, email: 'maria@example.com' }, smoke1: { id, email: SMOKE }, smoke2: { id, email: 'e2e-points-2@colaberry-test.local' } } as any)[id]);
    const report = await repairAllExplorerBridges();
    expect(report).toMatchObject({ scanned: 3, resolved: 1, syntheticSkipped: 2, unresolved: 0, unresolvedEnrollmentIds: [] });
    expect(profileCreate).toHaveBeenCalledTimes(1);
  });
});

describe('a fixture is never contactable', () => {
  it('email, sms and voice are suppressed with a reason, before any lead or consent read', async () => {
    const c = await resolveContactability({ enrollmentId: 'e1', leadId: 7, email: SMOKE });
    for (const ch of ['email', 'sms', 'voice'] as const) {
      expect(c[ch]).toEqual({ eligible: false, reason: 'synthetic_test_account' });
    }
    expect(leadFindByPk).not.toHaveBeenCalled();
    expect(evalConsent).not.toHaveBeenCalled();
  });

  it('holds even with no lead link', async () => {
    const c = await resolveContactability({ enrollmentId: 'e1', leadId: null, email: SMOKE });
    expect(c.email).toEqual({ eligible: false, reason: 'synthetic_test_account' });
  });

  it('a real person with no email on file is not mistaken for a fixture', async () => {
    const c = await resolveContactability({ enrollmentId: 'e2', leadId: 7, email: null });
    expect(c.email).toEqual({ eligible: true });
  });
});
