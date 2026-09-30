/**
 * Every gate pattern must actually match the phrase it was written for.
 *
 * WHY THIS FILE EXISTS: on 2026-08-10 a live 3-way concurrency run surfaced a
 * build that failed the gate on REQ-008 ("a user-friendly interface"). While
 * tracing it, five of the seven `UNFALSIFIABLE_PATTERNS` turned out to be dead —
 * they had been dead since the file was written. planGate.ts was first created
 * through a shell heredoc that interpreted `\b`, leaving a literal 0x08
 * backspace byte in the source. So this:
 *
 *     /\bhigh[- ]quality\b/i
 *
 * was really `/<0x08>high[- ]quality<0x08>/i` — a pattern demanding a control
 * character that no requirement statement will ever contain. `\w` survived
 * (the shell has no `\w` escape) which is why the corruption looked selective
 * and plausible. It rendered as correct source in every editor, every diff, and
 * every code review, and the 27 existing gate tests stayed green because not one
 * of them exercised those five phrases.
 *
 * The lesson generalises past this one file: a regex constant with no test that
 * asserts it MATCHES something is indistinguishable from a comment. These tests
 * are cheap and they are the difference between a rule and a decoration.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { gatePlan, UNFALSIFIABLE_PATTERNS } from '../planGate';
import { BuildPlan } from '../planContract';

/** One phrase per pattern, in declaration order. */
const PHRASES: Array<[RegExp, string]> = [
  [UNFALSIFIABLE_PATTERNS[0], 'must ensure privacy in compliance with relevant regulations'],
  [UNFALSIFIABLE_PATTERNS[1], 'should follow industry best practices for data handling'],
  [UNFALSIFIABLE_PATTERNS[2], 'should provide a user-friendly interface for the director'],
  [UNFALSIFIABLE_PATTERNS[3], 'should notify the team as needed'],
  [UNFALSIFIABLE_PATTERNS[4], 'must produce high-quality summaries'],
  [UNFALSIFIABLE_PATTERNS[5], 'should cache results where possible'],
  [UNFALSIFIABLE_PATTERNS[6], 'must deliver good performance under load'],
];

describe('unfalsifiable patterns are alive', () => {
  it('has a phrase for every declared pattern', () => {
    // Guards the guard: adding a pattern without a phrase must fail here rather
    // than silently leave the new one untested.
    expect(PHRASES).toHaveLength(UNFALSIFIABLE_PATTERNS.length);
  });

  it.each(PHRASES.map(([re, phrase], i) => [i, String(re), phrase]))(
    'pattern %i %s matches "%s"',
    (_i, source, phrase) => {
      const re = UNFALSIFIABLE_PATTERNS.find((r) => String(r) === source)!;
      expect(re.test(String(phrase))).toBe(true);
    },
  );

  it('each pattern is reachable through gatePlan, not just in isolation', () => {
    // Isolation is not enough: the 0x08 bug was invisible to a regex-only test
    // written by hand, because a hand-typed copy of the pattern was CORRECT.
    // Only the real constant, through the real function, proves the rule fires.
    for (const [, phrase] of PHRASES) {
      const plan = planWithStatement(`The system ${phrase}.`);
      const rules = gatePlan(plan).violations.map((v) => v.rule);
      expect(rules).toContain('requirement_unfalsifiable');
    }
  });

  it('does not fire on a testable statement', () => {
    const plan = planWithStatement('The system must warn the director 14 days before a deadline.');
    expect(gatePlan(plan).violations.map((v) => v.rule)).not.toContain('requirement_unfalsifiable');
  });
});

describe('planGate source is free of control characters', () => {
  it('contains no literal backspace, form feed, vertical tab, bell, or NUL', () => {
    // The root-cause check. Any of these in source is a corrupted escape, and in
    // a regex it silently produces a rule that can never match.
    const src = readFileSync(join(__dirname, '..', 'planGate.ts'), 'latin1');
    const found = [...src].reduce<Record<string, number>>((acc, ch) => {
      const c = ch.charCodeAt(0);
      if ([0x00, 0x07, 0x08, 0x0b, 0x0c].includes(c)) {
        const k = `0x${c.toString(16).padStart(2, '0')}`;
        acc[k] = (acc[k] ?? 0) + 1;
      }
      return acc;
    }, {});
    expect(found).toEqual({});
  });
});

// ── fixture ─────────────────────────────────────────────────────────────────

/** A gate-clean plan carrying one extra requirement under test. */
function planWithStatement(statement: string): BuildPlan {
  const acceptance = [
    'Given a deadline approaches, when the watcher runs, then the director is warned.',
    'Given the watcher runs twice, when it retries, then only one warning is sent.',
    'Trust — every warning is written to the audit log with its idempotency key.',
  ];
  const story = (id: string, release: string, fulfills: string[]) => ({
    id,
    release,
    title: `Deliver ${id}`,
    narrative: `As a director, I want ${id}, so that the outcome lands.`,
    fulfills,
    owner_agent: 'builder',
    acceptance,
    task_guidance: 'guidance',
    failure_paths: ['upstream unavailable'],
  });

  return {
    project_name: 'p',
    descriptor: 'd',
    requirements: [
      { id: 'REQ-001', statement: 'The system must warn the director two weeks out.', kind: 'FUNC', priority: 'must', cluster: 'core' },
      { id: 'REQ-002', statement: 'The system must draft from past submissions.', kind: 'FUNC', priority: 'must', cluster: 'core' },
      { id: 'REQ-050', statement, kind: 'NFR', priority: 'should', cluster: 'core' },
    ],
    releases: [
      { key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 },
      { key: 'r1', name: 'Drafting', goal: 'g', demo: 'd', week_start: 3, week_end: 4 },
    ],
    stories: [story('STORY-001', 'r0', ['REQ-001']), story('STORY-002', 'r1', ['REQ-002'])],
  };
}
