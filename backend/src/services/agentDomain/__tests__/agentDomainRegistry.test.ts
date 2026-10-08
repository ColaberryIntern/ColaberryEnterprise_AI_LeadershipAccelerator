import {
  AGENT_DOMAINS,
  AGENT_DOMAIN_KEYS,
  AGENT_DOMAIN_ENTRY_POINT,
  AGENT_DOMAIN_ORG_ID,
  FORBIDDEN_AUTHORITY_FIELDS,
  blockedDomains,
  getAgentDomain,
  isAssignablePlanningState,
  type AgentDomain,
} from '../agentDomainRegistry';

/** A fixture shaped like a domain, for the controls. Cast so a deliberately-bad shape compiles. */
const fixture = (over: Record<string, unknown>): AgentDomain => ({
  ...AGENT_DOMAINS[0],
  ...over,
} as AgentDomain);

describe('the registry holds exactly ten domains', () => {
  it('has ten entries and ten keys', () => {
    expect(AGENT_DOMAINS).toHaveLength(10);
    expect(AGENT_DOMAIN_KEYS).toHaveLength(10);
  });

  it('key sets agree in BOTH directions, so neither list can drift', () => {
    const fromEntries = [...AGENT_DOMAINS.map((d) => d.domain_key)].sort();
    const fromKeys = [...AGENT_DOMAIN_KEYS].sort();
    expect(fromEntries).toEqual(fromKeys);
  });

  it('POSITIVE CONTROL: an eleventh key breaks set-equality', () => {
    const withExtra = [...AGENT_DOMAIN_KEYS, 'eleventh'].sort();
    expect([...AGENT_DOMAINS.map((d) => d.domain_key)].sort()).not.toEqual(withExtra);
  });

  it('domain keys are unique and seq runs 1..10 with no gap', () => {
    expect(new Set(AGENT_DOMAINS.map((d) => d.domain_key)).size).toBe(10);
    expect(AGENT_DOMAINS.map((d) => d.seq).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('getAgentDomain resolves a real key and refuses an invented one', () => {
    expect(getAgentDomain('marketing')?.title).toContain('Marketing');
    expect(getAgentDomain('not_a_domain')).toBeUndefined();
  });
});

describe('the registry grants nothing and assigns nobody', () => {
  it('no entry carries a field that could be read as authority or assignment', () => {
    for (const d of AGENT_DOMAINS) {
      for (const forbidden of FORBIDDEN_AUTHORITY_FIELDS) {
        expect(Object.prototype.hasOwnProperty.call(d, forbidden)).toBe(false);
      }
    }
  });

  it('POSITIVE CONTROL: the sweep catches a planted builder field', () => {
    const planted = fixture({ builder: 'someone' });
    const hits = FORBIDDEN_AUTHORITY_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(planted, f));
    expect(hits).toContain('builder');
  });

  it('intended_builder is a plain name or null, never an id', () => {
    for (const d of AGENT_DOMAINS) {
      if (d.intended_builder !== null) {
        expect(typeof d.intended_builder).toBe('string');
        // a uuid here would mean the plan had become a foreign key into enrollments
        expect(d.intended_builder).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
      }
    }
  });

  it('requested capabilities are requested, never granted — no entry exports a granted list', () => {
    for (const d of AGENT_DOMAINS) {
      expect(Array.isArray(d.requested_capabilities)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(d, 'granted_capabilities')).toBe(false);
    }
  });
});

describe('intended builder states are honest about outstanding human steps', () => {
  it('every state is one of the three permitted values', () => {
    for (const d of AGENT_DOMAINS) {
      expect(['verified_active', 'onboarding_pending', 'unassigned']).toContain(d.intended_builder_state);
    }
  });

  it('an unassigned domain names no builder, and a named builder is never unassigned', () => {
    for (const d of AGENT_DOMAINS) {
      if (d.intended_builder_state === 'unassigned') expect(d.intended_builder).toBeNull();
      else expect(d.intended_builder).not.toBeNull();
    }
  });

  it('Ruth Kumera is onboarding_pending, and onboarding_pending is NEVER assignable', () => {
    const curriculum = getAgentDomain('curriculum')!;
    expect(curriculum.intended_builder).toBe('Ruth Kumera');
    expect(curriculum.intended_builder_state).toBe('onboarding_pending');
    expect(isAssignablePlanningState(curriculum)).toBe(false);
  });

  it('MUTATION GUARD: flipping her to verified_active would make her assignable, which this test forbids', () => {
    // The control for the assertion above: it proves the check reads the state rather than the name.
    expect(isAssignablePlanningState(fixture({ intended_builder_state: 'verified_active' }))).toBe(true);
    expect(isAssignablePlanningState(fixture({ intended_builder_state: 'onboarding_pending' }))).toBe(false);
    expect(isAssignablePlanningState(fixture({ intended_builder_state: 'unassigned' }))).toBe(false);
  });

  it('three domains are deliberately unassigned', () => {
    const unassigned = AGENT_DOMAINS.filter((d) => d.intended_builder_state === 'unassigned').map((d) => d.domain_key);
    expect(unassigned.sort()).toEqual(['executive', 'learner_success', 'website']);
  });
});

describe('manager fields are measured, and blockers are named rather than generic', () => {
  it('every domain resolves a manager identity that looks like an org_members id', () => {
    for (const d of AGENT_DOMAINS) {
      expect(d.manager_identity_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(d.manager_email).toContain('@');
    }
  });

  it('reachability matches production as measured 2026-10-08: six of ten, four blocked', () => {
    // Not the stale "three of ten" from HUMAN_OWNERSHIP_MAP.md. Swati acquired an admin login and
    // Dhee's row was created by T02, so the figure moved. Measured, not remembered.
    expect(AGENT_DOMAINS.filter((d) => d.can_reach_surface)).toHaveLength(6);
    expect(blockedDomains()).toHaveLength(4);
  });

  it('exactly five distinct humans can reach a surface, because Ali holds two domains', () => {
    const reachable = new Set(AGENT_DOMAINS.filter((d) => d.can_reach_surface).map((d) => d.manager_email));
    expect(reachable.size).toBe(5);
  });

  it('the four blocked domains are the measured four', () => {
    expect(blockedDomains().map((d) => d.domain_key).sort())
      .toEqual(['admissions', 'platform', 'product_experience', 'sales']);
  });

  it('a blocked domain always carries a NAMED blocker, and a reachable one carries none', () => {
    for (const d of AGENT_DOMAINS) {
      if (d.can_reach_surface) {
        expect(d.blocker).toBeNull();
      } else {
        expect(d.blocker).toBeTruthy();
        // named, not generic: it must say what is missing and who it belongs to
        expect(d.blocker).toContain('manager_has_no_admin_login');
        expect(d.blocker!.length).toBeGreaterThan(60);
      }
    }
  });

  it('POSITIVE CONTROL: a blocked domain with a null blocker fails the pairing', () => {
    const bad = fixture({ can_reach_surface: false, blocker: null });
    expect(bad.can_reach_surface === false && bad.blocker === null).toBe(true);
  });
});

describe('agent linkage is read-only and sparse by design', () => {
  it('exactly two domains carry an AI employee today', () => {
    const linked = AGENT_DOMAINS.filter((d) => d.agent_id !== null);
    expect(linked.map((d) => d.domain_key).sort()).toEqual(['curriculum', 'learner_success']);
  });

  it('the other eight are null rather than fabricated', () => {
    expect(AGENT_DOMAINS.filter((d) => d.agent_id === null)).toHaveLength(8);
  });
});

describe('the entry point is explicit and labelled', () => {
  it('is a stable literal the ADR and the schema both reference', () => {
    expect(AGENT_DOMAIN_ENTRY_POINT).toBe('agent_domain_factory_provisioner');
    expect(AGENT_DOMAIN_ORG_ID).toBe('acdfa378-3613-4e6f-850f-1bbfb9d3e789');
  });
});
