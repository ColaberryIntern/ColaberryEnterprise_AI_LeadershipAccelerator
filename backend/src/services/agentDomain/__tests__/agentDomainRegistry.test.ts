import {
  AGENT_DOMAINS,
  AGENT_DOMAIN_KEYS,
  AGENT_DOMAIN_ENTRY_POINT,
  AGENT_DOMAIN_ORG_ID,
  FORBIDDEN_AUTHORITY_FIELDS,
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

/**
 * The block that used to live here asserted the registry's own answer to "can this manager reach
 * their employee's surface" — seven of ten reachable, three blocked, each with a named blocker.
 *
 * Every one of those assertions passed while being wrong in production. The fields were measured
 * once, on 2026-10-15, and then frozen into source, so the test froze the same stale answer and
 * defended it. Three managers were recorded as locked out while holding a working scoped login.
 *
 * A test over a constant can only prove the constant has not changed. It cannot notice that the
 * world has. So the reachability assertions are gone, and what replaces them is a guard that the
 * catalog never starts answering the question again.
 */
describe('the catalog does not answer questions about live access', () => {
  it('carries no reachability field on any domain', () => {
    // Named explicitly rather than checked by shape: these two are the fields that went stale, and
    // re-adding either one under any name below should fail here and make someone read the comment.
    for (const d of AGENT_DOMAINS) {
      const keys = Object.keys(d);
      expect(keys).not.toContain('can_reach_surface');
      expect(keys).not.toContain('blocker');
      expect(keys).not.toContain('manager_can_reach');
      expect(keys).not.toContain('manager_blocker');
    }
  });

  it('exports no helper that filters the catalog by reachability', () => {
    // `blockedDomains()` was exactly that, and its only caller was this file.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const registry = require('../agentDomainRegistry') as Record<string, unknown>;
    expect(registry.blockedDomains).toBeUndefined();
  });

  it('still carries the static facts a catalog is for', () => {
    // The point is not that the registry got smaller. It is that what remains cannot go stale
    // without this file changing: ids, titles, sequence, planning state.
    for (const d of AGENT_DOMAINS) {
      expect(typeof d.domain_key).toBe('string');
      expect(typeof d.title).toBe('string');
      expect(typeof d.manager_identity_id).toBe('string');
      expect(typeof d.seq).toBe('number');
    }
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
