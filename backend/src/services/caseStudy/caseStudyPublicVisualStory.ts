import type { CaseStudyMetricEntry, CaseStudySnapshotContent, CaseStudySurfaceKey } from '../../types/caseStudy';
import type {
  PublicCaseStudyMetric,
  PublicCaseStudyVisualChart,
  PublicCaseStudyVisualChartPart,
  PublicCaseStudyVisualStory,
  PublicCaseStudyWorkflow,
  PublicCaseStudyWorkflowPanel,
} from '../../types/caseStudyPublic';
import type {
  CaseStudyVisualChart,
  CaseStudyVisualChartPart,
  CaseStudyVisualStorySection,
  CaseStudyWorkflowLane,
  CaseStudyWorkflowStatus,
} from '../../types/caseStudyVisual';
import { projectMetric, text } from './caseStudyPublicSections';
import {
  evidenceIdsCitedByContent,
  validateVisualStory,
  visualStoryContextFromContent,
} from './caseStudyVisualStoryValidate';

/**
 * caseStudyPublicVisualStory - the visual story as the public page receives it.
 *
 * THE FIGURES ARE RESOLVED HERE, ONCE, FROM VERIFIED METRICS. A chart part in
 * the stored section names a `metricKey`; the number a reader sees is the
 * metric's own payload, projected through `projectMetric` like every other
 * figure on the page. A literal part (allowed only beside an `evidenceId`)
 * crosses as a number with its denominator, nothing else. So a renderer draws
 * from values it never computed, and a stored story can never disagree with
 * the metrics beneath it: if a metric loses its verification the whole story
 * fails validation and is dropped, which is the same rule the gate applies.
 *
 * WHAT NEVER CROSSES. `enabled`, `surfaces` and `provenance` are the record's
 * business; node `evidenceId`s and the provenance hash name database rows.
 * `evidence` (the prose "where the proof lives") does cross, because it is
 * written for the reader.
 *
 * NULL IS THE OFF STATE. Absent, disabled, not listed for this surface, or
 * invalid: the page gets `null` and renders exactly as it did before the
 * section existed. There is no partial story: a card or chart whose metric
 * cannot be projected (an empty label, a series with no figure) drops the
 * whole story, never just itself, so the page can never show a story that
 * disagrees with the record by omission.
 */

const DEFAULT_MOTION_NOTE = 'Illustration, not live telemetry. Motion shows the shape of the flow, never event rates or recovery time.';
const DEFAULT_LANE_LABELS: Readonly<Record<CaseStudyWorkflowLane, string>> = Object.freeze({
  primary: 'Live path',
  recovery: 'Recovery path',
  manual: 'Manual repair',
});

const findMetric = (content: CaseStudySnapshotContent, key: string): CaseStudyMetricEntry | null =>
  [...(content.heroMetrics ?? []), ...(content.measurement?.metrics ?? [])].find((m) => m.key === key) ?? null;

const projected = (content: CaseStudySnapshotContent, key: string | undefined): PublicCaseStudyMetric | null => {
  if (!key) return null;
  const m = findMetric(content, key);
  return m ? projectMetric(m) : null;
};

/** Numerator and denominator of a metric, or null when its shape has none. */
function figureOf(content: CaseStudySnapshotContent, key: string): { value: number; denominator: number | null } | null {
  const m = findMetric(content, key);
  const p = m?.payload;
  if (!p) return typeof m?.numericValue === 'number' ? { value: m.numericValue, denominator: null } : null;
  if (p.shape === 'ratio' || p.shape === 'share') return { value: p.numerator, denominator: p.denominator };
  if (p.shape === 'count') return { value: p.value, denominator: null };
  return typeof m?.numericValue === 'number' ? { value: m.numericValue, denominator: null } : null;
}

function projectPart(
  content: CaseStudySnapshotContent,
  part: CaseStudyVisualChartPart,
  anchorDenominator: number,
): PublicCaseStudyVisualChartPart | null {
  const status: CaseStudyWorkflowStatus = part.status ?? 'processing';
  const caveat = text(part.caveat) || null;
  if (part.metricKey) {
    const f = figureOf(content, part.metricKey);
    if (!f) return null;
    return { label: part.label, value: f.value, denominator: f.denominator ?? anchorDenominator, status, caveat };
  }
  if (typeof part.value === 'number') {
    return { label: part.label, value: part.value, denominator: part.denominator ?? anchorDenominator, status, caveat };
  }
  return null;
}

function projectChart(content: CaseStudySnapshotContent, chart: CaseStudyVisualChart): PublicCaseStudyVisualChart | null {
  const metric = projected(content, chart.metricKey);
  const anchor = figureOf(content, chart.metricKey);
  if (!metric || !anchor) return null;
  const denominator = anchor.denominator ?? (chart.axisMax ?? anchor.value);
  const parts: PublicCaseStudyVisualChartPart[] = [];
  for (const part of chart.parts ?? []) {
    const p = projectPart(content, part, denominator);
    if (!p) return null; // a part with no figure would draw as zero, and missing is not zero
    parts.push(p);
  }
  if (parts.length === 0 && (chart.kind === 'share' || chart.kind === 'zero_card')) {
    // The anchoring metric is the whole chart.
    parts.push({ label: metric.label, value: anchor.value, denominator, status: chart.kind === 'zero_card' ? 'resolved' : 'processing', caveat: null });
  }
  return {
    key: chart.key,
    kind: chart.kind,
    title: chart.title,
    caption: text(chart.caption) || null,
    metric,
    denominator,
    parts,
    unit: text(chart.unit) || null,
    axisMax: typeof chart.axisMax === 'number' ? chart.axisMax : null,
    caveat: text(chart.caveat) || null,
    limitations: (chart.limitations ?? []).map((l) => text(l)).filter(Boolean),
  };
}

function projectWorkflow(content: CaseStudySnapshotContent, section: CaseStudyVisualStorySection): PublicCaseStudyWorkflow | null {
  const wf = section.workflow;
  if (!wf) return null;
  const panels: PublicCaseStudyWorkflowPanel[] = wf.panels.map((panel) => ({
    key: panel.key,
    label: panel.label,
    summary: text(panel.summary) || null,
    laneLabels: { ...DEFAULT_LANE_LABELS, ...(panel.laneLabels ?? {}) } as Readonly<Record<CaseStudyWorkflowLane, string>>,
    nodes: panel.nodes.map((n) => ({
      key: n.key,
      label: n.label,
      sublabel: text(n.sublabel) || null,
      detail: text(n.detail) || null,
      kicker: text(n.kicker) || null,
      role: n.role,
      status: n.status ?? 'processing',
      lane: n.lane ?? 'primary',
      evidence: text(n.evidence) || null,
      tally: projected(content, n.metricKey),
    })),
    edges: panel.edges.map((e) => ({
      from: e.from,
      to: e.to,
      label: text(e.label) || null,
      status: e.status ?? 'processing',
      condition: text(e.condition) || null,
      motion: e.motion !== false,
    })),
    initialNodeKey: panel.initialNodeKey ?? panel.nodes[0].key,
  }));
  return {
    key: wf.key,
    type: wf.type,
    title: wf.title,
    caption: text(wf.caption) || null,
    description: wf.description,
    panels,
    motionNote: text(wf.motionNote) || DEFAULT_MOTION_NOTE,
  };
}

export function projectVisualStory(
  content: CaseStudySnapshotContent,
  surfaceKey: CaseStudySurfaceKey,
): PublicCaseStudyVisualStory | null {
  const raw = (content as { visualStory?: unknown }).visualStory;
  if (!raw || typeof raw !== 'object') return null;
  const result = validateVisualStory(raw, visualStoryContextFromContent(content, evidenceIdsCitedByContent(content)));
  if (!result.ok) return null;
  const section = result.section;
  if (!section.enabled || !section.surfaces.includes(surfaceKey)) return null;

  const outcomeCards: PublicCaseStudyMetric[] = [];
  const ordered = [...section.outcomeCards].sort((a, b) => Number(b.emphasis === true) - Number(a.emphasis === true));
  for (const card of ordered) {
    const m = projected(content, card.metricKey);
    if (!m) return null;
    outcomeCards.push(m);
  }
  const charts: PublicCaseStudyVisualChart[] = [];
  for (const chart of section.charts) {
    const c = projectChart(content, chart);
    if (!c) return null;
    charts.push(c);
  }
  return {
    schemaVersion: section.schemaVersion,
    presentationVersion: section.presentationVersion,
    motion: section.motion,
    workflow: projectWorkflow(content, section),
    outcomeCards,
    charts,
  };
}
