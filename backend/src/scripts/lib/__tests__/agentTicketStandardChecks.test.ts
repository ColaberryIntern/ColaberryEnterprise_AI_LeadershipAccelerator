import {
  evaluateToolsGranted,
  isGenericFallbackLabel,
  stripComments,
  scanForTimeBasedClosurePatterns,
  findResolverMapping,
  AGENT_TICKET_RESOLVER_REGISTRY,
  KNOWN_GENERIC_COLLAPSE_LABELS,
} from '../agentTicketStandardChecks';

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
  const expectedCreators = [
    'cory-engine',
    'CoryBrain',
    'InboxCaseEngine',
    'workforce_intelligence_engine',
    'bpos_orchestrator',
    'Reese',
  ];

  it('happy path: all 6 real ticket-creator agents have a mapping', () => {
    for (const name of expectedCreators) {
      expect(findResolverMapping(name)).toBeDefined();
    }
  });

  it('failure path: an unmapped/unknown agent name returns undefined, not a fabricated default', () => {
    expect(findResolverMapping('SomeBrandNewAgentNobodyRegisteredYet')).toBeUndefined();
  });

  it('every mapped resolver has a non-null resolverAgentName (all 6 have a real recurring resolver today)', () => {
    for (const mapping of AGENT_TICKET_RESOLVER_REGISTRY) {
      expect(mapping.resolverAgentName).not.toBeNull();
    }
  });

  it('workforce_intelligence_engine is the one documented exception with no separate rules file or artifacts module', () => {
    const mapping = findResolverMapping('workforce_intelligence_engine');
    expect(mapping?.resolverRulesFile).toBeNull();
    expect(mapping?.resolverIoFile).toBe('services/company/workforceTicketAutoResolver.ts');
    expect(mapping?.artifactsFile).toBeNull();
  });

  it('every other mapped resolver (all but workforce_intelligence_engine) has a real artifactsFile', () => {
    for (const mapping of AGENT_TICKET_RESOLVER_REGISTRY) {
      if (mapping.creatorAgentName !== 'workforce_intelligence_engine') {
        expect(mapping.artifactsFile).not.toBeNull();
        expect(mapping.artifactsFile).toMatch(/^scripts\/lib\/.+\.ts$/);
      }
    }
  });

  it('Reese carries the documented, honest knownGap (not silently omitted)', () => {
    const mapping = findResolverMapping('Reese');
    expect(mapping?.knownGap).toBeDefined();
    expect(mapping?.knownGap).toMatch(/reese_autonomous_outreach/);
    expect(mapping?.knownGap).toMatch(/ReeseOutreachFollowUps/);
  });

  it('no other agent carries an undocumented knownGap (only Reese has a disclosed gap today)', () => {
    for (const mapping of AGENT_TICKET_RESOLVER_REGISTRY) {
      if (mapping.creatorAgentName !== 'Reese') {
        expect(mapping.knownGap).toBeUndefined();
      }
    }
  });
});
