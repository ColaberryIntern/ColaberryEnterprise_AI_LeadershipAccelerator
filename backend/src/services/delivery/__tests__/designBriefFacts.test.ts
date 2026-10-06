/**
 * P4-T3 — the design brief carries process/allocation/control facts, and OPENS what is missing.
 *
 * A separate file from `designBrief.test.ts` on purpose: that suite guards the live prospect-facing
 * path, and the acceptance criterion for this task is that it keeps passing untouched. Mixing the
 * new assertions into it would make "the existing tests still pass" unverifiable.
 */

import { buildDesignBrief, type DesignFacts } from '../designBrief';
import type { BuildBlueprint } from '../buildBlueprint';
import type { ProjectUnderstanding } from '../projectUnderstanding';

const understanding = (): ProjectUnderstanding => ({
  title: 'Deep Ellum route planner',
  items: [],
  proposed_surfaces: ['Route board'],
} as unknown as ProjectUnderstanding);

const blueprint = (): BuildBlueprint => ({
  readiness: { not_discussed: ['payments'] },
} as unknown as BuildBlueprint);

const FULL: DesignFacts = {
  taskSurfaces: [{ taskId: 't-intake', surface: 'ws-review#approve' }],
  allocation: [{ taskId: 't-intake', executionClass: 'human', accountableRoleId: 'role-counsel' }],
  showableControls: [{
    policyKey: 'agent.enabled',
    enforcedBy: 'persisted_column_checked',
    callSite: 'workforceAgentRuntime.ts:69',
  }],
  controlSurfaceExists: true,
  workspaceCount: 2,
};

describe('the brief carries the supplied facts verbatim', () => {
  it('every fact arrives unchanged, and nothing is opened', () => {
    const b = buildDesignBrief(understanding(), blueprint(), FULL);
    expect(b.task_surfaces).toEqual(FULL.taskSurfaces);
    expect(b.allocation_summary).toEqual(FULL.allocation);
    expect(b.controls).toEqual(FULL.showableControls);
    expect(b.workspace_count).toBe(2);
    expect(b.open_facts).toBeUndefined();
  });

  it('copies rather than aliases, so a later mutation of the input cannot rewrite the brief', () => {
    const facts: DesignFacts = { ...FULL, taskSurfaces: [{ taskId: 't-a', surface: 's-a' }] };
    const b = buildDesignBrief(understanding(), blueprint(), facts);
    (facts.taskSurfaces as Array<{ taskId: string; surface: string }>)[0].taskId = 'MUTATED';
    expect(b.task_surfaces).toEqual([{ taskId: 't-a', surface: 's-a' }]);
  });
});

describe('a missing fact is OPENED, never substituted', () => {
  it.each([
    ['taskSurfaces', 'task_surfaces', 'traceable to the work it serves'],
    ['allocation', 'allocation_summary', 'who performs each task'],
    ['workspaceCount', 'workspace_count', 'disclosure, not a target'],
  ] as const)('an absent %s leaves the field absent and names it in open_facts', (key, field, frag) => {
    const facts = { ...FULL };
    delete (facts as Record<string, unknown>)[key];
    const b = buildDesignBrief(understanding(), blueprint(), facts);
    expect((b as Record<string, unknown>)[field]).toBeUndefined();
    expect(b.open_facts?.join(' ')).toContain(frag);
  });

  it('an empty allocation is treated as ABSENT, not as "nobody does this work"', () => {
    // The distinction that matters: an empty allocation would read as a decision, and it is not one.
    const b = buildDesignBrief(understanding(), blueprint(), { ...FULL, allocation: [] });
    expect(b.allocation_summary).toBeUndefined();
    expect(b.open_facts?.join(' ')).toContain('undecided');
  });

  it('PASSING COUNTERPART: with every fact supplied, open_facts is absent entirely', () => {
    // Without this, a rule that opened everything unconditionally would pass the tests above.
    expect(buildDesignBrief(understanding(), blueprint(), FULL).open_facts).toBeUndefined();
  });
});

describe('THE P4-T2 CONSUMER: controlSurfaceExists is passed, never inferred', () => {
  it('an all-unavailable specification yields an OPEN FACT, not `controls: []`', () => {
    // The whole argument of P4-T2. "No control is enforced yet" and "no controls are needed" are
    // different claims, and an empty array asserts the second one.
    const b = buildDesignBrief(understanding(), blueprint(), {
      ...FULL, showableControls: [], controlSurfaceExists: false,
    });
    expect(b.controls).toBeUndefined();
    expect(b.open_facts?.join(' ')).toContain('nothing a human can actually operate');
  });

  it('distinguishes "no surface" from "no specification at all"', () => {
    const noSpec = { ...FULL };
    delete (noSpec as Record<string, unknown>).controlSurfaceExists;
    delete (noSpec as Record<string, unknown>).showableControls;
    const b = buildDesignBrief(understanding(), blueprint(), noSpec);
    expect(b.controls).toBeUndefined();
    expect(b.open_facts?.join(' ')).toContain('what a human can adjust is unknown');
  });

  it('a TRUE predicate with showable controls populates the field', () => {
    expect(buildDesignBrief(understanding(), blueprint(), FULL).controls).toHaveLength(1);
  });

  it('a TRUE predicate with an EMPTY showable list still opens rather than claiming controls', () => {
    // Defends against a caller that passes the predicate but forgets the list.
    const b = buildDesignBrief(understanding(), blueprint(), {
      ...FULL, showableControls: [], controlSurfaceExists: true,
    });
    expect(b.controls).toBeUndefined();
    expect(b.open_facts).toBeDefined();
  });
});

describe('the live prospect-facing path is unaffected', () => {
  it('called with NO facts, the brief is exactly what it was before P4-T3', () => {
    // `appPrototypeService` calls the two-argument form. Every new field must be absent, so the
    // website generator - which reads only named fields - cannot see any of this.
    const b = buildDesignBrief(understanding(), blueprint());
    for (const f of ['task_surfaces', 'allocation_summary', 'controls', 'workspace_count'] as const) {
      expect(b[f]).toBeUndefined();
    }
    // The pre-existing fields are untouched.
    expect(b.project_title).toBe('Deep Ellum route planner');
    expect(b.not_discussed).toEqual(['payments']);
    expect(b.concepts).toHaveLength(3);
  });

  it('no facts means no open_facts either — absence of input is not a finding', () => {
    // Opening four facts on the prospect path would put lifecycle noise into a sales artifact.
    expect(buildDesignBrief(understanding(), blueprint()).open_facts).toBeUndefined();
  });
});
