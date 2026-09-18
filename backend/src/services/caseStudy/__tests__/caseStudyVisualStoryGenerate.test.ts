import {
  generateVisualStory,
  isVisualStoryStale,
  visualStorySourceHash,
} from '../caseStudyVisualStoryGenerate';
import { validateVisualStory, visualStoryContextFromContent } from '../caseStudyVisualStoryValidate';
import { applyOverrides } from '../caseStudySnapshotOverrides';
import { overridesFromSnapshot } from '../caseStudySyncSources';
import type { CaseStudySnapshotContent } from '../../../types/caseStudy';
import type { CaseStudyProvenance } from '../../../types/caseStudyProvenance';

const EV = '8936f96c-2ab8-4578-af59-085887cecf6b';
const AT = '2026-09-16T08:00:00.000Z';

const metric = (key: string, over: Record<string, unknown> = {}) => ({
  key, label: `Metric ${key}`, valueDisplay: 'x', metricType: 'business_outcome', isHeadline: false, publishable: true,
  verification: { class: 'verified', method: 'internal', evidenceId: EV, verifiedAt: AT },
  ...over,
});

const content = (over: Record<string, unknown> = {}): CaseStudySnapshotContent => ({
  identity: { slug: 's', title: 'T', organizationIdentityMode: 'anonymized', organizationNamingConsent: false, builderIdentityMode: 'role_only', builderNamingConsent: false },
  taxonomy: {},
  heroMetrics: [metric('resolved', { isHeadline: true, shape: 'ratio', payload: { shape: 'ratio', numerator: 586, denominator: 604 }, measurement: { baseline: '46% (245 of 533) during the incident', sample: 's', measured: 'm', methodology: 'q' } })],
  measurement: { metrics: [
    metric('automatic', { shape: 'share', payload: { shape: 'share', numerator: 334, denominator: 347 }, measurement: { baseline: 'n/a: sizes the split', sample: 's', measured: 'm', methodology: 'q' } }),
    metric('dupes', { shape: 'ratio', payload: { shape: 'ratio', numerator: 0, denominator: 339 } }),
    metric('tests', { metricType: 'quality', shape: 'count', payload: { shape: 'count', value: 19 } }),
    metric('draft', { publishable: false, shape: 'ratio', payload: { shape: 'ratio', numerator: 1, denominator: 2 } }),
  ] },
  architecture: {
    narrative: ['Detection is a query.'], stack: [], capabilities: [], integrations: [], dataStores: [],
    diagram: {
      nodes: [
        { id: 'launch', label: 'Completed launch job', kind: 'job' },
        { id: 'detect', label: 'Missing-event detection query', kind: 'service' },
        { id: 'panel', label: 'Operator panel and alert', kind: 'ui' },
        { id: 'synthflow', label: 'Source call retrieval, read-only', kind: 'integration' },
        { id: 'audit', label: 'Recovery audit row', kind: 'datastore' },
      ],
      edges: [
        { from: 'launch', to: 'detect', label: 'no completion event' },
        { from: 'detect', to: 'panel' },
        { from: 'panel', to: 'synthflow', label: 'Call Completed' },
        { from: 'panel', to: 'audit' },
      ],
    },
    verification: { class: 'verified', method: 'repo', evidenceId: EV, verifiedAt: AT },
  },
  ...over,
} as unknown as CaseStudySnapshotContent);

describe('generateVisualStory', () => {
  it('is byte-identical for the same input', () => {
    const a = generateVisualStory(content(), { generatedAt: AT, sourceSnapshotId: '11111111-2222-4333-8444-555555555555' });
    const b = generateVisualStory(content(), { generatedAt: AT, sourceSnapshotId: '11111111-2222-4333-8444-555555555555' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.section).not.toBeNull();
  });

  it('draws a single-state workflow from the diagram, never a before-state, disabled and on no surface', () => {
    const { section } = generateVisualStory(content(), { generatedAt: AT });
    expect(section?.workflow?.type).toBe('single_state');
    expect(section?.workflow?.panels.map((p) => p.key)).toEqual(['single']);
    expect(section?.enabled).toBe(false);
    expect(section?.surfaces).toEqual([]);
    const nodes = section!.workflow!.panels[0].nodes;
    expect(nodes.map((n) => [n.key, n.role])).toEqual([
      ['launch', 'system'], ['detect', 'system'], ['panel', 'human'], ['synthflow', 'external'], ['audit', 'data'],
    ]);
    expect(section!.workflow!.panels[0].edges).toHaveLength(4);
    expect(section!.workflow!.panels[0].edges[0].label).toBe('no completion event');
  });

  it('returns null with a reason when there is no diagram to illustrate', () => {
    const r = generateVisualStory(content({ architecture: undefined }), { generatedAt: AT });
    expect(r.section).toBeNull();
    expect(r.reasons[0]).toMatch(/nothing to illustrate/);
  });

  it('leads with the headline metric and adds comparative publishable metrics, never a count or a draft', () => {
    const { section } = generateVisualStory(content(), { generatedAt: AT });
    expect(section?.outcomeCards).toEqual([
      { metricKey: 'resolved', emphasis: true }, { metricKey: 'automatic' }, { metricKey: 'dupes' },
    ]);
  });

  it('proposes one chart per ratio or share by its guardrail: comparison from a "N of M" baseline, zero card for a zero, share otherwise', () => {
    const { section } = generateVisualStory(content(), { generatedAt: AT });
    expect(section?.charts.map((c) => [c.key, c.kind])).toEqual([
      ['compare-resolved', 'comparison'], ['share-automatic', 'share'], ['zero-dupes', 'zero_card'],
    ]);
    const cmp = section!.charts[0];
    expect(cmp.parts?.[0]).toMatchObject({ value: 245, denominator: 533, evidenceId: EV });
    expect(cmp.caveat).toMatch(/not a controlled comparison/);
  });

  it('produces a draft the validator accepts', () => {
    const c = content();
    const { section } = generateVisualStory(c, { generatedAt: AT });
    const result = validateVisualStory(section, visualStoryContextFromContent(c, [EV]));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('summarises a diagram over the node limit rather than dropping the story, and says so', () => {
    const big = content();
    const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, kind: 'service' as const }));
    const edges = nodes.slice(1).map((n, i) => ({ from: `n${i}`, to: n.id }));
    (big.architecture as { diagram: unknown }).diagram = { nodes, edges };
    const r = generateVisualStory(big, { generatedAt: AT });
    expect(r.section?.workflow?.panels[0].nodes).toHaveLength(16);
    expect(r.reasons.some((x) => /first 16 are drawn/.test(x))).toBe(true);
  });
});

describe('staleness and sync survival', () => {
  it('flips stale when a source section changes and only then', () => {
    const c = content();
    const { section } = generateVisualStory(c, { generatedAt: AT });
    expect(isVisualStoryStale(section!, c)).toBe(false);
    const changedElsewhere = content({ identity: { ...c.identity, summary: 'a new summary' } });
    expect(isVisualStoryStale(section!, changedElsewhere)).toBe(false);
    const changedSource = content();
    (changedSource.architecture as { narrative: string[] }).narrative = ['Rewritten.'];
    expect(visualStorySourceHash(changedSource)).not.toBe(visualStorySourceHash(c));
    expect(isVisualStoryStale(section!, changedSource)).toBe(true);
  });

  it('carries a human-edited story through overridesFromSnapshot + applyOverrides byte-identical, marked stale by the rebuilt source', () => {
    const base = content();
    const generated = generateVisualStory(base, { generatedAt: AT }).section!;
    const edited = {
      ...generated,
      enabled: true,
      surfaces: ['enterprise' as const],
      provenance: { ...generated.provenance, generator: 'human' as const, humanEdited: true },
    };
    // 1. A person saves the story as a whole-section override on the current snapshot.
    const saved = applyOverrides(base, [{ path: 'visualStory', value: edited, actor: 'ali@colaberry.com', recordedAt: AT, note: 'authored' }]);
    expect(saved.applied).toEqual(['visualStory']);
    const snapshotFacts = {
      id: 'snap-9', version: 9, contentHash: 'x',
      content: saved.content,
      provenance: saved.entries as unknown as CaseStudyProvenance,
    };
    // 2. A sync rebuilds the snapshot from sources whose architecture changed...
    const rebuilt = content();
    (rebuilt.architecture as { narrative: string[] }).narrative = ['Rebuilt by sync.'];
    // ...and carries every human override forward exactly as the builder does.
    const carried = overridesFromSnapshot(snapshotFacts);
    expect(carried.map((o) => o.path)).toContain('visualStory');
    const next = applyOverrides(rebuilt, carried);
    const survived = (next.content as unknown as { visualStory: unknown }).visualStory;
    expect(JSON.stringify(survived)).toBe(JSON.stringify(edited));
    // 3. The story is intact but its source moved under it: stale, not overwritten.
    expect(isVisualStoryStale(edited, next.content)).toBe(true);
    expect(isVisualStoryStale(edited, base)).toBe(false);
  });
});
