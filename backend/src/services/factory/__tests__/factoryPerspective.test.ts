/**
 * L10.4 — the perspective checks, tested in BOTH DIRECTIONS.
 *
 * A detector's zero is worth nothing until the detector has been shown emitting the positive
 * case. Every rule here therefore has a fixture that makes it fire and a fixture that keeps it
 * quiet, and the firing fixtures are the REAL task titles from the 5 Nov production run rather
 * than stand-ins chosen to match the verb list.
 *
 * That last point is the whole reason this file is shaped the way it is. An earlier draft of
 * `BUYER_SIDE_VERBS` omitted `review`, which is the verb in `Review Proposals` — one of the two
 * failures cited as the motivation for writing the check at all. The check would have gone green
 * against `Receive proposals` while `Review Proposals` sailed through. A fixture that matches its
 * own trigger list proves only that the list matches itself.
 */
import {
  evaluatePerspective, BUYER_SIDE_VERBS, COUNTERPARTY_OBJECTS, CITATION_BUCKET_SHARE, type PerspectiveInput,
} from '../factoryPerspective';
import { factoryValidate, factoryErrors } from '../factoryValidate';
import type { FactoryTask, SourceBlock, FactoryProject } from '../contracts/factoryContract';

const task = (over: Partial<FactoryTask> & { id: string }): FactoryTask => ({
  process_id: 'PROC-1',
  title: over.id,
  description: '',
  kind: 'TASK',
  stage_id: 'S1',
  source_evidence: [],
  required_skills: [],
  judgment_level: 'low',
  decision_authority: 'none',
  data_sensitivity: 'internal',
  interaction_pattern: null,
  frequency: null,
  effort_minutes: null,
  effort_basis: 'UNKNOWN',
  confidence: null,
  method: 'EXPLICIT',
  ...over,
});

const block = (id: string, kind: SourceBlock['kind'] = 'requirement'): SourceBlock => ({
  id, locator: `p.${id}`, text: `text of ${id}`, kind,
});

/** Six requirement blocks, as Herriman's cited rows were. */
const SIX_REQS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((id) => block(id));

const rulesOf = (input: PerspectiveInput) => evaluatePerspective(input).map((f) => f.rule);

describe('BUYER_SIDE_TASK fires on the real 5 Nov failures', () => {
  // The three tasks the production run actually produced, with the titles it actually used.
  // Not two of three, and not constructed equivalents.
  const PRODUCTION_FAILURES = [
    { id: 't-receive-proposals', title: 'Receive Proposals' },
    { id: 't-review-proposals', title: 'Review Proposals' },
    { id: 't-select-vendor', title: 'Select Vendor' },
  ];

  it.each(PRODUCTION_FAILURES)('flags "$title"', ({ id, title }) => {
    const findings = evaluatePerspective({
      tasks: [task({ id, title, source_evidence: ['b1', 'b2'] })],
      source_blocks: SIX_REQS,
    });
    expect(findings.map((f) => f.rule)).toContain('BUYER_SIDE_TASK');
    expect(findings[0].ref).toBe(id);
    // The finding has to be judgeable without opening the code, so it names the rows.
    expect(findings[0].detail).toContain('b1, b2');
  });

  it('flags all three in one pass, so none is caught only in isolation', () => {
    const findings = evaluatePerspective({
      tasks: PRODUCTION_FAILURES.map(({ id, title }) =>
        task({ id, title, source_evidence: ['b1'] })),
      source_blocks: SIX_REQS,
    });
    expect(findings.filter((f) => f.rule === 'BUYER_SIDE_TASK')).toHaveLength(3);
  });
});

describe('BUYER_SIDE_TASK stays SILENT on the honest version of the same work', () => {
  // These cite the SAME blocks as the failures above. The only difference is whose action the
  // title states, which is exactly the distinction the check has to be sensitive to.
  const HONEST = ['Submit proposal', 'State compliance', 'Execute the agreement'];

  it.each(HONEST)('says nothing about "%s"', (title) => {
    const rules = rulesOf({
      tasks: [task({ id: 't-x', title, source_evidence: ['b1', 'b2'] })],
      source_blocks: SIX_REQS,
    });
    expect(rules).not.toContain('BUYER_SIDE_TASK');
  });

  it('says nothing when a counterparty verb cites a NON-requirement block', () => {
    // A genuinely external step — a city portal, a notarisation — can carry one of these verbs
    // honestly. Requiring every cited block to be a requirement is what keeps the check narrow.
    const rules = rulesOf({
      tasks: [task({ id: 't-x', title: 'Receive award notice', source_evidence: ['b1', 'ctx1'] })],
      source_blocks: [...SIX_REQS, block('ctx1', 'context')],
    });
    expect(rules).not.toContain('BUYER_SIDE_TASK');
  });

  it('says nothing about a task that cites nothing at all', () => {
    const rules = rulesOf({
      tasks: [task({ id: 't-x', title: 'Receive Proposals', source_evidence: [] })],
      source_blocks: SIX_REQS,
    });
    expect(rules).not.toContain('BUYER_SIDE_TASK');
  });

  it('ignores START and END, which nobody performs', () => {
    const rules = rulesOf({
      tasks: [task({ id: 'start', title: 'Receive Proposals', kind: 'START', source_evidence: ['b1'] })],
      source_blocks: SIX_REQS,
    });
    expect(rules).not.toContain('BUYER_SIDE_TASK');
  });
});

/**
 * The 6 Nov regeneration is the first run this rule judged that it had not been built from, and it
 * produced one false positive and one near miss. Both are pinned here with the titles production
 * actually used, because a rule calibrated only on the cases that motivated it has never been
 * tested at all.
 */
describe('the 6 Nov run: the verb is not sufficient, and the object is not either', () => {
  it('stays SILENT on "Review Compliance with Requirements" — our own compliance is our work', () => {
    // THE FALSE POSITIVE THAT FORCED THE OBJECT CONDITION. Identical verb to `Review Proposals`
    // and identical citation purity; only the object differs, so only the object can separate them.
    const rules = rulesOf({
      tasks: [task({ id: 't-review-compliance', title: 'Review Compliance with Requirements', source_evidence: ['b1', 'b2', 'b3'] })],
      source_blocks: SIX_REQS,
    });
    expect(rules).not.toContain('BUYER_SIDE_TASK');
  });

  it('stays SILENT on "Compile Proposal Document" — the noun is there, the verb is ours', () => {
    // The other direction, from the same run: a counterparty noun in a task that is plainly ours.
    const rules = rulesOf({
      tasks: [task({ id: 't-compile-proposal', title: 'Compile Proposal Document', source_evidence: ['b1'] })],
      source_blocks: SIX_REQS,
    });
    expect(rules).not.toContain('BUYER_SIDE_TASK');
  });

  it('still flags "Review Proposals", so the fix narrowed the rule without disarming it', () => {
    const rules = rulesOf({
      tasks: [task({ id: 't-review-proposals', title: 'Review Proposals', source_evidence: ['b1'] })],
      source_blocks: SIX_REQS,
    });
    expect(rules).toContain('BUYER_SIDE_TASK');
  });

  it('names the object in the finding, so the reader can judge the call', () => {
    const findings = evaluatePerspective({
      tasks: [task({ id: 't-x', title: 'Evaluate the bids', source_evidence: ['b1'] })],
      source_blocks: SIX_REQS,
    });
    expect(findings[0].detail).toContain('"bids"');
  });
});

describe('the object set and its fixtures cannot drift apart', () => {
  it('fires on EVERY counterparty noun in the published set', () => {
    for (const noun of COUNTERPARTY_OBJECTS) {
      const rules = rulesOf({
        tasks: [task({ id: `t-${noun}`, title: `Review the ${noun}`, source_evidence: ['b1'] })],
        source_blocks: SIX_REQS,
      });
      expect(rules).toContain('BUYER_SIDE_TASK');
    }
  });

  it('excludes "response", because our own submission is called that', () => {
    expect(COUNTERPARTY_OBJECTS as readonly string[]).not.toContain('response');
    const rules = rulesOf({
      tasks: [task({ id: 't-x', title: 'Review the response', source_evidence: ['b1'] })],
      source_blocks: SIX_REQS,
    });
    expect(rules).not.toContain('BUYER_SIDE_TASK');
  });

  it('shares no word with the verb set, so no title can satisfy both conditions with one word', () => {
    // The two conditions are only independent while the sets are disjoint. The implementation
    // looks for the object AFTER the leading word so that it stays correct if they ever overlap,
    // but that guard cannot be exercised today — and a test written against an impossible input
    // passes for the wrong reason. This pins the property the guard depends on instead.
    const overlap = (COUNTERPARTY_OBJECTS as readonly string[])
      .filter((n) => (BUYER_SIDE_VERBS as readonly string[]).includes(n));
    expect(overlap).toEqual([]);
  });
});

describe('the verb set and its fixtures cannot drift apart', () => {
  it('fires on EVERY verb in the published set', () => {
    // Adding a verb without a fixture, or shipping a verb the check cannot act on, fails here.
    for (const verb of BUYER_SIDE_VERBS) {
      const rules = rulesOf({
        tasks: [task({ id: `t-${verb}`, title: `${verb} the submissions`, source_evidence: ['b1'] })],
        source_blocks: SIX_REQS,
      });
      expect(rules).toContain('BUYER_SIDE_TASK');
    }
  });

  it('includes the verb whose omission would have hidden a real failure', () => {
    // Pinned on its own, because this is the specific mistake that was caught in review.
    expect(BUYER_SIDE_VERBS).toContain('review');
  });

  it('matches the leading verb only, not a verb buried mid-title', () => {
    // "Prepare the compliance review" is our work. A substring match would flag it.
    const rules = rulesOf({
      tasks: [task({ id: 't-x', title: 'Prepare the compliance review', source_evidence: ['b1'] })],
      source_blocks: SIX_REQS,
    });
    expect(rules).not.toContain('BUYER_SIDE_TASK');
  });
});

describe('CITATION_BUCKET, with the boundary pinned', () => {
  it('fires on the real 5 Nov shape: 23 of 36', () => {
    const blocks = Array.from({ length: 36 }, (_, i) => block(`r${i}`));
    const findings = evaluatePerspective({
      tasks: [task({
        id: 't-assess-requirements',
        title: 'Assess requirements',
        source_evidence: blocks.slice(0, 23).map((b) => b.id),
      })],
      source_blocks: blocks,
    });
    expect(findings.map((f) => f.rule)).toContain('CITATION_BUCKET');
    expect(findings[0].detail).toContain('23 of 36');
    expect(findings[0].detail).toContain('64%');
  });

  it('is SILENT when the same 36 are spread across eight tasks', () => {
    const blocks = Array.from({ length: 36 }, (_, i) => block(`r${i}`));
    const tasks = Array.from({ length: 8 }, (_, i) => task({
      id: `t${i}`,
      title: `Produce deliverable ${i}`,
      source_evidence: blocks.slice(i * 4, i * 4 + 4).map((b) => b.id),
    }));
    expect(rulesOf({ tasks, source_blocks: blocks })).not.toContain('CITATION_BUCKET');
  });

  // The boundary case, which CLAUDE.md requires and which a "fires on 64%, silent on 12%" pair
  // would skip entirely. The rule is a strict `>`, so exactly at the threshold is silent.
  it('is silent AT the threshold and fires just over it', () => {
    const blocks = Array.from({ length: 10 }, (_, i) => block(`r${i}`));
    const citing = (n: number) => rulesOf({
      tasks: [task({ id: 't-x', title: 'Assess requirements', source_evidence: blocks.slice(0, n).map((b) => b.id) })],
      source_blocks: blocks,
    });
    expect(CITATION_BUCKET_SHARE).toBe(0.4);
    expect(citing(4)).not.toContain('CITATION_BUCKET');  // exactly 40%
    expect(citing(5)).toContain('CITATION_BUCKET');      // 50%
  });

  it('does not divide by zero when there are no requirement blocks', () => {
    const rules = rulesOf({
      tasks: [task({ id: 't-x', title: 'Assess requirements', source_evidence: ['ctx1'] })],
      source_blocks: [block('ctx1', 'context')],
    });
    expect(rules).not.toContain('CITATION_BUCKET');
  });
});

describe('wired into the gate as a WARNING, not an error', () => {
  /**
   * A COMPLETE project, built field by field rather than cast into shape.
   *
   * The first draft of this fixture was `{ tasks, source_blocks } as unknown as FactoryProject`,
   * and `factoryValidate` threw on `project.processes.map` before reaching the perspective
   * check. The cast did not make the fixture valid, it only moved the failure from the type
   * checker to runtime — which is the same false-confidence shape as everything else this
   * session has been about. So: no cast, and the gate gets a project it can actually validate.
   */
  const project = (): FactoryProject => ({
    delivery_project_id: 'dp-1',
    tracks: [],
    source_blocks: SIX_REQS,
    requirements: [],
    processes: [{
      id: 'PROC-1',
      business_outcome: 'A responsive proposal is delivered on time',
      success_criterion: 'Submitted before the deadline',
      trigger: 'Solicitation published',
      inputs: [], outputs: [], decision_branches: [],
      future_owner_role_id: 'role-lead',
      exceptions: [],
    }],
    tasks: [task({ id: 't-receive-proposals', title: 'Receive Proposals', source_evidence: ['b1'] })],
    roles: [{ id: 'role-lead', name: 'Proposal lead', definition: 'Owns the response' }],
    assignments: [{
      id: 'as-1', task_id: 't-receive-proposals', role_id: 'role-lead',
      responsibility: 'PERFORMER', executor: { type: 'person', id: 'role-lead' },
      minutes: null, basis: 'UNKNOWN', evidence_note: null,
    }],
    transitions: [],
    allocation: [{
      task_id: 't-receive-proposals', execution_class: 'human',
      rationale: 'a person submits the proposal', accountable_role_id: 'role-lead',
    }],
    role_map: [],
  });

  it('reports the finding through factoryValidate', () => {
    const codes = factoryValidate(project()).map((i) => i.code);
    expect(codes).toContain('PERSPECTIVE_BUYER_SIDE_TASK');
  });

  it('does NOT make the project fail the gate', () => {
    // A warning that fails the gate is an error wearing a warning's label. Every decomposition
    // stored before today was generated under the old prompt; promoting this to an error would
    // retroactively un-approve the existing corpus.
    const errorCodes = factoryErrors(project()).map((i) => i.code);
    expect(errorCodes).not.toContain('PERSPECTIVE_BUYER_SIDE_TASK');
    expect(errorCodes).not.toContain('PERSPECTIVE_CITATION_BUCKET');
  });

  it('attributes the warning to the offending task', () => {
    // `stepId` is what ValidationIssue calls it. The first draft asserted `issue?.ref`, which
    // does not exist on the type: it read as `undefined` and the test failed for a reason that
    // had nothing to do with the code under test. ts-jest is transpile-only, so it compiled a
    // property access the type checker would have rejected — the reason green jest is never
    // evidence about types in this repo.
    const issue = factoryValidate(project()).find((i) => i.code === 'PERSPECTIVE_BUYER_SIDE_TASK');
    expect(issue?.stepId).toBe('t-receive-proposals');
  });
});
