import { z } from 'zod';
import type {
  CaseStudyMetricEntry,
  CaseStudyMetricPayload,
  CaseStudySnapshotContent,
} from '../../types/caseStudy';
import {
  CASE_STUDY_VISUAL_CHART_KINDS,
  CASE_STUDY_VISUAL_GENERATORS,
  CASE_STUDY_VISUAL_LIMITS as L,
  CASE_STUDY_VISUAL_MOTION,
  CASE_STUDY_VISUAL_STATES,
  CASE_STUDY_WORKFLOW_LANES,
  CASE_STUDY_WORKFLOW_PANEL_KEYS,
  CASE_STUDY_WORKFLOW_ROLES,
  CASE_STUDY_WORKFLOW_STATUSES,
  CASE_STUDY_WORKFLOW_TYPES,
  type CaseStudyVisualChart,
  type CaseStudyVisualStorySection,
  type CaseStudyWorkflowPanel,
} from '../../types/caseStudyVisual';

/**
 * caseStudyVisualStoryValidate - the deterministic check every visual story
 * passes before it is written (Studio override) and before it is published
 * (gate rule `visual_story_invalid`).
 *
 * WHAT IT REFUSES, AND WHY EACH REFUSAL IS ACTIONABLE. A model or a person can
 * propose labels and layouts; this decides whether the result is a story the
 * platform will draw. Every error carries the path of the field at fault and a
 * stable code, so the Studio can point at the row and the gate can name it.
 *   - Shape: unknown keys are rejected (`.strict()`), because a field the
 *     renderer does not know is either a typo or an attempt to smuggle markup.
 *   - Text: labels may not contain `<`, a URL scheme or `@`. The public payload
 *     is data, and a label is the one place a string reaches the DOM.
 *   - Graph: node keys unique, every edge joins two nodes in the same panel, no
 *     self loops, a `before_after` story carries exactly a before and an after
 *     panel, limits per panel so a dense graph is summarised, never dropped.
 *   - Figures: every `metricKey` names a verified, publishable metric on the
 *     record; a literal chart value is allowed only beside an `evidenceId` that
 *     is on the record; composition parts must sum to the metric's denominator;
 *     a two-value chart may not be labelled a trend; a zero card needs a real
 *     denominator, because missing is not zero.
 * Unknown stays unknown: nothing here fills a gap with a default figure.
 */

export interface VisualStoryMetricFact {
  readonly key: string;
  readonly publishable: boolean;
  readonly verified: boolean;
  readonly payload?: CaseStudyMetricPayload;
  readonly numericValue?: number;
}

export interface VisualStoryValidationContext {
  readonly metrics: readonly VisualStoryMetricFact[];
  readonly evidenceIds: readonly string[];
}

export interface VisualStoryValidationError {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type VisualStoryValidationResult =
  | { readonly ok: true; readonly section: CaseStudyVisualStorySection; readonly errors: readonly [] }
  | { readonly ok: false; readonly section: null; readonly errors: readonly VisualStoryValidationError[] };

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const UNSAFE_RE = /[<>]|https?:|@|[\x00-\x1f]/i;
const TREND_RE = /\b(trend|over time|per week|per day|time series|growth)\b/i;

const text = (max: number) => z.string().trim().min(1).max(max).refine((s) => !UNSAFE_RE.test(s), {
  message: 'must not contain <, >, a URL scheme, @ or control characters',
});
const key = z.string().regex(KEY_RE, 'lowercase letters, digits, _ and -, up to 40 characters');

const nodeSchema = z.object({
  key,
  label: text(L.nodeLabel),
  sublabel: text(L.nodeSublabel).optional(),
  detail: text(L.nodeDetail).optional(),
  kicker: text(L.nodeKicker).optional(),
  role: z.enum(CASE_STUDY_WORKFLOW_ROLES),
  status: z.enum(CASE_STUDY_WORKFLOW_STATUSES).optional(),
  lane: z.enum(CASE_STUDY_WORKFLOW_LANES).optional(),
  evidence: text(L.nodeEvidence).optional(),
  evidenceId: z.string().min(1).max(80).optional(),
  metricKey: z.string().min(1).max(80).optional(),
}).strict();

const edgeSchema = z.object({
  from: key,
  to: key,
  label: text(L.edgeLabel).optional(),
  status: z.enum(CASE_STUDY_WORKFLOW_STATUSES).optional(),
  condition: text(L.edgeCondition).optional(),
  motion: z.boolean().optional(),
}).strict();

const panelSchema = z.object({
  key: z.enum(CASE_STUDY_WORKFLOW_PANEL_KEYS),
  label: text(L.panelLabel),
  summary: text(L.panelSummary).optional(),
  laneLabels: z.object({
    primary: text(L.panelLabel).optional(),
    recovery: text(L.panelLabel).optional(),
    manual: text(L.panelLabel).optional(),
  }).strict().optional(),
  nodes: z.array(nodeSchema).min(1).max(L.nodesPerPanel),
  edges: z.array(edgeSchema).max(L.edgesPerPanel),
  initialNodeKey: key.optional(),
}).strict();

const workflowSchema = z.object({
  key,
  type: z.enum(CASE_STUDY_WORKFLOW_TYPES),
  title: text(L.title),
  caption: text(L.caption).optional(),
  description: text(L.description),
  panels: z.array(panelSchema).min(1).max(2),
  motionNote: text(L.caption).optional(),
}).strict();

const partSchema = z.object({
  label: text(L.nodeLabel),
  metricKey: z.string().min(1).max(80).optional(),
  value: z.number().finite().nonnegative().optional(),
  denominator: z.number().finite().positive().optional(),
  evidenceId: z.string().min(1).max(80).optional(),
  status: z.enum(CASE_STUDY_WORKFLOW_STATUSES).optional(),
  caveat: text(L.caveat).optional(),
}).strict();

const chartSchema = z.object({
  key,
  kind: z.enum(CASE_STUDY_VISUAL_CHART_KINDS),
  title: text(L.title),
  caption: text(L.caption).optional(),
  metricKey: z.string().min(1).max(80),
  parts: z.array(partSchema).max(L.chartParts).optional(),
  unit: text(40).optional(),
  axisMax: z.number().finite().positive().optional(),
  caveat: text(L.caveat).optional(),
  limitations: z.array(text(L.limitation)).max(6).optional(),
}).strict();

const sectionSchema = z.object({
  schemaVersion: z.literal(1),
  presentationVersion: z.literal('v2'),
  enabled: z.boolean(),
  surfaces: z.array(z.enum(['enterprise', 'training', 'ai-flotation', 'refactored'])).max(4),
  motion: z.enum(CASE_STUDY_VISUAL_MOTION),
  workflow: workflowSchema.optional(),
  outcomeCards: z.array(z.object({
    metricKey: z.string().min(1).max(80),
    emphasis: z.boolean().optional(),
  }).strict()).max(L.outcomeCards),
  charts: z.array(chartSchema).max(L.charts),
  provenance: z.object({
    generator: z.enum(CASE_STUDY_VISUAL_GENERATORS),
    generatedAt: z.string().datetime(),
    sourceSnapshotId: z.string().min(1).max(80).optional(),
    sourceContentHash: z.string().regex(HASH_RE, 'sha256 hex'),
    state: z.enum(CASE_STUDY_VISUAL_STATES),
    humanEdited: z.boolean(),
  }).strict(),
}).strict();

/** The metric facts a validator needs, read off snapshot content. */
export function visualStoryContextFromContent(
  content: CaseStudySnapshotContent,
  evidenceIds: readonly string[],
): VisualStoryValidationContext {
  const seen = new Map<string, VisualStoryMetricFact>();
  const all: readonly CaseStudyMetricEntry[] = [
    ...(content.heroMetrics ?? []),
    ...(content.measurement?.metrics ?? []),
  ];
  for (const m of all) {
    if (seen.has(m.key)) continue;
    seen.set(m.key, {
      key: m.key,
      publishable: m.publishable === true,
      verified: m.verification?.class === 'verified',
      payload: m.payload,
      numericValue: m.numericValue,
    });
  }
  return { metrics: [...seen.values()], evidenceIds };
}

/* ---------------------------------------------------------------- checks --- */

type Err = VisualStoryValidationError;
const err = (path: string, code: string, message: string): Err => ({ path, code, message });

function denominatorOf(m: VisualStoryMetricFact): number | null {
  const p = m.payload;
  if (p && (p.shape === 'ratio' || p.shape === 'share')) return p.denominator;
  return null;
}
function numeratorOf(m: VisualStoryMetricFact): number | null {
  const p = m.payload;
  if (p && (p.shape === 'ratio' || p.shape === 'share')) return p.numerator;
  if (p && p.shape === 'count') return p.value;
  return typeof m.numericValue === 'number' ? m.numericValue : null;
}

function checkMetricRef(
  path: string, metricKey: string, ctx: VisualStoryValidationContext, out: Err[],
): VisualStoryMetricFact | null {
  const m = ctx.metrics.find((x) => x.key === metricKey);
  if (!m) { out.push(err(path, 'metric_missing', `no metric "${metricKey}" on this record`)); return null; }
  if (!m.verified) { out.push(err(path, 'metric_not_verified', `metric "${metricKey}" is not verified`)); return null; }
  if (!m.publishable) { out.push(err(path, 'metric_not_publishable', `metric "${metricKey}" is not publishable`)); return null; }
  return m;
}

function checkPanel(path: string, panel: CaseStudyWorkflowPanel, ctx: VisualStoryValidationContext, out: Err[]): void {
  const keys = new Set<string>();
  panel.nodes.forEach((n, i) => {
    if (keys.has(n.key)) out.push(err(`${path}.nodes[${i}].key`, 'node_key_duplicate', `node key "${n.key}" appears twice`));
    keys.add(n.key);
    if (n.metricKey) checkMetricRef(`${path}.nodes[${i}].metricKey`, n.metricKey, ctx, out);
    if (n.evidenceId && !ctx.evidenceIds.includes(n.evidenceId)) {
      out.push(err(`${path}.nodes[${i}].evidenceId`, 'evidence_missing', 'evidenceId is not an evidence row on this record'));
    }
  });
  const degree = new Map<string, number>();
  const seenEdges = new Set<string>();
  panel.edges.forEach((e, i) => {
    const p = `${path}.edges[${i}]`;
    if (e.from === e.to) out.push(err(p, 'edge_self_loop', `edge "${e.from}" points at itself`));
    if (!keys.has(e.from)) out.push(err(`${p}.from`, 'edge_endpoint_missing', `no node "${e.from}" in this panel`));
    if (!keys.has(e.to)) out.push(err(`${p}.to`, 'edge_endpoint_missing', `no node "${e.to}" in this panel`));
    const sig = `${e.from}>${e.to}`;
    if (seenEdges.has(sig)) out.push(err(p, 'edge_duplicate', `edge ${e.from} -> ${e.to} appears twice`));
    seenEdges.add(sig);
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  });
  if (panel.nodes.length > 1) {
    panel.nodes.forEach((n, i) => {
      if (!degree.get(n.key)) out.push(err(`${path}.nodes[${i}]`, 'node_isolated', `node "${n.key}" has no edges`));
    });
    // One picture, one component: a second island would be drawn with no line
    // to the rest and read as a mistake. Edges are walked both ways because a
    // branch that only flows OUT of the main path is still part of it.
    const adjacent = new Map<string, string[]>();
    for (const e of panel.edges) {
      adjacent.set(e.from, [...(adjacent.get(e.from) ?? []), e.to]);
      adjacent.set(e.to, [...(adjacent.get(e.to) ?? []), e.from]);
    }
    const reached = new Set<string>([panel.nodes[0].key]);
    const queue = [panel.nodes[0].key];
    while (queue.length) {
      for (const next of adjacent.get(queue.shift() as string) ?? []) {
        if (!reached.has(next)) { reached.add(next); queue.push(next); }
      }
    }
    panel.nodes.forEach((n, i) => {
      if (degree.get(n.key) && !reached.has(n.key)) {
        out.push(err(`${path}.nodes[${i}]`, 'node_unreachable', `node "${n.key}" is not connected to "${panel.nodes[0].key}"`));
      }
    });
  }
  if (panel.initialNodeKey && !keys.has(panel.initialNodeKey)) {
    out.push(err(`${path}.initialNodeKey`, 'node_missing', `no node "${panel.initialNodeKey}" in this panel`));
  }
}

function checkChart(path: string, chart: CaseStudyVisualChart, ctx: VisualStoryValidationContext, out: Err[]): void {
  const anchor = checkMetricRef(`${path}.metricKey`, chart.metricKey, ctx, out);
  const parts = chart.parts ?? [];
  if (TREND_RE.test(`${chart.title} ${chart.caption ?? ''}`) && chart.kind !== 'comparison') {
    out.push(err(`${path}.title`, 'chart_labelled_as_trend', 'a summary chart may not be described as a trend or a time series'));
  }
  parts.forEach((part, i) => {
    const p = `${path}.parts[${i}]`;
    if (part.metricKey) checkMetricRef(`${p}.metricKey`, part.metricKey, ctx, out);
    if (part.value !== undefined && !part.metricKey) {
      if (!part.evidenceId) out.push(err(`${p}.value`, 'literal_value_without_evidence', 'a literal value needs the evidenceId that supports it'));
      else if (!ctx.evidenceIds.includes(part.evidenceId)) out.push(err(`${p}.evidenceId`, 'evidence_missing', 'evidenceId is not an evidence row on this record'));
    }
    if (part.value === undefined && !part.metricKey) out.push(err(p, 'part_without_figure', 'a part needs a metricKey or a literal value'));
  });
  if (!anchor) return;
  const denominator = denominatorOf(anchor);
  switch (chart.kind) {
    case 'composition': {
      if (parts.length < 2) out.push(err(`${path}.parts`, 'composition_needs_parts', 'a composition needs at least two parts'));
      if (denominator === null) { out.push(err(`${path}.metricKey`, 'composition_needs_denominator', 'the anchoring metric must be a ratio or share')); break; }
      let sum = 0; let complete = true;
      for (const part of parts) {
        const v = part.metricKey ? numeratorOf(ctx.metrics.find((m) => m.key === part.metricKey) ?? anchor) : part.value;
        if (v === null || v === undefined) { complete = false; continue; }
        sum += v;
      }
      if (complete && parts.length >= 2 && sum !== denominator) {
        out.push(err(`${path}.parts`, 'composition_parts_mismatch', `parts sum to ${sum}, the metric's denominator is ${denominator}`));
      }
      break;
    }
    case 'comparison': {
      if (parts.length < 2) out.push(err(`${path}.parts`, 'comparison_needs_parts', 'a comparison needs at least two bars'));
      if (!chart.caveat) out.push(err(`${path}.caveat`, 'comparison_needs_caveat', 'a comparison must state how its windows differ'));
      parts.forEach((part, i) => {
        if (!part.metricKey && part.denominator === undefined) {
          out.push(err(`${path}.parts[${i}].denominator`, 'comparison_bar_needs_denominator', 'a literal bar needs its denominator'));
        }
        if (part.value !== undefined && part.denominator !== undefined && part.value > part.denominator) {
          out.push(err(`${path}.parts[${i}].value`, 'value_exceeds_denominator', `${part.value} exceeds ${part.denominator}`));
        }
      });
      break;
    }
    case 'share': {
      if (denominator === null) out.push(err(`${path}.metricKey`, 'share_needs_ratio', 'a share chart anchors on a ratio or share metric'));
      break;
    }
    case 'two_value': {
      if (parts.length !== 2) out.push(err(`${path}.parts`, 'two_value_needs_two', 'exactly two summary values'));
      if (!chart.unit) out.push(err(`${path}.unit`, 'two_value_needs_unit', 'state the unit'));
      if (chart.axisMax === undefined) out.push(err(`${path}.axisMax`, 'two_value_needs_axis', 'state the axis maximum'));
      else {
        for (const part of parts) {
          const v = part.metricKey ? numeratorOf(ctx.metrics.find((m) => m.key === part.metricKey) ?? anchor) : part.value;
          if (typeof v === 'number' && v > chart.axisMax) out.push(err(`${path}.axisMax`, 'value_exceeds_axis', `${v} exceeds the axis maximum ${chart.axisMax}`));
        }
      }
      break;
    }
    case 'zero_card': {
      if (denominator === null || denominator <= 0) out.push(err(`${path}.metricKey`, 'zero_card_needs_denominator', 'zero is only meaningful over a real denominator'));
      else if (numeratorOf(anchor) !== 0) out.push(err(`${path}.metricKey`, 'zero_card_not_zero', 'the anchoring metric is not zero'));
      break;
    }
    default:
      break;
  }
}

export function validateVisualStory(input: unknown, ctx: VisualStoryValidationContext): VisualStoryValidationResult {
  const parsed = sectionSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => err(
      issue.path.map(String).join('.') || '(root)',
      'shape',
      issue.message,
    ));
    return { ok: false, section: null, errors };
  }
  const section = parsed.data as unknown as CaseStudyVisualStorySection;
  const out: Err[] = [];

  if (section.enabled && section.surfaces.length === 0) {
    out.push(err('surfaces', 'enabled_without_surface', 'an enabled story names at least one surface'));
  }

  const wf = section.workflow;
  if (wf) {
    const keys = wf.panels.map((p) => p.key).join(',');
    if (wf.type === 'before_after' && keys !== 'before,after') {
      out.push(err('workflow.panels', 'panels_mismatch', 'a before_after story carries exactly a "before" panel then an "after" panel'));
    }
    if (wf.type === 'single_state' && keys !== 'single') {
      out.push(err('workflow.panels', 'panels_mismatch', 'a single_state story carries exactly one "single" panel'));
    }
    wf.panels.forEach((panel, i) => checkPanel(`workflow.panels[${i}]`, panel, ctx, out));
  }

  const cardKeys = new Set<string>();
  let emphasised = 0;
  section.outcomeCards.forEach((card, i) => {
    if (cardKeys.has(card.metricKey)) out.push(err(`outcomeCards[${i}]`, 'card_duplicate', `metric "${card.metricKey}" is already a card`));
    cardKeys.add(card.metricKey);
    if (card.emphasis) emphasised += 1;
    checkMetricRef(`outcomeCards[${i}].metricKey`, card.metricKey, ctx, out);
  });
  if (emphasised > 1) out.push(err('outcomeCards', 'card_emphasis_multiple', 'at most one card carries emphasis'));

  const chartKeys = new Set<string>();
  section.charts.forEach((chart, i) => {
    if (chartKeys.has(chart.key)) out.push(err(`charts[${i}].key`, 'chart_key_duplicate', `chart key "${chart.key}" appears twice`));
    chartKeys.add(chart.key);
    checkChart(`charts[${i}]`, chart, ctx, out);
  });

  if (out.length > 0) return { ok: false, section: null, errors: out };
  return { ok: true, section, errors: [] };
}

/* ------------------------------------------------------------ gate rule --- */

/**
 * The evidence ids a PURE check can know about: every `evidenceId` a verified
 * metric or the production status cites on this snapshot. The write path
 * (`applyHumanOverride`) validates against the evidence table itself; the gate
 * has no database and settles for "cited by something already verified here",
 * which is the stricter reading and never admits an id from another record.
 */
export function evidenceIdsCitedByContent(content: CaseStudySnapshotContent): string[] {
  const out = new Set<string>();
  const take = (v: { class?: string; evidenceId?: string } | undefined) => {
    if (v?.class === 'verified' && typeof v.evidenceId === 'string' && v.evidenceId) out.add(v.evidenceId);
  };
  for (const m of [...(content.heroMetrics ?? []), ...(content.measurement?.metrics ?? [])]) take(m.verification);
  take(content.identity?.productionStatus?.verification);
  take(content.identity?.engagementWindow?.verification);
  return [...out];
}

/** Publish-gate rule 20: a visual story on the snapshot must validate against the snapshot. */
export function ruleVisualStory(
  content: CaseStudySnapshotContent,
  b: { add: (code: 'visual_story_invalid', field: string, message: string, remedy: string) => void },
): void {
  const vs = (content as { visualStory?: unknown }).visualStory;
  if (vs === undefined || vs === null) return;
  const result = validateVisualStory(vs, visualStoryContextFromContent(content, evidenceIdsCitedByContent(content)));
  if (result.ok) return;
  for (const e of result.errors.slice(0, 8)) {
    b.add('visual_story_invalid', `visualStory.${e.path}`,
      `the visual story fails validation at ${e.path}: ${e.message}`,
      'open the Visual Story panel in the Studio, fix the field it names, and save; or disable the story');
  }
}
