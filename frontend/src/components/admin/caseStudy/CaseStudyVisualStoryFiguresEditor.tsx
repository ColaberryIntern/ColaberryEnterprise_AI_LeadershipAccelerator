import React from 'react';
import {
  CHART_KINDS, STORY_SURFACES, WORKFLOW_STATUSES, emptyChart, emptyPart,
} from './caseStudyVisualStoryPanelModel';
import type { ChartPartRow, ChartRow, VisualStoryForm } from './caseStudyVisualStoryPanelModel';

/**
 * CaseStudyVisualStoryFiguresEditor - the switch, the cards and the charts.
 *
 * NOTHING HERE TYPES A HEADLINE NUMBER. An outcome card is a metric KEY; the
 * figure the page shows is that metric's verified value. A chart's anchor is
 * a metric key too. The only literal a part may carry is a value with a
 * denominator AND an evidence id, which the server refuses without the id, so
 * the field is labelled with that condition rather than hidden behind it.
 *
 * THE SWITCH IS THE PUBLISH DECISION FOR THIS BAND. `enabled` plus a surface
 * list is what the projection reads; a saved story that is off changes no
 * page. The panel's header says which it is.
 */

interface Props {
  form: VisualStoryForm;
  onChange: (next: VisualStoryForm) => void;
  errorFor: (pathPrefix: string) => string | null;
  metricKeys: readonly string[];
  disabled: boolean;
  /** From the server's limits: cards and charts per story, parts per chart. */
  limits: { outcomeCards: number; charts: number; chartParts: number };
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="form-label small mb-0 d-grid gap-1">
    <span className="text-muted">{label}</span>
    {children}
  </label>
);

const MetricSelect = ({ value, onChange, metricKeys, disabled, allowNone, testId }: {
  value: string; onChange: (v: string) => void; metricKeys: readonly string[]; disabled: boolean; allowNone?: boolean; testId?: string;
}) => (
  <select className="form-select form-select-sm" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} data-testid={testId}>
    {allowNone ? <option value="">none</option> : <option value="">choose a metric</option>}
    {metricKeys.map((k) => <option key={k} value={k}>{k}</option>)}
    {value && !metricKeys.includes(value) ? <option value={value}>{value} (not on this record)</option> : null}
  </select>
);

function Parts({ chart, index, onChange, errorFor, metricKeys, disabled, max }: {
  chart: ChartRow; index: number; onChange: (c: ChartRow) => void; errorFor: Props['errorFor']; metricKeys: readonly string[]; disabled: boolean; max: number;
}) {
  const set = (i: number, patch: Partial<ChartPartRow>) => onChange({ ...chart, parts: chart.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <div className="mt-2">
      <div className="d-flex align-items-center justify-content-between mb-1">
        <span className="small text-muted">Parts ({chart.parts.length} of {max}) - a metric key, or a literal with its denominator and evidence id</span>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onChange({ ...chart, parts: [...chart.parts, emptyPart()] })} disabled={disabled || chart.parts.length >= max} data-testid="cs-vs-add-part">Add part</button>
      </div>
      {chart.parts.map((p, i) => {
        const err = errorFor(`charts.${index}.parts.${i}`);
        return (
          <div key={i} className={`row g-2 align-items-end border rounded p-2 mb-2 mx-0 ${err ? 'border-danger' : ''}`} data-testid="cs-vs-part">
            <div className="col-6 col-lg-2"><Field label="Label"><input className="form-control form-control-sm" value={p.label} onChange={(e) => set(i, { label: e.target.value })} disabled={disabled} /></Field></div>
            <div className="col-6 col-lg-2"><Field label="Metric"><MetricSelect value={p.metricKey} onChange={(v) => set(i, { metricKey: v })} metricKeys={metricKeys} disabled={disabled} allowNone /></Field></div>
            <div className="col-4 col-lg-1"><Field label="Value"><input className="form-control form-control-sm" inputMode="decimal" value={p.value} onChange={(e) => set(i, { value: e.target.value })} disabled={disabled} /></Field></div>
            <div className="col-4 col-lg-1"><Field label="Of"><input className="form-control form-control-sm" inputMode="decimal" value={p.denominator} onChange={(e) => set(i, { denominator: e.target.value })} disabled={disabled} /></Field></div>
            <div className="col-4 col-lg-2"><Field label="Evidence id"><input className="form-control form-control-sm" value={p.evidenceId} onChange={(e) => set(i, { evidenceId: e.target.value })} disabled={disabled} /></Field></div>
            <div className="col-6 col-lg-1"><Field label="Status"><select className="form-select form-select-sm" value={p.status} onChange={(e) => set(i, { status: e.target.value })} disabled={disabled}><option value="">default</option>{WORKFLOW_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field></div>
            <div className="col-6 col-lg-2"><Field label="Caveat"><input className="form-control form-control-sm" value={p.caveat} onChange={(e) => set(i, { caveat: e.target.value })} disabled={disabled} /></Field></div>
            <div className="col-12 col-lg-1"><button type="button" className="btn btn-sm btn-outline-danger w-100" onClick={() => onChange({ ...chart, parts: chart.parts.filter((_, j) => j !== i) })} disabled={disabled} aria-label={`Remove part ${i + 1}`}>Remove</button></div>
            {err ? <p className="small text-danger mb-0" data-testid="cs-vs-row-error">{err}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export default function CaseStudyVisualStoryFiguresEditor({ form, onChange, errorFor, metricKeys, disabled, limits }: Props) {
  const set = (patch: Partial<VisualStoryForm>) => onChange({ ...form, ...patch });
  const toggleSurface = (s: string) => set({ surfaces: form.surfaces.includes(s) ? form.surfaces.filter((x) => x !== s) : [...form.surfaces, s] });
  const setCard = (i: number, patch: Partial<VisualStoryForm['outcomeCards'][number]>) =>
    set({ outcomeCards: form.outcomeCards.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setChart = (i: number, c: ChartRow) => set({ charts: form.charts.map((x, j) => (j === i ? c : x)) });

  return (
    <div data-testid="cs-vs-figures">
      <div className="row g-2 align-items-end mb-3">
        <div className="col-12 col-lg-3">
          <div className="form-check form-switch">
            <input id="cs-vs-enabled" className="form-check-input" type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} disabled={disabled} data-testid="cs-vs-enabled" />
            <label className="form-check-label small" htmlFor="cs-vs-enabled">Show the visual story</label>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <span className="small text-muted d-block mb-1">On these surfaces</span>
          {STORY_SURFACES.map((s) => (
            <div key={s} className="form-check form-check-inline small">
              <input id={`cs-vs-surface-${s}`} className="form-check-input" type="checkbox" checked={form.surfaces.includes(s)} onChange={() => toggleSurface(s)} disabled={disabled || !form.enabled} data-testid={`cs-vs-surface-${s}`} />
              <label className="form-check-label" htmlFor={`cs-vs-surface-${s}`}>{s}</label>
            </div>
          ))}
        </div>
        <div className="col-12 col-lg-3">
          <Field label="Motion"><select className="form-select form-select-sm" value={form.motion} onChange={(e) => set({ motion: e.target.value === 'off' ? 'off' : 'auto' })} disabled={disabled}><option value="auto">Auto (readers can pause)</option><option value="off">Off</option></select></Field>
        </div>
      </div>
      {errorFor('enabled') || errorFor('surfaces') ? <p className="small text-danger">{errorFor('enabled') || errorFor('surfaces')}</p> : null}

      <div className="mb-3">
        <div className="d-flex align-items-center justify-content-between mb-1">
          <strong className="small">Outcome cards ({form.outcomeCards.length} of {limits.outcomeCards})</strong>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => set({ outcomeCards: [...form.outcomeCards, { metricKey: '', emphasis: false }] })} disabled={disabled || form.outcomeCards.length >= limits.outcomeCards} data-testid="cs-vs-add-card">Add card</button>
        </div>
        {form.outcomeCards.map((c, i) => {
          const err = errorFor(`outcomeCards.${i}`);
          return (
            <div key={i} className={`row g-2 align-items-end border rounded p-2 mb-2 mx-0 ${err ? 'border-danger' : ''}`} data-testid="cs-vs-card">
              <div className="col-8 col-lg-6"><Field label="Metric"><MetricSelect value={c.metricKey} onChange={(v) => setCard(i, { metricKey: v })} metricKeys={metricKeys} disabled={disabled} testId="cs-vs-card-metric" /></Field></div>
              <div className="col-2 col-lg-3"><div className="form-check small"><input id={`cs-vs-card-lead-${i}`} className="form-check-input" type="checkbox" checked={c.emphasis} onChange={(e) => setCard(i, { emphasis: e.target.checked })} disabled={disabled} /><label className="form-check-label" htmlFor={`cs-vs-card-lead-${i}`}>Lead card</label></div></div>
              <div className="col-2 col-lg-3"><button type="button" className="btn btn-sm btn-outline-danger w-100" onClick={() => set({ outcomeCards: form.outcomeCards.filter((_, j) => j !== i) })} disabled={disabled} aria-label={`Remove card ${i + 1}`}>Remove</button></div>
              {err ? <p className="small text-danger mb-0" data-testid="cs-vs-row-error">{err}</p> : null}
            </div>
          );
        })}
      </div>

      <div className="mb-2">
        <div className="d-flex align-items-center justify-content-between mb-1">
          <strong className="small">Charts ({form.charts.length} of {limits.charts})</strong>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => set({ charts: [...form.charts, emptyChart(`chart-${form.charts.length + 1}`)] })} disabled={disabled || form.charts.length >= limits.charts} data-testid="cs-vs-add-chart">Add chart</button>
        </div>
        {form.charts.map((c, i) => {
          const err = errorFor(`charts.${i}`);
          return (
            <div key={i} className={`border rounded p-2 mb-2 ${err ? 'border-danger' : ''}`} data-testid="cs-vs-chart">
              <div className="row g-2">
                <div className="col-6 col-lg-2"><Field label="Key"><input className="form-control form-control-sm" value={c.key} onChange={(e) => setChart(i, { ...c, key: e.target.value })} disabled={disabled} /></Field></div>
                <div className="col-6 col-lg-2"><Field label="Kind"><select className="form-select form-select-sm" value={c.kind} onChange={(e) => setChart(i, { ...c, kind: e.target.value })} disabled={disabled} data-testid="cs-vs-chart-kind">{CHART_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field></div>
                <div className="col-12 col-lg-5"><Field label="Title"><input className="form-control form-control-sm" value={c.title} onChange={(e) => setChart(i, { ...c, title: e.target.value })} disabled={disabled} data-testid="cs-vs-chart-title" /></Field></div>
                <div className="col-12 col-lg-3"><Field label="Anchor metric"><MetricSelect value={c.metricKey} onChange={(v) => setChart(i, { ...c, metricKey: v })} metricKeys={metricKeys} disabled={disabled} /></Field></div>
                <div className="col-12 col-lg-6"><Field label="Caption (optional)"><input className="form-control form-control-sm" value={c.caption} onChange={(e) => setChart(i, { ...c, caption: e.target.value })} disabled={disabled} /></Field></div>
                <div className="col-12 col-lg-6"><Field label="Caveat (required for a comparison)"><input className="form-control form-control-sm" value={c.caveat} onChange={(e) => setChart(i, { ...c, caveat: e.target.value })} disabled={disabled} /></Field></div>
                <div className="col-6 col-lg-2"><Field label="Unit (two-value)"><input className="form-control form-control-sm" value={c.unit} onChange={(e) => setChart(i, { ...c, unit: e.target.value })} disabled={disabled} /></Field></div>
                <div className="col-6 col-lg-2"><Field label="Axis max (two-value)"><input className="form-control form-control-sm" inputMode="decimal" value={c.axisMax} onChange={(e) => setChart(i, { ...c, axisMax: e.target.value })} disabled={disabled} /></Field></div>
                <div className="col-12 col-lg-8"><Field label="Limitations, one per line (optional)"><textarea className="form-control form-control-sm" rows={2} value={c.limitations} onChange={(e) => setChart(i, { ...c, limitations: e.target.value })} disabled={disabled} /></Field></div>
              </div>
              <Parts chart={c} index={i} onChange={(next) => setChart(i, next)} errorFor={errorFor} metricKeys={metricKeys} disabled={disabled} max={limits.chartParts} />
              <div className="d-flex justify-content-between align-items-center mt-1">
                {err ? <p className="small text-danger mb-0" data-testid="cs-vs-row-error">{err}</p> : <span />}
                <button type="button" className="btn btn-sm btn-link text-danger px-0" onClick={() => set({ charts: form.charts.filter((_, j) => j !== i) })} disabled={disabled}>Remove chart</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
