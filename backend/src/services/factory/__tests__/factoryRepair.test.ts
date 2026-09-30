/**
 * factoryRepair must be TARGETED, MONOTONE, and BOUNDED (the three properties sbp/planRepair learned
 * from a live failure). These tests mock the model (NO network) and pin: a clean decomposition is
 * returned untouched with no model call; a fixable one is repaired to zero errors; a non-improving or
 * worse candidate is DISCARDED (never accepted); the loop is capped at 3 calls and fails closed with
 * its remaining errors; a malformed repair is discarded and retried under the cap; a thrown call
 * breaks and fails closed.
 */
import {
  repairDecomposition,
  buildFactoryRepairUserPrompt,
  factoryRemedyText,
  FACTORY_REMEDIES,
  MAX_REPAIR_ATTEMPTS,
  type FactoryRepairContext,
} from '../factoryRepair';
import { buildSampleContractProject } from '../sample/sampleContractProject';
import { assembleFactoryProject } from '../factoryAssemble';
import { factoryErrors } from '../factoryValidate';
import type { FactoryDecomposition } from '../factoryDecompose';

const s = buildSampleContractProject();
const goodDecomp: FactoryDecomposition = {
  processes: s.processes, tasks: s.tasks, assignments: s.assignments, transitions: s.transitions, roles: s.roles,
};
const ctx: FactoryRepairContext = {
  blocks: s.source_blocks, requirements: s.requirements, tracks: s.tracks, deliveryProjectId: s.delivery_project_id,
};

/** Drop t-route-tech's only PERFORMER → exactly one PERFORMER error. */
function brokenDecomp(): FactoryDecomposition {
  return {
    ...goodDecomp,
    assignments: goodDecomp.assignments.filter((a) => !(a.task_id === 't-route-tech' && a.responsibility === 'PERFORMER')),
  };
}
/** Also drop t-route-admin's PERFORMER → TWO PERFORMER errors (a strictly-worse candidate). */
function worseDecomp(): FactoryDecomposition {
  return {
    ...goodDecomp,
    assignments: goodDecomp.assignments.filter((a) => a.responsibility !== 'PERFORMER' || a.task_id === 't-classify' || a.task_id === 't-extract'),
  };
}

function clientInOrder(contents: Array<string | null>) {
  const q = [...contents];
  const create = jest.fn(async () => ({ choices: [{ message: { content: (q.shift() ?? null) ?? undefined } }] }));
  return { client: { create } as any, create };
}
function alwaysReturns(content: string) {
  const create = jest.fn(async () => ({ choices: [{ message: { content } }] }));
  return { client: { create } as any, create };
}
const deps = (client: any) => ({ client, model: 'test-model', correlationId: 'c1' });

describe('repairDecomposition — the broken fixture really is broken', () => {
  it('the broken decomposition assembles to exactly one PERFORMER error', () => {
    const errs = factoryErrors(assembleFactoryProject({ decomposition: brokenDecomp(), ...ctx }));
    expect(errs).toHaveLength(1);
    expect(errs[0].code).toBe('PERFORMER');
    // and the good one is clean
    expect(factoryErrors(assembleFactoryProject({ decomposition: goodDecomp, ...ctx }))).toEqual([]);
  });
});

describe('repairDecomposition — targeted, monotone, bounded', () => {
  it('returns a clean decomposition untouched and NEVER calls the model', async () => {
    const { client, create } = alwaysReturns('{}');
    const res = await repairDecomposition(goodDecomp, ctx, deps(client));
    expect(res.errors).toEqual([]);
    expect(res.attempts).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('repairs a fixable decomposition to zero errors (one accepted attempt)', async () => {
    const { client, create } = clientInOrder([JSON.stringify(goodDecomp)]);
    const res = await repairDecomposition(brokenDecomp(), ctx, deps(client));
    expect(res.errors).toEqual([]);
    expect(res.attempts).toBe(1);
    expect(res.rejected).toBe(0);
    expect(create).toHaveBeenCalledTimes(1);
    expect(factoryErrors(res.project)).toEqual([]);
  });

  it('discards a non-improving candidate and fails closed after the cap (bounded to 3 calls)', async () => {
    // the model keeps returning the same broken decomposition — never fewer errors
    const { client, create } = alwaysReturns(JSON.stringify(brokenDecomp()));
    const res = await repairDecomposition(brokenDecomp(), ctx, deps(client));
    expect(res.errors.length).toBeGreaterThan(0); // fail-closed with the gap recorded
    expect(res.attempts).toBe(0);                  // nothing was accepted
    expect(res.rejected).toBe(MAX_REPAIR_ATTEMPTS);
    expect(create).toHaveBeenCalledTimes(MAX_REPAIR_ATTEMPTS); // no unbounded loop
  });

  it('discards a strictly-worse candidate (monotonicity)', async () => {
    const { client, create } = alwaysReturns(JSON.stringify(worseDecomp()));
    const res = await repairDecomposition(brokenDecomp(), ctx, deps(client));
    // best never got worse than the 1-error input it started from
    expect(res.errors).toHaveLength(1);
    expect(res.attempts).toBe(0);
    expect(res.rejected).toBe(MAX_REPAIR_ATTEMPTS);
  });

  it('discards a malformed repair and still succeeds on a later good one', async () => {
    const { client, create } = clientInOrder(['not json{', JSON.stringify(goodDecomp)]);
    const res = await repairDecomposition(brokenDecomp(), ctx, deps(client));
    expect(res.errors).toEqual([]);
    expect(res.attempts).toBe(1);
    expect(res.rejected).toBe(1);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('breaks and fails closed when the repair call throws', async () => {
    const create = jest.fn(async () => { throw new Error('upstream 500'); });
    const res = await repairDecomposition(brokenDecomp(), ctx, { client: { create } as any, model: 'm' });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.attempts).toBe(0);
    expect(create).toHaveBeenCalledTimes(1); // broke out, did not loop
  });
});

describe('repair prompt and remedies are targeted to the violated rules', () => {
  it('the prompt carries the violations verbatim and the current decomposition', () => {
    const errs = factoryErrors(assembleFactoryProject({ decomposition: brokenDecomp(), ...ctx }));
    const prompt = buildFactoryRepairUserPrompt(brokenDecomp(), errs);
    expect(prompt).toMatch(/\[PERFORMER\]/);
    expect(prompt).toContain('CURRENT DECOMPOSITION');
    expect(prompt).toContain('t-route-tech'); // the decomposition JSON is embedded
  });

  it('factoryRemedyText shows only the remedies for the rules actually violated', () => {
    const text = factoryRemedyText([{ code: 'PERFORMER', message: 'x', severity: 'error' }]);
    expect(text).toContain(FACTORY_REMEDIES.PERFORMER);
    expect(text).not.toContain(FACTORY_REMEDIES.LOOP); // not violated, not shown
  });

  it('every factoryValidate error code has a remedy entry', () => {
    for (const code of ['WORK_REFERENCE', 'SOURCE_CLASSIFICATION', 'SOURCE_COVERAGE', 'PERFORMER', 'OVERSIGHT', 'DUPLICATE_ASSIGNMENT', 'EFFORT_EVIDENCE', 'START', 'END', 'REACHABILITY', 'BRANCH_KIND', 'DECISION', 'LOOP']) {
      expect(FACTORY_REMEDIES[code]).toBeDefined();
    }
  });
});
