import type {
  CaseStudyVisualChartKind,
  CaseStudyWorkflowStatus,
  PublicCaseStudyDetail,
  PublicCaseStudyMetric,
  PublicCaseStudyVisualChart,
  PublicCaseStudyVisualStory,
  PublicCaseStudyWorkflowPanel,
} from '../../services/caseStudyPublicTypes';

/**
 * storyVisualModel - the visual story as the band renders it.
 *
 * NOTHING HERE COMPUTES A FIGURE. Every number a reader sees arrived on the
 * wire already resolved from a verified metric by the server projection; this
 * module only arranges those numbers into rows a bar can be drawn from and
 * sentences a screen reader can say. A percentage is derived from a value and
 * a denominator the wire supplied together, for the bar's length only; the
 * text beside the bar is the wire's own wording.
 *
 * PURE. Total functions of the record. The graph geometry lives next door in
 * `storyWorkflowLayout.ts`; motion lives in a hook. This is the part that can
 * be unit-tested without a DOM.
 */

export type {
  PublicCaseStudyVisualStory,
  PublicCaseStudyVisualChart,
  PublicCaseStudyWorkflow,
  PublicCaseStudyWorkflowPanel,
  PublicCaseStudyWorkflowNode,
  PublicCaseStudyWorkflowEdge,
  CaseStudyWorkflowStatus,
  CaseStudyWorkflowLane,
  CaseStudyWorkflowRole,
} from '../../services/caseStudyPublicTypes';

/** What a status means in words, so colour is never the only carrier. */
export const STATUS_WORD: Readonly<Record<CaseStudyWorkflowStatus, string>> = Object.freeze({
  processing: 'In flow',
  resolved: 'Resolved',
  attention: 'Needs attention',
  failure: 'Failed',
  unknown: 'Unknown',
});

export function visualStoryFor(record: Pick<PublicCaseStudyDetail, 'visualStory'>): PublicCaseStudyVisualStory | null {
  const story = record.visualStory;
  if (!story) return null;
  // A story with nothing to show is the same as no story; the band never renders empty.
  if (!story.workflow && story.outcomeCards.length === 0 && story.charts.length === 0) return null;
  return story;
}

/* ---------------------------------------------------------------- workflow --- */

/**
 * The order Previous / Next walk the nodes: the initial node first, then a
 * breadth-first walk along the edges, then anything unreachable in declared
 * order. Every node appears exactly once.
 */
export function panelSelectionOrder(panel: PublicCaseStudyWorkflowPanel): readonly string[] {
  const keys = panel.nodes.map((n) => n.key);
  const known = new Set(keys);
  const start = known.has(panel.initialNodeKey) ? panel.initialNodeKey : keys[0];
  const order: string[] = [];
  const seen = new Set<string>();
  const queue: string[] = start ? [start] : [];
  while (queue.length > 0) {
    const k = queue.shift()!;
    if (seen.has(k)) continue;
    seen.add(k);
    order.push(k);
    for (const e of panel.edges) if (e.from === k && known.has(e.to) && !seen.has(e.to)) queue.push(e.to);
  }
  for (const k of keys) if (!seen.has(k)) { seen.add(k); order.push(k); }
  return order;
}

/**
 * Split a node label into at most `lines` lines of about `width` characters,
 * breaking only at spaces. SVG text does not wrap on its own; a word longer
 * than the width stands alone on its line rather than being cut.
 */
export function wrapLabel(text: string, width = 22, lines = 2): readonly string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  if (out.length <= lines) return out;
  // Over budget: keep the first lines and end the last one with an ellipsis.
  const kept = out.slice(0, lines);
  kept[lines - 1] = `${kept[lines - 1].slice(0, Math.max(1, width - 1))}…`;
  return kept;
}

/* ------------------------------------------------------------ outcome cards --- */

export interface OutcomeCardView {
  readonly key: string;
  readonly metric: PublicCaseStudyMetric;
  /** True only when the figure is a whole number, optionally a percent, so the count-up cannot misread it. */
  readonly animate: boolean;
}

/**
 * Only a leading whole number, on its own or followed by a percent sign, a
 * multiplier or a space, may count up. "34.2 min" would animate as 0.2, 1.2,
 * ... and a reader would see a wrong figure on the way; "0 of 339" has nothing
 * to count; "n/a" has no number at all.
 */
export function countUpEligible(valueDisplay: string): boolean {
  const m = valueDisplay.trim().match(/^\+?(\d[\d,]*)(%|x|×|\s|$)/);
  if (!m) return false;
  const value = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0;
}

export function outcomeCardsFor(story: PublicCaseStudyVisualStory): readonly OutcomeCardView[] {
  return story.outcomeCards.slice(0, 3).map((metric, i) => ({
    key: `${i}-${metric.label}`,
    metric,
    animate: countUpEligible(metric.valueDisplay),
  }));
}

/* ------------------------------------------------------------------ charts --- */

export interface ChartRowView {
  readonly label: string;
  readonly value: number;
  readonly denominator: number;
  /** 0..100, for the bar's length only. */
  readonly percent: number;
  readonly status: CaseStudyWorkflowStatus;
  readonly statusWord: string;
  readonly caveat: string | null;
  /** "301 of 604" style wording for the table and the screen reader. */
  readonly figure: string;
}

export interface ChartView {
  readonly key: string;
  readonly kind: CaseStudyVisualChartKind;
  readonly title: string;
  readonly caption: string | null;
  readonly metric: PublicCaseStudyMetric;
  readonly denominator: number;
  readonly unit: string | null;
  readonly axisMax: number | null;
  readonly rows: readonly ChartRowView[];
  readonly caveat: string | null;
  readonly limitations: readonly string[];
  /** The one sentence a screen reader hears for the whole chart. */
  readonly summary: string;
  /** A fixed guardrail sentence for kinds that are easy to misread, or null. */
  readonly note: string | null;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

const pct = (value: number, denominator: number): number =>
  denominator > 0 ? Math.max(0, Math.min(100, (value / denominator) * 100)) : 0;

const NOTE: Readonly<Partial<Record<CaseStudyVisualChartKind, string>>> = Object.freeze({
  comparison: 'Two observation windows, not a controlled comparison.',
  two_value: 'Two summary statistics, not a trend.',
  zero_card: 'A zero over a real denominator, from the record\'s own measurement.',
});

function rowsFor(chart: PublicCaseStudyVisualChart): readonly ChartRowView[] {
  return chart.parts.map((p) => {
    const denominator = chart.kind === 'two_value' && chart.axisMax ? chart.axisMax : p.denominator;
    const figure = chart.kind === 'two_value'
      ? `${fmt(p.value)}${chart.unit ? ` ${chart.unit}` : ''}`
      : `${fmt(p.value)} of ${fmt(p.denominator)}`;
    return {
      label: p.label,
      value: p.value,
      denominator: p.denominator,
      percent: pct(p.value, denominator),
      status: p.status,
      statusWord: STATUS_WORD[p.status],
      caveat: p.caveat,
      figure,
    };
  });
}

function summaryFor(chart: PublicCaseStudyVisualChart, rows: readonly ChartRowView[]): string {
  const parts = rows.map((r) => `${r.label} ${r.figure}`).join('; ');
  switch (chart.kind) {
    case 'composition':
      return `${chart.title}: ${parts}, of ${fmt(chart.denominator)} in total.`;
    case 'comparison':
      return `${chart.title}: ${parts}. ${NOTE.comparison}`;
    case 'two_value':
      return `${chart.title}: ${parts}. ${NOTE.two_value}`;
    case 'zero_card':
      return `${chart.title}: ${rows[0] ? rows[0].figure : chart.metric.valueDisplay}.`;
    case 'share':
    default:
      return `${chart.title}: ${parts}.`;
  }
}

export function chartsFor(story: PublicCaseStudyVisualStory): readonly ChartView[] {
  const out: ChartView[] = [];
  for (const chart of story.charts) {
    const rows = rowsFor(chart);
    // A chart with no row would draw nothing and read as zero. It is not drawn.
    if (rows.length === 0) continue;
    out.push({
      key: chart.key,
      kind: chart.kind,
      title: chart.title,
      caption: chart.caption,
      metric: chart.metric,
      denominator: chart.denominator,
      unit: chart.unit,
      axisMax: chart.axisMax,
      rows,
      caveat: chart.caveat,
      limitations: chart.limitations,
      summary: summaryFor(chart, rows),
      note: NOTE[chart.kind] ?? null,
    });
  }
  return out;
}

/** Composition rows must account for the whole; the table says so when they do not. */
export function compositionRemainder(chart: ChartView): number {
  const sum = chart.rows.reduce((acc, r) => acc + r.value, 0);
  return Math.max(0, chart.denominator - sum);
}
