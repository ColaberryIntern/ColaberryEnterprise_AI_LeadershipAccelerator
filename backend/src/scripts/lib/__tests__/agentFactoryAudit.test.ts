/**
 * The audit's judgement, driven over the cases that actually matter.
 *
 * The point of testing `assess` rather than the queries: the queries can only be wrong in
 * ways a reviewer sees, while the JUDGEMENT is the part that drifts silently. An audit
 * that says "9% complete" while every gate is cold is technically accurate and
 * operationally useless, and nothing but a test keeps the ordering honest.
 */

import { assess, render, type AuditInput } from '../agentFactoryAudit';

const BUILD = (over: Partial<AuditInput['builds'][number]> = {}) => ({
  domain_key: 'platform',
  intended_builder: 'Quincy',
  tasks: 100,
  complete: 10,
  in_progress: 5,
  verified: 10,
  ...over,
});

const COLD: AuditInput['spine'] = [
  { step: 'build authorization', table_name: 'agent_domain_build_authorizations', rows: 0 },
  { step: 'tool grant', table_name: 'agent_domain_tool_grants', rows: 0 },
];

describe('the gates', () => {
  it('says the path has never completed when EVERY gate is cold', () => {
    const v = assess({ builds: [BUILD()], managers: [], spine: COLD });
    expect(v.gatesNeverUsed).toHaveLength(2);
    expect(v.headlines[0]).toMatch(/never completed once/i);
  });

  it('names the cold ones individually once some gate has warmed up', () => {
    // The distinction is the whole value: "nothing works" and "one step works" call for
    // different actions, and a single all-or-nothing message hides the difference.
    const v = assess({
      builds: [BUILD()],
      managers: [],
      spine: [{ ...COLD[0], rows: 3 }, COLD[1]],
    });
    expect(v.headlines[0]).toMatch(/1 of 2 governance steps have never been used: tool grant/);
    expect(v.headlines[0]).not.toMatch(/never completed once/i);
  });

  it('says nothing about gates when they are all in use, rather than reporting an all-clear', () => {
    const v = assess({
      builds: [BUILD()],
      managers: [],
      spine: COLD.map((g) => ({ ...g, rows: 1 })),
    });
    expect(v.gatesNeverUsed).toHaveLength(0);
    expect(v.headlines.some((h) => /governance/i.test(h))).toBe(false);
  });
});

describe('ordering, which is the part that makes it useful', () => {
  /**
   * A cold gate outranks slow progress. Progress toward a gate nobody can pass is not
   * progress, and an audit that leads with the percentage invites exactly the reading
   * that let this drift for a month.
   */
  it('puts a cold gate ABOVE the completion percentage', () => {
    const v = assess({ builds: [BUILD()], managers: [], spine: COLD });
    const gateAt = v.headlines.findIndex((h) => /governance|never completed/i.test(h));
    const pctAt = v.headlines.findIndex((h) => /tasks complete/i.test(h));
    expect(gateAt).toBeGreaterThan(-1);
    expect(pctAt).toBeGreaterThan(gateAt);
  });

  it('always reports progress, even when it is the only thing to say', () => {
    const v = assess({ builds: [BUILD()], managers: [], spine: [] });
    expect(v.headlines.at(-1)).toMatch(/10 of 100 tasks complete \(10%\)/);
  });
});

describe('unassigned domains are not 0% progress', () => {
  /**
   * Counting an unstaffed domain's tasks into the denominator reports a staffing problem
   * as a productivity problem. They are different problems with different owners, so the
   * percentage covers staffed builds only and the unstaffed ones are named.
   */
  it('excludes a domain with no builder from the percentage and names it', () => {
    const v = assess({
      builds: [
        BUILD({ tasks: 100, complete: 50 }),
        BUILD({ domain_key: 'website', intended_builder: null, tasks: 900, complete: 0 }),
      ],
      managers: [],
      spine: [],
    });
    expect(v.totalTasks).toBe(100);
    expect(v.percentComplete).toBe(50);
    expect(v.unassignedDomains).toEqual(['website']);
    expect(v.assignedBuilds).toBe(1);
  });

  it('treats a blank builder as unassigned, not as a builder named ""', () => {
    const v = assess({
      builds: [BUILD({ intended_builder: '   ' })],
      managers: [],
      spine: [],
    });
    expect(v.unassignedDomains).toEqual(['platform']);
  });
});

describe('managers', () => {
  const MGR = (over: Partial<AuditInput['managers'][number]> = {}) => ({
    domain_key: 'platform',
    recorded_can_reach: true,
    can_reach: true,
    blocker: null,
    via: 'bridge' as const,
    ...over,
  });

  it('counts and names the ones who cannot reach their agent', () => {
    const v = assess({
      builds: [BUILD()],
      managers: [
        MGR({ domain_key: 'platform', recorded_can_reach: false, can_reach: false, blocker: 'org_member_email_mismatch', via: null }),
        MGR({ domain_key: 'curriculum' }),
      ],
      spine: [],
    });
    expect(v.managersBlocked).toEqual(['platform']);
    expect(v.headlines.some((h) => /1 of 2 managers cannot reach/.test(h))).toBe(true);
  });

  /**
   * The regression test for this audit's own first mistake. It read the stored flag as fact and
   * reported three managers as locked out who were not, which produced a recommendation to
   * create four admin_users rows — a near-full access grant that would have unblocked nobody.
   */
  it('says loudly where the STORED flag contradicts the computed answer', () => {
    const v = assess({
      builds: [BUILD()],
      managers: [
        MGR({ domain_key: 'platform', recorded_can_reach: false, can_reach: true }),
        MGR({ domain_key: 'sales', recorded_can_reach: false, can_reach: true }),
        MGR({ domain_key: 'curriculum' }),
      ],
      spine: [],
    });
    expect(v.managerFlagWrong).toEqual(['platform', 'sales']);
    expect(v.managersBlocked).toEqual([]);
    const line = v.headlines.find((h) => /stored manager_can_reach flag is WRONG/.test(h));
    expect(line).toContain('2 of 3 domains');
    expect(line).toContain('platform, sales');
  });

  it('says nothing about disagreement when the flag is right', () => {
    const v = assess({ builds: [BUILD()], managers: [MGR()], spine: [] });
    expect(v.managerFlagWrong).toEqual([]);
    expect(v.headlines.some((h) => /flag is WRONG/.test(h))).toBe(false);
  });

  /**
   * Reaching the page only through a legacy full-admin row is not the same as reaching it. The
   * scoped path is broken and a wide grant is load-bearing, which any boolean reports as fine.
   */
  it('separates a manager who gets in only through a legacy full-admin login', () => {
    const v = assess({
      builds: [BUILD()],
      managers: [MGR({ domain_key: 'website', via: 'legacy' }), MGR({ domain_key: 'curriculum' })],
      spine: [],
    });
    expect(v.managersOnLegacyOnly).toEqual(['website']);
    expect(v.managersBlocked).toEqual([]);
    expect(v.headlines.some((h) => /ONLY through a legacy full-admin login: website/.test(h))).toBe(true);
  });

  it('does not count a BLOCKED manager as legacy-only even if via somehow says legacy', () => {
    const v = assess({
      builds: [BUILD()],
      managers: [MGR({ domain_key: 'website', can_reach: false, recorded_can_reach: false, via: 'legacy' })],
      spine: [],
    });
    expect(v.managersOnLegacyOnly).toEqual([]);
    expect(v.managersBlocked).toEqual(['website']);
  });

  it('puts the wrong-flag line ABOVE the progress percentage', () => {
    // Same ordering argument as the gates: a believed-but-false number outranks a slow one.
    const v = assess({
      builds: [BUILD()],
      managers: [MGR({ recorded_can_reach: false, can_reach: true })],
      spine: [],
    });
    const flagAt = v.headlines.findIndex((h) => /flag is WRONG/.test(h));
    const pctAt = v.headlines.findIndex((h) => /tasks complete/.test(h));
    expect(flagAt).toBeGreaterThan(-1);
    expect(pctAt).toBeGreaterThan(flagAt);
  });

  it('names the refusing MECHANISM beside each domain in the rendered table', () => {
    const managers = [
      MGR({ domain_key: 'admissions', recorded_can_reach: false, can_reach: false, blocker: 'org_member_email_mismatch', via: null }),
      MGR({ domain_key: 'website', via: 'legacy' }),
    ];
    const out = render(assess({ builds: [BUILD()], managers, spine: [] }), [BUILD()], managers);
    expect(out).toMatch(/admissions\s+NO\s+-\s+org_member_email_mismatch/);
    expect(out).toMatch(/website\s+YES\s+legacy\s+legacy full-admin login/);
  });

  it('marks a stored flag that disagrees, in the table as well as the headline', () => {
    const managers = [MGR({ domain_key: 'platform', recorded_can_reach: false, can_reach: true })];
    const out = render(assess({ builds: [BUILD()], managers, spine: [] }), [BUILD()], managers);
    expect(out).toMatch(/stored flag says false, which is wrong/);
  });

  it('omits the manager table entirely when no managers are passed', () => {
    const out = render(assess({ builds: [BUILD()], managers: [], spine: [] }), [BUILD()]);
    expect(out).not.toMatch(/MANAGER ACCESS/);
  });
});

describe('edges that would otherwise render as a missing measurement', () => {
  it('is 0%, never NaN, on an empty board', () => {
    const v = assess({ builds: [], managers: [], spine: [] });
    expect(v.percentComplete).toBe(0);
    expect(String(v.percentComplete)).not.toBe('NaN');
    // A blank cell reads as "we failed to measure"; a zero reads as "we measured zero".
    expect(render(v, [])).not.toMatch(/NaN/);
  });

  it('floors rather than rounds, so 99.6% never prints as 100%', () => {
    // Rounding up to a round number is how "done" gets claimed one task early.
    const v = assess({
      builds: [BUILD({ tasks: 1000, complete: 996 })],
      managers: [],
      spine: [],
    });
    expect(v.percentComplete).toBe(99);
  });
});

describe('render', () => {
  it('names the table beside every gate, so a surprising zero can be checked', () => {
    // The agent_runs lesson: a zero can mean "nothing happened" or "wrong table". The
    // report must let the reader tell which without going back to the author.
    const out = render(assess({ builds: [BUILD()], managers: [], spine: COLD }), [BUILD()]);
    expect(out).toMatch(/NEVER\s+build authorization\s+agent_domain_build_authorizations/);
  });

  it('marks an unassigned domain in the table rather than printing an empty name', () => {
    const builds = [BUILD({ domain_key: 'website', intended_builder: null })];
    const out = render(assess({ builds, managers: [], spine: [] }), builds);
    expect(out).toMatch(/website\s+\(UNASSIGNED\)/);
  });
});
