/**
 * L9.5 — the all-workspace answer.
 *
 * The ticket states the hole precisely: *"The schema makes the field mandatory; only the prompt
 * explains what an honest answer is. Gutting that paragraph leaves every test green. A model could
 * satisfy the schema by labelling everything a workspace, which would make the rule pass on
 * exactly the plans it was built to catch."*
 *
 * `workspaceMapping.ts` already caught the OPPOSITE degenerate answer — all-headless, via
 * `SURFACE_NO_HUMAN_PATH`. It had no detector for all-workspace, which is the cheaper lie, because
 * `workspace` is always available.
 *
 * ## Both directions, and the negative controls are the point
 *
 * The signal requires TWO conditions together: every `PERFORMER` is an agent, AND
 * `judgment_level === 'none'`. Either alone is a legitimate plan, so each is asserted to produce
 * NO warning on its own. A detector that fired on one condition would flag honest designs, and
 * that is the failure mode this suite exists to prevent — not the missed detection.
 */

import {
  backgroundSurfaceIssues,
} from '../workspaceBindingChecks';
import { SURFACE_CODES } from '../workspaceBindingTypes';
import type { TaskSurfaceBinding } from '../workspaceBindingTypes';

/**
 * A workspace binding with a DELIBERATELY PARTIAL `ref`, cast through `unknown`.
 *
 * `backgroundSurfaceIssues` reads exactly two fields — `kind` and `taskId` — because the
 * completeness of a `WorkspaceRef` is `refIssues`' job and is covered in `workspaceMapping.test.ts`.
 * Building the full thirteen-field ref here would be noise that obscures what each case varies,
 * and the cast is through `unknown` rather than a direct assertion because TypeScript is right
 * that the shapes do not overlap: this is a stub, and saying so beats pretending otherwise.
 */
const WS = (taskId: string): TaskSurfaceBinding => ({
  taskId,
  kind: 'workspace',
  ref: { workspaceTitle: 'Imports', slotId: 'main', primaryHumanJob: 'review imports' },
} as unknown as TaskSurfaceBinding);

const HEADLESS = (taskId: string): TaskSurfaceBinding => ({
  taskId, kind: 'headless', reason: 'system_to_system',
});

const task = (id: string, judgment: unknown = 'none') => ({ id, judgment_level: judgment });
const perf = (taskId: string, type: unknown = 'agent') => ({
  task_id: taskId, responsibility: 'PERFORMER', executor: type === null ? null : { type },
});

const codes = (xs: ReadonlyArray<{ code: string }>) => xs.map((i) => i.code);

describe('the code is registered', () => {
  it('SURFACE_BACKGROUND_TASK_CLAIMS_SURFACE is in the closed set', () => {
    expect(SURFACE_CODES).toContain('SURFACE_BACKGROUND_TASK_CLAIMS_SURFACE');
  });
});

describe('DETECTS the all-workspace answer', () => {
  it('an agent-performed, zero-judgment task bound to a workspace is reported', () => {
    const out = backgroundSurfaceIssues([task('t1')], [perf('t1')], [WS('t1')]);
    expect(codes(out)).toEqual(['SURFACE_BACKGROUND_TASK_CLAIMS_SURFACE']);
    expect(out[0].stepId).toBe('t1');
  });

  it('it WARNS rather than refuses, because refusing would add a false-positive path', () => {
    const out = backgroundSurfaceIssues([task('t1')], [perf('t1')], [WS('t1')]);
    expect(out[0].severity).toBe('warning');
  });

  it('the message names headless and the two reasons that fit', () => {
    const [i] = backgroundSurfaceIssues([task('t1')], [perf('t1')], [WS('t1')]);
    expect(i.message).toMatch(/headless/);
    expect(i.message).toMatch(/system_to_system/);
    expect(i.message).toMatch(/derived_computation/);
  });

  it('reports EVERY offending task, not just the first', () => {
    const out = backgroundSurfaceIssues(
      [task('t1'), task('t2'), task('t3')],
      [perf('t1'), perf('t2'), perf('t3')],
      [WS('t1'), WS('t2'), WS('t3')],
    );
    expect(out).toHaveLength(3);
    expect(out.map((i) => i.stepId)).toEqual(['t1', 't2', 't3']);
  });

  it('a task with SEVERAL performers, all agents, is still reported', () => {
    const out = backgroundSurfaceIssues(
      [task('t1')], [perf('t1'), perf('t1')], [WS('t1')],
    );
    expect(out).toHaveLength(1);
  });
});

describe('NEGATIVE CONTROLS: each condition alone is a legitimate plan', () => {
  it('an agent performer with a REAL judgment level is NOT reported', () => {
    // An agent performing work a human then judges on a screen is a reasonable design.
    for (const j of ['low', 'medium', 'high']) {
      expect(backgroundSurfaceIssues([task('t1', j)], [perf('t1')], [WS('t1')])).toEqual([]);
    }
  });

  it('a zero-judgment task performed by a PERSON is NOT reported', () => {
    // A zero-judgment task can still be something a person does.
    expect(backgroundSurfaceIssues([task('t1')], [perf('t1', 'person')], [WS('t1')])).toEqual([]);
  });

  it('a zero-judgment task performed by a TEAM is NOT reported', () => {
    expect(backgroundSurfaceIssues([task('t1')], [perf('t1', 'team')], [WS('t1')])).toEqual([]);
  });

  it('MIXED performers - one agent, one person - is NOT reported', () => {
    const out = backgroundSurfaceIssues(
      [task('t1')], [perf('t1', 'agent'), perf('t1', 'person')], [WS('t1')],
    );
    expect(out).toEqual([]);
  });

  it('the same task bound HEADLESS is not reported — that is the honest answer', () => {
    expect(backgroundSurfaceIssues([task('t1')], [perf('t1')], [HEADLESS('t1')])).toEqual([]);
  });

  it('ABSENCE IS NOT A SIGNAL: no performer recorded is a different defect', () => {
    // Reading "no performer" as "performed by an agent" would invent the finding. That gap
    // belongs to the allocation rules.
    expect(backgroundSurfaceIssues([task('t1')], [], [WS('t1')])).toEqual([]);
  });

  it('a performer with a NULL executor is not read as an agent', () => {
    expect(backgroundSurfaceIssues([task('t1')], [perf('t1', null)], [WS('t1')])).toEqual([]);
  });

  it('a non-PERFORMER agent assignment does not trigger it', () => {
    const approver = { task_id: 't1', responsibility: 'APPROVER', executor: { type: 'agent' } };
    expect(backgroundSurfaceIssues([task('t1')], [approver], [WS('t1')])).toEqual([]);
  });

  it('an assignment for a DIFFERENT task does not leak across', () => {
    const out = backgroundSurfaceIssues(
      [task('t1'), task('t2', 'high')], [perf('t2')], [WS('t1'), WS('t2')],
    );
    expect(out).toEqual([]);
  });
});

describe('it never throws on malformed input, and never invents a finding', () => {
  it('non-array tasks or assignments yield nothing', () => {
    expect(backgroundSurfaceIssues(null as any, [], [WS('t1')])).toEqual([]);
    expect(backgroundSurfaceIssues([task('t1')], null as any, [WS('t1')])).toEqual([]);
  });

  it('no workspace bindings at all short-circuits', () => {
    expect(backgroundSurfaceIssues([task('t1')], [perf('t1')], [])).toEqual([]);
    expect(backgroundSurfaceIssues([task('t1')], [perf('t1')], [HEADLESS('t1')])).toEqual([]);
  });

  it('malformed members are skipped rather than thrown on', () => {
    const tasks = [null, 7, { id: 5, judgment_level: 'none' }, { judgment_level: 'none' }] as any;
    const assigns = [null, 'x', { task_id: 't1' }] as any;
    expect(() => backgroundSurfaceIssues(tasks, assigns, [WS('t1')])).not.toThrow();
    expect(backgroundSurfaceIssues(tasks, assigns, [WS('t1')])).toEqual([]);
  });

  it('a malformed BINDING does not become a workspace claim', () => {
    const bad = [{ taskId: 't1' }, { kind: 'workspace' }, null] as any;
    expect(backgroundSurfaceIssues([task('t1')], [perf('t1')], bad)).toEqual([]);
  });
});
