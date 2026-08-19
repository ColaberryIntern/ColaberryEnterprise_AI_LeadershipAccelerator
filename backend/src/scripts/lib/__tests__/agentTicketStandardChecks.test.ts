import {
  evaluateToolsGranted,
  isGenericFallbackLabel,
  stripComments,
  scanForTimeBasedClosurePatterns,
  findResolverMapping,
  evaluateReportsTo,
  AGENT_TICKET_RESOLVER_REGISTRY,
  KNOWN_GENERIC_COLLAPSE_LABELS,
} from '../agentTicketStandardChecks';

describe('evaluateReportsTo', () => {
  it('happy path: a real org_members row on Colaberry passes', () => {
    const result = evaluateReportsTo(
      { reports_to_org_member_id: 'f179c222-284e-4180-a335-cca9e4918b2e' },
      { org_id: 'colaberry-org-id' },
      'Colaberry',
    );
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('f179c222-284e-4180-a335-cca9e4918b2e');
  });

  it('failure path: reports_to_org_member_id not set at all', () => {
    const result = evaluateReportsTo({ reports_to_org_member_id: null }, null, null);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/is not set/);
    expect(result.reason).toMatch(/structurally rejected/);
  });

  it('failure path: reports_to_org_member_id set but the org_members row does not exist (dangling FK)', () => {
    const result = evaluateReportsTo(
      { reports_to_org_member_id: 'deleted-org-member-id' },
      null,
      null,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/dangling reference/);
  });

  it("boundary: resolves to a real org_members row, but on the wrong org (not 'Colaberry')", () => {
    const result = evaluateReportsTo(
      { reports_to_org_member_id: 'some-id' },
      { org_id: 'other-org-id' },
      'SomeOtherCompany',
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/SomeOtherCompany/);
    expect(result.reason).toMatch(/not 'Colaberry'/);
  });
});

describe('evaluateToolsGranted', () => {
  it('happy path: a populated string array passes', () => {
    const result = evaluateToolsGranted(['create_tickets', 'query_agent_fleet_stats']);
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('2 tool(s)');
    expect(result.reason).toContain('create_tickets');
  });

  it('failure path: missing/undefined tools_granted fails', () => {
    expect(evaluateToolsGranted(undefined).pass).toBe(false);
    expect(evaluateToolsGranted(null).pass).toBe(false);
  });

  it('failure path: wrong type (not an array) fails', () => {
    const result = evaluateToolsGranted('not-an-array');
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/not an array/);
  });

  it('boundary case: empty array fails (declared zero capabilities)', () => {
    const result = evaluateToolsGranted([]);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/empty array/);
  });

  it('boundary case: array containing an empty-string entry fails', () => {
    const result = evaluateToolsGranted(['create_tickets', '']);
    expect(result.pass).toBe(false);
  });

  it('boundary case: array containing a non-string entry fails', () => {
    const result = evaluateToolsGranted(['create_tickets', 42 as unknown as string]);
    expect(result.pass).toBe(false);
  });

  it('idempotency: calling twice on the same input returns deep-equal results', () => {
    const input = ['create_tickets', 'close_tickets_on_recovery'];
    expect(evaluateToolsGranted(input)).toEqual(evaluateToolsGranted(input));
  });
});

describe('isGenericFallbackLabel', () => {
  it('happy path: a real, distinguishing name is not a fallback', () => {
    expect(isGenericFallbackLabel('Cory Engine — Autonomous Operations')).toBe(false);
    expect(isGenericFallbackLabel('BPOS Orchestrator — Universal Ticket Layer')).toBe(false);
  });

  it('failure path: known collapse labels (the real #1559 bug shape) are flagged', () => {
    for (const label of KNOWN_GENERIC_COLLAPSE_LABELS) {
      expect(isGenericFallbackLabel(label)).toBe(true);
    }
  });

  it('boundary case: null/undefined/empty/whitespace-only are flagged', () => {
    expect(isGenericFallbackLabel(null)).toBe(true);
    expect(isGenericFallbackLabel(undefined)).toBe(true);
    expect(isGenericFallbackLabel('')).toBe(true);
    expect(isGenericFallbackLabel('   ')).toBe(true);
  });

  it('boundary case: a collapse label with surrounding whitespace is still flagged (trimmed)', () => {
    expect(isGenericFallbackLabel('  Cory  ')).toBe(true);
  });

  it('boundary case: a real name that merely contains a collapse label as a substring is NOT flagged', () => {
    // "Cory Brain — Strategic Initiatives" contains "Cory" as a substring but is
    // itself a real, distinguishing name - only an EXACT match to a known
    // collapse label is the bug.
    expect(isGenericFallbackLabel('Cory Brain — Strategic Initiatives')).toBe(false);
  });
});

describe('stripComments', () => {
  it('removes block comments', () => {
    expect(stripComments('const a = 1; /* Date.now() in prose */ const b = 2;')).not.toMatch(/Date\.now/);
  });

  it('removes line comments', () => {
    expect(stripComments('const a = 1; // no Date.now() here\nconst b = 2;')).not.toMatch(/Date\.now/);
  });

  it('leaves real code untouched', () => {
    const code = 'const stillFailing = ctx.failingAgentNames.has(agentName);';
    expect(stripComments(code)).toBe(code);
  });
});

describe('scanForTimeBasedClosurePatterns', () => {
  it('happy path: a clean file (no anti-pattern tokens) reports zero matches', () => {
    const clean = `
      export function classify(ticket: { description: string }, ctx: { stillFailing: boolean }) {
        if (ctx.stillFailing) return { shouldClose: false };
        return { shouldClose: true };
      }
    `;
    expect(scanForTimeBasedClosurePatterns(clean)).toEqual([]);
  });

  it('failure path: Date.now() is detected', () => {
    const bad = `const elapsed = Date.now() - ticket.createdAtMs;`;
    const matches = scanForTimeBasedClosurePatterns(bad);
    expect(matches.some((m) => m.pattern.includes('Date.now()'))).toBe(true);
  });

  it('failure path: bare new Date() (reading current wall clock) is detected', () => {
    const bad = `const now = new Date();`;
    const matches = scanForTimeBasedClosurePatterns(bad);
    expect(matches.some((m) => m.pattern.includes('new Date()'))).toBe(true);
  });

  it('failure path: new Date(someArg) is NOT flagged (constructing from a real value, not "now")', () => {
    const ok = `const created = new Date(ticket.created_at);`;
    const matches = scanForTimeBasedClosurePatterns(ok);
    expect(matches.some((m) => m.pattern.includes('new Date()'))).toBe(false);
  });

  it('failure path: daysSince / ageInDays tokens are detected', () => {
    expect(scanForTimeBasedClosurePatterns(`const stale = daysSinceOpened(ticket) > 7;`).length).toBeGreaterThan(0);
    expect(scanForTimeBasedClosurePatterns(`if (ageInDays > 7) return close();`).length).toBeGreaterThan(0);
  });

  it('failure path: created_at/createdAt compared with < or > is detected', () => {
    expect(scanForTimeBasedClosurePatterns(`if (ticket.created_at < threshold) close();`).length).toBeGreaterThan(0);
    expect(scanForTimeBasedClosurePatterns(`if (ticket.createdAt > threshold) close();`).length).toBeGreaterThan(0);
  });

  it('boundary case: a pattern token appearing only inside a comment is NOT flagged', () => {
    const source = `
      // No time-based fallback of any kind lives in this file: no Date.now(),
      // no ageInDays, no created_at < comparison anywhere.
      export function classify() { return { shouldClose: false }; }
    `;
    expect(scanForTimeBasedClosurePatterns(source)).toEqual([]);
  });

  it('regression guard: legitimate sibling-ORDER comparison via getTime() (Reese\'s real pattern) produces ZERO matches', () => {
    // Mirrors reeseStudentSupportSupersessionRules.ts's real isNewer() function:
    // comparing two PERSISTED createdAt values to each other to determine order
    // is allowed and must never be flagged - only a comparison against the
    // CURRENT wall clock is the forbidden pattern.
    const legitimateOrdering = `
      function isNewer(a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): boolean {
        const aTime = a.createdAt.getTime();
        const bTime = b.createdAt.getTime();
        if (aTime !== bTime) return aTime > bTime;
        return a.id > b.id;
      }
    `;
    expect(scanForTimeBasedClosurePatterns(legitimateOrdering)).toEqual([]);
  });

  it('idempotency: calling twice on the same input returns deep-equal results', () => {
    const source = `const elapsed = Date.now() - x; if (ticket.created_at > y) close();`;
    expect(scanForTimeBasedClosurePatterns(source)).toEqual(scanForTimeBasedClosurePatterns(source));
  });

  it('reports 1-based line numbers matching the actual offending line', () => {
    const source = ['const a = 1;', 'const b = 2;', 'const now = Date.now();'].join('\n');
    const matches = scanForTimeBasedClosurePatterns(source);
    const dateNowMatch = matches.find((m) => m.pattern.includes('Date.now()'));
    expect(dateNowMatch?.line).toBe(3);
  });
});

describe('AGENT_TICKET_RESOLVER_REGISTRY / findResolverMapping', () => {
  // The original 6 agents' ticket-creator names — each of these genuinely has a real,
  // registered recurring resolver today (Reese is the sole documented partial-coverage
  // exception, asserted separately below).
  const expectedCreators = [
    'cory-engine',
    'CoryBrain',
    'InboxCaseEngine',
    'workforce_intelligence_engine',
    'bpos_orchestrator',
    'Reese',
  ];

  // The 16 department Strategy Architect agents added in the 2026-08-18 Agent Ticket Standard
  // audit (session CC-20260818-a7d2) — confirmed to have NO recurring resolver yet
  // (Initiative.status has zero write paths in this codebase), a documented, honest gap, not
  // an oversight. Listed explicitly (not derived from STRATEGY_CONFIGS) so this test file has
  // no import-time dependency on that module and stays a pure fixture-comparison test.
  const departmentArchitectCreators = [
    'ExecutiveStrategyArchitect', 'GovernanceStrategyArchitect', 'StrategyFuturesArchitect',
    'FinanceIntelligenceArchitect', 'OperationsOptimizationArchitect', 'OrchestrationEcosystemArchitect',
    'InsightArchitect', 'PartnershipExpansionArchitect', 'GrowthExperimentArchitect',
    'MarketingAutomationArchitect', 'AdmissionsConversionArchitect', 'InfrastructureEvolutionArchitect',
    'PlatformInnovationArchitect', 'LearningInnovationArchitect', 'StudentSuccessArchitect',
    'AlumniNetworkArchitect',
  ];

  it('happy path: all 6 original real ticket-creator agents have a mapping', () => {
    for (const name of expectedCreators) {
      expect(findResolverMapping(name)).toBeDefined();
    }
  });

  it('happy path: all 16 department Strategy Architect agents also have a mapping (audited, not silently skipped)', () => {
    expect(departmentArchitectCreators).toHaveLength(16);
    for (const name of departmentArchitectCreators) {
      expect(findResolverMapping(name)).toBeDefined();
    }
  });

  it('failure path: an unmapped/unknown agent name returns undefined, not a fabricated default', () => {
    expect(findResolverMapping('SomeBrandNewAgentNobodyRegisteredYet')).toBeUndefined();
  });

  it('every one of the original 6 mapped resolvers has a non-null resolverAgentName (a real recurring resolver today)', () => {
    for (const name of expectedCreators) {
      expect(findResolverMapping(name)?.resolverAgentName).not.toBeNull();
    }
  });

  it('every one of the 16 department Strategy Architects has a null resolverAgentName — honest, not a placeholder (no live re-checkable signal exists yet)', () => {
    for (const name of departmentArchitectCreators) {
      const mapping = findResolverMapping(name);
      expect(mapping?.resolverAgentName).toBeNull();
      expect(mapping?.resolverRulesFile).toBeNull();
      expect(mapping?.resolverIoFile).toBeNull();
      expect(mapping?.artifactsFile).toBeNull();
    }
  });

  it('workforce_intelligence_engine is the one documented exception among the original 6 with no separate rules file or artifacts module', () => {
    const mapping = findResolverMapping('workforce_intelligence_engine');
    expect(mapping?.resolverRulesFile).toBeNull();
    expect(mapping?.resolverIoFile).toBe('services/company/workforceTicketAutoResolver.ts');
    expect(mapping?.artifactsFile).toBeNull();
  });

  it('every other mapped resolver among the original 6 (all but workforce_intelligence_engine) has a real artifactsFile', () => {
    for (const name of expectedCreators) {
      if (name !== 'workforce_intelligence_engine') {
        const mapping = findResolverMapping(name);
        expect(mapping?.artifactsFile).not.toBeNull();
        expect(mapping?.artifactsFile).toMatch(/^scripts\/lib\/.+\.ts$/);
      }
    }
  });

  it('Reese carries the documented, honest knownGap (not silently omitted)', () => {
    const mapping = findResolverMapping('Reese');
    expect(mapping?.knownGap).toBeDefined();
    expect(mapping?.knownGap).toMatch(/reese_autonomous_outreach/);
    expect(mapping?.knownGap).toMatch(/ReeseOutreachFollowUps/);
  });

  it('every one of the 16 department Strategy Architects carries its own documented knownGap explaining the missing resolver', () => {
    for (const name of departmentArchitectCreators) {
      const mapping = findResolverMapping(name);
      expect(mapping?.knownGap).toBeDefined();
      expect(mapping?.knownGap).toMatch(/Initiative\.status/);
      expect(mapping?.knownGap).not.toMatch(/daysSince|ageInDays|Date\.now\(\)/); // never a time-based excuse
    }
  });

  it('no agent outside the original-6-minus-Reese and the 16 Architects carries an undocumented knownGap', () => {
    const expectedGapBearers = new Set(['Reese', ...departmentArchitectCreators]);
    for (const mapping of AGENT_TICKET_RESOLVER_REGISTRY) {
      if (!expectedGapBearers.has(mapping.creatorAgentName)) {
        expect(mapping.knownGap).toBeUndefined();
      }
    }
  });
});
