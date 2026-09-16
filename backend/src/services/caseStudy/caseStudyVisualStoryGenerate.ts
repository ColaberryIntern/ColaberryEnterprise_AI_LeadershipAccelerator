import { hashCanonical } from '../../utils/canonicalHash';
import type {
  CaseStudyMetricEntry,
  CaseStudySnapshotContent,
} from '../../types/caseStudy';
import {
  CASE_STUDY_VISUAL_LIMITS as L,
  type CaseStudyVisualChart,
  type CaseStudyVisualOutcomeCard,
  type CaseStudyVisualStorySection,
  type CaseStudyWorkflowEdge,
  type CaseStudyWorkflowNode,
  type CaseStudyWorkflowRole,
  type CaseStudyWorkflowVisual,
} from '../../types/caseStudyVisual';

/**
 * caseStudyVisualStoryGenerate - a DETERMINISTIC first draft of the visual
 * story, from sections the record already carries.
 *
 * WHAT IT WILL AND WILL NOT DO. It draws a `single_state` workflow from the
 * architecture diagram's nodes and edges, picks outcome cards from the
 * metrics that already lead the record, and proposes the one chart per metric
 * whose shape makes the chart's guardrail trivially true (a ratio or share
 * becomes a share bar; a zero over a real denominator becomes a zero card; a
 * ratio whose stated baseline reads "N of M" becomes a comparison that cites
 * the metric's own evidence). It never invents a before-state: a `before_after`
 * pair exists only when a person authored the before panel from evidence, and
 * a greenfield record gets a single-state illustration or nothing.
 *
 * SAME INPUT, SAME OUTPUT. No clock reads except the `generatedAt` stamp the
 * caller supplies; no randomness; keys derive from the diagram's own keys. The
 * provenance hash covers exactly the sections the draft was read from, so
 * `isVisualStoryStale` answers "has anything this was drawn from changed" and
 * nothing else. A sync that changes those sections marks a human-edited story
 * stale and leaves it alone; it never regenerates over a person's work.
 *
 * DISABLED BY DEFAULT. A generated draft carries `enabled: false` and no
 * surfaces. Turning it on is a human act in the Studio, after the gate.
 */

export interface GenerateVisualStoryOptions {
  /** ISO instant to stamp; the caller owns the clock so tests are byte-stable. */
  readonly generatedAt: string;
  readonly sourceSnapshotId?: string;
}

export interface GenerateVisualStoryResult {
  readonly section: CaseStudyVisualStorySection | null;
  /** Everything that was skipped, summarised or could not be drawn, in words. */
  readonly reasons: readonly string[];
}

/** The sections a draft is read from; the hash covers exactly these. */
export function visualStorySourceHash(content: CaseStudySnapshotContent): string {
  return hashCanonical({
    architecture: content.architecture ?? null,
    measurement: content.measurement ?? null,
    heroMetrics: content.heroMetrics ?? [],
    buildTimeline: content.buildTimeline ?? [],
    artifacts: content.artifacts ?? [],
  });
}

export function isVisualStoryStale(
  section: Pick<CaseStudyVisualStorySection, 'provenance'>,
  content: CaseStudySnapshotContent,
): boolean {
  return section.provenance.sourceContentHash !== visualStorySourceHash(content);
}

const KEY_RE = /[^a-z0-9_-]+/g;
const toKey = (raw: string): string => {
  const k = raw.toLowerCase().replace(KEY_RE, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return /^[a-z0-9]/.test(k) ? k : `n-${k}`.slice(0, 40);
};

/** Cut at a word boundary, never mid-word, never past `max`. */
const clip = (s: string, max: number): string => {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return (at > max / 2 ? cut.slice(0, at) : cut).trim();
};

const ROLE_BY_KIND: Readonly<Record<string, CaseStudyWorkflowRole>> = Object.freeze({
  ui: 'human', operator: 'human', person: 'human', human: 'human',
  integration: 'external', external: 'external', api: 'external', vendor: 'external',
  datastore: 'data', database: 'data', data: 'data', store: 'data', queue: 'data',
});
const roleFor = (kind: string | undefined): CaseStudyWorkflowRole =>
  (kind && ROLE_BY_KIND[kind.toLowerCase()]) || 'system';

function workflowFrom(content: CaseStudySnapshotContent, reasons: string[]): CaseStudyWorkflowVisual | null {
  const diagram = content.architecture?.diagram;
  const rawNodes = diagram?.nodes ?? [];
  const rawEdges = diagram?.edges ?? [];
  if (rawNodes.length < 2 || rawEdges.length === 0) {
    reasons.push('no architecture diagram with at least two connected components: nothing to illustrate');
    return null;
  }
  const keep = rawNodes.slice(0, L.nodesPerPanel);
  if (rawNodes.length > L.nodesPerPanel) {
    reasons.push(`architecture diagram has ${rawNodes.length} components; the first ${L.nodesPerPanel} are drawn, edit the draft to choose`);
  }
  const keyOf = new Map<string, string>();
  const nodes: CaseStudyWorkflowNode[] = [];
  for (const n of keep) {
    let key = toKey(n.id);
    while (keyOf.has(key) || [...keyOf.values()].includes(key)) key = `${key.slice(0, 38)}-2`;
    keyOf.set(n.id, key);
    nodes.push({ key, label: clip(n.label, L.nodeLabel), role: roleFor(n.kind), status: 'processing', lane: 'primary' });
  }
  const edges: CaseStudyWorkflowEdge[] = [];
  const seen = new Set<string>();
  for (const e of rawEdges) {
    const from = keyOf.get(e.from);
    const to = keyOf.get(e.to);
    if (!from || !to) { reasons.push(`connection ${e.from} -> ${e.to} joins a component that is not drawn; left out`); continue; }
    if (from === to || seen.has(`${from}>${to}`)) continue;
    if (edges.length >= L.edgesPerPanel) { reasons.push(`more than ${L.edgesPerPanel} connections; the rest are left out`); break; }
    seen.add(`${from}>${to}`);
    edges.push({ from, to, ...(e.label ? { label: clip(e.label, L.edgeLabel) } : {}), status: 'processing' });
  }
  const labels = nodes.map((n) => n.label);
  const description = clip(
    `How the system works, as the architecture diagram draws it: ${labels.join(', ')}. ${edges.length} connections between ${nodes.length} components.`,
    L.description,
  );
  return {
    key: 'architecture',
    type: 'single_state',
    title: 'How the system works',
    description,
    panels: [{ key: 'single', label: 'As built', nodes, edges, initialNodeKey: nodes[0].key }],
  };
}

const usable = (m: CaseStudyMetricEntry): boolean =>
  m.publishable === true && m.verification?.class === 'verified';
const comparative = (m: CaseStudyMetricEntry): boolean =>
  m.payload?.shape === 'ratio' || m.payload?.shape === 'share' || m.payload?.shape === 'series'
  || (typeof m.measurement?.baseline === 'string' && !/^n\/a/i.test(m.measurement.baseline));

function cardsFrom(metrics: readonly CaseStudyMetricEntry[]): CaseStudyVisualOutcomeCard[] {
  const out: CaseStudyVisualOutcomeCard[] = [];
  const headline = metrics.find((m) => m.isHeadline && usable(m));
  if (headline) out.push({ metricKey: headline.key, emphasis: true });
  for (const m of metrics) {
    if (out.length >= L.outcomeCards) break;
    if (!usable(m) || !comparative(m) || out.some((c) => c.metricKey === m.key)) continue;
    out.push({ metricKey: m.key });
  }
  return out;
}

const BASELINE_RE = /(\d[\d,]*)\s+of\s+(\d[\d,]*)/;

function chartsFrom(metrics: readonly CaseStudyMetricEntry[], reasons: string[]): CaseStudyVisualChart[] {
  const out: CaseStudyVisualChart[] = [];
  for (const m of metrics) {
    if (out.length >= L.charts) break;
    if (!usable(m)) continue;
    const p = m.payload;
    if (!p || (p.shape !== 'ratio' && p.shape !== 'share')) continue;
    const title = clip(m.label, L.title);
    if (p.numerator === 0 && p.denominator > 0) {
      out.push({ key: `zero-${toKey(m.key)}`, kind: 'zero_card', title, metricKey: m.key });
      continue;
    }
    const baseline = typeof m.measurement?.baseline === 'string' ? m.measurement.baseline.match(BASELINE_RE) : null;
    const evidenceId = m.verification?.evidenceId;
    if (baseline && evidenceId) {
      const value = Number(baseline[1].replace(/,/g, ''));
      const denominator = Number(baseline[2].replace(/,/g, ''));
      if (Number.isFinite(value) && Number.isFinite(denominator) && value <= denominator) {
        out.push({
          key: `compare-${toKey(m.key)}`,
          kind: 'comparison',
          title,
          metricKey: m.key,
          caveat: 'Two different observation windows, stated in the measurement notes; context, not a controlled comparison.',
          parts: [
            { label: 'Before', value, denominator, evidenceId, status: 'attention' },
            { label: 'After', metricKey: m.key, status: 'resolved' },
          ],
        });
        continue;
      }
      reasons.push(`metric "${m.key}": baseline text did not read as a whole figure; drawn as a share instead`);
    }
    out.push({ key: `share-${toKey(m.key)}`, kind: 'share', title, metricKey: m.key });
  }
  return out;
}

export function generateVisualStory(
  content: CaseStudySnapshotContent,
  options: GenerateVisualStoryOptions,
): GenerateVisualStoryResult {
  const reasons: string[] = [];
  const workflow = workflowFrom(content, reasons);
  if (!workflow) return { section: null, reasons };

  const metrics: CaseStudyMetricEntry[] = [];
  for (const m of [...(content.heroMetrics ?? []), ...(content.measurement?.metrics ?? [])]) {
    if (!metrics.some((x) => x.key === m.key)) metrics.push(m);
  }
  const outcomeCards = cardsFrom(metrics);
  if (outcomeCards.length === 0) reasons.push('no verified, publishable, comparative metric to lead with; the draft has no outcome cards');
  const charts = chartsFrom(metrics, reasons);
  if (charts.length === 0) reasons.push('no ratio or share metric to chart; the draft has no charts');

  const section: CaseStudyVisualStorySection = {
    schemaVersion: 1,
    presentationVersion: 'v2',
    enabled: false,
    surfaces: [],
    motion: 'auto',
    workflow,
    outcomeCards,
    charts,
    provenance: {
      generator: 'evidence',
      generatedAt: options.generatedAt,
      ...(options.sourceSnapshotId ? { sourceSnapshotId: options.sourceSnapshotId } : {}),
      sourceContentHash: visualStorySourceHash(content),
      state: 'draft',
      humanEdited: false,
    },
  };
  return { section, reasons };
}
