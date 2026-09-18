import React, { useState } from 'react';
import {
  WORKFLOW_LANES, WORKFLOW_ROLES, WORKFLOW_STATUSES, emptyEdge, emptyNode, emptyPanel,
} from './caseStudyVisualStoryPanelModel';
import type { EdgeRow, NodeRow, PanelForm, VisualStoryForm } from './caseStudyVisualStoryPanelModel';

/**
 * CaseStudyVisualStoryWorkflowEditor - the illustration's words and shape.
 *
 * ONE PANEL AT A TIME. A before/after story has two panels; the editor shows
 * one and a switch, so the node table stays readable. The single-state story
 * has one panel and no switch.
 *
 * ROWS, NOT A CANVAS. Nodes and edges are rows in two small tables, because
 * the fields that matter (a step's plain words, where its proof lives, which
 * metric it carries) are text, and the picture is the public page's job. The
 * key column is what edges and the initial step refer to.
 *
 * SERVER ERRORS LAND ON THE ROW. `errorFor` answers with the message whose
 * path begins with a row's path (`workflow.panels.1.nodes.3`), so a refused
 * save marks the row it named rather than leaving the operator to count.
 */

interface Props {
  form: VisualStoryForm;
  onChange: (next: VisualStoryForm) => void;
  errorFor: (pathPrefix: string) => string | null;
  metricKeys: readonly string[];
  disabled: boolean;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="form-label small mb-0 d-grid gap-1">
    <span className="text-muted">{label}</span>
    {children}
  </label>
);

function NodeRows({ panel, prefix, onChange, errorFor, metricKeys, disabled }: {
  panel: PanelForm; prefix: string; onChange: (p: PanelForm) => void; errorFor: Props['errorFor']; metricKeys: readonly string[]; disabled: boolean;
}) {
  const set = (i: number, patch: Partial<NodeRow>) => onChange({ ...panel, nodes: panel.nodes.map((n, j) => (j === i ? { ...n, ...patch } : n)) });
  const remove = (i: number) => onChange({ ...panel, nodes: panel.nodes.filter((_, j) => j !== i) });
  const add = () => onChange({ ...panel, nodes: [...panel.nodes, emptyNode(`step-${panel.nodes.length + 1}`)] });
  return (
    <div className="mb-3">
      <div className="d-flex align-items-center justify-content-between mb-1">
        <strong className="small">Steps ({panel.nodes.length})</strong>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={add} disabled={disabled} data-testid="cs-vs-add-node">Add step</button>
      </div>
      {panel.nodes.map((n, i) => {
        const err = errorFor(`${prefix}.nodes.${i}`);
        return (
          <div key={i} className={`border rounded p-2 mb-2 ${err ? 'border-danger' : ''}`} data-testid="cs-vs-node">
            <div className="row g-2">
              <div className="col-6 col-lg-2"><Field label="Key"><input className="form-control form-control-sm" value={n.key} onChange={(e) => set(i, { key: e.target.value })} disabled={disabled} data-testid="cs-vs-node-key" /></Field></div>
              <div className="col-6 col-lg-3"><Field label="Label"><input className="form-control form-control-sm" value={n.label} onChange={(e) => set(i, { label: e.target.value })} disabled={disabled} data-testid="cs-vs-node-label" /></Field></div>
              <div className="col-4 col-lg-2"><Field label="Role"><select className="form-select form-select-sm" value={n.role} onChange={(e) => set(i, { role: e.target.value })} disabled={disabled}>{WORKFLOW_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field></div>
              <div className="col-4 col-lg-2"><Field label="Status"><select className="form-select form-select-sm" value={n.status} onChange={(e) => set(i, { status: e.target.value })} disabled={disabled}><option value="">default (processing)</option>{WORKFLOW_STATUSES.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field></div>
              <div className="col-4 col-lg-2"><Field label="Lane"><select className="form-select form-select-sm" value={n.lane} onChange={(e) => set(i, { lane: e.target.value })} disabled={disabled}><option value="">default (primary)</option>{WORKFLOW_LANES.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field></div>
              <div className="col-12 col-lg-1 d-flex align-items-end"><button type="button" className="btn btn-sm btn-outline-danger w-100" onClick={() => remove(i)} disabled={disabled} aria-label={`Remove step ${n.key || i + 1}`}>Remove</button></div>
              <div className="col-12 col-lg-6"><Field label="Kicker"><input className="form-control form-control-sm" value={n.kicker} onChange={(e) => set(i, { kicker: e.target.value })} disabled={disabled} /></Field></div>
              <div className="col-12 col-lg-6"><Field label="Sublabel"><input className="form-control form-control-sm" value={n.sublabel} onChange={(e) => set(i, { sublabel: e.target.value })} disabled={disabled} /></Field></div>
              <div className="col-12"><Field label="Detail (what this step does, in plain words)"><textarea className="form-control form-control-sm" rows={2} value={n.detail} onChange={(e) => set(i, { detail: e.target.value })} disabled={disabled} /></Field></div>
              <div className="col-12 col-lg-6"><Field label="Where the proof lives (shown to readers)"><input className="form-control form-control-sm" value={n.evidence} onChange={(e) => set(i, { evidence: e.target.value })} disabled={disabled} /></Field></div>
              <div className="col-6 col-lg-3"><Field label="Evidence id"><input className="form-control form-control-sm" value={n.evidenceId} onChange={(e) => set(i, { evidenceId: e.target.value })} disabled={disabled} /></Field></div>
              <div className="col-6 col-lg-3"><Field label="Tally metric"><select className="form-select form-select-sm" value={n.metricKey} onChange={(e) => set(i, { metricKey: e.target.value })} disabled={disabled}><option value="">none</option>{metricKeys.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field></div>
            </div>
            {err ? <p className="small text-danger mb-0 mt-1" data-testid="cs-vs-row-error">{err}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

function EdgeRows({ panel, prefix, onChange, errorFor, disabled }: {
  panel: PanelForm; prefix: string; onChange: (p: PanelForm) => void; errorFor: Props['errorFor']; disabled: boolean;
}) {
  const keys = panel.nodes.map((n) => n.key).filter(Boolean);
  const set = (i: number, patch: Partial<EdgeRow>) => onChange({ ...panel, edges: panel.edges.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const remove = (i: number) => onChange({ ...panel, edges: panel.edges.filter((_, j) => j !== i) });
  const add = () => onChange({ ...panel, edges: [...panel.edges, emptyEdge()] });
  return (
    <div className="mb-3">
      <div className="d-flex align-items-center justify-content-between mb-1">
        <strong className="small">Connections ({panel.edges.length})</strong>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={add} disabled={disabled} data-testid="cs-vs-add-edge">Add connection</button>
      </div>
      {panel.edges.map((e, i) => {
        const err = errorFor(`${prefix}.edges.${i}`);
        return (
          <div key={i} className={`row g-2 align-items-end border rounded p-2 mb-2 mx-0 ${err ? 'border-danger' : ''}`} data-testid="cs-vs-edge">
            <div className="col-6 col-lg-2"><Field label="From"><select className="form-select form-select-sm" value={e.from} onChange={(ev) => set(i, { from: ev.target.value })} disabled={disabled}><option value="">choose</option>{keys.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field></div>
            <div className="col-6 col-lg-2"><Field label="To"><select className="form-select form-select-sm" value={e.to} onChange={(ev) => set(i, { to: ev.target.value })} disabled={disabled}><option value="">choose</option>{keys.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field></div>
            <div className="col-6 col-lg-2"><Field label="Label"><input className="form-control form-control-sm" value={e.label} onChange={(ev) => set(i, { label: ev.target.value })} disabled={disabled} /></Field></div>
            <div className="col-6 col-lg-2"><Field label="Condition"><input className="form-control form-control-sm" value={e.condition} onChange={(ev) => set(i, { condition: ev.target.value })} disabled={disabled} /></Field></div>
            <div className="col-6 col-lg-2"><Field label="Status"><select className="form-select form-select-sm" value={e.status} onChange={(ev) => set(i, { status: ev.target.value })} disabled={disabled}><option value="">default (processing)</option>{WORKFLOW_STATUSES.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field></div>
            <div className="col-3 col-lg-1"><div className="form-check small"><input id={`cs-vs-edge-motion-${prefix}-${i}`} className="form-check-input" type="checkbox" checked={e.motion} onChange={(ev) => set(i, { motion: ev.target.checked })} disabled={disabled} /><label className="form-check-label" htmlFor={`cs-vs-edge-motion-${prefix}-${i}`}>Motion</label></div></div>
            <div className="col-3 col-lg-1"><button type="button" className="btn btn-sm btn-outline-danger w-100" onClick={() => remove(i)} disabled={disabled} aria-label={`Remove connection ${i + 1}`}>Remove</button></div>
            {err ? <p className="small text-danger mb-0" data-testid="cs-vs-row-error">{err}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export default function CaseStudyVisualStoryWorkflowEditor({ form, onChange, errorFor, metricKeys, disabled }: Props) {
  const [panelIndex, setPanelIndex] = useState(0);
  const set = (patch: Partial<VisualStoryForm>) => onChange({ ...form, ...patch });
  const setType = (type: VisualStoryForm['workflowType']) => {
    const panels = type === 'before_after'
      ? [form.panels.find((p) => p.key === 'before') ?? emptyPanel('before', 'Before'), { ...(form.panels.find((p) => p.key === 'after') ?? form.panels[0] ?? emptyPanel('after', 'After')), key: 'after' }]
      : [{ ...(form.panels.find((p) => p.key === 'after') ?? form.panels[0] ?? emptyPanel('single', 'As built')), key: 'single' }];
    onChange({ ...form, workflowType: type, panels });
    setPanelIndex(0);
  };
  const index = Math.min(panelIndex, form.panels.length - 1);
  const panel = form.panels[index];
  const prefix = `workflow.panels.${index}`;
  const setPanel = (p: PanelForm) => set({ panels: form.panels.map((x, i) => (i === index ? p : x)) });

  if (!form.hasWorkflow) {
    return (
      <div className="mb-3">
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => set({ hasWorkflow: true })} disabled={disabled}>Add a workflow illustration</button>
      </div>
    );
  }
  return (
    <div className="mb-3" data-testid="cs-vs-workflow">
      <div className="row g-2 mb-2">
        <div className="col-12 col-lg-3"><Field label="Type"><select className="form-select form-select-sm" value={form.workflowType} onChange={(e) => setType(e.target.value as VisualStoryForm['workflowType'])} disabled={disabled} data-testid="cs-vs-type"><option value="single_state">Single state</option><option value="before_after">Before and after</option></select></Field></div>
        <div className="col-12 col-lg-9"><Field label="Title"><input className="form-control form-control-sm" value={form.title} onChange={(e) => set({ title: e.target.value })} disabled={disabled} data-testid="cs-vs-title" /></Field></div>
        <div className="col-12"><Field label="Description"><textarea className="form-control form-control-sm" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} disabled={disabled} /></Field></div>
        <div className="col-12 col-lg-6"><Field label="Caption (optional)"><input className="form-control form-control-sm" value={form.caption} onChange={(e) => set({ caption: e.target.value })} disabled={disabled} /></Field></div>
        <div className="col-12 col-lg-6"><Field label="Motion note (optional; the default says illustration, not telemetry)"><input className="form-control form-control-sm" value={form.motionNote} onChange={(e) => set({ motionNote: e.target.value })} disabled={disabled} /></Field></div>
      </div>
      {errorFor('workflow.title') || errorFor('workflow.description') ? <p className="small text-danger">{errorFor('workflow.title') || errorFor('workflow.description')}</p> : null}
      {form.panels.length > 1 ? (
        <div className="btn-group btn-group-sm mb-2" role="group" aria-label="Panel">
          {form.panels.map((p, i) => (
            <button key={p.key} type="button" className={`btn ${i === index ? 'btn-primary' : 'btn-outline-primary'}`} aria-pressed={i === index} onClick={() => setPanelIndex(i)} data-testid={`cs-vs-panel-${p.key}`}>{p.label || p.key}</button>
          ))}
        </div>
      ) : null}
      <div className="row g-2 mb-2">
        <div className="col-6 col-lg-3"><Field label="Panel label"><input className="form-control form-control-sm" value={panel.label} onChange={(e) => setPanel({ ...panel, label: e.target.value })} disabled={disabled} /></Field></div>
        <div className="col-6 col-lg-3"><Field label="First step (key)"><select className="form-select form-select-sm" value={panel.initialNodeKey} onChange={(e) => setPanel({ ...panel, initialNodeKey: e.target.value })} disabled={disabled}><option value="">first listed</option>{panel.nodes.map((n) => n.key).filter(Boolean).map((k) => <option key={k} value={k}>{k}</option>)}</select></Field></div>
        <div className="col-12 col-lg-6"><Field label="Panel summary (optional)"><input className="form-control form-control-sm" value={panel.summary} onChange={(e) => setPanel({ ...panel, summary: e.target.value })} disabled={disabled} /></Field></div>
        {(['primary', 'recovery', 'manual'] as const).map((lane) => (
          <div key={lane} className="col-4"><Field label={`${lane} lane label (optional)`}><input className="form-control form-control-sm" value={panel.laneLabels[lane]} onChange={(e) => setPanel({ ...panel, laneLabels: { ...panel.laneLabels, [lane]: e.target.value } })} disabled={disabled} /></Field></div>
        ))}
      </div>
      {errorFor(`${prefix}.label`) || errorFor(`${prefix}.initialNodeKey`) ? <p className="small text-danger">{errorFor(`${prefix}.label`) || errorFor(`${prefix}.initialNodeKey`)}</p> : null}
      <NodeRows panel={panel} prefix={prefix} onChange={setPanel} errorFor={errorFor} metricKeys={metricKeys} disabled={disabled} />
      <EdgeRows panel={panel} prefix={prefix} onChange={setPanel} errorFor={errorFor} disabled={disabled} />
      <button type="button" className="btn btn-sm btn-link text-danger px-0" onClick={() => set({ hasWorkflow: false })} disabled={disabled}>Remove the workflow illustration</button>
    </div>
  );
}
