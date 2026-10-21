/* eslint-disable */
// Unit tests for the agent-domain BuildPlan derivation.
//
// The load-bearing test here is the HASH EQUIVALENCE one. `domainBuildPlan.js` carries a JS port
// of the canonical hash because the real implementation is TypeScript and an operational `.js`
// script running on the host cannot require it. Two implementations of one invariant is exactly
// the situation `canonicalHash.ts`'s own header warns about, so the port is pinned against the
// original: the day they diverge, this fails rather than a publish being rejected as tampered.
//
// The rest guards the properties that make the plan safe to write: the plan cannot disagree with
// the tasks it was derived from, duplicate story ids are refused rather than silently collapsed,
// and a story with no acceptance criteria is REPORTED rather than quietly shipped unverifiable.

const { buildPlanFromTasks, canonicalJson, hashPlan, releaseNameFrom } = require('../domainBuildPlan');
import { canonicalJson as realCanonicalJson, hashCanonical } from '../../../utils/canonicalHash';

function task(over: any = {}) {
  return {
    story_id: 'marketing.RESEARCH-1-SYSTEM-CLASSES',
    release_key: 'r0',
    title: 'Compare the five system classes',
    narrative: 'Write a short, evidenced comparison.',
    build: '# Compare\n**Release:** Discovery and validation\nbody',
    acceptance: ['The document compares all five system classes.', 'It cites this domain capability count.'],
    fulfills: null,
    owner_agent: null,
    ...over,
  };
}

const base = { projectName: 'Marketing & Growth', descriptor: 'The marketing domain agent' };

describe('the JS hash port matches the TypeScript original', () => {
  const cases: any[] = [
    { a: 1, b: 'two' },
    { b: 'two', a: 1 },                       // key order must not change the hash
    { nested: { z: [3, 2, 1], a: { y: 1, x: 2 } } },
    { arr: [{ b: 1, a: 2 }, { a: 2, b: 1 }] },
    { empty: {}, list: [], nul: null },
    [1, 2, 3],
    'a string',
    42,
    null,
  ];

  it('produces identical canonical JSON for every case', () => {
    for (const c of cases) expect(canonicalJson(c)).toBe(realCanonicalJson(c));
  });

  it('produces identical hashes for every case', () => {
    for (const c of cases) expect(hashPlan(c)).toBe(hashCanonical(c));
  });

  it('agrees on a realistic derived plan', () => {
    const { plan } = buildPlanFromTasks({ ...base, tasks: [task(), task({ story_id: 'marketing.X', release_key: 'r2' })] });
    expect(hashPlan(plan)).toBe(hashCanonical(plan));
    expect(canonicalJson(plan)).toBe(realCanonicalJson(plan));
  });

  it('is order independent, which is the entire point', () => {
    const one = buildPlanFromTasks({ ...base, tasks: [task({ story_id: 'a.1' }), task({ story_id: 'a.2' })] }).plan;
    const two = buildPlanFromTasks({ ...base, tasks: [task({ story_id: 'a.2' }), task({ story_id: 'a.1' })] }).plan;
    expect(hashPlan(one)).toBe(hashPlan(two));
  });
});

describe('the plan is DERIVED, so it cannot disagree with the tasks', () => {
  it('carries each story acceptance verbatim', () => {
    const acc = ['one criterion.', 'another criterion.', 'Trust: a third.'];
    const { plan } = buildPlanFromTasks({ ...base, tasks: [task({ acceptance: acc })] });
    expect(plan.stories[0].acceptance).toEqual(acc);
  });

  it('keeps story ids, titles, narratives and release keys as given', () => {
    const { plan } = buildPlanFromTasks({
      ...base,
      tasks: [task({ story_id: 'x.Y', title: 'A title', narrative: 'A narrative', release_key: 'r1' })],
    });
    const s = plan.stories[0];
    expect([s.id, s.title, s.narrative, s.release]).toEqual(['x.Y', 'A title', 'A narrative', 'r1']);
  });

  it('puts the prompt into task_guidance so the plan carries the same instruction the page shows', () => {
    const { plan } = buildPlanFromTasks({ ...base, tasks: [task({ build: 'THE PROMPT' })] });
    expect(plan.stories[0].task_guidance).toBe('THE PROMPT');
  });
});

describe('what is honestly absent stays absent', () => {
  it('emits NO requirements, because these projects have none', () => {
    const { plan } = buildPlanFromTasks({ ...base, tasks: [task()] });
    expect(plan.requirements).toEqual([]);
  });

  it('leaves fulfills and owner_agent empty rather than inventing them', () => {
    const { plan } = buildPlanFromTasks({ ...base, tasks: [task({ fulfills: null, owner_agent: null })] });
    expect(plan.stories[0].fulfills).toEqual([]);
    expect(plan.stories[0].owner_agent).toBe('');
  });

  it('passes fulfills through when a task actually has it', () => {
    const { plan } = buildPlanFromTasks({ ...base, tasks: [task({ fulfills: ['REQ-001'] })] });
    expect(plan.stories[0].fulfills).toEqual(['REQ-001']);
  });

  it('uses 0 for unknown week windows instead of a guess', () => {
    const { plan } = buildPlanFromTasks({ ...base, tasks: [task()] });
    expect(plan.releases[0].week_start).toBe(0);
    expect(plan.releases[0].week_end).toBe(0);
  });
});

describe('releases', () => {
  it('reads the release name from the prompt the programme already wrote', () => {
    const { plan } = buildPlanFromTasks({ ...base, tasks: [task()] });
    expect(plan.releases[0].name).toBe('Discovery and validation');
  });

  it('falls back to the key rather than inventing a name', () => {
    const { plan } = buildPlanFromTasks({ ...base, tasks: [task({ build: 'no release marker here' })] });
    expect(plan.releases[0].name).toBe('r0');
  });

  it('orders releases by key so the plan is stable', () => {
    const { plan } = buildPlanFromTasks({
      ...base,
      tasks: [task({ story_id: 'a.3', release_key: 'r2' }), task({ story_id: 'a.1', release_key: 'r0' }),
        task({ story_id: 'a.2', release_key: 'r1' })],
    });
    expect(plan.releases.map((r: any) => r.key)).toEqual(['r0', 'r1', 'r2']);
  });

  it('does not duplicate a release that many stories share', () => {
    const { plan } = buildPlanFromTasks({
      ...base,
      tasks: [task({ story_id: 'a.1' }), task({ story_id: 'a.2' }), task({ story_id: 'a.3' })],
    });
    expect(plan.releases).toHaveLength(1);
    expect(plan.stories).toHaveLength(3);
  });
});

describe('it refuses rather than shipping something unsafe', () => {
  it('throws on zero tasks instead of writing an empty plan', () => {
    expect(() => buildPlanFromTasks({ ...base, tasks: [] })).toThrow(/zero tasks/);
  });

  it('throws on duplicate story ids rather than silently collapsing them', () => {
    expect(() => buildPlanFromTasks({
      ...base, tasks: [task({ story_id: 'dupe' }), task({ story_id: 'dupe' })],
    })).toThrow(/duplicate story ids/);
  });

  it('WARNS about a story with no acceptance criteria, because it could never be verified', () => {
    const { warnings } = buildPlanFromTasks({
      ...base, tasks: [task({ story_id: 'bare.one', acceptance: [] })],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/bare\.one/);
    expect(warnings[0]).toMatch(/no acceptance criteria/);
  });

  it('drops non-string acceptance entries, matching what the verifier reader does', () => {
    const { plan } = buildPlanFromTasks({
      ...base, tasks: [task({ acceptance: ['good', 42, null, { a: 1 }] as any })],
    });
    expect(plan.stories[0].acceptance).toEqual(['good']);
  });
});
