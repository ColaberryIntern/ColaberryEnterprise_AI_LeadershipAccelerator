import { CAPABILITY_REGISTRY } from '../../../services/workGraph/capabilityRegistry';

// ProofDesk Work Graph (Milestone 3) — backward-compat regression fixture. This is
// the ORIGINAL ticketAgentDispatcher.ts AGENT_MAPPINGS array, preserved here
// verbatim (not imported — that array no longer exists after T009 removes it from
// the dispatcher) so this test can independently prove the new capability registry
// still resolves every original condition to the same agent, without trusting the
// registry's own claims about itself.
const ORIGINAL_AGENT_MAPPINGS_SHAPE: Array<{ match: (t: any) => boolean; agent_name: string }> = [
  { match: (t) => t.type === 'curriculum' && t.metadata?.action === 'design_module', agent_name: 'CurriculumArchitectAgent' },
  { match: (t) => t.type === 'curriculum' && t.metadata?.action === 'generate_artifact', agent_name: 'ArtifactGenerationAgent' },
  { match: (t) => t.type === 'curriculum' && t.metadata?.action === 'qa_check', agent_name: 'CurriculumQAAgent' },
  { match: (t) => t.type === 'bug', agent_name: 'PlatformFixAgent' },
  { match: (t) => t.type === 'curriculum', agent_name: 'CurriculumArchitectAgent' },
];

describe('CAPABILITY_REGISTRY — shape', () => {
  it('exports exactly 5 seed entries', () => {
    expect(CAPABILITY_REGISTRY).toHaveLength(5);
  });

  it('every entry has the required scoring metadata fields', () => {
    for (const entry of CAPABILITY_REGISTRY) {
      expect(typeof entry.capabilityId).toBe('string');
      expect(typeof entry.match).toBe('function');
      expect(typeof entry.agent_name).toBe('string');
      expect(typeof entry.execute).toBe('function');
      expect(typeof entry.specificity).toBe('number');
      expect(['R0', 'R1', 'R2', 'R3', 'R4']).toContain(entry.maxRiskTier);
      expect(typeof entry.resourceScopePattern).toBe('string');
      expect(typeof entry.costTier).toBe('number');
      expect(entry.enabled).toBe(true);
    }
  });
});

describe('CAPABILITY_REGISTRY — backward compatibility (byte-for-byte agent resolution)', () => {
  // Synthetic tickets exercising each of the 5 original AGENT_MAPPINGS conditions,
  // in the SAME order the original array checked them (first-match-wins), so this
  // test independently re-derives what the old dispatcher would have picked.
  const scenarios: Array<{ label: string; ticket: any; expectedAgent: string }> = [
    {
      label: 'curriculum + design_module',
      ticket: { type: 'curriculum', metadata: { action: 'design_module' } },
      expectedAgent: 'CurriculumArchitectAgent',
    },
    {
      label: 'curriculum + generate_artifact',
      ticket: { type: 'curriculum', metadata: { action: 'generate_artifact' } },
      expectedAgent: 'ArtifactGenerationAgent',
    },
    {
      label: 'curriculum + qa_check',
      ticket: { type: 'curriculum', metadata: { action: 'qa_check' } },
      expectedAgent: 'CurriculumQAAgent',
    },
    {
      label: 'bug (any metadata)',
      ticket: { type: 'bug', metadata: {} },
      expectedAgent: 'PlatformFixAgent',
    },
    {
      label: 'curriculum, no specific action (generic catch-all)',
      ticket: { type: 'curriculum', metadata: { action: 'something_unrecognized' } },
      expectedAgent: 'CurriculumArchitectAgent',
    },
  ];

  it.each(scenarios)(
    'the ORIGINAL array (re-derived, not the registry) resolves "$label" to $expectedAgent — sanity check on the fixture itself',
    ({ ticket, expectedAgent }) => {
      const originalMatch = ORIGINAL_AGENT_MAPPINGS_SHAPE.find((m) => m.match(ticket));
      expect(originalMatch?.agent_name).toBe(expectedAgent);
    }
  );

  it.each(scenarios)(
    'every eligible CAPABILITY_REGISTRY entry for "$label" points at an agent that includes $expectedAgent among its matches, and the highest-specificity one is $expectedAgent',
    ({ ticket, expectedAgent }) => {
      const eligible = CAPABILITY_REGISTRY.filter((e) => e.enabled && e.match(ticket));
      expect(eligible.length).toBeGreaterThan(0);

      // The highest-specificity eligible entry is what the router will pick when
      // all other scoring factors are neutral/equal (see capabilityRouter.test.ts
      // for the full scored end-to-end proof) — this test isolates just the
      // specificity-driven tie-break the registry itself is responsible for.
      const winner = eligible.reduce((best, e) => (e.specificity > best.specificity ? e : best));
      expect(winner.agent_name).toBe(expectedAgent);
    }
  );

  it('the generic curriculum catch-all has lower specificity than every action-specific curriculum entry', () => {
    const genericFallback = CAPABILITY_REGISTRY.find((e) => e.capabilityId === 'curriculum.generic_fallback')!;
    const specificEntries = CAPABILITY_REGISTRY.filter(
      (e) => e.capabilityId.startsWith('curriculum.') && e.capabilityId !== 'curriculum.generic_fallback'
    );
    expect(specificEntries.length).toBeGreaterThan(0);
    for (const entry of specificEntries) {
      expect(genericFallback.specificity).toBeLessThan(entry.specificity);
    }
  });
});

describe('CAPABILITY_REGISTRY — non-matching ticket', () => {
  it('no entry matches a ticket type with no defined capability', () => {
    const ticket = { type: 'strategic', metadata: {} };
    const eligible = CAPABILITY_REGISTRY.filter((e) => e.enabled && e.match(ticket));
    expect(eligible).toHaveLength(0);
  });
});
