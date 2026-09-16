import {
  validateVisualStory,
  visualStoryContextFromContent,
  type VisualStoryValidationContext,
} from '../caseStudyVisualStoryValidate';
import type { CaseStudySnapshotContent } from '../../../types/caseStudy';

/**
 * One maximal fixture passes; every rule the plan names has a fixture that
 * trips it, asserted by error code so the wrong refusal cannot pass for the
 * right one. Codes with no case here are the ones the Zod shape reaches first
 * (unreachable through the public function) or structural duplicates of a
 * tested rule. Mutation notes: deleting the named check in
 * caseStudyVisualStoryValidate.ts turns the matching `it` red.
 */

const EV = '8936f96c-2ab8-4578-af59-085887cecf6b';
const EV2 = '11111111-2222-4333-8444-555555555555';

const ctx: VisualStoryValidationContext = {
  evidenceIds: [EV],
  metrics: [
    { key: 'resolved', publishable: true, verified: true, payload: { shape: 'ratio', numerator: 586, denominator: 604 } },
    { key: 'recovered', publishable: true, verified: true, payload: { shape: 'count', value: 301 } },
    { key: 'advanced', publishable: true, verified: true, payload: { shape: 'count', value: 285 } },
    { key: 'open', publishable: true, verified: true, payload: { shape: 'count', value: 18 } },
    { key: 'automatic', publishable: true, verified: true, payload: { shape: 'share', numerator: 334, denominator: 347 } },
    { key: 'median', publishable: true, verified: true, payload: { shape: 'count', value: 34.2 }, numericValue: 34.2 },
    { key: 'dupes', publishable: true, verified: true, payload: { shape: 'ratio', numerator: 0, denominator: 339 } },
    { key: 'draft_only', publishable: false, verified: true, payload: { shape: 'count', value: 1 } },
    { key: 'pending', publishable: true, verified: false, payload: { shape: 'count', value: 1 } },
  ],
};

const provenance = {
  generator: 'human' as const,
  generatedAt: '2026-09-16T08:00:00.000Z',
  sourceContentHash: 'a'.repeat(64),
  state: 'draft' as const,
  humanEdited: true,
};

const node = (key: string, over: Record<string, unknown> = {}) => ({ key, label: key, role: 'system', ...over });

const maximal = () => ({
  schemaVersion: 1,
  presentationVersion: 'v2',
  enabled: true,
  surfaces: ['enterprise'],
  motion: 'auto',
  workflow: {
    key: 'cora',
    type: 'before_after',
    title: 'Same call, a different path',
    caption: 'Illustration',
    description: 'Before: events were lost. After: the gap is detected and the result replayed.',
    panels: [
      {
        key: 'before', label: 'Before',
        nodes: [node('launch'), node('event', { status: 'attention' }), node('lost', { status: 'failure', role: 'human', lane: 'manual' })],
        edges: [{ from: 'launch', to: 'event' }, { from: 'event', to: 'lost', status: 'attention' }],
      },
      {
        key: 'after', label: 'After', initialNodeKey: 'detect',
        nodes: [node('launch'), node('event'), node('detect', { lane: 'recovery', status: 'resolved', metricKey: 'median', evidenceId: EV, evidence: 'audit table' })],
        edges: [{ from: 'launch', to: 'event' }, { from: 'event', to: 'detect', condition: 'no completion' }],
      },
    ],
  },
  outcomeCards: [{ metricKey: 'resolved', emphasis: true }, { metricKey: 'automatic' }, { metricKey: 'median' }],
  charts: [
    { key: 'where', kind: 'composition', title: 'Where the 604 went', metricKey: 'resolved', parts: [{ label: 'Recovered', metricKey: 'recovered' }, { label: 'Advanced', metricKey: 'advanced' }, { label: 'Unresolved', metricKey: 'open' }] },
    { key: 'before-after', kind: 'comparison', title: 'Resolution in context', metricKey: 'resolved', caveat: 'Different windows', parts: [{ label: 'Incident', value: 245, denominator: 533, evidenceId: EV }, { label: 'Since', metricKey: 'resolved' }] },
    { key: 'auto', kind: 'share', title: 'Automatic share', metricKey: 'automatic' },
    { key: 'timing', kind: 'two_value', title: 'Recovery timing', metricKey: 'median', unit: 'minutes', axisMax: 60, parts: [{ label: 'Median', metricKey: 'median' }, { label: 'p90', value: 47, evidenceId: EV }] },
    { key: 'zero', kind: 'zero_card', title: 'Duplicate call records', metricKey: 'dupes' },
  ],
  provenance,
});

const withChart = (chart: Record<string, unknown>) => ({ ...maximal(), charts: [chart] });
const codes = (input: unknown) => validateVisualStory(input, ctx).errors.map((e) => e.code);
const paths = (input: unknown) => validateVisualStory(input, ctx).errors.map((e) => e.path);

describe('validateVisualStory: the maximal fixture passes', () => {
  it('returns ok with the typed section and no errors', () => {
    const r = validateVisualStory(maximal(), ctx);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.ok && r.section.charts).toHaveLength(5);
  });
});

describe('shape', () => {
  it('rejects an unknown key anywhere (strict objects)', () => {
    expect(codes({ ...maximal(), extra: 1 })).toContain('shape');
    const m = maximal();
    (m.workflow.panels[0].nodes[0] as Record<string, unknown>).id = 'x';
    expect(paths(m)).toContain('workflow.panels.0.nodes.0');
  });
  it('rejects markup, URLs, @ and control characters in labels', () => {
    for (const bad of ['<b>x</b>', 'see https://x', 'a@b', 'a\u0007b']) {
      const m = maximal();
      m.workflow.panels[0].nodes[0].label = bad;
      expect(validateVisualStory(m, ctx).ok).toBe(false);
    }
  });
  it('rejects a wrong schema or presentation version', () => {
    expect(validateVisualStory({ ...maximal(), schemaVersion: 2 }, ctx).ok).toBe(false);
    expect(validateVisualStory({ ...maximal(), presentationVersion: 'v1' }, ctx).ok).toBe(false);
  });
});

describe('graph integrity', () => {
  it('rejects duplicate node keys', () => {
    const m = maximal(); m.workflow.panels[1].nodes.push(node('launch'));
    expect(codes(m)).toContain('node_key_duplicate');
  });
  it('rejects an edge to a node that is not in the panel', () => {
    const m = maximal(); m.workflow.panels[0].edges.push({ from: 'launch', to: 'nowhere' });
    expect(codes(m)).toContain('edge_endpoint_missing');
  });
  it('rejects self loops and duplicate edges', () => {
    const m = maximal();
    m.workflow.panels[0].edges.push({ from: 'launch', to: 'launch' });
    m.workflow.panels[0].edges.push({ from: 'launch', to: 'event' });
    expect(codes(m)).toEqual(expect.arrayContaining(['edge_self_loop', 'edge_duplicate']));
  });
  it('flags an isolated node rather than dropping it', () => {
    const m = maximal(); m.workflow.panels[1].nodes.push(node('orphan'));
    expect(codes(m)).toContain('node_isolated');
  });
  it('requires exactly before then after for a before_after story', () => {
    const m = maximal(); m.workflow.panels.reverse();
    expect(codes(m)).toContain('panels_mismatch');
    const s = maximal(); s.workflow.type = 'single_state';
    expect(codes(s)).toContain('panels_mismatch');
  });
  it('rejects a node metric or evidence that is not on the record', () => {
    const m = maximal();
    m.workflow.panels[1].nodes[2].metricKey = 'nope';
    m.workflow.panels[1].nodes[2].evidenceId = EV2;
    expect(codes(m)).toEqual(expect.arrayContaining(['metric_missing', 'evidence_missing']));
  });
});

describe('figures', () => {
  it('refuses a card on a metric that is missing, unverified or unpublishable', () => {
    expect(codes({ ...maximal(), outcomeCards: [{ metricKey: 'nope' }] })).toContain('metric_missing');
    expect(codes({ ...maximal(), outcomeCards: [{ metricKey: 'pending' }] })).toContain('metric_not_verified');
    expect(codes({ ...maximal(), outcomeCards: [{ metricKey: 'draft_only' }] })).toContain('metric_not_publishable');
  });
  it('allows at most one emphasised card and no duplicate cards', () => {
    expect(codes({ ...maximal(), outcomeCards: [{ metricKey: 'resolved', emphasis: true }, { metricKey: 'automatic', emphasis: true }] })).toContain('card_emphasis_multiple');
    expect(codes({ ...maximal(), outcomeCards: [{ metricKey: 'resolved' }, { metricKey: 'resolved' }] })).toContain('card_duplicate');
  });
  it('rejects composition parts that do not sum to the metric denominator', () => {
    const c = withChart({ key: 'w', kind: 'composition', title: 'x', metricKey: 'resolved', parts: [{ label: 'a', metricKey: 'recovered' }, { label: 'b', metricKey: 'advanced' }] });
    expect(codes(c)).toContain('composition_parts_mismatch');
  });
  it('rejects a literal value without evidence, and evidence not on the record', () => {
    expect(codes(withChart({ key: 'w', kind: 'comparison', title: 'x', metricKey: 'resolved', caveat: 'c', parts: [{ label: 'a', value: 1, denominator: 2 }, { label: 'b', metricKey: 'resolved' }] })))
      .toContain('literal_value_without_evidence');
    expect(codes(withChart({ key: 'w', kind: 'comparison', title: 'x', metricKey: 'resolved', caveat: 'c', parts: [{ label: 'a', value: 1, denominator: 2, evidenceId: EV2 }, { label: 'b', metricKey: 'resolved' }] })))
      .toContain('evidence_missing');
  });
  it('requires a comparison to carry its window caveat and bar denominators', () => {
    const r = codes(withChart({ key: 'w', kind: 'comparison', title: 'x', metricKey: 'resolved', parts: [{ label: 'a', value: 5, evidenceId: EV }, { label: 'b', metricKey: 'resolved' }] }));
    expect(r).toEqual(expect.arrayContaining(['comparison_needs_caveat', 'comparison_bar_needs_denominator']));
  });
  it('refuses a two-value chart described as a trend, without a unit, or off its axis', () => {
    expect(codes(withChart({ key: 'w', kind: 'two_value', title: 'Recovery trend', metricKey: 'median', unit: 'min', axisMax: 60, parts: [{ label: 'a', metricKey: 'median' }, { label: 'b', value: 47, evidenceId: EV }] })))
      .toContain('chart_labelled_as_trend');
    expect(codes(withChart({ key: 'w', kind: 'two_value', title: 'x', metricKey: 'median', axisMax: 60, parts: [{ label: 'a', metricKey: 'median' }, { label: 'b', value: 47, evidenceId: EV }] })))
      .toContain('two_value_needs_unit');
    expect(codes(withChart({ key: 'w', kind: 'two_value', title: 'x', metricKey: 'median', unit: 'min', axisMax: 40, parts: [{ label: 'a', metricKey: 'median' }, { label: 'b', value: 47, evidenceId: EV }] })))
      .toContain('value_exceeds_axis');
  });
  it('accepts a real zero and refuses a zero card over a non-zero metric', () => {
    expect(validateVisualStory(withChart({ key: 'z', kind: 'zero_card', title: 'x', metricKey: 'dupes' }), ctx).ok).toBe(true);
    expect(codes(withChart({ key: 'z', kind: 'zero_card', title: 'x', metricKey: 'resolved' }))).toContain('zero_card_not_zero');
  });
  it('requires an enabled story to name a surface', () => {
    expect(codes({ ...maximal(), surfaces: [] })).toContain('enabled_without_surface');
    expect(validateVisualStory({ ...maximal(), enabled: false, surfaces: [] }, ctx).ok).toBe(true);
  });
});

describe('limits and closed vocabularies (reached through the Zod shape)', () => {
  const shapeFails = (mutate: (m: ReturnType<typeof maximal>) => void) => {
    const m = maximal(); mutate(m);
    const r = validateVisualStory(m, ctx);
    expect(r.ok).toBe(false);
    expect(r.errors.every((e) => e.code === 'shape')).toBe(true);
    return r.errors.map((e) => e.path);
  };
  it('refuses a label, a detail and a caption one character over their limits', () => {
    expect(shapeFails((m) => { m.workflow.panels[0].nodes[0].label = 'x'.repeat(41); })).toContain('workflow.panels.0.nodes.0.label');
    expect(shapeFails((m) => { (m.workflow.panels[0].nodes[0] as Record<string, unknown>).detail = 'x'.repeat(281); })).toContain('workflow.panels.0.nodes.0.detail');
    expect(shapeFails((m) => { m.workflow.caption = 'x'.repeat(201); })).toContain('workflow.caption');
    // Non-vacuity: exactly at the limit passes.
    const ok = maximal(); ok.workflow.panels[0].nodes[0].label = 'x'.repeat(40);
    expect(validateVisualStory(ok, ctx).ok).toBe(true);
  });
  it('refuses a role, status, lane or chart kind outside the closed lists', () => {
    expect(shapeFails((m) => { (m.workflow.panels[0].nodes[0] as Record<string, unknown>).role = 'robot'; })).toContain('workflow.panels.0.nodes.0.role');
    expect(shapeFails((m) => { (m.workflow.panels[0].nodes[0] as Record<string, unknown>).status = 'green'; })).toContain('workflow.panels.0.nodes.0.status');
    expect(shapeFails((m) => { (m.workflow.panels[0].nodes[0] as Record<string, unknown>).lane = 'side'; })).toContain('workflow.panels.0.nodes.0.lane');
    expect(shapeFails((m) => { (m.charts[0] as Record<string, unknown>).kind = 'pie'; })).toContain('charts.0.kind');
  });
  it('refuses more than 16 nodes or 24 edges in a panel, and more than 3 cards', () => {
    expect(shapeFails((m) => {
      for (let i = 0; i < 15; i += 1) m.workflow.panels[0].nodes.push(node(`n${i}`));
    })).toContain('workflow.panels.0.nodes');
    expect(shapeFails((m) => {
      for (let i = 0; i < 24; i += 1) m.workflow.panels[0].edges.push({ from: 'launch', to: 'event' });
    })).toContain('workflow.panels.0.edges');
    expect(shapeFails((m) => { m.outcomeCards.push({ metricKey: 'dupes' }); })).toContain('outcomeCards');
  });
  it('refuses a surface outside the four keys', () => {
    expect(shapeFails((m) => { (m as Record<string, unknown>).surfaces = ['intranet']; })).toContain('surfaces.0');
  });
});

describe('the remaining figure rules', () => {
  it('refuses a zero card, a share and a composition anchored on a plain count', () => {
    expect(codes(withChart({ key: 'z', kind: 'zero_card', title: 'x', metricKey: 'recovered' }))).toContain('zero_card_needs_denominator');
    expect(codes(withChart({ key: 's', kind: 'share', title: 'x', metricKey: 'recovered' }))).toContain('share_needs_ratio');
    expect(codes(withChart({ key: 'c', kind: 'composition', title: 'x', metricKey: 'recovered', parts: [{ label: 'a', metricKey: 'advanced' }, { label: 'b', metricKey: 'open' }] })))
      .toContain('composition_needs_denominator');
  });
  it('refuses a composition or comparison with fewer than two parts, and a two-value chart without exactly two', () => {
    expect(codes(withChart({ key: 'c', kind: 'composition', title: 'x', metricKey: 'resolved', parts: [{ label: 'a', metricKey: 'recovered' }] }))).toContain('composition_needs_parts');
    expect(codes(withChart({ key: 'c', kind: 'comparison', title: 'x', metricKey: 'resolved', caveat: 'c', parts: [{ label: 'a', metricKey: 'resolved' }] }))).toContain('comparison_needs_parts');
    expect(codes(withChart({ key: 't', kind: 'two_value', title: 'x', metricKey: 'median', unit: 'min', axisMax: 60, parts: [{ label: 'a', metricKey: 'median' }] }))).toContain('two_value_needs_two');
    expect(codes(withChart({ key: 't', kind: 'two_value', title: 'x', metricKey: 'median', unit: 'min', parts: [{ label: 'a', metricKey: 'median' }, { label: 'b', value: 47, evidenceId: EV }] }))).toContain('two_value_needs_axis');
  });
  it('refuses a part with no figure, a bar over its denominator, and a duplicate chart key', () => {
    expect(codes(withChart({ key: 'c', kind: 'comparison', title: 'x', metricKey: 'resolved', caveat: 'c', parts: [{ label: 'a' }, { label: 'b', metricKey: 'resolved' }] }))).toContain('part_without_figure');
    expect(codes(withChart({ key: 'c', kind: 'comparison', title: 'x', metricKey: 'resolved', caveat: 'c', parts: [{ label: 'a', value: 9, denominator: 4, evidenceId: EV }, { label: 'b', metricKey: 'resolved' }] }))).toContain('value_exceeds_denominator');
    const m = maximal(); m.charts.push({ ...m.charts[2], key: 'auto' } as typeof m.charts[number]);
    expect(codes(m)).toContain('chart_key_duplicate');
  });
  it('refuses an initial node that is not in the panel, and a second island of connected nodes', () => {
    const m = maximal(); (m.workflow.panels[1] as Record<string, unknown>).initialNodeKey = 'ghost';
    expect(codes(m)).toContain('node_missing');
    const island = maximal();
    island.workflow.panels[1].nodes.push(node('x1'), node('x2'));
    island.workflow.panels[1].edges.push({ from: 'x1', to: 'x2' });
    expect(codes(island)).toContain('node_unreachable');
    expect(codes(island)).not.toContain('node_isolated');
  });
});

describe('visualStoryContextFromContent', () => {
  it('collects hero and measurement metrics once each with their facts', () => {
    const content = {
      heroMetrics: [{ key: 'a', publishable: true, verification: { class: 'verified' }, payload: { shape: 'count', value: 1 } }],
      measurement: { metrics: [
        { key: 'a', publishable: true, verification: { class: 'verified' } },
        { key: 'b', publishable: false, verification: { class: 'pending' } },
      ] },
    } as unknown as CaseStudySnapshotContent;
    const c = visualStoryContextFromContent(content, [EV]);
    expect(c.metrics.map((m) => [m.key, m.publishable, m.verified])).toEqual([['a', true, true], ['b', false, false]]);
    expect(c.evidenceIds).toEqual([EV]);
  });
});
