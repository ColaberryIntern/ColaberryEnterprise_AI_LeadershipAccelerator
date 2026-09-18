import {
  STATUS_WORD,
  cardFigure,
  chartsFor,
  compositionRemainder,
  countUpEligible,
  outcomeCardsFor,
  panelSelectionOrder,
  visualStoryFor,
} from '../storyVisualModel';
import type {
  PublicCaseStudyMetric,
  PublicCaseStudyVisualChart,
  PublicCaseStudyVisualStory,
  PublicCaseStudyWorkflowPanel,
} from '../../../services/caseStudyPublicTypes';

const metric = (label: string, valueDisplay: string): PublicCaseStudyMetric => ({
  label, valueDisplay, unit: null, verificationClass: 'verified', verificationMethod: 'internal',
  baseline: null, sample: null, methodology: null, limitations: [], shape: null, payload: null, plain: null,
  collection: null,
} as unknown as PublicCaseStudyMetric);

const chart = (over: Partial<PublicCaseStudyVisualChart>): PublicCaseStudyVisualChart => ({
  key: 'c', kind: 'share', title: 'Share', caption: null, metric: metric('Resolved', '97%'), denominator: 604,
  parts: [{ label: 'Resolved', value: 586, denominator: 604, status: 'resolved', caveat: null }],
  unit: null, axisMax: null, caveat: null, limitations: [],
  ...over,
});

const story = (over: Partial<PublicCaseStudyVisualStory> = {}): PublicCaseStudyVisualStory => ({
  schemaVersion: 1, presentationVersion: 'v2', motion: 'auto', workflow: null, outcomeCards: [], charts: [], ...over,
});

describe('visualStoryFor', () => {
  it('is null for a legacy record and for a story with nothing in it', () => {
    expect(visualStoryFor({ visualStory: null })).toBeNull();
    expect(visualStoryFor({ visualStory: story() })).toBeNull();
    expect(visualStoryFor({ visualStory: story({ charts: [chart({})] }) })).not.toBeNull();
  });
});

describe('panelSelectionOrder', () => {
  const panel: PublicCaseStudyWorkflowPanel = {
    key: 'after', label: 'After', summary: null, laneLabels: { primary: 'a', recovery: 'b', manual: 'c' },
    nodes: ['orphan', 'start', 'left', 'right', 'end'].map((key) => ({
      key, label: key, sublabel: null, detail: null, kicker: null, role: 'system', status: 'processing', lane: 'primary', evidence: null, tally: null,
    })),
    edges: [
      { from: 'start', to: 'left', label: null, status: 'processing', condition: null, motion: true },
      { from: 'start', to: 'right', label: null, status: 'processing', condition: null, motion: true },
      { from: 'left', to: 'end', label: null, status: 'processing', condition: null, motion: true },
      { from: 'right', to: 'end', label: null, status: 'processing', condition: null, motion: true },
    ],
    initialNodeKey: 'start',
  };

  it('starts at the initial node, walks the edges breadth-first, then appends the unreachable, each once', () => {
    expect(panelSelectionOrder(panel)).toEqual(['start', 'left', 'right', 'end', 'orphan']);
  });

  it('falls back to the first declared node when the initial key is unknown', () => {
    expect(panelSelectionOrder({ ...panel, initialNodeKey: 'ghost' })[0]).toBe('orphan');
  });
});

describe('countUpEligible', () => {
  it('accepts whole numbers, percents and multipliers, with thousands separators', () => {
    for (const s of ['97%', '586', '1,204', '3x', '12 hours', '+40%']) expect({ s, ok: countUpEligible(s) }).toEqual({ s, ok: true });
  });

  it('refuses decimals, zero, ranges that start with a word, and no number at all', () => {
    for (const s of ['34.2 min', '0 of 339', 'n/a', 'about 40', '', '-3']) expect({ s, ok: countUpEligible(s) }).toEqual({ s, ok: false });
  });
});

describe('outcomeCardsFor', () => {
  it('keeps at most three, in wire order, and marks only parsable figures for animation', () => {
    const cards = outcomeCardsFor(story({ outcomeCards: [metric('A', '97%'), metric('B', '34.2 min'), metric('C', '0 of 339'), metric('D', '5')] }));
    expect(cards.map((c) => [c.metric.label, c.figure, c.animate])).toEqual([['A', '97%', true], ['B', '34.2 min', false], ['C', '0 of 339', false]]);
  });

  it('takes the figure from the metric shape and keeps the record wording as the statement', () => {
    const ratio = { ...metric('Resolved', '97% of lost completion events resolved, from 46% by hand'), shape: 'ratio', payload: { shape: 'ratio', numerator: 586, denominator: 604 } } as PublicCaseStudyMetric;
    const share = { ...metric('Lost', '4.2% of launches lost their completion event'), shape: 'share', payload: { shape: 'share', numerator: 604, denominator: 14510 } } as PublicCaseStudyMetric;
    const count = { ...metric('Wait', 'median 34 minutes, p90 47 minutes'), shape: 'count', payload: { shape: 'count', value: 34.2 } } as PublicCaseStudyMetric;
    const unit = { ...count, unit: 'min' } as PublicCaseStudyMetric;
    expect(cardFigure(ratio)).toBe('97%');
    expect(cardFigure(share)).toBe('4.2%');
    expect(cardFigure(count)).toBe('median 34 minutes');
    // The rounded public headline: whole from ten up, one decimal below ten; the stored 34.2 is untouched.
    expect(cardFigure(unit)).toBe('34 min');
    expect(cardFigure({ ...unit, payload: { shape: 'count', value: 4.25 } } as PublicCaseStudyMetric)).toBe('4.3 min');
    expect(cardFigure({ ...unit, payload: { shape: 'count', value: 1400 } } as PublicCaseStudyMetric)).toBe('1,400 min');
    const [card] = outcomeCardsFor(story({ outcomeCards: [ratio] }));
    expect(card.statement).toBe('97% of lost completion events resolved, from 46% by hand');
    expect(card.animate).toBe(true);
  });
});

describe('chartsFor', () => {
  it('turns parts into rows with the wire figures spelled out, a percent for the bar, and a status word', () => {
    const [view] = chartsFor(story({ charts: [chart({})] }));
    expect(view.rows).toEqual([{
      label: 'Resolved', value: 586, denominator: 604, percent: (586 / 604) * 100, status: 'resolved', statusWord: 'Resolved', caveat: null, figure: '586 of 604',
    }]);
    expect(view.summary).toBe('Share: Resolved 586 of 604.');
    expect(view.note).toBeNull();
  });

  it('gives comparison and two-value charts their guardrail sentence, and two-value bars scale to the axis', () => {
    const cmp = chartsFor(story({ charts: [chart({ kind: 'comparison', title: 'Then and now', parts: [
      { label: 'Before', value: 245, denominator: 533, status: 'attention', caveat: 'incident window' },
      { label: 'After', value: 586, denominator: 604, status: 'resolved', caveat: null },
    ] })] }))[0];
    expect(cmp.note).toMatch(/not a controlled comparison/);
    expect(cmp.summary).toBe('Then and now: Before 245 of 533; After 586 of 604. Two observation windows, not a controlled comparison.');
    const two = chartsFor(story({ charts: [chart({ kind: 'two_value', title: 'Wait', unit: 'min', axisMax: 60, parts: [
      { label: 'Median', value: 34, denominator: 60, status: 'processing', caveat: null },
      { label: 'p90', value: 47, denominator: 60, status: 'processing', caveat: null },
    ] })] }))[0];
    expect(two.rows.map((r) => [r.figure, Math.round(r.percent)])).toEqual([['34 min', 57], ['47 min', 78]]);
    expect(two.note).toBe('Two summary statistics, not a trend.');
  });

  it('renders a zero card as the wire zero, never as an absent figure', () => {
    const [zero] = chartsFor(story({ charts: [chart({ kind: 'zero_card', title: 'Duplicates', denominator: 339, parts: [
      { label: 'Duplicate replays', value: 0, denominator: 339, status: 'resolved', caveat: null },
    ] })] }));
    expect(zero.rows[0].figure).toBe('0 of 339');
    expect(zero.rows[0].percent).toBe(0);
    expect(zero.summary).toBe('Duplicates: 0 of 339.');
  });

  it('drops a chart with no rows rather than drawing an empty bar as zero', () => {
    expect(chartsFor(story({ charts: [chart({ parts: [] })] }))).toEqual([]);
  });

  it('reports the composition remainder so the table can account for the whole', () => {
    const [comp] = chartsFor(story({ charts: [chart({ kind: 'composition', title: 'How they were recovered', denominator: 604, parts: [
      { label: 'Auto', value: 301, denominator: 604, status: 'resolved', caveat: null },
      { label: 'Assisted', value: 285, denominator: 604, status: 'processing', caveat: null },
    ] })] }));
    expect(compositionRemainder(comp)).toBe(18);
    expect(comp.summary).toBe('How they were recovered: Auto 301 of 604; Assisted 285 of 604, of 604 in total.');
  });

  it('has a word for every status', () => {
    expect(Object.keys(STATUS_WORD).sort()).toEqual(['attention', 'failure', 'processing', 'resolved', 'unknown']);
  });
});
