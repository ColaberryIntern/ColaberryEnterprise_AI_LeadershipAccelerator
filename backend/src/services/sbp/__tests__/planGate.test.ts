/**
 * planGate — one test per violation class, each written so it fails if the rule
 * it covers is removed. Plus a passing-plan case, because a gate that rejects
 * everything is as useless as one that rejects nothing.
 */
import { gatePlan, formatViolations, GateRule } from '../planGate';
import { BuildPlan, PlanStory, PlanRequirement } from '../planContract';

// ── builders ────────────────────────────────────────────────────────────────
const req = (over: Partial<PlanRequirement> = {}): PlanRequirement => ({
  id: 'REQ-001',
  statement: 'The system must let a manager add employees to a roster by name and email.',
  kind: 'FUNC',
  priority: 'must',
  cluster: 'Roster',
  ...over,
});

const story = (over: Partial<PlanStory> = {}): PlanStory => ({
  id: 'STORY-001',
  release: 'r0',
  title: 'Manager adds employees to a roster',
  narrative: 'As a manager, I want to add employees by name and email, so that I can buy the right number of seats.',
  fulfills: ['REQ-001'],
  owner_agent: 'Roster',
  acceptance: [
    'Given the dashboard, when I add an employee, then they appear on the roster.',
    'Given a malformed email, when I submit, then an error shows and nothing is created.',
    'Trust - every roster change is written to the audit log with actor and timestamp.',
  ],
  task_guidance: 'Add the roster endpoint and table.',
  failure_paths: ['duplicate email', 'roster over seat count'],
  ...over,
});

const plan = (over: Partial<BuildPlan> = {}): BuildPlan => ({
  project_name: 'Sponsor Dashboard',
  descriptor: 'Corporate seat management',
  requirements: [req()],
  releases: [{ key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
  stories: [story()],
  ...over,
});

const rules = (r: ReturnType<typeof gatePlan>): GateRule[] => r.violations.map((v) => v.rule);

// ── the passing case ────────────────────────────────────────────────────────
describe('gatePlan — a well-formed plan', () => {
  it('passes', () => {
    const result = gatePlan(plan());
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('formats a PASS', () => {
    expect(formatViolations(gatePlan(plan()))).toBe('gate: PASS');
  });
});

// ── coverage ────────────────────────────────────────────────────────────────
describe('must_uncovered', () => {
  it('fails when a must-have requirement has no story', () => {
    const result = gatePlan(plan({ requirements: [req(), req({ id: 'REQ-002' })] }));
    expect(rules(result)).toContain('must_uncovered');
    expect(result.violations.find((v) => v.rule === 'must_uncovered')?.subject).toBe('REQ-002');
  });

  it('does NOT fail for an uncovered `should`', () => {
    const result = gatePlan(plan({ requirements: [req(), req({ id: 'REQ-002', priority: 'should' })] }));
    expect(rules(result)).not.toContain('must_uncovered');
  });

  // The root fix for the pilot's layer stories: a CONSTRAINT is context, not work.
  it('does NOT demand a story for a CONSTRAINT requirement, even at must priority', () => {
    const result = gatePlan(plan({
      requirements: [
        req(),
        req({ id: 'REQ-002', kind: 'CONSTRAINT', priority: 'must', statement: 'The system must use PaySimple for payments.' }),
      ],
    }));
    expect(rules(result)).not.toContain('must_uncovered');
    expect(result.ok).toBe(true);
  });
});

// ── referential integrity ───────────────────────────────────────────────────
describe('referential integrity', () => {
  it('fails on a story citing an unknown requirement', () => {
    const result = gatePlan(plan({ stories: [story({ fulfills: ['REQ-001', 'REQ-404'] })] }));
    expect(rules(result)).toContain('dangling_requirement');
  });

  it('fails on a story naming an unknown release', () => {
    const result = gatePlan(plan({ stories: [story({ release: 'r9' })] }));
    expect(rules(result)).toContain('dangling_release');
  });

  it('fails on blocked_by naming a story that does not exist', () => {
    const result = gatePlan(plan({
      releases: [
        { key: 'r0', name: 'a', goal: 'g', demo: 'd', week_start: 1, week_end: 1 },
        { key: 'r1', name: 'b', goal: 'g', demo: 'd', week_start: 2, week_end: 2 },
      ],
      stories: [story(), story({ id: 'STORY-002', release: 'r1', blocked_by: ['STORY-999'] })],
    }));
    expect(rules(result)).toContain('dangling_blocked_by');
  });
});

// ── acceptance quality ──────────────────────────────────────────────────────
describe('acceptance quality', () => {
  it('fails when a story has fewer than 3 acceptance criteria', () => {
    const result = gatePlan(plan({
      stories: [story({ acceptance: ['Given a thing, when I do it, then it works.', 'Trust - it is logged.'] })],
    }));
    expect(rules(result)).toContain('acceptance_too_few');
  });

  it('fails when no acceptance line is a Trust line', () => {
    const result = gatePlan(plan({
      stories: [story({ acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', 'Given g, when h, then i.'] })],
    }));
    expect(rules(result)).toContain('acceptance_no_trust_line');
  });

  it.each([
    'Trust - every action is audited.',
    'Trust — every action is audited.',
    '🛡 Trust — audited: every action is logged.',
    'trust: every action is audited.',
  ])('accepts the trust line variant %p', (line) => {
    const result = gatePlan(plan({
      stories: [story({ acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', line] })],
    }));
    expect(rules(result)).not.toContain('acceptance_no_trust_line');
  });
});

// ── walking skeleton ────────────────────────────────────────────────────────
describe('walking skeleton', () => {
  it('fails when there is no r0', () => {
    const result = gatePlan(plan({
      releases: [{ key: 'r1', name: 'a', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
      stories: [story({ release: 'r1' })],
    }));
    expect(rules(result)).toContain('r0_missing');
  });

  it('fails when an r0 story is gated', () => {
    const result = gatePlan(plan({ stories: [story({ blocked_by: ['STORY-001'] })] }));
    expect(rules(result)).toContain('r0_not_ungated');
  });

  // The pilot's r0 demo was "enroll a team member and process a payment" — a
  // happy path proving no guarantee.
  it('fails when r0 proves no correctness guarantee', () => {
    const result = gatePlan(plan({
      stories: [story({
        acceptance: [
          'Given the dashboard, when I add an employee, then they appear.',
          'Given a bad email, when I submit, then an error shows.',
          'Trust - the screen renders quickly.',
        ],
      })],
    }));
    expect(rules(result)).toContain('r0_no_trust_spine');
  });

  it.each(['audit', 'idempotent', 'exactly-once', 'approval gate', 'transaction id'])(
    'accepts r0 when a story proves the guarantee via %p',
    (term) => {
      const result = gatePlan(plan({
        stories: [story({
          acceptance: [
            'Given the dashboard, when I add an employee, then they appear.',
            'Given a bad email, when I submit, then an error shows.',
            `Trust - the ${term} behaviour holds on replay.`,
          ],
        })],
      }));
      expect(rules(result)).not.toContain('r0_no_trust_spine');
    },
  );
});

// ── invented vendors ────────────────────────────────────────────────────────
describe('invented_vendor', () => {
  const SOURCE = 'The manager pays for seats through our existing PaySimple hosted link. Emails go via Mandrill.';

  // Measured on the first pilot run: it invented Stripe/PayPal over PaySimple.
  it('fails when the plan names a vendor absent from both inputs', () => {
    const result = gatePlan(
      plan({ requirements: [req({ statement: 'The system must integrate with payment gateways like Stripe or PayPal.' })] }),
      SOURCE,
    );
    expect(rules(result)).toContain('invented_vendor');
  });

  it('fails when the plan invents a compliance regime', () => {
    const result = gatePlan(
      plan({ requirements: [req({ statement: 'The system must comply with GDPR and HIPAA.' })] }),
      SOURCE,
    );
    expect(rules(result)).toContain('invented_vendor');
  });

  it('does NOT fail for a vendor the source actually names', () => {
    const result = gatePlan(
      plan({ requirements: [req({ statement: 'The system must take payment through PaySimple.' })] }),
      SOURCE,
    );
    expect(rules(result)).not.toContain('invented_vendor');
  });

  it('skips the rule entirely when no source text is supplied', () => {
    const result = gatePlan(
      plan({ requirements: [req({ statement: 'The system must use Stripe.' })] }),
    );
    expect(rules(result)).not.toContain('invented_vendor');
  });
});

// ── determinism ─────────────────────────────────────────────────────────────
describe('purity', () => {
  it('is deterministic and does not mutate its input', () => {
    const p = plan({ requirements: [req(), req({ id: 'REQ-002' })] });
    const snapshot = JSON.stringify(p);
    const a = gatePlan(p);
    const b = gatePlan(p);
    expect(JSON.stringify(p)).toBe(snapshot);
    expect(a).toEqual(b);
  });
});

// ── fail closed on malformed model output ───────────────────────────────────
describe('malformed input fails closed rather than throwing', () => {
  it('reports a violation for a requirement missing its statement', () => {
    const bad = plan({ requirements: [{ id: 'REQ-001', kind: 'FUNC', priority: 'must', cluster: 'c' } as any] });
    expect(() => gatePlan(bad)).not.toThrow();
    expect(rules(gatePlan(bad))).toContain('malformed_requirement');
  });

  it('reports a violation for a story missing its title', () => {
    const bad = plan({ stories: [{ id: 'STORY-001', release: 'r0', fulfills: [] } as any] });
    expect(() => gatePlan(bad)).not.toThrow();
    expect(rules(gatePlan(bad))).toContain('malformed_story');
  });

  it('survives an entirely empty object', () => {
    expect(() => gatePlan({} as any)).not.toThrow();
    expect(gatePlan({} as any).ok).toBe(false);
  });
});
