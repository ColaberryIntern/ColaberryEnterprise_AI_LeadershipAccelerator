import { layoutWorkflow, layoutWorkflowToFit, orientationFor, workflowSteps } from '../storyWorkflowLayout';
import type {
  PublicCaseStudyWorkflowEdge,
  PublicCaseStudyWorkflowNode,
  PublicCaseStudyWorkflowPanel,
} from '../../../services/caseStudyPublicTypes';

/**
 * Geometry a reader can follow: every edge drawn, no two boxes overlapping,
 * branches kept, and the phone layout inside a phone.
 */

const node = (key: string, lane: PublicCaseStudyWorkflowNode['lane'] = 'primary'): PublicCaseStudyWorkflowNode => ({
  key, label: key, sublabel: null, detail: null, kicker: null, role: 'system', status: 'processing', lane, evidence: null, tally: null,
});
const edge = (from: string, to: string, label: string | null = null): PublicCaseStudyWorkflowEdge => ({
  from, to, label, status: 'processing', condition: null, motion: true,
});

/** The CORA "after" shape: a main line, a recovery branch that rejoins, a manual fallback, and a retry loop. */
const after: PublicCaseStudyWorkflowPanel = {
  key: 'after', label: 'After', summary: null,
  laneLabels: { primary: 'Live path', recovery: 'Recovery path', manual: 'Manual repair' },
  nodes: [
    node('launch'), node('completes'), node('event'), node('pipeline'),
    node('gap', 'recovery'), node('fetch', 'recovery'), node('replay', 'recovery'),
    node('advance', 'manual'),
  ],
  edges: [
    edge('launch', 'completes'), edge('completes', 'event'), edge('event', 'pipeline'),
    edge('completes', 'gap', 'no event'), edge('gap', 'fetch'), edge('fetch', 'replay'), edge('replay', 'pipeline'),
    edge('fetch', 'advance', 'source unavailable'), edge('advance', 'pipeline'),
    edge('fetch', 'gap', 'retry'),
  ],
  initialNodeKey: 'launch',
};

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('workflowSteps', () => {
  it('assigns longest-path steps so a rejoining branch lands after both feeders', () => {
    const steps = workflowSteps(after);
    expect(steps.get('launch')).toBe(0);
    expect(steps.get('completes')).toBe(1);
    expect(steps.get('gap')).toBe(2);
    expect(steps.get('replay')).toBe(4);
    expect(steps.get('advance')).toBe(4);
    // pipeline is fed by event (2), replay (4) and advance (4): it sits after all of them.
    expect(steps.get('pipeline')).toBe(5);
  });

  it('still places every node when the graph is one cycle', () => {
    const ring: PublicCaseStudyWorkflowPanel = { ...after, nodes: [node('a'), node('b'), node('c')], edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')], initialNodeKey: 'a' };
    const steps = workflowSteps(ring);
    expect([...steps.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(new Set(steps.values()).size).toBe(3);
  });
});

describe.each(['horizontal', 'vertical'] as const)('layoutWorkflow %s', (orientation) => {
  const layout = layoutWorkflow(after, orientation);

  it('draws every node once and every edge, the retry loop included', () => {
    expect(layout.nodes.map((n) => n.key).sort()).toEqual(after.nodes.map((n) => n.key).sort());
    expect(layout.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(after.edges.map((e) => `${e.from}>${e.to}`).sort());
    const retry = layout.edges.find((e) => e.from === 'fetch' && e.to === 'gap')!;
    expect(retry.returns).toBe(true);
    expect(retry.label).toBe('retry');
    expect(retry.d).toMatch(/^M [\d.]+ [\d.]+ C /);
  });

  it('places no two boxes on top of each other', () => {
    for (let i = 0; i < layout.nodes.length; i += 1) {
      for (let j = i + 1; j < layout.nodes.length; j += 1) {
        expect({ a: layout.nodes[i].key, b: layout.nodes[j].key, overlap: overlaps(layout.nodes[i], layout.nodes[j]) })
          .toEqual({ a: layout.nodes[i].key, b: layout.nodes[j].key, overlap: false });
      }
    }
  });

  it('keeps every box inside the viewBox and names the lanes it uses', () => {
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x + n.width).toBeLessThanOrEqual(layout.width);
      expect(n.y + n.height).toBeLessThanOrEqual(layout.height);
    }
    expect(layout.viewBox).toBe(`0 0 ${layout.width} ${layout.height}`);
    expect(layout.lanes.map((l) => l.label)).toEqual(['Live path', 'Recovery path', 'Manual repair']);
  });

  it('puts every edge label at a finite point', () => {
    for (const e of layout.edges) {
      expect(Number.isFinite(e.labelX)).toBe(true);
      expect(Number.isFinite(e.labelY)).toBe(true);
    }
  });
});

describe('orientation specifics', () => {
  it('horizontal runs the steps left to right and stacks lanes top to bottom', () => {
    const l = layoutWorkflow(after, 'horizontal');
    const box = (k: string) => l.nodes.find((n) => n.key === k)!;
    expect(box('completes').x).toBeGreaterThan(box('launch').x);
    expect(box('pipeline').x).toBeGreaterThan(box('replay').x);
    expect(box('gap').y).toBeGreaterThan(box('completes').y);
    expect(box('advance').y).toBeGreaterThan(box('gap').y);
    // The branch is a real branch: the rejoin edge does not run backwards.
    expect(l.edges.find((e) => e.from === 'replay' && e.to === 'pipeline')!.returns).toBe(false);
  });

  it('vertical fits a phone: one column, no wider than 360, steps top to bottom, lane as an indent', () => {
    const l = layoutWorkflow(after, 'vertical');
    expect(l.width).toBeLessThanOrEqual(360);
    const box = (k: string) => l.nodes.find((n) => n.key === k)!;
    expect(box('completes').y).toBeGreaterThan(box('launch').y);
    expect(box('pipeline').y).toBeGreaterThan(box('advance').y);
    expect(box('gap').x).toBeGreaterThan(box('launch').x);
    expect(box('advance').x).toBeGreaterThan(box('gap').x);
    for (const n of l.nodes) expect(n.x + n.width).toBeLessThanOrEqual(360);
  });

  it('switches at 768', () => {
    expect(orientationFor(767)).toBe('vertical');
    expect(orientationFor(768)).toBe('horizontal');
    expect(orientationFor(390)).toBe('vertical');
  });

  it('drops an edge to an unknown node rather than throwing, and nothing else', () => {
    const bad = { ...after, edges: [...after.edges, edge('launch', 'ghost')] };
    const l = layoutWorkflow(bad, 'horizontal');
    expect(l.edges).toHaveLength(after.edges.length);
  });
});

describe('fitting the width the page offers', () => {
  it('horizontal spans exactly the width given, with readable boxes and wrapped labels, and never overlaps', () => {
    const l = layoutWorkflow(after, 'horizontal', { maxWidth: 1268 });
    expect(l.fits).toBe(true);
    expect(l.width).toBe(1268);
    expect(l.viewBox).toBe(`0 0 1268 ${l.height}`);
    for (const n of l.nodes) {
      expect(n.width).toBeGreaterThanOrEqual(118);
      expect(n.x + n.width).toBeLessThanOrEqual(1268);
      expect(n.labelLines.length).toBeGreaterThanOrEqual(1);
      expect(n.labelLines.length).toBeLessThanOrEqual(4);
    }
    for (let i = 0; i < l.nodes.length; i += 1) {
      for (let j = i + 1; j < l.nodes.length; j += 1) expect(overlaps(l.nodes[i], l.nodes[j])).toBe(false);
    }
    // Every edge is still drawn; a diagonal between lanes keeps its label.
    expect(l.edges).toHaveLength(after.edges.length);
    expect(l.edges.find((e) => e.from === 'completes' && e.to === 'gap')!.labelFits).toBe(true);
    // A labelled short hop between neighbours in a tight column gives its label up to the panel.
    const tight = layoutWorkflow({ ...after, edges: after.edges.map((e) => (e.from === 'launch' ? { ...e, label: 'go' } : e)) }, 'horizontal', { maxWidth: 1268 });
    expect(tight.edges.find((e) => e.from === 'launch')!.labelFits).toBe(false);
    // ...and keeps it when the columns are far enough apart.
    const roomy = layoutWorkflow({ ...after, edges: after.edges.map((e) => (e.from === 'launch' ? { ...e, label: 'go' } : e)) }, 'horizontal');
    expect(roomy.edges.find((e) => e.from === 'launch')!.labelFits).toBe(true);
  });

  it('says so when the width cannot give every column a readable box', () => {
    const l = layoutWorkflow(after, 'horizontal', { maxWidth: 688 });
    expect(l.fits).toBe(false);
  });

  it('vertical uses the width offered, up to a comfortable line length, and fits a phone', () => {
    const tablet = layoutWorkflow(after, 'vertical', { maxWidth: 688 });
    expect(tablet.width).toBe(688);
    expect(tablet.nodes[0].width).toBeLessThanOrEqual(520);
    expect(tablet.nodes[0].width).toBeGreaterThan(360);
    const phone = layoutWorkflow(after, 'vertical', { maxWidth: 342 });
    expect(phone.width).toBe(342);
    for (const n of phone.nodes) expect(n.x + n.width).toBeLessThanOrEqual(342);
  });

  it('layoutWorkflowToFit keeps the horizontal composition on a desk and takes the column on a phone', () => {
    expect(layoutWorkflowToFit(after, 1440, 1268).orientation).toBe('horizontal');
    expect(layoutWorkflowToFit(after, 390, 342).orientation).toBe('vertical');
    // A six-step panel fits a narrower desk.
    const before = { ...after, nodes: after.nodes.slice(0, 4), edges: after.edges.slice(0, 3) };
    expect(layoutWorkflowToFit(before, 1024, 900).orientation).toBe('horizontal');
  });

  /**
   * The narrow-canvas rule, which is the whole reason aiflotation.com drew a
   * stack where the other two sites drew lanes: a canvas narrower than the
   * drawing scales it (the SVG is `width: 100%`), so the composition is kept
   * until the type would be too small to read.
   */
  it('scales a horizontal drawing into a narrow canvas rather than stacking it, up to 1.6x', () => {
    // The narrowest this panel can be drawn horizontally: boxes at their floor.
    const tightest = layoutWorkflow(after, 'horizontal', { maxWidth: 1 }).width;
    // A canvas just under it, which is AI Flotation's case: kept, and scaled.
    const narrow = tightest - 60;
    const flotation = layoutWorkflowToFit(after, 1440, narrow);
    expect(flotation.orientation).toBe('horizontal');
    expect(flotation.width).toBeGreaterThan(narrow);
    expect(layoutWorkflowToFit(after, 768, 688).orientation).toBe('horizontal');
    // Past the cap the column is the honest answer: the boxes would be unreadable.
    expect(layoutWorkflowToFit(after, 1440, Math.floor(tightest / 1.8)).orientation).toBe('vertical');
    // An unmeasured canvas keeps the drawing rather than guessing a ratio.
    expect(layoutWorkflowToFit(after, 1440, 0).orientation).toBe('horizontal');
  });
});
