/**
 * Manager reach, driven over the TEN REAL PRODUCTION ROWS as of 12 November 2026.
 *
 * Synthetic cases are here too, for the branches production does not currently exercise. But
 * the real rows lead, deliberately: this module exists because a hand-written answer to this
 * same question was wrong on three of ten rows, and a synthetic fixture cannot catch that. The
 * production block below is the regression test for the actual mistake.
 */

import {
  assessManagerReach,
  REQUIRED_SECTION,
  AGENT_DETAIL_PATH,
  type ManagerAccessFacts,
} from '../agentManagerReach';

const facts = (over: Partial<ManagerAccessFacts> = {}): ManagerAccessFacts => ({
  domainKey: 'platform',
  orgMemberEmail: 'mgr@colaberry.com',
  agentsReporting: 1,
  bridge: { mgmtRole: 'curriculum', extraSections: [], tokenEmail: 'mgr@colaberry.com' },
  legacy: null,
  recordedCanReach: true,
  ...over,
});

describe('the section the Agent Detail surface sits behind', () => {
  it('is read from the gate rather than restated here', () => {
    // If someone re-files '/api/admin/agents' under another section, this module must follow
    // them. Pinning the value ALSO means that re-filing fails this test loudly instead of
    // silently changing who the audit thinks can reach the page.
    expect(REQUIRED_SECTION).toBe('dashboard');
    expect(AGENT_DETAIL_PATH.startsWith('/api/admin/agents/')).toBe(true);
  });
});

describe('production, 12 November 2026 — the rows that were recorded wrong', () => {
  /**
   * All three were recorded `manager_can_reach = false` with a blocker naming a missing
   * `admin_users` row. Each in fact holds a staff management role, which is the scoped login,
   * and each role carries 'dashboard'. The conclusion drawn from the stored flag — "four
   * managers are locked out, create admin_users rows" — would have widened near-full access
   * on three people who were never blocked.
   */
  // The extras are the real production values: Aleem and Roselyn each additionally hold
  // `{agents}`, Kes holds none. Faithful rather than simplified, because the point of this
  // block is to be the row as it actually is.
  it.each([
    ['platform', 'kes@colaberry.com', 'admin', 6, [] as string[]],
    ['product_experience', 'aleem@colaberry.com', 'product_experience', 1, ['agents']],
    ['sales', 'roselen@colaberry.com', 'revenue', 1, ['agents']],
  ])('%s: reaches it via the bridge, and the stored false is a disagreement', (domain, email, role, agents, extras) => {
    const v = assessManagerReach(facts({
      domainKey: domain,
      orgMemberEmail: email,
      agentsReporting: agents as number,
      bridge: { mgmtRole: role as string, extraSections: extras as string[], tokenEmail: email as string },
      legacy: null,
      recordedCanReach: false,
    }));
    expect(v.canReach).toBe(true);
    expect(v.via).toBe('bridge');
    expect(v.blocker).toBeNull();
    expect(v.disagreesWithRecord).toBe(true);
  });

  /**
   * Taiwo. The stored prose says "(a) he has no admin_users row" — he HAS one, role `admin`,
   * under taiwo@colaberry.com. The real refusal is that the 6 agents report to an org_members
   * row under taiwooludimimu@gmail.com, and the lookup is an exact match.
   */
  it('admissions: is blocked by an email mismatch, not by a missing login', () => {
    const v = assessManagerReach(facts({
      domainKey: 'admissions',
      orgMemberEmail: 'taiwooludimimu@gmail.com',
      agentsReporting: 6,
      bridge: null,
      legacy: { role: 'admin', tokenEmail: 'taiwo@colaberry.com' },
      recordedCanReach: false,
    }));
    expect(v.canReach).toBe(false);
    expect(v.blocker).toBe('org_member_email_mismatch');
    // The sentence must name both addresses, because the fix is choosing which one to move.
    expect(v.detail).toContain('taiwo@colaberry.com');
    expect(v.detail).toContain('taiwooludimimu@gmail.com');
    expect(v.disagreesWithRecord).toBe(false);
  });

  /**
   * The row that is right for the wrong reason. `support` holds only 'students', so the scoped
   * token is refused; a legacy admin_users row carries them instead. A boolean cannot say that,
   * which is the whole argument for `via`.
   */
  it('website: reaches it only via the LEGACY login, because support lacks the section', () => {
    const scopedOnly = assessManagerReach(facts({
      domainKey: 'website',
      orgMemberEmail: 'saitejesh@colaberry.com',
      bridge: { mgmtRole: 'support', extraSections: [], tokenEmail: 'saitejesh@colaberry.com' },
      legacy: null,
    }));
    expect(scopedOnly.canReach).toBe(false);
    expect(scopedOnly.blocker).toBe('section_not_held');

    const asInProduction = assessManagerReach(facts({
      domainKey: 'website',
      orgMemberEmail: 'saitejesh@colaberry.com',
      bridge: { mgmtRole: 'support', extraSections: [], tokenEmail: 'saitejesh@colaberry.com' },
      legacy: { role: 'admin', tokenEmail: 'saitejesh@colaberry.com' },
    }));
    expect(asInProduction.canReach).toBe(true);
    expect(asInProduction.via).toBe('legacy');
    expect(asInProduction.disagreesWithRecord).toBe(false);
  });

  it.each([
    ['curriculum', 'swati@colaberry.com', 'curriculum', 2],
    ['internship', 'dhee@colaberry.com', 'admin', 1],
    ['marketing', 'sohail@colaberry.com', 'marketing', 2],
    ['executive', 'ali@colaberry.com', 'owner', 12],
    ['learner_success', 'ali@colaberry.com', 'owner', 12],
  ])('%s: already worked and still does, with no disagreement', (domain, email, role, agents) => {
    const v = assessManagerReach(facts({
      domainKey: domain,
      orgMemberEmail: email,
      agentsReporting: agents as number,
      bridge: { mgmtRole: role as string, extraSections: [], tokenEmail: email as string },
      recordedCanReach: true,
    }));
    expect(v.canReach).toBe(true);
    expect(v.disagreesWithRecord).toBe(false);
  });
});

describe('the chain, one link at a time', () => {
  it('refuses someone with no login at all', () => {
    const v = assessManagerReach(facts({ bridge: null, legacy: null }));
    expect(v.canReach).toBe(false);
    expect(v.blocker).toBe('no_admin_login');
    expect(v.via).toBeNull();
  });

  it('refuses a scoped role that does not hold the section', () => {
    // 'support' is ['students'] — no dashboard.
    const v = assessManagerReach(facts({ bridge: { mgmtRole: 'support', extraSections: [], tokenEmail: 'mgr@colaberry.com' } }));
    expect(v.blocker).toBe('section_not_held');
  });

  it('lets an EXTRA section grant the surface, since effectiveSections is what the gate reads', () => {
    // C82: a person may hold sections on top of their role. The gate reads role + extras, so
    // this module must too, or it would report a working manager as blocked.
    const v = assessManagerReach(facts({
      bridge: { mgmtRole: 'support', extraSections: ['dashboard'], tokenEmail: 'mgr@colaberry.com' },
    }));
    expect(v.canReach).toBe(true);
    expect(v.via).toBe('bridge');
  });

  it('ignores an extra section that is not a real section key', () => {
    const v = assessManagerReach(facts({
      bridge: { mgmtRole: 'support', extraSections: ['not_a_section'], tokenEmail: 'mgr@colaberry.com' },
    }));
    expect(v.canReach).toBe(false);
    expect(v.blocker).toBe('section_not_held');
  });

  it('refuses an unknown management role rather than treating it as unscoped', () => {
    // sectionsForRole denies by default, and that default must survive into this verdict.
    const v = assessManagerReach(facts({
      bridge: { mgmtRole: 'agent_manager', extraSections: [], tokenEmail: 'mgr@colaberry.com' },
    }));
    expect(v.canReach).toBe(false);
    expect(v.blocker).toBe('section_not_held');
  });

  it('refuses when no org_members row exists for the manager', () => {
    const v = assessManagerReach(facts({ orgMemberEmail: null }));
    expect(v.blocker).toBe('org_member_missing');
  });

  it('treats a CASE difference as a mismatch, because the lookup is exact', () => {
    // Postgres `=` on text is case-sensitive, so this really does refuse. A report that
    // normalized case here would declare a blocked manager fine.
    const v = assessManagerReach(facts({
      orgMemberEmail: 'Mgr@colaberry.com',
      bridge: { mgmtRole: 'curriculum', extraSections: [], tokenEmail: 'mgr@colaberry.com' },
    }));
    expect(v.canReach).toBe(false);
    expect(v.blocker).toBe('org_member_email_mismatch');
  });

  it('refuses when nothing reports to them', () => {
    const v = assessManagerReach(facts({ agentsReporting: 0 }));
    expect(v.blocker).toBe('no_agent_reports_to_them');
  });

  it('lets super_admin through with nothing reporting to them, because it bypasses the chain', () => {
    const v = assessManagerReach(facts({
      agentsReporting: 0,
      bridge: null,
      legacy: { role: 'super_admin', tokenEmail: 'mgr@colaberry.com' },
    }));
    expect(v.canReach).toBe(true);
    expect(v.via).toBe('legacy');
  });

  it('does NOT let a legacy sales role bypass the chain', () => {
    const v = assessManagerReach(facts({
      agentsReporting: 0,
      bridge: null,
      legacy: { role: 'sales', tokenEmail: 'mgr@colaberry.com' },
    }));
    expect(v.canReach).toBe(false);
    expect(v.blocker).toBe('no_agent_reports_to_them');
  });

  it('does not let a legacy login be refused on sections, because its token is never gated', () => {
    // A legacy admin_users token carries no mgmt_role, so mgmtSectionGate returns next() on its
    // first branch. Gating it here would under-report who can reach the page.
    const v = assessManagerReach(facts({
      bridge: null,
      legacy: { role: 'sales', tokenEmail: 'mgr@colaberry.com' },
    }));
    expect(v.canReach).toBe(true);
    expect(v.via).toBe('legacy');
  });
});

describe('which blocker gets reported when both logins fail', () => {
  it('names the BRIDGE obstacle, because the narrow login is the one worth fixing', () => {
    const v = assessManagerReach(facts({
      orgMemberEmail: 'mgr@colaberry.com',
      bridge: { mgmtRole: 'support', extraSections: [], tokenEmail: 'mgr@colaberry.com' },
      legacy: { role: 'admin', tokenEmail: 'someone-else@colaberry.com' },
    }));
    expect(v.canReach).toBe(false);
    expect(v.blocker).toBe('section_not_held');
  });

  it('still passes on the legacy login when the bridge one fails', () => {
    const v = assessManagerReach(facts({
      bridge: { mgmtRole: 'support', extraSections: [], tokenEmail: 'mgr@colaberry.com' },
      legacy: { role: 'admin', tokenEmail: 'mgr@colaberry.com' },
    }));
    expect(v.canReach).toBe(true);
    expect(v.via).toBe('legacy');
  });
});
