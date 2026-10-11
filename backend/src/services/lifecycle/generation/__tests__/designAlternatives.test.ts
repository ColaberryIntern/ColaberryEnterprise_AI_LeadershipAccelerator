/**
 * P4-T4a — the alternatives are a derivation, and the comparator is structural.
 *
 * ## The input space is a SCOPED LIST, not a quantified claim
 *
 * Amendment 1 of this run's standing rule: a claim quantified over an input space ships with a
 * seeded generator over that space, or is rewritten as a scoped list. This suite takes the second
 * option, and `INPUTS` below IS the list. Nothing here claims anything about "any process graph".
 *
 * ## Every pattern must be reached by something in that list
 *
 * Amendment 2: the positive control is per claimed position, never aggregate. `DESIGN_PATTERNS`
 * has three members, so there are three positions, and each gets its own test that names the
 * pattern. An aggregate "at least one pattern was produced" would pass with two of the three
 * dead, which is how `exception_first` would have shipped as code nothing reaches — and that is
 * not hypothetical: NO fixture in the reference corpus has a rework edge (see `reworkProject`).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DESIGN_PATTERNS,
  alternativesDifferMeaningfully,
  generateDesignAlternatives,
  type AlternativeSet,
  type DesignPatternKey,
  type DesignStructure,
} from '../designAlternatives';
import { businessTasks, validateTaskSurfaces } from '../workspaceMapping';
import type { TaskSurfaceBinding, WorkspaceRef } from '../workspaceBindingTypes';
import { MAX_VARIANTS, MIN_VARIANTS } from '../../../delivery/deliveryDesignLoop';
import { CONCEPT_VARIANTS } from '../../../delivery/designBrief';
import { manualOnlyProject } from './fixtures/manualOnly';
import { fixtureA, fixtureB, fixtureC } from './fixtures/referenceFixtures';
import type { FactoryProject } from '../../../factory/contracts/factoryContract';

/** A complete, valid workspace ref. `role` differs between the reference fixtures and D. */
function ref(role: string, over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    workspaceId: 'ws-work',
    workspaceTitle: 'Work',
    action: 'do the thing and record the outcome',
    primaryJob: 'move one case to its next state',
    intendedRoles: [role],
    records: ['case'],
    decisions: [],
    whyNotExisting: 'no existing workspace shows this case next to the rule that governs it',
    requirementIds: [],
    taskIds: ['x'],
    audience: 'internal',
    permissionViews: [{ roleId: role, visibleActions: [] }],
    deepLink: '/cases/:id',
    preservesNavigationState: true,
    ...over,
  };
}

const ws = (taskId: string, role: string, over: Partial<WorkspaceRef> = {}): TaskSurfaceBinding =>
  ({ taskId, kind: 'workspace', ref: ref(role, { workspaceId: `ws-${taskId}`, workspaceTitle: `Surface for ${taskId}`, taskIds: [taskId], ...over }) });

const headless = (taskId: string): TaskSurfaceBinding =>
  ({ taskId, kind: 'headless', reason: 'scheduled_ingestion' });

/**
 * Fixture D plus a rework edge, which the reference corpus does not have anywhere.
 *
 * Measured, not assumed: across `referenceFixtures.ts` and `manualOnly.ts` all eight transitions
 * carry `is_rework: false` and every `ProcessRecord` has `exceptions: []`. So without this input
 * `exception_first` is unreachable by the whole corpus. The gap is recorded in the carried-forward
 * register against Fixture B, whose own documented coverage says its appeals path should be "a
 * real exception/rework edge in the transition graph".
 */
function reworkProject(): FactoryProject {
  const p = manualOnlyProject();
  return {
    ...p,
    transitions: [
      ...p.transitions,
      { id: 'e-rework', from_task_id: 't-review', to_task_id: 't-intake', condition: 'more information needed', is_rework: true },
    ],
  };
}

/**
 * Fixture D plus a headless re-check that kicks a contract back to intake.
 *
 * This input exists because without it `why: 'structurally_identical'` is a DEAD BRANCH: across
 * the other inputs every absent pattern is absent for `inapplicable`, so the deduplication never
 * fires and the code reporting it is unreachable. Found by asking which exclusion reasons the
 * list actually produces, not by reading the module.
 *
 * The shape is ordinary: a scheduled re-check (headless, so it holds no surface) returns a case
 * to the intake desk. Because the rework SOURCE is headless, the rework TARGET is still the first
 * task a human touches — so `queue_detail` and `exception_first` put the same tasks at the same
 * depth, and the honest answer is one option reported once rather than two that differ in name.
 */
function reworkFromHeadlessProject(): FactoryProject {
  const p = manualOnlyProject();
  return {
    ...p,
    tasks: [...p.tasks, { ...p.tasks.find((t) => t.id === 't-intake')!, id: 't-recheck', title: 'Re-check the contract value against the current threshold' }],
    transitions: [
      ...p.transitions,
      { id: 'e-recheck', from_task_id: 't-review', to_task_id: 't-recheck', condition: 'threshold changed', is_rework: false },
      { id: 'e-reopen', from_task_id: 't-recheck', to_task_id: 't-intake', condition: null, is_rework: true },
    ],
  };
}

interface Input {
  name: string;
  project: FactoryProject;
  bindings: TaskSurfaceBinding[];
  /** every binding's `intendedRoles` must name a role the project declares. */
  role: string;
}

/** THE SCOPED INPUT LIST. Every claim in this suite is about the inputs below and no others. */
const INPUTS: ReadonlyArray<Input> = [
  { name: 'A proposal', project: fixtureA.project(), role: 'r-1', bindings: [ws('t-draft', 'r-1'), ws('t-review', 'r-1')] },
  { name: 'B admissions', project: fixtureB.project(), role: 'r-1', bindings: [ws('t-draft', 'r-1'), ws('t-review', 'r-1')] },
  { name: 'C service', project: fixtureC.project(), role: 'r-1', bindings: [ws('t-draft', 'r-1'), ws('t-review', 'r-1')] },
  { name: 'D legal, both tasks on a surface', project: manualOnlyProject(), role: 'role-counsel', bindings: [ws('t-intake', 'role-counsel'), ws('t-review', 'role-counsel')] },
  { name: 'D legal, intake ingested headlessly', project: manualOnlyProject(), role: 'role-counsel', bindings: [headless('t-intake'), ws('t-review', 'role-counsel')] },
  { name: 'D legal plus a rework edge', project: reworkProject(), role: 'role-counsel', bindings: [ws('t-intake', 'role-counsel'), ws('t-review', 'role-counsel')] },
  { name: 'D legal with a headless re-check reopening intake', project: reworkFromHeadlessProject(), role: 'role-counsel', bindings: [ws('t-intake', 'role-counsel'), ws('t-review', 'role-counsel'), headless('t-recheck')] },
];

const setFor = (i: Input): AlternativeSet => generateDesignAlternatives(i.project, i.bindings);
const patternsOf = (s: AlternativeSet) => s.alternatives.map((a) => a.pattern);

describe('the seeded exemplars are designs P4-T1 accepts', () => {
  // Amendment 2: where reaching a position needs a valid structure, seed a VALID exemplar.
  // Alternatives derived from bindings the workspace mapping would refuse would be derived from
  // a design that cannot exist, and every structural claim below would be about nothing.
  it.each(INPUTS.map((i) => [i.name, i] as const))('%s: validateTaskSurfaces returns no issue', (_n, i) => {
    expect(validateTaskSurfaces(i.project, i.bindings)).toEqual([]);
  });
});

describe('PER-PATTERN REACH: each of the three positions is produced by some input', () => {
  const reachedBy = (p: DesignPatternKey) => INPUTS.filter((i) => patternsOf(setFor(i)).includes(p)).map((i) => i.name);

  it.each(DESIGN_PATTERNS.map((p) => [p] as const))('%s is reached', (pattern) => {
    expect(reachedBy(pattern)).not.toEqual([]);
  });

  it('and every pattern NOT produced for an input says why, per pattern', () => {
    // Declared, not inferred from the count: "this pattern cannot apply here" and "this pattern
    // collapsed onto another" are different facts, and a length cannot tell them apart.
    for (const i of INPUTS) {
      const s = setFor(i);
      const accounted = [...patternsOf(s), ...s.excluded.map((e) => e.pattern)].sort();
      expect(accounted).toEqual([...DESIGN_PATTERNS].sort());
      for (const e of s.excluded) expect(e.detail.length).toBeGreaterThan(20);
    }
  });

  it('exception_first is reached ONLY by the rework input, which no reference fixture supplies', () => {
    expect(reachedBy('exception_first')).toEqual(['D legal plus a rework edge']);
  });

  it.each([['inapplicable'], ['structurally_identical']] as const)('the exclusion reason %s is reached', (why) => {
    // Per reason, not aggregate. `structurally_identical` was a dead branch until the
    // exception-at-entry input was added, and an aggregate check could not have shown that.
    const reached = INPUTS.filter((i) => setFor(i).excluded.some((e) => e.why === why)).map((i) => i.name);
    expect(reached).not.toEqual([]);
  });

  it('the dedup reports which pattern it collapsed onto, not just that it collapsed', () => {
    const s = setFor(INPUTS[6]);
    expect(patternsOf(s)).toEqual(['queue_detail', 'case_workspace']);
    expect(s.excluded).toEqual([
      { pattern: 'exception_first', why: 'structurally_identical', detail: expect.stringContaining("the same shape as 'queue_detail'") },
    ]);
  });
});

describe('the alternatives differ in navigation structure, asserted structurally', () => {
  it('Fixture A yields a queue/detail shape and a one-surface shape, differing in depth', () => {
    const s = setFor(INPUTS[0]);
    expect(patternsOf(s)).toEqual(['queue_detail', 'case_workspace']);

    const [queue, single] = s.alternatives;
    // The structural difference, named: the review task is one hop in from the entry in one
    // shape and on the landing surface in the other.
    const depthOf = (a: typeof queue, taskId: string) => a.structure.slots.find((x) => x.taskIds.includes(taskId))!.depth;
    expect(depthOf(queue, 't-draft')).toBe(0);
    expect(depthOf(queue, 't-review')).toBe(1);
    expect(depthOf(single, 't-draft')).toBe(0);
    expect(depthOf(single, 't-review')).toBe(0);
    expect(alternativesDifferMeaningfully(queue.structure, single.structure)).toBe(true);
  });

  it('every slot traces to one of the project own business tasks, and covers all bound ones', () => {
    for (const i of INPUTS) {
      const own = new Set(businessTasks(i.project).map((t) => t.id));
      const bound = new Set(i.bindings.filter((b) => b.kind === 'workspace').map((b) => b.taskId));
      for (const a of setFor(i).alternatives) {
        const inStructure = a.structure.slots.flatMap((s) => s.taskIds);
        for (const id of inStructure) expect(own.has(id)).toBe(true);
        expect(new Set(inStructure)).toEqual(bound);
      }
    }
  });

  it('carries the binding domain content verbatim and invents no screen name', () => {
    const a = setFor(INPUTS[3]).alternatives[0];
    expect(a.surfaces.map((s) => [s.taskId, s.workspaceId, s.workspaceTitle])).toEqual([
      ['t-intake', 'ws-t-intake', 'Surface for t-intake'],
      ['t-review', 'ws-t-review', 'Surface for t-review'],
    ]);
  });

  it('is deterministic: no model call, so the same input yields the identical set twice', () => {
    for (const i of INPUTS) {
      expect(JSON.stringify(generateDesignAlternatives(i.project, i.bindings)))
        .toBe(JSON.stringify(generateDesignAlternatives(i.project, i.bindings)));
    }
  });
});

describe('THE COMPARATOR, tested directly rather than through the generator', () => {
  // A comparator only ever checked against structures the same module generated proves the two
  // agree, not that either is right. These structures are written by hand for that reason.
  const base = (): DesignStructure => ({
    pattern: 'queue_detail',
    slots: [
      { slotId: 'queue', depth: 0, taskIds: ['t-a'], workspaceIds: ['ws-1'] },
      { slotId: 'detail', depth: 1, taskIds: ['t-b'], workspaceIds: ['ws-2'] },
    ],
    navigation: [{ fromSlotId: 'queue', toSlotId: 'detail' }],
  });

  it('POSITIVE CONTROL: two structures differing only in labels are NOT meaningfully different', () => {
    // The renamed-dashboard failure. Every label changed, nothing structural moved.
    const renamed: DesignStructure = {
      pattern: 'case_workspace',
      slots: [
        { slotId: 'command_center', depth: 0, taskIds: ['t-a'], workspaceIds: ['ws-COMMAND-CENTER'] },
        { slotId: 'drill_down', depth: 1, taskIds: ['t-b'], workspaceIds: ['ws-DETAIL-VIEW'] },
      ],
      navigation: [{ fromSlotId: 'command_center', toSlotId: 'drill_down' }],
    };
    expect(alternativesDifferMeaningfully(base(), renamed)).toBe(false);
  });

  it('a different PARTITION of the same tasks is meaningfully different', () => {
    const merged: DesignStructure = {
      pattern: 'case_workspace',
      slots: [{ slotId: 'case', depth: 0, taskIds: ['t-a', 't-b'], workspaceIds: ['ws-1'] }],
      navigation: [],
    };
    expect(alternativesDifferMeaningfully(base(), merged)).toBe(true);
  });

  it('a different DEPTH for the same partition is meaningfully different', () => {
    const flattened = base();
    const deeper: DesignStructure = {
      ...flattened,
      slots: flattened.slots.map((s) => ({ ...s, depth: 0 })),
    };
    expect(alternativesDifferMeaningfully(flattened, deeper)).toBe(true);
  });

  it('and a structure never differs from itself', () => {
    expect(alternativesDifferMeaningfully(base(), base())).toBe(false);
  });
});

describe('the collapse is declared, which is what makes one structure an answer', () => {
  it('D with a headless intake yields exactly one structure, and names both exclusions', () => {
    const s = setFor(INPUTS[4]);
    expect(patternsOf(s)).toEqual(['case_workspace']);
    expect(s.excluded).toEqual([
      { pattern: 'queue_detail', why: 'inapplicable', detail: expect.stringContaining('nothing for a queue to route into') },
      { pattern: 'exception_first', why: 'inapplicable', detail: expect.stringContaining('rework transition') },
    ]);
  });

  it('PASSING COUNTERPART: D with both tasks on surfaces is NOT the one-structure case', () => {
    // Without this, a generator that always collapsed to one would pass the test above. The
    // phase-4 plan predicted Fixture D itself was the degenerate case; measured, it is not —
    // the degenerate case is a property of the BINDINGS, not of the fixture.
    expect(setFor(INPUTS[3]).alternatives).toHaveLength(2);
  });

  it('a project with every task headless yields ZERO structures, which is a different fact', () => {
    const s = generateDesignAlternatives(manualOnlyProject(), [headless('t-intake'), headless('t-review')]);
    expect(s.alternatives).toEqual([]);
    expect(s.excluded.map((e) => e.pattern).sort()).toEqual([...DESIGN_PATTERNS].sort());
  });

  it('a rework cycle removes the queue entry point and says so, rather than reporting no tasks', () => {
    const s = setFor(INPUTS[5]);
    expect(patternsOf(s)).toEqual(['case_workspace', 'exception_first']);
    expect(s.excluded).toEqual([
      { pattern: 'queue_detail', why: 'inapplicable', detail: expect.stringContaining('no entry point for a queue') },
    ]);
  });
});

describe('the bounds are the existing ones, and the counts in the prose are asserted', () => {
  it('there are three patterns, within the existing variant ceiling', () => {
    // Amendment 3: no apparatus number appears in prose unless a test asserts it. The module
    // header and the register both say "three patterns" and "a ceiling of four".
    expect(DESIGN_PATTERNS).toHaveLength(3);
    expect(DESIGN_PATTERNS.length).toBeLessThanOrEqual(MAX_VARIANTS);
    expect(MIN_VARIANTS).toBe(2);
    expect(MAX_VARIANTS).toBe(4);
  });

  it('no input in the list exceeds the ceiling', () => {
    for (const i of INPUTS) expect(setFor(i).alternatives.length).toBeLessThanOrEqual(MAX_VARIANTS);
  });

  it('D1 CONTROL: the generated set is not the prospect-brief concept triple', () => {
    const concepts = CONCEPT_VARIANTS.map((c) => c.key as string).sort();
    for (const i of INPUTS) {
      expect(patternsOf(setFor(i)).map(String).sort()).not.toEqual(concepts);
    }
    // And the design-brief triple is genuinely a different set, so the control can fail.
    expect(concepts).toEqual(['command_center', 'executive', 'operational']);
  });
});

describe('malformed input is refused rather than thrown through', () => {
  it.each([
    ['bindings null', null],
    ['bindings a string', 'alt-queue_detail'],
    ['bindings an object', { kind: 'workspace' }],
  ] as const)('%s yields an empty set, never a throw', (_n, v) => {
    expect(() => generateDesignAlternatives(manualOnlyProject(), v as never)).not.toThrow();
    expect(generateDesignAlternatives(manualOnlyProject(), v as never).alternatives).toEqual([]);
  });

  it('a binding naming a task the project does not have contributes no slot', () => {
    const s = generateDesignAlternatives(manualOnlyProject(), [ws('t-nonexistent', 'role-counsel'), ws('t-review', 'role-counsel')]);
    expect(s.alternatives.flatMap((a) => a.structure.slots.flatMap((x) => x.taskIds))).toEqual(['t-review']);
  });

  it('a workspace binding with a null ref is skipped rather than dereferenced', () => {
    const bad = { taskId: 't-intake', kind: 'workspace', ref: null } as never;
    expect(() => generateDesignAlternatives(manualOnlyProject(), [bad, ws('t-review', 'role-counsel')])).not.toThrow();
  });
});

describe('AMENDMENT 4: every operand of the binding filter is isolated', () => {
  // The shipped guard is `b && b.kind === 'workspace' && ids.has(b.taskId) && b.ref` — four
  // operands. An earlier version of THIS COMMENT quoted a fifth, `typeof b.taskId ===
  // 'string'`, which the adjacent prose said had been removed: the comment described the
  // draft rather than the code. `b.kind` and `b.ref` already had controls; `b` itself and
  // `ids.has` get them here.
  const bound = (bs: unknown[]) => generateDesignAlternatives(manualOnlyProject(), bs as never)
    .alternatives.flatMap((a) => a.structure.slots.flatMap((x) => x.taskIds));

  it('a NULL element is skipped while every other binding is kept', () => {
    expect(bound([null, ws('t-review', 'role-counsel')])).toEqual(['t-review']);
  });

  it('a binding whose taskId is not a string is skipped', () => {
    // Behaviour, not operand isolation: `ids.has` rejects it. Pinned because a malformed
    // binding reaching a slot would put a task in a design the process does not have.
    const bad = { taskId: 7, kind: 'workspace', ref: ref('role-counsel') };
    expect(bound([bad, ws('t-review', 'role-counsel')])).toEqual(['t-review']);
  });

  it('PASSING COUNTERPART: two well-formed bindings are both kept', () => {
    expect([...new Set(bound([ws('t-intake', 'role-counsel'), ws('t-review', 'role-counsel')]))].sort())
      .toEqual(['t-intake', 't-review']);
  });

  it('a rework edge is an exception only where is_rework is TRUE', () => {
    // Isolates `e.is_rework === true`: same graph, same binding, flag flipped.
    const p = reworkProject();
    const flat = {
      ...p,
      transitions: p.transitions.map((t) => ({ ...t, is_rework: false })),
    };
    const bs = [ws('t-intake', 'role-counsel'), ws('t-review', 'role-counsel')];
    expect(generateDesignAlternatives(p, bs).alternatives.map((a) => a.pattern))
      .toContain('exception_first');
    expect(generateDesignAlternatives(flat, bs).alternatives.map((a) => a.pattern))
      .not.toContain('exception_first');
  });
});

describe('the corpus claim this suite rests on is ASSERTED, not stated', () => {
  // Amendment 3: no apparatus number in prose unless a test asserts it. Three documents and
  // this file say the reference corpus has no rework edge, which is why this suite supplies
  // its own. That is a present-tense claim about two other files, so it is checked here.
  //
  // WHEN THIS FAILS, it is probably good news: it means Fixture B finally has the
  // exception/rework edge its own documented coverage in `reference-fixtures.md` promises.
  // Then update this test, the register entry, and the "reached ONLY by the rework input"
  // assertion above — all three describe the same fact.
  const FIXTURES = ['referenceFixtures.ts', 'manualOnly.ts'] as const;

  it('no transition in either fixture file is flagged is_rework', () => {
    let transitions = 0;
    let rework = 0;
    for (const f of FIXTURES) {
      const src = readFileSync(join(__dirname, 'fixtures', f), 'utf8');
      transitions += [...src.matchAll(/is_rework:\s*(true|false)/g)].length;
      rework += [...src.matchAll(/is_rework:\s*true/g)].length;
    }
    // The COUNT is asserted, not just the property. Three documents and this file say "all
    // eight transitions", and `toBeGreaterThan(0)` left that number unpinned: a ninth
    // non-rework edge would stale all three while the suite stayed green, which is exactly
    // what Amendment 3 exists to catch. Asserting 8 also keeps the extraction control — a
    // regex matching nothing yields 0, which is not 8.
    expect(transitions).toBe(8);
    expect(rework).toBe(0);
  });

  it('and no ProcessRecord in either fixture declares an exception', () => {
    for (const f of FIXTURES) {
      const src = readFileSync(join(__dirname, 'fixtures', f), 'utf8');
      const decls = [...src.matchAll(/exceptions:\s*\[([^\]]*)\]/g)].map((m) => m[1].trim());
      expect(decls.length).toBeGreaterThan(0);
      expect(decls.every((d) => d === '')).toBe(true);
    }
  });
});
