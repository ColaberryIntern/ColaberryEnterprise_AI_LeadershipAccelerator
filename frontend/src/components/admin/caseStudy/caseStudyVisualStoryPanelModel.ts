/**
 * caseStudyVisualStoryPanelModel - the Visual Story panel's form, as pure data.
 *
 * TWO SHAPES, ONE TRUTH. The stored section is the server's strict schema:
 * optional fields are ABSENT, numbers are numbers, and an empty string is a
 * validation error. A form is what an operator types into: every field a
 * string, every optional one blank when unset. `formFromSection` and
 * `sectionFromForm` are the two directions, and the second drops every blank
 * so a form with nothing typed into an optional box round-trips to a section
 * without that key.
 *
 * NOTHING HERE VALIDATES SEMANTICS. Reachability, metric existence, evidence
 * ids and chart guardrails are the server's, and its errors come back with a
 * path this panel prints beside the field. The one thing done here is the
 * shape conversion, so the server sees a section and not a form.
 *
 * PURE. No React, no DOM, no clock: the panel owns those.
 */

export const WORKFLOW_ROLES = ['human', 'system', 'external', 'data'] as const;
export const WORKFLOW_STATUSES = ['processing', 'resolved', 'attention', 'failure', 'unknown'] as const;
export const WORKFLOW_LANES = ['primary', 'recovery', 'manual'] as const;
export const CHART_KINDS = ['composition', 'comparison', 'share', 'two_value', 'zero_card'] as const;
export const STORY_SURFACES = ['enterprise', 'training', 'ai-flotation', 'refactored'] as const;
export const PANEL_KEYS = ['before', 'after', 'single'] as const;

export interface NodeRow {
  key: string; label: string; sublabel: string; detail: string; kicker: string;
  role: string; status: string; lane: string; evidence: string; evidenceId: string; metricKey: string;
}
export interface EdgeRow { from: string; to: string; label: string; status: string; condition: string; motion: boolean }
export interface PanelForm {
  key: string; label: string; summary: string; initialNodeKey: string;
  laneLabels: { primary: string; recovery: string; manual: string };
  nodes: NodeRow[]; edges: EdgeRow[];
}
export interface ChartPartRow {
  label: string; metricKey: string; value: string; denominator: string; evidenceId: string; status: string; caveat: string;
}
export interface ChartRow {
  key: string; kind: string; title: string; caption: string; metricKey: string; caveat: string;
  unit: string; axisMax: string; limitations: string; parts: ChartPartRow[];
}
export interface OutcomeCardRow { metricKey: string; emphasis: boolean }

export interface VisualStoryForm {
  enabled: boolean;
  surfaces: string[];
  motion: 'auto' | 'off';
  hasWorkflow: boolean;
  workflowKey: string;
  workflowType: 'before_after' | 'single_state';
  title: string; caption: string; description: string; motionNote: string;
  panels: PanelForm[];
  outcomeCards: OutcomeCardRow[];
  charts: ChartRow[];
  /** Carried through untouched except for the three fields a human save sets. */
  provenance: Record<string, unknown>;
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);

export const emptyNode = (key = ''): NodeRow => ({
  key, label: '', sublabel: '', detail: '', kicker: '', role: 'system', status: '', lane: '', evidence: '', evidenceId: '', metricKey: '',
});
export const emptyEdge = (): EdgeRow => ({ from: '', to: '', label: '', status: '', condition: '', motion: true });
export const emptyPart = (): ChartPartRow => ({ label: '', metricKey: '', value: '', denominator: '', evidenceId: '', status: '', caveat: '' });
export const emptyChart = (key = ''): ChartRow => ({ key, kind: 'share', title: '', caption: '', metricKey: '', caveat: '', unit: '', axisMax: '', limitations: '', parts: [] });
export const emptyPanel = (key: string, label: string): PanelForm => ({
  key, label, summary: '', initialNodeKey: '', laneLabels: { primary: '', recovery: '', manual: '' }, nodes: [], edges: [],
});

export function emptyForm(): VisualStoryForm {
  return {
    enabled: false, surfaces: [], motion: 'auto', hasWorkflow: false, workflowKey: 'workflow', workflowType: 'single_state',
    title: '', caption: '', description: '', motionNote: '', panels: [emptyPanel('single', 'As built')],
    outcomeCards: [], charts: [], provenance: {},
  };
}

function nodeFrom(v: unknown): NodeRow {
  const n = rec(v);
  return {
    key: str(n.key), label: str(n.label), sublabel: str(n.sublabel), detail: str(n.detail), kicker: str(n.kicker),
    // Blank status and lane mean "the default", and stay blank so a section
    // that never set them round-trips without gaining keys.
    role: str(n.role) || 'system', status: str(n.status), lane: str(n.lane),
    evidence: str(n.evidence), evidenceId: str(n.evidenceId), metricKey: str(n.metricKey),
  };
}
function edgeFrom(v: unknown): EdgeRow {
  const e = rec(v);
  return { from: str(e.from), to: str(e.to), label: str(e.label), status: str(e.status), condition: str(e.condition), motion: bool(e.motion, true) };
}
function panelFrom(v: unknown): PanelForm {
  const p = rec(v);
  const lanes = rec(p.laneLabels);
  return {
    key: str(p.key), label: str(p.label), summary: str(p.summary), initialNodeKey: str(p.initialNodeKey),
    laneLabels: { primary: str(lanes.primary), recovery: str(lanes.recovery), manual: str(lanes.manual) },
    nodes: arr(p.nodes).map(nodeFrom), edges: arr(p.edges).map(edgeFrom),
  };
}
function partFrom(v: unknown): ChartPartRow {
  const p = rec(v);
  return { label: str(p.label), metricKey: str(p.metricKey), value: str(p.value), denominator: str(p.denominator), evidenceId: str(p.evidenceId), status: str(p.status), caveat: str(p.caveat) };
}
function chartFrom(v: unknown): ChartRow {
  const c = rec(v);
  return {
    key: str(c.key), kind: str(c.kind) || 'share', title: str(c.title), caption: str(c.caption), metricKey: str(c.metricKey),
    caveat: str(c.caveat), unit: str(c.unit), axisMax: str(c.axisMax), limitations: arr(c.limitations).map(str).join('\n'),
    parts: arr(c.parts).map(partFrom),
  };
}

export function formFromSection(raw: Record<string, unknown> | null | undefined): VisualStoryForm {
  if (!raw || Object.keys(raw).length === 0) return emptyForm();
  const wf = rec(raw.workflow);
  const hasWorkflow = Object.keys(wf).length > 0;
  const type = str(wf.type) === 'before_after' ? 'before_after' : 'single_state';
  return {
    enabled: bool(raw.enabled),
    surfaces: arr(raw.surfaces).map(str).filter(Boolean),
    motion: str(raw.motion) === 'off' ? 'off' : 'auto',
    hasWorkflow,
    workflowKey: str(wf.key) || 'workflow',
    workflowType: type,
    title: str(wf.title), caption: str(wf.caption), description: str(wf.description), motionNote: str(wf.motionNote),
    panels: hasWorkflow ? arr(wf.panels).map(panelFrom) : [emptyPanel('single', 'As built')],
    outcomeCards: arr(raw.outcomeCards).map((c) => ({ metricKey: str(rec(c).metricKey), emphasis: bool(rec(c).emphasis) })),
    charts: arr(raw.charts).map(chartFrom),
    provenance: rec(raw.provenance),
  };
}

/** Keep a key only when its value is non-blank; the server's schema is strict about absence. */
const opt = (v: string): string | undefined => (v.trim() ? v.trim() : undefined);
const num = (v: string): number | undefined => (v.trim() === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export interface SectionFromFormOptions {
  /** The instant of the save, ISO. */
  readonly now: string;
}

export function sectionFromForm(form: VisualStoryForm, options: SectionFromFormOptions): Record<string, unknown> {
  const panels = form.panels.map((p) => compact({
    key: p.key,
    label: p.label.trim(),
    summary: opt(p.summary),
    laneLabels: (() => {
      const l = compact({ primary: opt(p.laneLabels.primary), recovery: opt(p.laneLabels.recovery), manual: opt(p.laneLabels.manual) });
      return Object.keys(l).length ? l : undefined;
    })(),
    nodes: p.nodes.map((n) => compact({
      key: n.key.trim(), label: n.label.trim(), sublabel: opt(n.sublabel), detail: opt(n.detail), kicker: opt(n.kicker),
      role: n.role, status: opt(n.status), lane: opt(n.lane), evidence: opt(n.evidence), evidenceId: opt(n.evidenceId), metricKey: opt(n.metricKey),
    })),
    edges: p.edges.map((e) => compact({
      from: e.from.trim(), to: e.to.trim(), label: opt(e.label), status: opt(e.status), condition: opt(e.condition),
      motion: e.motion ? undefined : false,
    })),
    initialNodeKey: opt(p.initialNodeKey),
  }));
  const workflow = form.hasWorkflow ? compact({
    key: form.workflowKey.trim() || 'workflow',
    type: form.workflowType,
    title: form.title.trim(),
    caption: opt(form.caption),
    description: form.description.trim(),
    panels: form.workflowType === 'before_after' ? panels : panels.slice(0, 1),
    motionNote: opt(form.motionNote),
  }) : undefined;
  const charts = form.charts.map((c) => compact({
    key: c.key.trim(), kind: c.kind, title: c.title.trim(), caption: opt(c.caption), metricKey: c.metricKey.trim(),
    parts: c.parts.length ? c.parts.map((p) => compact({
      label: p.label.trim(), metricKey: opt(p.metricKey), value: num(p.value), denominator: num(p.denominator),
      evidenceId: opt(p.evidenceId), status: opt(p.status), caveat: opt(p.caveat),
    })) : undefined,
    unit: opt(c.unit), axisMax: num(c.axisMax), caveat: opt(c.caveat),
    limitations: (() => { const l = c.limitations.split('\n').map((s) => s.trim()).filter(Boolean); return l.length ? l : undefined; })(),
  }));
  return compact({
    schemaVersion: 1,
    presentationVersion: 'v2',
    enabled: form.enabled,
    surfaces: form.enabled ? form.surfaces : [],
    motion: form.motion,
    workflow,
    outcomeCards: form.outcomeCards.filter((c) => c.metricKey.trim()).map((c) => compact({ metricKey: c.metricKey.trim(), emphasis: c.emphasis ? true : undefined })),
    charts,
    provenance: {
      ...form.provenance,
      generator: 'human',
      generatedAt: options.now,
      // Saving through the override path approves the snapshot in the same act,
      // so an enabled story is approved; a story kept off stays a draft.
      state: form.enabled ? 'approved' : 'draft',
      humanEdited: true,
    },
  });
}

/** The provenance hash a save needs; a form without one cannot be saved until a draft supplies it. */
export const hasSourceHash = (form: VisualStoryForm): boolean =>
  /^[0-9a-f]{64}$/i.test(str(form.provenance.sourceContentHash));

export interface DiffSummary {
  readonly changed: boolean;
  readonly lines: readonly string[];
}

/** What changed between two forms, in words an operator can check before saving. */
export function diffSummary(before: VisualStoryForm, after: VisualStoryForm): DiffSummary {
  const lines: string[] = [];
  if (before.enabled !== after.enabled) lines.push(after.enabled ? 'Story turned on' : 'Story turned off');
  if (before.surfaces.join() !== after.surfaces.join()) lines.push(`Surfaces: ${after.surfaces.join(', ') || 'none'}`);
  if (before.motion !== after.motion) lines.push(`Motion: ${after.motion}`);
  if (before.hasWorkflow !== after.hasWorkflow) lines.push(after.hasWorkflow ? 'Workflow added' : 'Workflow removed');
  if (before.workflowType !== after.workflowType) lines.push(`Workflow type: ${after.workflowType}`);
  for (const f of ['title', 'caption', 'description', 'motionNote'] as const) {
    if (before[f] !== after[f]) lines.push(`Workflow ${f} changed`);
  }
  const count = (p: PanelForm[]) => p.reduce((acc, x) => acc + x.nodes.length, 0);
  const edges = (p: PanelForm[]) => p.reduce((acc, x) => acc + x.edges.length, 0);
  if (count(before.panels) !== count(after.panels)) lines.push(`Steps: ${count(before.panels)} to ${count(after.panels)}`);
  if (edges(before.panels) !== edges(after.panels)) lines.push(`Connections: ${edges(before.panels)} to ${edges(after.panels)}`);
  const stepsChanged = JSON.stringify(before.panels) !== JSON.stringify(after.panels)
    && count(before.panels) === count(after.panels) && edges(before.panels) === edges(after.panels);
  if (stepsChanged) lines.push('Step or connection wording changed');
  if (JSON.stringify(before.outcomeCards) !== JSON.stringify(after.outcomeCards)) {
    lines.push(`Outcome cards: ${after.outcomeCards.map((c) => c.metricKey).filter(Boolean).join(', ') || 'none'}`);
  }
  if (before.charts.length !== after.charts.length) lines.push(`Charts: ${before.charts.length} to ${after.charts.length}`);
  else if (JSON.stringify(before.charts) !== JSON.stringify(after.charts)) lines.push('Chart wording or figures changed');
  return { changed: lines.length > 0, lines };
}
