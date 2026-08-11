/**
 * Blocking vs advisory: what stops a plan reaching a student, and what merely
 * annotates it.
 *
 * WHY THIS EXISTS: the second production concurrency run (2026-08-10) left one
 * build in three at `gate_failed` over a SINGLE `story_redundant_scaffold` —
 * STORY-010 "Ensure idempotent notification and logging" subsuming two others.
 * That story was the r0 trust spine, which `r0_no_trust_spine` explicitly
 * requires and which by its nature cites requirements other stories own. The
 * gate was contradicting itself, and the cost was a student staring at an empty
 * Projects page over a story-overlap nit.
 *
 * The split fixes the cost, not the contradiction: repair still tries to clear
 * everything, and `gate.ok` still means spotless. What changed is what happens
 * when repair runs out of attempts.
 *
 * The tests that matter most here are the NEGATIVE ones — proving the split
 * cannot be used to smuggle a genuinely broken plan through. A severity model
 * that quietly downgrades `must_uncovered` would be far worse than no severity
 * model at all.
 */
import {
  gatePlan, BLOCKING_RULES, blockingViolations, advisoryViolations, isPublishable, GateRule, GateViolation,
} from '../planGate';
import { BuildPlan } from '../planContract';

const v = (rule: GateRule, subject = 'X'): GateViolation => ({ rule, subject, message: `${rule} on ${subject}` });

describe('the severity line is where we say it is', () => {
  it('blocks exactly the nine rules that mean the plan is wrong', () => {
    // Pinned as a literal list. Moving a rule across this line changes whether
    // students see broken plans, so it must be a deliberate edit to this test.
    expect([...BLOCKING_RULES].sort()).toEqual([
      'dangling_blocked_by',
      'dangling_release',
      'dangling_requirement',
      'invented_vendor',
      'malformed_requirement',
      'malformed_story',
      'must_uncovered',
      'r0_missing',
      'r0_not_ungated',
    ]);
  });

  it.each([
    ['must_uncovered', 'the plan claims a requirement nothing delivers'],
    ['dangling_blocked_by', 'materialization would lock a task behind a story that does not exist'],
    ['dangling_requirement', 'a story cites a requirement that is not in the plan'],
    ['dangling_release', 'a story names a release that is not in the plan'],
    ['malformed_story', 'a story is missing a field the portal renders'],
    ['malformed_requirement', 'a requirement is missing a field'],
    ['r0_missing', 'there is no first release to start from'],
    ['r0_not_ungated', 'every r0 story is blocked, so the student cannot start anything'],
    ['invented_vendor', 'the plan names a vendor the student never mentioned'],
  ] as Array<[GateRule, string]>)('%s blocks — %s', (rule) => {
    expect(isPublishable([v(rule)])).toBe(false);
  });

  it.each([
    ['story_redundant_scaffold', 'one story overlaps two others'],
    ['story_is_layer', 'a story is plumbing rather than a slice'],
    ['requirement_unfalsifiable', 'a requirement is vague'],
    ['release_unbalanced', 'one release carries too many stories'],
    ['release_empty', 'a release renders as an empty list'],
    ['acceptance_too_few', 'a story has thin acceptance criteria'],
    ['acceptance_no_trust_line', 'a story has no Trust line'],
    ['r0_no_trust_spine', 'r0 does not prove the guarantee'],
  ] as Array<[GateRule, string]>)('%s warns but does not block — %s', (rule) => {
    expect(isPublishable([v(rule)])).toBe(true);
  });

  it('every rule is classified — a new rule cannot default to silently advisory', () => {
    // The failure mode this guards: someone adds a blocking-severity rule, forgets
    // BLOCKING_RULES, and it silently becomes a warning. Enumerated from the
    // union type via a plan that trips a representative sample is not possible in
    // TS at runtime, so the check is on the two lists staying in sync with the
    // rules the gate can actually emit (asserted in planGate.test.ts).
    const allRules: GateRule[] = [
      'must_uncovered', 'dangling_requirement', 'dangling_release', 'dangling_blocked_by',
      'acceptance_too_few', 'acceptance_no_trust_line', 'r0_missing', 'r0_not_ungated',
      'r0_no_trust_spine', 'invented_vendor', 'malformed_requirement', 'malformed_story',
      'story_is_layer', 'story_redundant_scaffold', 'requirement_unfalsifiable',
      'release_unbalanced', 'release_empty',
    ];
    const violations = allRules.map((r) => v(r));
    expect(blockingViolations(violations).length + advisoryViolations(violations).length)
      .toBe(allRules.length);
    expect(blockingViolations(violations)).toHaveLength(BLOCKING_RULES.size);
  });
});

describe('the split cannot smuggle a broken plan through', () => {
  it('one blocking violation among many advisory ones still blocks', () => {
    const mixed = [
      v('story_redundant_scaffold'), v('release_unbalanced'), v('requirement_unfalsifiable'),
      v('must_uncovered', 'REQ-007'), v('story_is_layer'),
    ];
    expect(isPublishable(mixed)).toBe(false);
    expect(blockingViolations(mixed).map((x) => x.subject)).toEqual(['REQ-007']);
  });

  it('a plan with an uncovered must-have is never publishable, however tidy', () => {
    const plan = planMissingCoverage();
    const rules = gatePlan(plan).violations.map((x) => x.rule);
    expect(rules).toContain('must_uncovered');
    expect(isPublishable(gatePlan(plan).violations)).toBe(false);
  });

  it('a plan whose r0 is fully blocked is never publishable — it locks the student out', () => {
    const plan = planWithBlockedR0();
    expect(gatePlan(plan).violations.map((x) => x.rule)).toContain('r0_not_ungated');
    expect(isPublishable(gatePlan(plan).violations)).toBe(false);
  });
});

describe('the case that motivated the split', () => {
  it('a lone redundant-scaffold plan reaches the student instead of failing closed', () => {
    // Reconstructed from production project 2c9953ce: STORY-010, the r0 trust
    // spine, fulfils {REQ-004, REQ-010} — the union of STORY-003 and STORY-009.
    const plan = planWithTrustSpineOverlap();
    const gate = gatePlan(plan);

    expect(gate.ok).toBe(false);
    expect(gate.violations.map((x) => x.rule)).toEqual(['story_redundant_scaffold']);
    expect(isPublishable(gate.violations)).toBe(true);   // ← the whole point
    expect(advisoryViolations(gate.violations)).toHaveLength(1);
  });
});

// ── fixtures ────────────────────────────────────────────────────────────────

const RELEASES = [
  { key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 },
  { key: 'r1', name: 'Drafting', goal: 'g', demo: 'd', week_start: 3, week_end: 4 },
];

const ACCEPTANCE = [
  'Given a deadline approaches, when the watcher runs, then the director is warned.',
  'Given it runs twice, when it retries, then only one warning is sent.',
  'Trust — every warning is written to the audit log with its idempotency key.',
];

function story(id: string, release: string, fulfills: string[], over: Record<string, unknown> = {}) {
  return {
    id, release, title: `Deliver ${id}`,
    narrative: `As a director, I want ${id}, so that the outcome lands.`,
    fulfills, owner_agent: 'builder', acceptance: ACCEPTANCE,
    task_guidance: 'guidance', failure_paths: ['upstream unavailable'],
    ...over,
  };
}

function requirement(id: string, statement: string) {
  return { id, statement, kind: 'FUNC' as const, priority: 'must' as const, cluster: 'core' };
}

function planMissingCoverage(): BuildPlan {
  return {
    project_name: 'p', descriptor: 'd',
    requirements: [
      requirement('REQ-001', 'The system must warn the director two weeks out.'),
      requirement('REQ-002', 'The system must draft from past submissions.'),
    ],
    releases: RELEASES,
    stories: [story('STORY-001', 'r0', ['REQ-001']), story('STORY-002', 'r1', ['REQ-001'])],
  };
}

function planWithBlockedR0(): BuildPlan {
  return {
    project_name: 'p', descriptor: 'd',
    requirements: [
      requirement('REQ-001', 'The system must warn the director two weeks out.'),
      requirement('REQ-002', 'The system must draft from past submissions.'),
    ],
    releases: RELEASES,
    stories: [
      story('STORY-001', 'r0', ['REQ-001'], { blocked_by: ['STORY-002'] }),
      story('STORY-002', 'r1', ['REQ-002']),
    ],
  };
}

function planWithTrustSpineOverlap(): BuildPlan {
  return {
    project_name: 'Grant Deadline Watchdog', descriptor: 'watches grant portals',
    requirements: [
      requirement('REQ-004', 'The system must notify the director two weeks before a deadline.'),
      requirement('REQ-010', 'The system must log all actions taken for audit purposes.'),
    ],
    releases: RELEASES,
    stories: [
      story('STORY-003', 'r0', ['REQ-004']),
      story('STORY-010', 'r0', ['REQ-004', 'REQ-010'], { title: 'Ensure idempotent notification and logging' }),
      story('STORY-009', 'r1', ['REQ-010']),
    ],
  };
}
