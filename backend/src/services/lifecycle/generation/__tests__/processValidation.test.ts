/**
 * P3-T2 — the two gaps `factoryValidate` leaves open, and proof the fourteen it already closes
 * still fire through this layer.
 *
 * Fixture helpers follow `factory/__tests__/factoryValidate.test.ts` deliberately: same `task()`,
 * `asg()`, `base()` shape. They are re-declared rather than imported because that file does not
 * export them, and exporting them would mean editing an existing file — which this task does not do.
 *
 * Every rejection case is paired with a PASSING counterpart. A rule that only ever rejects is
 * indistinguishable from a rule that is simply always on.
 */

import { validateProcess, processErrors, cyclingReworkEdges, tasksThatCannotTerminate, PROCESS_VALIDATION_CODES } from '../processValidation';
import { factoryValidate, factoryErrors } from '../../../factory/factoryValidate';
import type { FactoryProject, FactoryTask, Assignment } from '../../../factory/contracts/factoryContract';

const task = (over: Partial<FactoryTask> & Pick<FactoryTask, 'id' | 'kind'>): FactoryTask => ({
  process_id: 'proc-1', title: 't', description: 'd', stage_id: 's', source_evidence: [],
  required_skills: [], judgment_level: 'low', decision_authority: 'none', data_sensitivity: 'internal',
  interaction_pattern: null, frequency: null, effort_minutes: null, effort_basis: 'UNKNOWN',
  confidence: null, method: 'EXPLICIT', ...over,
});

const asg = (over: Partial<Assignment> & Pick<Assignment, 'id' | 'task_id' | 'role_id' | 'responsibility'>): Assignment => ({
  executor: { type: 'person', id: 'p-1' }, minutes: null, basis: 'UNKNOWN', evidence_note: null, ...over,
});

/** START → t-1 → DECISION → END, with a labelled rework branch back to t-1. */
function base(): FactoryProject {
  return {
    delivery_project_id: 'dp-1',
    tracks: [{ id: 'tr-1', delivery_project_id: 'dp-1', track_type: 'solution_build', status: 'active', owner_identity_id: null, solution_student_project_id: 'sp-1' }],
    source_blocks: [{ id: 'blk-1', locator: 'L.1', text: 'the requirement', kind: 'requirement' }],
    requirements: [],
    processes: [{ id: 'proc-1', business_outcome: 'o', success_criterion: 'c', trigger: 't', inputs: [], outputs: [], decision_branches: [], future_owner_role_id: 'r-1', exceptions: [] }],
    tasks: [
      task({ id: 't-start', kind: 'START', stage_id: 's0' }),
      task({ id: 't-1', kind: 'TASK', stage_id: 's1', source_evidence: ['blk-1'] }),
      task({ id: 't-dec', kind: 'DECISION', stage_id: 's2' }),
      task({ id: 't-end', kind: 'END', stage_id: 's3' }),
    ],
    roles: [{ id: 'r-1', name: 'Analyst', definition: 'reviews' }],
    assignments: [
      asg({ id: 'a-1', task_id: 't-1', role_id: 'r-1', responsibility: 'PERFORMER' }),
      asg({ id: 'a-2', task_id: 't-dec', role_id: 'r-1', responsibility: 'PERFORMER' }),
    ],
    transitions: [
      { id: 'e-1', from_task_id: 't-start', to_task_id: 't-1', condition: null, is_rework: false },
      { id: 'e-2', from_task_id: 't-1', to_task_id: 't-dec', condition: null, is_rework: false },
      { id: 'e-3', from_task_id: 't-dec', to_task_id: 't-end', condition: 'approved', is_rework: false },
      // The rework branch: legal under LOOP precisely because it is flagged.
      { id: 'e-rework', from_task_id: 't-dec', to_task_id: 't-1', condition: 'rejected', is_rework: true },
    ],
    allocation: [], role_map: [],
  };
}

const codes = (p: FactoryProject, bounds = {}) => validateProcess(p, bounds).map((i) => i.code);

describe('the premise: this fixture is CLEAN under factoryValidate yet loops forever', () => {
  it('factoryValidate finds nothing wrong with an unbounded rework cycle', () => {
    // If this ever fails, the gap this module exists for has been closed upstream and this
    // module should be reconsidered rather than kept out of habit.
    expect(factoryErrors(base())).toEqual([]);
  });

  it('and the cycle is genuinely a cycle, not a mislabelled forward edge', () => {
    expect(cyclingReworkEdges(base()).map((e) => e.id)).toEqual(['e-rework']);
  });

  it('adds exactly two codes, neither colliding with factoryValidate’s fourteen', () => {
    const existing = new Set(
      // Drive the full rule set out of the validator rather than hardcoding fourteen strings.
      factoryValidate(brokenEveryWhichWay()).map((i) => i.code),
    );
    for (const c of PROCESS_VALIDATION_CODES) expect(existing.has(c)).toBe(false);
    expect([...PROCESS_VALIDATION_CODES]).toEqual(['REWORK_BOUND', 'TERMINATION']);
  });
});

/** A project tripping many rules at once, used only to harvest the upstream code vocabulary. */
function brokenEveryWhichWay(): FactoryProject {
  const p = base();
  p.tasks.push(task({ id: 't-orphan', kind: 'TASK', stage_id: 's9' }));
  p.source_blocks.push({ id: 'blk-2', locator: 'L.2', text: '?', kind: 'unresolved' });
  p.transitions.push({ id: 'e-bad', from_task_id: 'nope', to_task_id: 't-1', condition: null, is_rework: false });
  return p;
}

describe('REWORK_BOUND — the gap LOOP leaves open by design', () => {
  it('rejects a cycling rework edge with no declared bound, naming the edge and the task', () => {
    const issues = validateProcess(base(), {});
    const rework = issues.filter((i) => i.code === 'REWORK_BOUND');

    expect(rework).toHaveLength(1);
    expect(rework[0].message).toContain('e-rework');
    // Asserted on the FIELD, not by substring-matching the message.
    expect(rework[0].stepId).toBe('t-dec');
    expect(rework[0].severity).toBe('error');
  });

  it('PASSING COUNTERPART: a declared finite bound is accepted', () => {
    expect(processErrors(base(), { 'e-rework': 3 })).toEqual([]);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['infinite', Number.POSITIVE_INFINITY],
    ['NaN', Number.NaN],
  ])('rejects a %s bound', (_label, value) => {
    const issues = validateProcess(base(), { 'e-rework': value as number });
    expect(issues.filter((i) => i.code === 'REWORK_BOUND')).toHaveLength(1);
  });

  it('accepts a bound of exactly 1 — one retry is bounded', () => {
    expect(processErrors(base(), { 'e-rework': 1 })).toEqual([]);
  });

  it('PASSING COUNTERPART: a rework edge that closes no cycle needs no bound', () => {
    const p = base();
    // Flagged as rework but pointing forward: its destination cannot get back to its origin.
    p.transitions = p.transitions.filter((e) => e.id !== 'e-rework');
    p.transitions.push({ id: 'e-fwd-rework', from_task_id: 't-dec', to_task_id: 't-end', condition: 'rejected', is_rework: true });

    expect(cyclingReworkEdges(p)).toEqual([]);
    expect(codes(p)).not.toContain('REWORK_BOUND');
  });

  it('a bound declared for an edge that is not cycling is simply unused, not an error', () => {
    const p = base();
    p.transitions = p.transitions.filter((e) => e.id !== 'e-rework');
    p.transitions.push({ id: 'e-3b', from_task_id: 't-dec', to_task_id: 't-end', condition: 'rejected', is_rework: false });
    expect(processErrors(p, { 'some-other-edge': 5 })).toEqual([]);
  });

  it('reports every unbounded cycle, not just the first', () => {
    const p = base();
    p.tasks.push(task({ id: 't-2', kind: 'TASK', stage_id: 's4', source_evidence: ['blk-1'] }));
    p.assignments.push(asg({ id: 'a-3', task_id: 't-2', role_id: 'r-1', responsibility: 'PERFORMER' }));
    p.transitions.push({ id: 'e-4', from_task_id: 't-1', to_task_id: 't-2', condition: null, is_rework: false });
    p.transitions.push({ id: 'e-rework-2', from_task_id: 't-2', to_task_id: 't-1', condition: null, is_rework: true });
    // t-1 now has two outgoing edges, so it must be a DECISION to satisfy BRANCH_KIND.
    p.tasks.find((t) => t.id === 't-1')!.kind = 'DECISION';
    p.transitions.find((e) => e.id === 'e-2')!.condition = 'to-decision';
    p.transitions.find((e) => e.id === 'e-4')!.condition = 'to-two';

    const rework = validateProcess(p, {}).filter((i) => i.code === 'REWORK_BOUND');
    expect(rework.map((i) => i.message.match(/edge (\S+)/)?.[1]).sort())
      .toEqual(['e-rework', 'e-rework-2']);
  });

  it('a bound of 0 explains WHY it is not a bound', () => {
    const issues = validateProcess(base(), { 'e-rework': 0 });
    expect(issues.find((i) => i.code === 'REWORK_BOUND')!.message)
      .toContain('not "bounded"');
  });
});

describe('TERMINATION — reachable FROM start does not mean it can reach an END', () => {
  /** A dead end: reachable from START, no path onward. */
  function withDeadEnd(): FactoryProject {
    const p = base();
    p.tasks.push(task({ id: 't-dead', kind: 'TASK', stage_id: 's5', source_evidence: ['blk-1'] }));
    p.assignments.push(asg({ id: 'a-dead', task_id: 't-dead', role_id: 'r-1', responsibility: 'PERFORMER' }));
    p.transitions.push({ id: 'e-dead', from_task_id: 't-dec', to_task_id: 't-dead', condition: 'escalate', is_rework: false });
    return p;
  }

  it('the dead end passes factoryValidate cleanly — that is the point', () => {
    expect(factoryErrors(withDeadEnd())).toEqual([]);
  });

  it('rejects the task that cannot reach any END, naming it', () => {
    const issues = validateProcess(withDeadEnd(), { 'e-rework': 2 });
    const term = issues.filter((i) => i.code === 'TERMINATION');

    expect(term).toHaveLength(1);
    expect(term[0].stepId).toBe('t-dead');
    expect(term[0].message).toContain('cannot reach any END');
  });

  it('PASSING COUNTERPART: give the dead end a path out and it is accepted', () => {
    const p = withDeadEnd();
    p.transitions.push({ id: 'e-out', from_task_id: 't-dead', to_task_id: 't-end', condition: null, is_rework: false });
    expect(processErrors(p, { 'e-rework': 2 })).toEqual([]);
  });

  it('counts a backwards path as termination, because it is a real path', () => {
    const p = base();
    p.tasks.push(task({ id: 't-side', kind: 'TASK', stage_id: 's6', source_evidence: ['blk-1'] }));
    p.assignments.push(asg({ id: 'a-side', task_id: 't-side', role_id: 'r-1', responsibility: 'PERFORMER' }));
    p.transitions.push({ id: 'e-side', from_task_id: 't-dec', to_task_id: 't-side', condition: 'aside', is_rework: false });
    // t-side's only way on is a rework edge back to t-1, which can still reach t-end.
    p.transitions.push({ id: 'e-side-back', from_task_id: 't-side', to_task_id: 't-1', condition: null, is_rework: true });

    expect(tasksThatCannotTerminate(p)).toEqual([]);
  });

  it('stays SILENT when there is no END at all, so END is not buried under derived noise', () => {
    const p = base();
    p.tasks = p.tasks.filter((t) => t.kind !== 'END');
    p.transitions = p.transitions.filter((e) => e.to_task_id !== 't-end');

    expect(codes(p, { 'e-rework': 2 })).toContain('END');
    expect(codes(p, { 'e-rework': 2 })).not.toContain('TERMINATION');
  });

  it('holds START itself to the rule — a process that cannot finish is not a process', () => {
    const p = base();
    // Sever the only route to END; START is still START, and still cannot finish.
    p.transitions = p.transitions.filter((e) => e.id !== 'e-3');

    expect(tasksThatCannotTerminate(p).sort()).toEqual(['t-1', 't-dec', 't-start']);
  });
});

describe('the three rules already enforced upstream still fire THROUGH this layer', () => {
  // These assert DELEGATION, not re-implementation. A regression in factoryValidate surfaces here.
  it('DECISION — a branch with fewer than two distinct labels is rejected, and a labelled one passes', () => {
    const p = base();
    p.transitions.find((e) => e.id === 'e-3')!.condition = 'rejected'; // now both labels identical
    expect(codes(p, { 'e-rework': 2 })).toContain('DECISION');

    expect(codes(base(), { 'e-rework': 2 })).not.toContain('DECISION');
  });

  it('REACHABILITY — an orphan task is rejected, and the connected fixture passes', () => {
    const p = base();
    p.tasks.push(task({ id: 't-orphan', kind: 'TASK', stage_id: 's9', source_evidence: ['blk-1'] }));
    p.assignments.push(asg({ id: 'a-orph', task_id: 't-orphan', role_id: 'r-1', responsibility: 'PERFORMER' }));
    expect(codes(p, { 'e-rework': 2 })).toContain('REACHABILITY');

    expect(codes(base(), { 'e-rework': 2 })).not.toContain('REACHABILITY');
  });

  it('SOURCE_COVERAGE — an uncited requirement block is rejected, and a cited one passes', () => {
    const p = base();
    p.tasks.find((t) => t.id === 't-1')!.source_evidence = [];
    expect(codes(p, { 'e-rework': 2 })).toContain('SOURCE_COVERAGE');

    expect(codes(base(), { 'e-rework': 2 })).not.toContain('SOURCE_COVERAGE');
  });

  it('puts the upstream cause ABOVE this layer’s symptoms', () => {
    const p = base();
    p.tasks.find((t) => t.id === 't-1')!.source_evidence = [];
    const all = validateProcess(p, {}).map((i) => i.code);

    expect(all.indexOf('SOURCE_COVERAGE')).toBeLessThan(all.indexOf('REWORK_BOUND'));
  });
});

describe('boundaries', () => {
  it('an empty project does not throw, and defers to the upstream START/END rules', () => {
    const empty: FactoryProject = {
      delivery_project_id: 'dp-0', tracks: [], source_blocks: [], requirements: [], processes: [],
      tasks: [], roles: [], assignments: [], transitions: [], allocation: [], role_map: [],
    };
    const result = codes(empty);
    expect(result).toContain('START');
    expect(result).not.toContain('TERMINATION');
    expect(result).not.toContain('REWORK_BOUND');
  });

  it('bounds default to empty, so omitting the argument cannot accidentally pass a cycle', () => {
    expect(validateProcess(base()).some((i) => i.code === 'REWORK_BOUND')).toBe(true);
  });

  it('a self-loop flagged as rework still needs a bound', () => {
    const p = base();
    p.transitions.push({ id: 'e-self', from_task_id: 't-1', to_task_id: 't-1', condition: null, is_rework: true });
    expect(cyclingReworkEdges(p).map((e) => e.id).sort()).toEqual(['e-rework', 'e-self']);
  });

  it('does not stack-overflow on a long chain', () => {
    const p = base();
    let prev = 't-1';
    for (let n = 0; n < 5_000; n += 1) {
      const id = `t-chain-${n}`;
      p.tasks.push(task({ id, kind: 'TASK', stage_id: 'sc', source_evidence: ['blk-1'] }));
      p.transitions.push({ id: `e-chain-${n}`, from_task_id: prev, to_task_id: id, condition: `c${n}`, is_rework: false });
      prev = id;
    }
    p.transitions.push({ id: 'e-chain-end', from_task_id: prev, to_task_id: 't-end', condition: null, is_rework: false });

    expect(() => tasksThatCannotTerminate(p)).not.toThrow();
    expect(tasksThatCannotTerminate(p)).toEqual([]);
  });
});
