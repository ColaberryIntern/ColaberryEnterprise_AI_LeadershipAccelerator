import {
  sectionForPath,
  firstAccessiblePath,
  UNIVERSAL_ADMIN_PATHS,
  NAV_GROUPS,
  ALL_LINKS,
} from '../components/Layout/adminNav';
import { roleFromAdminToken } from '../utils/adminToken';

/** A canSection predicate for an identity holding exactly these sections. */
const holding = (...sections: string[]) => (s: string) => sections.includes(s);

/** Mirrors the backend's adminAllowedSections for a plain sales login. */
const SALES = holding('leads');
const FULL_ADMIN = () => true;

function tokenWith(payload: object): string {
  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

describe('sectionForPath', () => {
  it('resolves a nav path to its group section', () => {
    expect(sectionForPath('/admin/revenue')).toBe('revenue');
    expect(sectionForPath('/admin/campaigns')).toBe('campaigns');
    expect(sectionForPath('/admin/ingest-logs')).toBe('lead_ingestion');
    expect(sectionForPath('/admin/settings')).toBe('system');
  });

  it('honours a per-link section override', () => {
    // Leads and Pipeline live in the Revenue group but carry 'leads'.
    expect(sectionForPath('/admin/leads')).toBe('leads');
    expect(sectionForPath('/admin/pipeline')).toBe('leads');
    expect(sectionForPath('/admin/opportunities')).toBe('revenue');
  });

  it('resolves a detail route to its parent section', () => {
    expect(sectionForPath('/admin/leads/42')).toBe('leads');
    expect(sectionForPath('/admin/campaigns/7')).toBe('campaigns');
  });

  it('does not let a prefix leak into a sibling route', () => {
    expect(sectionForPath('/admin/leadsomething')).toBeNull();
  });

  it('returns null for a path with no nav entry', () => {
    expect(sectionForPath('/admin/change-password')).toBeNull();
    expect(sectionForPath('/admin/nonexistent')).toBeNull();
  });
});

describe('nav visibility for a sales rep', () => {
  // Reproduces AdminLayout's filter so the IA and the gate cannot drift apart.
  const visibleGroups = (canSection: (s: string) => boolean) =>
    NAV_GROUPS
      .map((g) => ({ ...g, links: g.links.filter((l) => canSection(l.section ?? g.section)) }))
      .filter((g) => g.links.length > 0);

  it('shows exactly Leads and Pipeline, under the Revenue group', () => {
    const groups = visibleGroups(SALES);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Revenue');
    expect(groups[0].links.map((l) => l.path)).toEqual(['/admin/leads', '/admin/pipeline']);
  });

  it('hides every other group', () => {
    const labels = visibleGroups(SALES).map((g) => g.label);
    for (const hidden of ['Campaigns', 'Lead Ingestion', 'Inbox & Content', 'Program', 'Intelligence', 'System']) {
      expect(labels).not.toContain(hidden);
    }
  });

  it('leaves a full admin seeing every group and every link', () => {
    const groups = visibleGroups(FULL_ADMIN);
    expect(groups).toHaveLength(NAV_GROUPS.length);
    const linkCount = groups.reduce((n, g) => n + g.links.length, 0);
    expect(linkCount).toBe(NAV_GROUPS.reduce((n, g) => n + g.links.length, 0));
  });

  it('keeps Leads and Pipeline visible to a Revenue-scoped staff role', () => {
    // The mgmt 'revenue' role holds both sections, so moving those two links to
    // 'leads' must not have taken them away.
    const groups = visibleGroups(holding('dashboard', 'revenue', 'leads'));
    const revenue = groups.find((g) => g.label === 'Revenue');
    expect(revenue?.links.map((l) => l.path)).toContain('/admin/leads');
    expect(revenue?.links.map((l) => l.path)).toContain('/admin/pipeline');
  });
});

describe('firstAccessiblePath', () => {
  it('sends a sales rep to the lead queue', () => {
    expect(firstAccessiblePath(SALES)).toBe('/admin/leads');
  });

  it('sends a full admin to the dashboard', () => {
    expect(firstAccessiblePath(FULL_ADMIN)).toBe('/admin/dashboard');
  });

  it('falls back to a universally reachable page when nothing is accessible', () => {
    expect(firstAccessiblePath(() => false)).toBe(UNIVERSAL_ADMIN_PATHS[0]);
  });

  // The redirect-loop guard: ProtectedRoute bounces out-of-scope requests here,
  // so the destination must itself be in scope.
  it('always returns somewhere the same identity may actually go', () => {
    for (const canSection of [SALES, FULL_ADMIN, holding('dashboard', 'program')]) {
      const path = firstAccessiblePath(canSection);
      const section = sectionForPath(path);
      const reachable = section ? canSection(section) : UNIVERSAL_ADMIN_PATHS.includes(path);
      expect(reachable).toBe(true);
    }
  });
});

describe('ALL_LINKS', () => {
  it('gives every link a resolved section so nothing escapes the filter', () => {
    for (const link of ALL_LINKS) {
      expect(typeof link.section).toBe('string');
      expect(link.section).not.toBe('');
    }
  });
});

describe('roleFromAdminToken', () => {
  it('reads the role claim, padding included', () => {
    expect(roleFromAdminToken(tokenWith({ role: 'sales' }))).toBe('sales');
    expect(
      roleFromAdminToken(
        tokenWith({
          sub: '9f2a1c44-0e7b-4c3d-9a11-5b6c7d8e9f00',
          email: 'ntaylor@colaberry.com',
          role: 'sales',
          iat: 1786000000,
        })
      )
    ).toBe('sales');
  });

  it('returns null for anything it cannot read', () => {
    expect(roleFromAdminToken(null)).toBeNull();
    expect(roleFromAdminToken('')).toBeNull();
    expect(roleFromAdminToken('not-a-jwt')).toBeNull();
    expect(roleFromAdminToken('only.two')).toBeNull();
    expect(roleFromAdminToken('aaa.!!!not-base64!!!.sig')).toBeNull();
    expect(roleFromAdminToken(tokenWith({ email: 'x@y.com' }))).toBeNull();
  });
});
