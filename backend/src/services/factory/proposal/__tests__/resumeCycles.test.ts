import { planBuildAll, enqueueReviewCycles, RESUME_CAP, type EnqueueDeps } from '../resumeCycles';

describe('planBuildAll', () => {
  const docs = [
    { key: 'cover', status: 'drafted', order: 2 },
    { key: 'tech', status: 'not_started', order: 1 },
    { key: 'done', status: 'accepted', order: 0 }, // skipped: accepted
    { key: 'stale', status: 'drafted', superseded: true, order: 3 }, // skipped: superseded
  ];

  it('selects not-passed, not-superseded docs in blueprint order', () => {
    expect(planBuildAll(docs)).toEqual(['tech', 'cover']); // order 1 before 2; done + stale excluded
  });

  it('caps the number enqueued', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ key: `d${i}`, status: 'not_started', order: i }));
    expect(planBuildAll(many, 3)).toEqual(['d0', 'd1', 'd2']);
  });

  it('is total on empty / junk', () => {
    expect(planBuildAll([])).toEqual([]);
    expect(planBuildAll([{ key: '', status: 'not_started' }] as any)).toEqual([]);
  });
});

function deps(over: Partial<EnqueueDeps> & { activeIds?: Set<string> } = {}): EnqueueDeps & { started: string[] } {
  const started: string[] = [];
  const active = over.activeIds ?? new Set<string>();
  let n = 0;
  return {
    started,
    docIdFor: over.docIdFor ?? (async (_p, k) => (k === 'missing' ? null : `id-${k}`)),
    isActive: over.isActive ?? (async (id) => active.has(id)),
    createRun: over.createRun ?? (async () => ({ id: `run-${++n}` })),
    startCycle: over.startCycle ?? ((_p, docKey) => { started.push(docKey); }),
  };
}

describe('enqueueReviewCycles', () => {
  it('enqueues one cycle per unique doc and starts each', async () => {
    const d = deps();
    const r = await enqueueReviewCycles('p', ['a', 'b', 'a'], d); // 'a' deduped
    expect(r.enqueued.map((e) => e.docKey)).toEqual(['a', 'b']);
    expect(d.started).toEqual(['a', 'b']);
  });

  it('skips a document that already has an active run (one at a time)', async () => {
    const d = deps({ activeIds: new Set(['id-b']) });
    const r = await enqueueReviewCycles('p', ['a', 'b'], d);
    expect(r.enqueued.map((e) => e.docKey)).toEqual(['a']);
    expect(r.skipped).toContain('b');
    expect(d.started).toEqual(['a']); // b never started
  });

  it('skips a doc with no id and never throws on a store error', async () => {
    const d = deps({ createRun: async () => { throw new Error('db down'); } });
    const r = await enqueueReviewCycles('p', ['missing', 'x'], d);
    expect(r.enqueued).toEqual([]);
    expect(r.skipped).toEqual(['missing', 'x']); // missing: no id; x: createRun threw
  });

  it('holds the per-call cap (the resume guard)', async () => {
    const keys = Array.from({ length: RESUME_CAP + 3 }, (_, i) => `d${i}`);
    const d = deps();
    const r = await enqueueReviewCycles('p', keys, d, { cap: RESUME_CAP });
    expect(r.enqueued).toHaveLength(RESUME_CAP);
    expect(r.skipped).toHaveLength(3);
    expect(d.started).toHaveLength(RESUME_CAP);
  });
});
