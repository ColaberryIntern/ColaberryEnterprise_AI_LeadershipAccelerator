import { projectPublicDetail } from '../caseStudyPublicProjection';
import { FORBIDDEN_PUBLIC_KEYS, PUBLIC_DETAIL_KEYS } from '../../../types/caseStudyPublic';
import { SENTINELS, deepKeys, deepStrings, internalSnapshotContent } from './publicFixtures';
import type { PublicProjectionInput } from '../caseStudyPublicProjection';
import type { CaseStudySnapshotContent, CaseStudySurfaceKey } from '../../../types/caseStudy';

/**
 * The visual story crosses to the public payload only when it is valid,
 * enabled and listed for the surface being served, and every figure on it is
 * resolved here from the record's verified metrics. Legacy records, the other
 * surfaces and a broken story all get null: the page is unchanged.
 */

const EV = 'ev-55555555-6666-4777-8888-999999999999'; // the internal fixture's verified evidence id
const HASH = 'b'.repeat(64);

function input(content: CaseStudySnapshotContent, surfaceKey: CaseStudySurfaceKey = 'enterprise'): PublicProjectionInput {
  return {
    surfaceKey,
    slug: 'stockout-forecasting',
    content,
    publication: { featured: false, publishedAt: '2026-08-22T10:00:00.000Z', updatedAt: '2026-08-22T10:00:00.000Z', titleOverride: null, summaryOverride: null },
    canonicalBaseUrl: 'https://enterprise.colaberry.ai',
  };
}

/** The internal fixture plus a maximal story that cites only its verified metric. */
function withStory(over: Record<string, unknown> = {}): CaseStudySnapshotContent {
  const content = internalSnapshotContent() as unknown as Record<string, unknown>;
  const hero = (content.heroMetrics as Record<string, unknown>[])[0];
  hero.shape = 'ratio';
  hero.payload = { shape: 'ratio', numerator: 41, denominator: 100 };
  content.visualStory = {
    schemaVersion: 1, presentationVersion: 'v2', enabled: true, surfaces: ['enterprise'], motion: 'auto',
    workflow: {
      key: 'flow', type: 'before_after', title: 'Same order, a different path', description: 'Before and after.',
      panels: [
        { key: 'before', label: 'Before', nodes: [{ key: 'order', label: 'Order', role: 'system' }, { key: 'hand', label: 'By hand', role: 'human', status: 'attention', lane: 'manual' }], edges: [{ from: 'order', to: 'hand', status: 'attention' }] },
        { key: 'after', label: 'After', initialNodeKey: 'agent', nodes: [
          { key: 'order', label: 'Order', role: 'system' },
          { key: 'agent', label: 'Forecast agent', role: 'system', status: 'resolved', lane: 'recovery', detail: 'Predicts the gap.', kicker: 'Step 2', evidence: 'The stockout metric on this record', evidenceId: EV, metricKey: 'stockouts' },
        ], edges: [{ from: 'order', to: 'agent', label: 'daily', condition: 'stock below floor', motion: false }] },
      ],
    },
    outcomeCards: [{ metricKey: 'stockouts', emphasis: true }],
    charts: [
      { key: 'share', kind: 'share', title: 'Stockouts cut', metricKey: 'stockouts' },
      { key: 'cmp', kind: 'comparison', title: 'Then and now', metricKey: 'stockouts', caveat: 'Different seasons.', parts: [{ label: 'Then', value: 68, denominator: 100, evidenceId: EV, caveat: 'winter' }, { label: 'Now', metricKey: 'stockouts', status: 'resolved' }] },
    ],
    provenance: { generator: 'human', generatedAt: '2026-09-16T00:00:00.000Z', sourceSnapshotId: 'snap-33333333-4444-4555-8666-777777777777', sourceContentHash: HASH, state: 'approved', humanEdited: true },
    ...over,
  };
  return content as unknown as CaseStudySnapshotContent;
}

describe('projectVisualStory through projectPublicDetail', () => {
  it('projects a valid, enabled story for its surface with figures resolved from the metrics', () => {
    const detail = projectPublicDetail(input(withStory()));
    expect(detail.visualStory).not.toBeNull();
    const vs = detail.visualStory!;
    expect(vs.workflow?.panels.map((p) => p.key)).toEqual(['before', 'after']);
    const agent = vs.workflow!.panels[1].nodes[1];
    expect(agent.tally?.valueDisplay).toBe('41% fewer');
    expect(agent.evidence).toBe('The stockout metric on this record');
    expect(vs.workflow!.panels[1].edges[0]).toEqual({ from: 'order', to: 'agent', label: 'daily', status: 'processing', condition: 'stock below floor', motion: false });
    expect(vs.workflow!.panels[1].initialNodeKey).toBe('agent');
    expect(vs.workflow!.panels[0].laneLabels.manual).toBe('Manual repair');
    expect(vs.outcomeCards.map((m) => m.label)).toEqual(['Stockouts per store per week']);
    const share = vs.charts.find((c) => c.key === 'share')!;
    expect(share.parts).toEqual([{ label: 'Stockouts per store per week', value: 41, denominator: 100, status: 'processing', caveat: null }]);
    const cmp = vs.charts.find((c) => c.key === 'cmp')!;
    expect(cmp.parts.map((p) => [p.label, p.value, p.denominator])).toEqual([['Then', 68, 100], ['Now', 41, 100]]);
    expect(cmp.caveat).toBe('Different seasons.');
    expect(vs.workflow!.motionNote).toMatch(/not live telemetry/);
  });

  it('keeps the detail key set exactly the allow-list, and leaks no forbidden key or sentinel', () => {
    const detail = projectPublicDetail(input(withStory()));
    expect(Object.keys(detail).sort()).toEqual([...PUBLIC_DETAIL_KEYS].sort());
    const forbidden = new Set<string>(FORBIDDEN_PUBLIC_KEYS as readonly string[]);
    expect([...deepKeys(detail.visualStory)].filter((k) => forbidden.has(k))).toEqual([]);
    const strings = deepStrings(detail.visualStory);
    for (const s of SENTINELS) expect(strings.filter((x) => x.includes(s.value as string))).toEqual([]);
    expect(strings.filter((x) => x.includes(EV) || x.includes(HASH))).toEqual([]);
    expect([...deepKeys(detail.visualStory)]).not.toContain('evidenceId');
    expect([...deepKeys(detail.visualStory)]).not.toContain('provenance');
  });

  it('is null for a surface the story is not enabled on, when disabled, and on a legacy record', () => {
    expect(projectPublicDetail(input(withStory(), 'training')).visualStory).toBeNull();
    expect(projectPublicDetail(input(withStory({ enabled: false, surfaces: [] }))).visualStory).toBeNull();
    expect(projectPublicDetail(input(internalSnapshotContent())).visualStory).toBeNull();
  });

  it('is null, not partial, when the story no longer validates against the record', () => {
    const broken = withStory();
    ((broken as unknown as { visualStory: { workflow: { panels: { edges: { from: string; to: string }[] }[] } } }).visualStory.workflow.panels[0].edges).push({ from: 'order', to: 'ghost' });
    expect(projectPublicDetail(input(broken)).visualStory).toBeNull();
    const unverified = withStory();
    ((unverified as unknown as { heroMetrics: { verification: { class: string } }[] }).heroMetrics)[0].verification.class = 'pending';
    expect(projectPublicDetail(input(unverified)).visualStory).toBeNull();
  });

  it('never fills a missing figure with zero: a zero card on a non-zero metric fails validation and drops the story', () => {
    const c = withStory();
    const vs = (c as unknown as { visualStory: { charts: Record<string, unknown>[] } }).visualStory;
    vs.charts = [{ key: 'z', kind: 'zero_card', title: 'x', metricKey: 'stockouts' }];
    expect(projectPublicDetail(input(c)).visualStory).toBeNull();
  });
});
