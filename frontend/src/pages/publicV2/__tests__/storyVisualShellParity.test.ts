import { layoutWorkflow, workflowSteps } from '../storyWorkflowLayout';
import { cardFigure, chartsFor, countUpEligible, outcomeCardsFor, panelSelectionOrder, wrapLabel } from '../storyVisualModel';
import type {
  PublicCaseStudyMetric,
  PublicCaseStudyVisualChart,
  PublicCaseStudyVisualStory,
  PublicCaseStudyWorkflowEdge,
  PublicCaseStudyWorkflowNode,
  PublicCaseStudyWorkflowPanel,
} from '../../../services/caseStudyPublicTypes';

/* eslint-disable @typescript-eslint/no-var-requires */
// The framework-free port the other brand sites draw the band with. Plain
// script, so it is required rather than imported; it exports under CommonJS.
const shell = require('../../../../../packages/case-study-shell/case-study-visual-model.js') as {
  layoutWorkflow: typeof layoutWorkflow;
  workflowSteps: (panel: PublicCaseStudyWorkflowPanel) => Record<string, number>;
  panelSelectionOrder: typeof panelSelectionOrder;
  wrapLabel: typeof wrapLabel;
  cardFigure: typeof cardFigure;
  countUpEligible: typeof countUpEligible;
  outcomeCardsFor: typeof outcomeCardsFor;
  chartsFor: typeof chartsFor;
};
/* eslint-enable @typescript-eslint/no-var-requires */

/**
 * ONE DRAWING ON EVERY SITE. aiflotation.com and training.colaberry.com draw
 * the band with `packages/case-study-shell/case-study-visual-model.js`, a
 * hand-written port of the three pure modules here. This test runs both
 * against the same records and fails the moment they disagree, which is what
 * lets the port exist without becoming a second opinion.
 */

const node = (key: string, lane: PublicCaseStudyWorkflowNode['lane'] = 'primary', label = key): PublicCaseStudyWorkflowNode => ({
  key, label, sublabel: null, detail: null, kicker: null, role: 'system', status: 'processing', lane, evidence: null, tally: null,
});
const edge = (from: string, to: string, label: string | null = null): PublicCaseStudyWorkflowEdge => ({
  from, to, label, status: 'processing', condition: null, motion: true,
});

/** The CORA "after" shape: a main line, a recovery branch that rejoins, a manual fallback, a retry loop. */
const after: PublicCaseStudyWorkflowPanel = {
  key: 'after', label: 'After', summary: null,
  laneLabels: { primary: 'Live path', recovery: 'Recovery path', manual: 'Manual repair' },
  nodes: [
    node('launch', 'primary', 'Outbound call launched'), node('completes', 'primary', 'Call completes on the platform'),
    node('event', 'primary', 'Completion event arrives'), node('pipeline', 'primary', 'Replayed through the same pipeline'),
    node('gap', 'recovery', 'Missing-event detection query'), node('fetch', 'recovery', 'Automatic recovery job, every 5 minutes'),
    node('replay', 'recovery', 'Source call retrieved, read-only'), node('advance', 'manual', 'Advanced as no-answer'),
  ],
  edges: [
    edge('launch', 'completes'), edge('completes', 'event'), edge('event', 'pipeline'),
    edge('completes', 'gap', 'no completion event'), edge('gap', 'fetch'), edge('fetch', 'replay'), edge('replay', 'pipeline', 'replay'),
    edge('fetch', 'advance', 'source unavailable'), edge('advance', 'pipeline'),
    edge('fetch', 'gap', 'retry'),
  ],
  initialNodeKey: 'launch',
};

/** The "proposes" shape: every routing case at once. */
const proposes: PublicCaseStudyWorkflowPanel = {
  key: 'single', label: 'As built', summary: null,
  laneLabels: { primary: 'Proposal', recovery: 'Guardrails', manual: 'Human decision' },
  nodes: [
    node('telemetry'), node('model'), node('proposal'),
    node('abac', 'recovery'), node('queue', 'recovery'), node('guardrail', 'recovery'), node('audit', 'recovery'),
    node('human', 'manual'), node('refused', 'manual'),
  ],
  edges: [
    edge('telemetry', 'model'), edge('model', 'proposal'), edge('proposal', 'abac', 'checked'),
    edge('abac', 'refused', 'no'), edge('abac', 'queue', 'yes'), edge('queue', 'human', 'held until a person acts'),
    edge('human', 'refused', 'reject'), edge('human', 'guardrail', 'approve'), edge('guardrail', 'audit'),
    edge('human', 'audit', 'decision recorded'),
  ],
  initialNodeKey: 'telemetry',
};

const metric = (over: Partial<PublicCaseStudyMetric>): PublicCaseStudyMetric => ({
  label: 'Lost completion events resolved by the system', valueDisplay: '97% of lost completion events resolved, from 46% by hand',
  unit: null, baseline: null, sample: null, methodology: null, limitations: [], verificationClass: 'verified', verificationMethod: null,
  payload: null, ...over,
} as PublicCaseStudyMetric);

const metrics: PublicCaseStudyMetric[] = [
  metric({ payload: { shape: 'ratio', numerator: 586, denominator: 604 } as PublicCaseStudyMetric['payload'] }),
  metric({ label: 'Recoveries by the job', valueDisplay: '96% of recoveries automatic (334 of 347)', payload: { shape: 'share', numerator: 334, denominator: 347 } as PublicCaseStudyMetric['payload'] }),
  metric({ label: 'Duplicate records', valueDisplay: '0 of 339', unit: 'records', payload: { shape: 'count', value: 0 } as PublicCaseStudyMetric['payload'] }),
  metric({ label: 'Time to recovery', valueDisplay: 'median 34 minutes, p90 47 minutes', payload: { shape: 'span', startDate: '2026-04-27', endDate: '2026-04-29' } }),
  metric({ label: 'Small share', valueDisplay: '3.2% of calls', payload: { shape: 'share', numerator: 11, denominator: 339 } as PublicCaseStudyMetric['payload'] }),
  metric({ label: 'Decision records', valueDisplay: '14 decision records', unit: 'records', payload: { shape: 'count', value: 1400 } as PublicCaseStudyMetric['payload'] }),
  metric({ label: 'Wait', valueDisplay: 'median 34 minutes, p90 47 minutes', unit: 'minutes', payload: { shape: 'count', value: 34.2 } as PublicCaseStudyMetric['payload'] }),
  metric({ label: 'Small wait', valueDisplay: '4.25 minutes', unit: 'minutes', payload: { shape: 'count', value: 4.25 } as PublicCaseStudyMetric['payload'] }),
];

const charts: PublicCaseStudyVisualChart[] = [
  {
    key: 'how', kind: 'composition', title: 'How the 604 lost completion events were resolved', caption: null, metric: metrics[0], denominator: 604,
    parts: [
      { label: 'Recovered and replayed', value: 301, denominator: 604, status: 'resolved', caveat: null },
      { label: 'Advanced as no-answer', value: 285, denominator: 604, status: 'processing', caveat: null },
    ],
    unit: null, axisMax: null, caveat: null, limitations: ['Counted from the recovery audit rows'],
  },
  {
    key: 'time', kind: 'two_value', title: 'Time from launch completion to automatic recovery', caption: 'Median and p90', metric: metrics[3], denominator: 0,
    parts: [
      { label: 'Median', value: 34.2, denominator: 0, status: 'processing', caveat: null },
      { label: '90th percentile', value: 47, denominator: 0, status: 'processing', caveat: 'one window' },
    ],
    unit: 'min', axisMax: 60, caveat: null, limitations: [],
  },
  { key: 'zero', kind: 'zero_card', title: 'Recovered calls that produced a duplicate', caption: null, metric: metrics[2], denominator: 339, parts: [{ label: 'Duplicates', value: 0, denominator: 339, status: 'resolved', caveat: null }], unit: null, axisMax: null, caveat: 'A zero', limitations: [] },
  { key: 'empty', kind: 'share', title: 'Nothing resolved', caption: null, metric: metrics[1], denominator: 10, parts: [], unit: null, axisMax: null, caveat: null, limitations: [] },
];

const story: PublicCaseStudyVisualStory = { schemaVersion: 1, presentationVersion: 'v2', motion: 'auto', workflow: null, outcomeCards: metrics.slice(0, 4), charts };

describe('the shell port draws what the page draws', () => {
  it.each([after, proposes])('assigns the same steps and the same selection order ($key)', (panel) => {
    expect(shell.workflowSteps(panel)).toEqual(Object.fromEntries(workflowSteps(panel)));
    expect(shell.panelSelectionOrder(panel)).toEqual(panelSelectionOrder(panel));
  });

  it.each([
    [after, 1198], [after, 1022], [after, 1268], [proposes, 1198], [proposes, 900],
  ])('lays out %s horizontally at %i px identically, boxes, edges, labels and fit', (panel, width) => {
    const ours = layoutWorkflow(panel, 'horizontal', { maxWidth: width });
    const theirs = shell.layoutWorkflow(panel, 'horizontal', { maxWidth: width });
    expect(JSON.parse(JSON.stringify(theirs))).toEqual(JSON.parse(JSON.stringify(ours)));
  });

  it.each([[after, 688], [after, 342], [proposes, 360]])('lays out %s vertically at %i px identically', (panel, width) => {
    const ours = layoutWorkflow(panel, 'vertical', { maxWidth: width });
    const theirs = shell.layoutWorkflow(panel, 'vertical', { maxWidth: width });
    expect(JSON.parse(JSON.stringify(theirs))).toEqual(JSON.parse(JSON.stringify(ours)));
  });

  it('agrees on the default sizes with no width given', () => {
    expect(JSON.parse(JSON.stringify(shell.layoutWorkflow(after, 'horizontal')))).toEqual(JSON.parse(JSON.stringify(layoutWorkflow(after, 'horizontal'))));
  });

  it('wraps labels identically, ellipsis included', () => {
    for (const label of ['Ten competencies, each independent', 'Automatic recovery job, every 5 minutes', 'Short', 'Averyveryverylongsinglewordlabel here']) {
      for (const [width, lines] of [[12, 4], [15, 3], [22, 2]] as const) expect(shell.wrapLabel(label, width, lines)).toEqual(wrapLabel(label, width, lines));
    }
  });

  it('shows the same figure on every card and animates the same ones', () => {
    for (const m of metrics) {
      expect(shell.cardFigure(m)).toBe(cardFigure(m));
      expect(shell.countUpEligible(shell.cardFigure(m))).toBe(countUpEligible(cardFigure(m)));
    }
    expect(JSON.parse(JSON.stringify(shell.outcomeCardsFor(story)))).toEqual(JSON.parse(JSON.stringify(outcomeCardsFor(story))));
    // The values themselves, so a shared mistake cannot pass as agreement.
    expect(metrics.map((m) => cardFigure(m))).toEqual(['97%', '96%', '0 records', 'median 34 minutes', '3.2%', '1,400 records', '34 minutes', '4.3 minutes']);
  });

  it('resolves the same chart rows, percents, summaries and notes, and drops the empty chart', () => {
    const ours = chartsFor(story);
    const theirs = shell.chartsFor(story);
    expect(JSON.parse(JSON.stringify(theirs))).toEqual(JSON.parse(JSON.stringify(ours)));
    expect(ours.map((c) => c.key)).toEqual(['how', 'time', 'zero']);
    expect(ours[1].rows[0].percent).toBeCloseTo(57, 0);
  });
});
