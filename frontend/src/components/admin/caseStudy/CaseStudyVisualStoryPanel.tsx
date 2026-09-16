import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SectionCard } from '../shell';
import CaseStudyVisualStoryWorkflowEditor from './CaseStudyVisualStoryWorkflowEditor';
import CaseStudyVisualStoryFiguresEditor from './CaseStudyVisualStoryFiguresEditor';
import {
  diffSummary, formFromSection, hasSourceHash, sectionFromForm,
} from './caseStudyVisualStoryPanelModel';
import type { VisualStoryForm } from './caseStudyVisualStoryPanelModel';
import type { SnapshotView } from './caseStudySnapshotView';
import type {
  CaseStudyVisualStoryDraft, CaseStudyVisualStoryState, CaseStudyVisualStoryValidationError,
} from '../../../services/caseStudyAdminTypes';

/**
 * CaseStudyVisualStoryPanel - author the illustration, the cards and the
 * charts a published record carries under its hero.
 *
 * ONE WRITE PATH. Save goes through `applyHumanOverride` with path
 * `visualStory`, the same override every other panel uses, which validates
 * the section, approves the new snapshot and re-pins the live surfaces where
 * the gate allows. This panel never writes any other way; "Generate" is a
 * read that returns a draft to the form, and nothing in the form is saved
 * until Save is pressed.
 *
 * THE SERVER'S REFUSAL IS THE FORM'S ERROR LIST. A rejected save carries
 * `errors[{path, code, message}]`; the panel prints them at the top and hands
 * each editor an `errorFor(pathPrefix)` so the row the server named is marked.
 *
 * STALE IS A BADGE, NOT A REGENERATION. When the sections the story was drawn
 * from changed under it, the header says so and offers Regenerate; nothing
 * overwrites a person's work on its own.
 */

export interface CaseStudyVisualStoryPanelProps {
  visualStory: SnapshotView['visualStory'];
  metricKeys: readonly string[];
  busy: boolean;
  onReadState: () => Promise<CaseStudyVisualStoryState>;
  onGenerate: () => Promise<CaseStudyVisualStoryDraft>;
  /** The desk's override; rejects with the axios error so `response.data.errors` can be read. */
  onSave: (path: string, value: unknown, note?: string) => Promise<void>;
  now?: () => Date;
}

const DEFAULT_LIMITS = { outcomeCards: 3, charts: 6, chartParts: 8 };

/** `a[1].b[2]` and `a.1.b.2` are the same path to a row. */
export const dotted = (path: string): string => path.replace(/\[(\d+)\]/g, '.$1');

function errorsOf(err: unknown): CaseStudyVisualStoryValidationError[] {
  const data = (err as { response?: { data?: { errors?: unknown; error?: string } } })?.response?.data;
  if (Array.isArray(data?.errors)) {
    return data.errors
      .filter((e): e is CaseStudyVisualStoryValidationError => Boolean(e) && typeof e === 'object' && typeof (e as { path?: unknown }).path === 'string')
      .map((e) => ({ path: e.path, code: String(e.code ?? ''), message: String(e.message ?? '') }));
  }
  return [];
}

export default function CaseStudyVisualStoryPanel({
  visualStory, metricKeys, busy, onReadState, onGenerate, onSave, now = () => new Date(),
}: CaseStudyVisualStoryPanelProps) {
  const stored = useMemo(() => formFromSection(visualStory?.raw ?? null), [visualStory]);
  const [form, setForm] = useState<VisualStoryForm>(stored);
  const [state, setState] = useState<CaseStudyVisualStoryState | null>(null);
  const [reasons, setReasons] = useState<readonly string[]>([]);
  const [errors, setErrors] = useState<CaseStudyVisualStoryValidationError[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // A new snapshot (after a save, a sync, a reload) resets the form to what is stored.
  useEffect(() => { setForm(stored); setErrors([]); setPreviewOpen(false); }, [stored]);

  // The read is keyed on the snapshot in hand, not on the callback's identity,
  // so a page that passes a fresh arrow each render cannot loop this effect.
  const readRef = useRef(onReadState);
  readRef.current = onReadState;
  useEffect(() => {
    let live = true;
    readRef.current().then((s) => { if (live) { setState(s); setLoadError(null); } }).catch(() => {
      if (live) setLoadError('Could not read the stored visual story; the form still edits the snapshot in hand.');
    });
    return () => { live = false; };
  }, [visualStory]);

  const limits = {
    outcomeCards: state?.limits.outcomeCards ?? DEFAULT_LIMITS.outcomeCards,
    charts: state?.limits.charts ?? DEFAULT_LIMITS.charts,
    chartParts: state?.limits.chartParts ?? DEFAULT_LIMITS.chartParts,
  };
  const diff = useMemo(() => diffSummary(stored, form), [stored, form]);
  const disabled = busy || working;
  // The validator writes semantic paths with brackets (`workflow.panels[1].nodes[3]`)
  // and shape paths with dots (`workflow.panels.1.nodes.3.label`); the editors ask
  // with dots. Both spellings are normalised to dots before matching, so a row is
  // marked whichever kind of refusal named it.
  const errorFor = useCallback((prefix: string): string | null => {
    const want = dotted(prefix);
    const hit = errors.find((e) => { const p = dotted(e.path); return p === want || p.startsWith(`${want}.`); });
    return hit ? `${hit.path}: ${hit.message}` : null;
  }, [errors]);

  const generate = async () => {
    setWorking(true);
    setErrors([]);
    try {
      const out = await onGenerate();
      setState(out);
      setReasons(out.reasons);
      if (out.draft) {
        const next = formFromSection(out.draft);
        // A draft is a proposal for the pictures; the switch and the surfaces stay as the person set them.
        setForm({ ...next, enabled: form.enabled, surfaces: form.surfaces });
      }
      if (!out.draftValidation.ok) setErrors([...out.draftValidation.errors]);
    } catch {
      setLoadError('Could not draw a draft from this record.');
    } finally {
      setWorking(false);
    }
  };

  const save = async () => {
    setWorking(true);
    setErrors([]);
    try {
      const section = sectionFromForm(form, { now: now().toISOString() });
      await onSave('visualStory', section, form.enabled ? 'Visual story saved and shown' : 'Visual story saved, not shown');
      setPreviewOpen(false);
    } catch (err) {
      setErrors(errorsOf(err));
    } finally {
      setWorking(false);
    }
  };

  const reset = () => { setForm(stored); setErrors([]); setPreviewOpen(false); };
  const canSave = !disabled && diff.changed && hasSourceHash(form);

  return (
    <SectionCard
      title="Visual story"
      icon="flow-chart"
      subtitle="The workflow illustration, outcome cards and charts under the hero. Draw a draft from the record's evidence, edit the words, then save; the page shows it only when the switch is on."
    >
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3 small" data-testid="cs-vs-status">
        <span className="text-muted">On this record:</span>
        {visualStory ? (
          <>
            <span className={`badge ${visualStory.enabled ? 'bg-success' : 'bg-secondary'}`} data-testid="cs-vs-badge-enabled">
              {visualStory.enabled ? `Shown on ${visualStory.surfaces.join(', ') || 'no surface'}` : 'Saved, not shown'}
            </span>
            <span className="badge bg-light text-dark border">{visualStory.state}</span>
            {state?.stale ? <span className="badge bg-warning text-dark" data-testid="cs-vs-badge-stale">Stale: the sections it was drawn from changed</span> : null}
            {state && !state.validation.ok ? <span className="badge bg-danger" data-testid="cs-vs-badge-invalid">Fails validation</span> : null}
          </>
        ) : <span className="text-muted">No visual story yet.</span>}
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={generate} disabled={disabled} data-testid="cs-vs-generate">
          {visualStory || form.hasWorkflow ? 'Regenerate from evidence' : 'Generate from evidence'}
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPreviewOpen((o) => !o)} disabled={disabled || !diff.changed} aria-pressed={previewOpen} data-testid="cs-vs-preview">Preview changes</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={reset} disabled={disabled || !diff.changed} data-testid="cs-vs-reset">Reset to approved</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={!canSave} data-testid="cs-vs-save">Save</button>
      </div>

      {!hasSourceHash(form) ? (
        <p className="small text-muted">Generate a draft first: the save carries a fingerprint of the sections the story was drawn from, and only the generator can compute it.</p>
      ) : null}
      {loadError ? <p className="small text-warning">{loadError}</p> : null}
      {reasons.length > 0 ? (
        <ul className="small text-muted" data-testid="cs-vs-reasons">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      ) : null}
      {errors.length > 0 ? (
        <div className="alert alert-danger py-2 small" role="alert" data-testid="cs-vs-errors">
          <strong>The server refused this story.</strong>
          <ul className="mb-0">{errors.map((e) => <li key={`${e.path}:${e.code}`}><code>{e.path}</code> {e.message}</li>)}</ul>
        </div>
      ) : null}
      {previewOpen ? (
        <div className="alert alert-info py-2 small" data-testid="cs-vs-diff">
          <strong>What will change:</strong>
          <ul className="mb-0">{diff.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      ) : null}

      <CaseStudyVisualStoryFiguresEditor form={form} onChange={setForm} errorFor={errorFor} metricKeys={metricKeys} disabled={disabled} limits={limits} />
      <CaseStudyVisualStoryWorkflowEditor form={form} onChange={setForm} errorFor={errorFor} metricKeys={metricKeys} disabled={disabled} />
    </SectionCard>
  );
}
