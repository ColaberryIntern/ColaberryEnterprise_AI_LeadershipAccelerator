import {
  setOrganizationStatus,
  addCohortToOrganization,
  removeCohortFromOrganization,
  getOrganizationDetail,
} from '../adminOrgService';
import { Organization, OrgMember, OrgCohort, Cohort, Lead } from '../../models';

jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn(), constructor: { QueryTypes: { SELECT: 'SELECT' } } },
}));

jest.mock('../../models', () => ({
  Organization: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
  OrgMember: { findAll: jest.fn() },
  OrgCohort: { findAll: jest.fn(), findOrCreate: jest.fn(), destroy: jest.fn() },
  Cohort: { findByPk: jest.fn() },
  Enrollment: {},
  Lead: { findByPk: jest.fn(), findOne: jest.fn() },
}));

const mockOrg = (over: Record<string, unknown> = {}) => ({
  id: 'org-1',
  name: 'Acme',
  status: 'active',
  auto_staff_sync: false,
  created_at: new Date('2026-01-01'),
  status_changed_at: null,
  status_changed_by: null,
  lead_id: null,
  owner: { id: 'enr-1', email: 'owner@acme.test', full_name: 'Dana Reyes' },
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('setOrganizationStatus — enable/disable is idempotent', () => {
  it('suspends an active account and stamps who did it', async () => {
    const org = mockOrg();
    (Organization.findByPk as jest.Mock).mockResolvedValue(org);

    const result = await setOrganizationStatus('org-1', 'suspended', 'ali@colaberry.com');

    expect(result).toEqual({ id: 'org-1', status: 'suspended', changed: true });
    expect(org.update).toHaveBeenCalledTimes(1);
    const patch = org.update.mock.calls[0][0];
    expect(patch.status).toBe('suspended');
    expect(patch.status_changed_by).toBe('ali@colaberry.com');
    expect(patch.status_changed_at).toBeInstanceOf(Date);
  });

  it('re-sending the SAME status writes nothing — a double-clicked toggle is a no-op', () => {
    // This is the idempotency rule: same input, same end state, no second side
    // effect. Without it a double-click would overwrite the audit stamp with a
    // later timestamp and lose when the change actually happened.
    const org = mockOrg({ status: 'active' });
    (Organization.findByPk as jest.Mock).mockResolvedValue(org);

    return setOrganizationStatus('org-1', 'active', 'ali@colaberry.com').then((result) => {
      expect(result).toEqual({ id: 'org-1', status: 'active', changed: false });
      expect(org.update).not.toHaveBeenCalled();
    });
  });

  it('treats a legacy row with no status as active', async () => {
    // Rows created before the status column existed read back as undefined and
    // must not be considered suspended.
    const org = mockOrg({ status: undefined });
    (Organization.findByPk as jest.Mock).mockResolvedValue(org);

    const result = await setOrganizationStatus('org-1', 'active', 'ali@colaberry.com');
    expect(result).toEqual({ id: 'org-1', status: 'active', changed: false });
    expect(org.update).not.toHaveBeenCalled();
  });

  it('returns null for an unknown account rather than creating one', async () => {
    (Organization.findByPk as jest.Mock).mockResolvedValue(null);
    expect(await setOrganizationStatus('nope', 'suspended', 'a@b.c')).toBeNull();
  });
});

describe('addCohortToOrganization — linking is idempotent and validated', () => {
  it('creates the link and reports created:true', async () => {
    (Organization.findByPk as jest.Mock).mockResolvedValue(mockOrg());
    (Cohort.findByPk as jest.Mock).mockResolvedValue({ id: 'coh-1' });
    (OrgCohort.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'link-1' }, true]);

    expect(await addCohortToOrganization('org-1', 'coh-1', 25, 'ali@colaberry.com')).toEqual({
      link_id: 'link-1',
      created: true,
    });
  });

  it('re-linking the same cohort is a no-op, not a duplicate', async () => {
    (Organization.findByPk as jest.Mock).mockResolvedValue(mockOrg());
    (Cohort.findByPk as jest.Mock).mockResolvedValue({ id: 'coh-1' });
    (OrgCohort.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'link-1' }, false]);

    expect(await addCohortToOrganization('org-1', 'coh-1', null, 'ali@colaberry.com')).toEqual({
      link_id: 'link-1',
      created: false,
    });
  });

  it('refuses a cohort that does not exist rather than writing a dangling link', async () => {
    (Organization.findByPk as jest.Mock).mockResolvedValue(mockOrg());
    (Cohort.findByPk as jest.Mock).mockResolvedValue(null);

    expect(await addCohortToOrganization('org-1', 'ghost', null, 'a@b.c')).toEqual({
      error: 'cohort_not_found',
    });
    expect(OrgCohort.findOrCreate).not.toHaveBeenCalled();
  });

  it('refuses an organization that does not exist', async () => {
    (Organization.findByPk as jest.Mock).mockResolvedValue(null);
    (Cohort.findByPk as jest.Mock).mockResolvedValue({ id: 'coh-1' });

    expect(await addCohortToOrganization('ghost', 'coh-1', null, 'a@b.c')).toEqual({
      error: 'org_not_found',
    });
    expect(OrgCohort.findOrCreate).not.toHaveBeenCalled();
  });
});

describe('removeCohortFromOrganization', () => {
  it('reports false when nothing was linked, so the route can 404', async () => {
    (OrgCohort.destroy as jest.Mock).mockResolvedValue(0);
    expect(await removeCohortFromOrganization('org-1', 'coh-1')).toBe(false);
  });

  it('reports true when a link was removed', async () => {
    (OrgCohort.destroy as jest.Mock).mockResolvedValue(1);
    expect(await removeCohortFromOrganization('org-1', 'coh-1')).toBe(true);
  });
});

describe('getOrganizationDetail', () => {
  const wire = (members: unknown[], links: unknown[]) => {
    (Organization.findByPk as jest.Mock).mockResolvedValue(mockOrg());
    (OrgMember.findAll as jest.Mock).mockResolvedValue(members);
    (OrgCohort.findAll as jest.Mock).mockResolvedValue(links);
    (Lead.findOne as jest.Mock).mockResolvedValue(null);
  };

  it('returns null for an unknown account', async () => {
    (Organization.findByPk as jest.Mock).mockResolvedValue(null);
    expect(await getOrganizationDetail('nope')).toBeNull();
  });

  it('counts placed members per cohort from the enrollment, not the link', async () => {
    // seats_sponsored is what the company committed to; members_placed is who is
    // actually in the cohort. Linking a cohort moves nobody, so these differ and
    // the difference is the unfilled seats -- collapsing them would hide that.
    wire(
      [
        { id: 'm1', email: 'a@x.test', role: 'manager', team: null, invite_status: 'active', joined_at: null, enrollment: { id: 'e1', cohort_id: 'coh-1' } },
        { id: 'm2', email: 'b@x.test', role: 'member', team: null, invite_status: 'active', joined_at: null, enrollment: { id: 'e2', cohort_id: 'coh-1' } },
        { id: 'm3', email: 'c@x.test', role: 'member', team: null, invite_status: 'invited', joined_at: null, enrollment: null },
      ],
      [
        { id: 'link-1', cohort_id: 'coh-1', seats_sponsored: 10, cohort: { id: 'coh-1', name: 'July 2026', start_date: null, status: 'open' } },
      ],
    );

    const detail = await getOrganizationDetail('org-1');
    expect(detail?.cohorts[0].members_placed).toBe(2);
    expect(detail?.cohorts[0].seats_sponsored).toBe(10);
    expect(detail?.stats).toMatchObject({
      member_count: 3,
      active_member_count: 2,
      invited_member_count: 1,
      manager_count: 1,
      members_with_cohort: 2,
      members_without_cohort: 1,
    });
  });

  it('survives a cohort row that was deleted out from under the link', async () => {
    // ON DELETE CASCADE should prevent this, but a null include must not throw.
    wire([], [{ id: 'link-1', cohort_id: 'gone', seats_sponsored: null, cohort: null }]);
    const detail = await getOrganizationDetail('org-1');
    expect(detail?.cohorts[0].name).toBe('(cohort removed)');
  });

  it('falls back to matching the owner email when no lead is linked', async () => {
    // Registration historically wrote the org and the lead through two
    // independent calls with nothing joining them but the address.
    wire([], []);
    (Lead.findOne as jest.Mock).mockResolvedValue({
      id: 24491, email: 'owner@acme.test', company: 'Acme', status: 'new', source: 'website',
    });

    const detail = await getOrganizationDetail('org-1');
    expect(Lead.findByPk).not.toHaveBeenCalled();
    expect(Lead.findOne).toHaveBeenCalledWith({ where: { email: 'owner@acme.test' } });
    expect(detail?.lead?.id).toBe(24491);
  });

  it('prefers the explicit lead_id link over the email fallback', async () => {
    (Organization.findByPk as jest.Mock).mockResolvedValue(mockOrg({ lead_id: 999 }));
    (OrgMember.findAll as jest.Mock).mockResolvedValue([]);
    (OrgCohort.findAll as jest.Mock).mockResolvedValue([]);
    (Lead.findByPk as jest.Mock).mockResolvedValue({
      id: 999, email: 'other@acme.test', company: 'Acme', status: 'new', source: 'website',
    });

    const detail = await getOrganizationDetail('org-1');
    expect(detail?.lead?.id).toBe(999);
    expect(Lead.findOne).not.toHaveBeenCalled();
  });
});
