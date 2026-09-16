import { layoutWorkflow } from '../storyWorkflowLayout';
import { LABEL_LIFT } from '../storyWorkflowEdges';
import type {
  PublicCaseStudyWorkflowEdge,
  PublicCaseStudyWorkflowNode,
  PublicCaseStudyWorkflowPanel,
} from '../../../services/caseStudyPublicTypes';

/**
 * The defects the first three migrated records showed live on 2026-09-16:
 * a diagonal's label painted over by the box it left ("hecked", "en ready",
 * "blic URL"), two labels from one node drawn on top of each other
 * ("appr(decision recorded"), an arrow to a lower lane running behind the
 * next box in its own row, and a 34-character label cut to "each…" in a
 * nine-column drawing. Each case here is one of those shapes.
 */

const node = (key: string, lane: PublicCaseStudyWorkflowNode['lane'] = 'primary', label = key): PublicCaseStudyWorkflowNode => ({
  key, label, sublabel: null, detail: null, kicker: null, role: 'system', status: 'processing', lane, evidence: null, tally: null,
});
const edge = (from: string, to: string, label: string | null = null): PublicCaseStudyWorkflowEdge => ({
  from, to, label, status: 'processing', condition: null, motion: true,
});
const panel = (nodes: PublicCaseStudyWorkflowNode[], edges: PublicCaseStudyWorkflowEdge[]): PublicCaseStudyWorkflowPanel => ({
  key: 'single', label: 'As built', summary: null,
  laneLabels: { primary: 'Proposal', recovery: 'Guardrails', manual: 'Human decision' },
  nodes, edges, initialNodeKey: nodes[0].key,
});

type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** The rectangle the graph paints a label into: 11 px type, centred on labelX, baseline LABEL_LIFT above labelY. */
const labelBox = (e: { label: string | null; labelX: number; labelY: number }): Rect => {
  const width = (e.label ?? '').length * 6 + 8;
  return { x: e.labelX - width / 2, y: e.labelY - LABEL_LIFT - 11, width, height: 15 };
};

/** The "proposes" shape: three lanes, a queue between the evaluator and the refusal, two labelled edges out of the human. */
const proposes = panel(
  [
    node('telemetry'), node('model'), node('proposal'),
    node('abac', 'recovery'), node('queue', 'recovery'), node('guardrail', 'recovery'), node('audit', 'recovery'),
    node('human', 'manual'), node('refused', 'manual'),
  ],
  [
    edge('telemetry', 'model'), edge('model', 'proposal'), edge('proposal', 'abac', 'checked'),
    edge('abac', 'refused', 'no'), edge('abac', 'queue', 'yes'), edge('queue', 'human', 'held until a person acts'),
    edge('human', 'refused', 'reject'), edge('human', 'guardrail', 'approve'), edge('guardrail', 'audit'),
    edge('human', 'audit', 'decision recorded'),
  ],
);

describe('routeHorizontalEdges, through the layout', () => {
  const l = layoutWorkflow(proposes, 'horizontal', { maxWidth: 1198 });
  const box = (key: string): Rect => l.nodes.find((n) => n.key === key)!;
  const drawn = l.edges.filter((e) => e.label && e.labelFits);

  it('draws no label over a box, and no label over another label', () => {
    expect(drawn.length).toBeGreaterThan(0);
    for (const e of drawn) {
      for (const n of l.nodes) expect({ edge: `${e.from}>${e.to}`, over: n.key, hit: overlaps(labelBox(e), n) }).toEqual({ edge: `${e.from}>${e.to}`, over: n.key, hit: false });
    }
    for (let i = 0; i < drawn.length; i += 1) {
      for (let j = i + 1; j < drawn.length; j += 1) expect(overlaps(labelBox(drawn[i]), labelBox(drawn[j]))).toBe(false);
    }
  });

  it('keeps a diagonal label clear of the box it leaves, between the two rows', () => {
    const checked = l.edges.find((e) => e.from === 'proposal' && e.to === 'abac')!;
    expect(checked.labelFits).toBe(true);
    const from = box('proposal'); const to = box('abac');
    expect(checked.labelY - LABEL_LIFT).toBeGreaterThan(from.y + from.height);
    expect(checked.labelY - LABEL_LIFT - 11).toBeLessThan(to.y);
  });

  it('gives the second of two colliding labels from one node to the panel, keeping the first declared', () => {
    const approve = l.edges.find((e) => e.from === 'human' && e.to === 'guardrail')!;
    const recorded = l.edges.find((e) => e.from === 'human' && e.to === 'audit')!;
    expect(approve.labelFits).toBe(true);
    expect(recorded.labelFits).toBe(false);
    expect(recorded.label).toBe('decision recorded');
  });

  it('takes the corridor between the rows when both rows are occupied between the two', () => {
    // abac > refused: the queue sits in abac's row and the human in refused's row.
    const no = l.edges.find((e) => e.from === 'abac' && e.to === 'refused')!;
    const abac = box('abac'); const queue = box('queue'); const human = box('human');
    // Two bends around one straight run, and the run lies between the rows, not through either.
    const m = no.d.match(/^M [\d.]+ [\d.]+ C [^L]+ L ([\d.]+) ([\d.]+) C /);
    expect(m).not.toBeNull();
    const runY = Number(m![2]);
    expect(runY).toBeGreaterThan(abac.y + abac.height);
    expect(runY).toBeLessThan(human.y);
    // Its label sits on that run, over neither box.
    expect(no.labelFits).toBe(true);
    expect(overlaps(labelBox(no), queue)).toBe(false);
    expect(overlaps(labelBox(no), human)).toBe(false);
  });

  it('steps down in the first gap when its own row is occupied and the row it enters is clear', () => {
    const early = panel(
      [node('a'), node('b'), node('c'), node('y', 'recovery')],
      [edge('a', 'b'), edge('b', 'c'), edge('c', 'y'), edge('a', 'y', 'early')],
    );
    const l2 = layoutWorkflow(early, 'horizontal', { maxWidth: 1198 });
    const e = l2.edges.find((e2) => e2.from === 'a' && e2.to === 'y')!;
    const b = l2.nodes.find((n) => n.key === 'b')!;
    const y = l2.nodes.find((n) => n.key === 'y')!;
    // One bend, finished before b's left edge, then a straight run in y's row.
    const m = e.d.match(/^M [\d.]+ [\d.]+ C [^L]+, ([\d.]+) ([\d.]+) L /);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(b.x);
    expect(Number(m![2])).toBe(y.y + y.height / 2);
    expect(e.labelFits).toBe(true);
    for (const n of l2.nodes) expect(overlaps(labelBox(e), n)).toBe(false);
  });

  it('runs first and steps down in the last gap when its own row is clear and the lower row is not', () => {
    // a alone in its lane; the lower lane's chain x>w>v fills the columns under the run to y.
    const wide = panel(
      [node('a'), node('x', 'recovery'), node('w', 'recovery'), node('v', 'recovery'), node('y', 'recovery')],
      [edge('x', 'w'), edge('w', 'v'), edge('v', 'y'), edge('a', 'y', 'late')],
    );
    const l2 = layoutWorkflow(wide, 'horizontal', { maxWidth: 1198 });
    const late = l2.edges.find((e) => e.from === 'a' && e.to === 'y')!;
    const v = l2.nodes.find((n) => n.key === 'v')!;
    const a = l2.nodes.find((n) => n.key === 'a')!;
    // A straight run along a's row, then the bend, which starts past the last lower box.
    expect(late.d).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ C /);
    const bendStart = Number(late.d.split(' L ')[1].split(' ')[0]);
    expect(bendStart).toBeGreaterThanOrEqual(v.x + v.width);
    // Its label sits on the run in a's row, over nothing.
    expect(late.labelFits).toBe(true);
    expect(late.labelY).toBe(a.y + a.height / 2);
    for (const n of l2.nodes) expect(overlaps(labelBox(late), n)).toBe(false);
  });

  it('bends in the middle, as before, when the band between the two is clear', () => {
    const clear = panel(
      [node('a'), node('b'), node('x', 'recovery'), node('y', 'recovery')],
      [edge('a', 'b'), edge('x', 'y'), edge('a', 'y', 'across')],
    );
    const l2 = layoutWorkflow(clear, 'horizontal', { maxWidth: 1198 });
    const across = l2.edges.find((e) => e.from === 'a' && e.to === 'y')!;
    expect(across.d).toMatch(/^M [\d.]+ [\d.]+ C /);
    expect(across.d).not.toContain(' L ');
    const a = l2.nodes.find((n) => n.key === 'a')!;
    const y = l2.nodes.find((n) => n.key === 'y')!;
    // The label is centred between the two rows.
    expect(across.labelFits).toBe(true);
    expect(across.labelY - LABEL_LIFT - 4).toBeCloseTo((a.y + a.height / 2 + y.y + y.height / 2) / 2, 5);
  });

  it('wraps a 34-character label to four lines in an eight-column drawing rather than cutting it', () => {
    const eight = panel(
      ['s1', 's2', 's3', 's4', 's5', 's6', 's7'].map((k) => node(k)).concat([node('ten', 'recovery', 'Ten competencies, each independent')]),
      [edge('s1', 's2'), edge('s2', 's3'), edge('s3', 's4'), edge('s4', 's5'), edge('s5', 's6'), edge('s6', 's7'), edge('s7', 'ten')],
    );
    const l3 = layoutWorkflow(eight, 'horizontal', { maxWidth: 1198 });
    expect(l3.fits).toBe(true);
    const ten = l3.nodes.find((n) => n.key === 'ten')!;
    expect(ten.labelLines.join(' ')).toBe('Ten competencies, each independent');
    expect(ten.labelLines.length).toBeLessThanOrEqual(4);
  });

  it('still says every edge, drawn label or not', () => {
    expect(l.edges).toHaveLength(proposes.edges.length);
    for (const e of l.edges) expect(e.label).toBe(proposes.edges.find((p) => p.from === e.from && p.to === e.to)!.label);
  });
});
