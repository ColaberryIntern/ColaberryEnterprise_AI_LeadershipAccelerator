import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudentGovProjectView, GovProposalDocument, GovReviewApi, GovStudioApi, GovDocumentVersion, GovVersionContent, GovDiffSegment, GovSectionPlanFields } from '../../../../services/govProjectPortalApi';
import { CHECKS, Bar, colr, weightedScore } from './studioHelpers';
import { outlineRows } from './editorHelpers';

type EditorMode = 'paper' | 'outline' | 'edit';

const PLAN_FIELDS: Array<{ k: keyof GovSectionPlanFields; label: string }> = [
  { k: 'hotButton', label: 'Hot button' }, { k: 'feature', label: 'Feature' }, { k: 'benefit', label: 'Benefit' }, { k: 'proof', label: 'Proof' }, { k: 'discriminator', label: 'Discriminator' },
];
const EMPTY_PLAN: GovSectionPlanFields = { hotButton: '', feature: '', benefit: '', proof: '', discriminator: '' };

/**
 * DraftVersions — the Draft & versions editor. One working copy per document: the paper preview (the version's
 * content, with diff mode against the previous version), the section plan (reviewer-editable; saving writes a human
 * version), the six-check scores, and the version history. The "Run review cycle" button starts the agent loop and
 * polls the run until it stops. Ported from the approved design. Admin gets the full history/diff/section-plan via
 * the review API; the portal shows the latest version + the run cycle.
 */
export default function DraftVersions(
  { view, projectId, docs, studioApi, reviewApi, initialDocKey, onReload, onToast }:
  { view: StudentGovProjectView; projectId: string; docs: GovProposalDocument[]; studioApi: GovStudioApi; reviewApi?: GovReviewApi; initialDocKey?: string | null; onReload: () => void; onToast?: (m: string) => void },
): React.ReactElement {
  const scored = useMemo(() => docs.filter((d) => d.key !== 'pricing' && (d.docType === 'derived' || d.docType === 'build' || d.docType === 'generated')), [docs]);
  const [docKey, setDocKey] = useState<string>(() => (initialDocKey && scored.some((d) => d.key === initialDocKey) ? initialDocKey : scored[0]?.key ?? ''));
  const doc = scored.find((d) => d.key === docKey) ?? null;

  const [versions, setVersions] = useState<GovDocumentVersion[]>([]);
  const [selVerId, setSelVerId] = useState<string | null>(null);
  const [content, setContent] = useState<GovVersionContent | null>(null);
  const [diff, setDiff] = useState<GovDiffSegment[] | null>(null);
  const [running, setRunning] = useState(false);
  const [planDraft, setPlanDraft] = useState<GovSectionPlanFields>(EMPTY_PLAN);
  const [selSection, setSelSection] = useState<string>('');
  const [mode, setMode] = useState<EditorMode>('paper');
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const poll = useRef<number | null>(null);
  const canEdit = !!reviewApi?.editDocument;

  const loadVersions = useCallback(() => {
    if (!docKey) { setVersions([]); return; }
    if (reviewApi) {
      reviewApi.listReview(projectId, docKey).then((r) => { setVersions(r.versions); setSelVerId((cur) => cur ?? r.versions[0]?.id ?? null); }).catch(() => setVersions([]));
    } else if (doc?.latest) {
      const v: GovDocumentVersion = { id: doc.latest.versionId, version: doc.latest.version, authorKind: 'agent', changeSummary: null, scores: doc.latest.scores, findings: [], passes: doc.latest.passes, pageCount: doc.latest.pageCount, createdAt: doc.latest.createdAt };
      setVersions([v]); setSelVerId(v.id);
    } else { setVersions([]); setSelVerId(null); }
  }, [projectId, docKey, reviewApi, doc]);

  useEffect(() => { setSelVerId(null); loadVersions(); }, [loadVersions]);
  useEffect(() => {
    if (!docKey || !selVerId) { setContent(null); return; }
    studioApi.getVersionContent(projectId, docKey, selVerId).then((c) => { setContent(c); setSelSection((cur) => cur || c.sections[0]?.sectionKey || ''); }).catch(() => setContent(null));
    setDiff(null);
  }, [projectId, docKey, selVerId, studioApi]);
  useEffect(() => () => { if (poll.current) window.clearInterval(poll.current); }, []);

  const selVer = versions.find((v) => v.id === selVerId) ?? null;
  const sc = weightedScore(selVer?.scores);

  const toggleDiff = useCallback(() => {
    if (!reviewApi || !selVerId) { onToast?.('Diff is available to reviewers.'); return; }
    if (diff) { setDiff(null); return; }
    const idx = versions.findIndex((v) => v.id === selVerId);
    const prev = versions[idx + 1]; // versions are newest-first
    if (!prev) { onToast?.('No earlier version to diff against.'); return; }
    reviewApi.diffVersions(projectId, prev.id, selVerId).then((r) => setDiff(r.segments)).catch(() => onToast?.('Could not diff the versions.'));
  }, [reviewApi, projectId, selVerId, versions, diff, onToast]);

  const runCycle = useCallback(() => {
    if (running || !docKey) return;
    setRunning(true);
    studioApi.startReviewCycle(projectId, docKey).then(({ runId }) => {
      poll.current = window.setInterval(() => {
        studioApi.getReviewRun(projectId, runId).then((run) => {
          if (run.status !== 'running') {
            if (poll.current) window.clearInterval(poll.current);
            setRunning(false);
            onToast?.(`Review cycle ${run.status}.${run.lastMessage ? ` ${run.lastMessage}` : ''}`);
            onReload(); loadVersions();
          }
        }).catch(() => { if (poll.current) window.clearInterval(poll.current); setRunning(false); });
      }, 2000);
    }).catch((e: unknown) => {
      setRunning(false);
      const status = (e as { response?: { status?: number } })?.response?.status;
      onToast?.(status === 409 ? 'A review cycle is already running for this document.' : status === 403 ? 'Running a cycle needs an edit share on this document.' : 'Could not start the review cycle.');
    });
  }, [running, docKey, projectId, studioApi, onReload, loadVersions, onToast]);

  const section = content?.sections.find((s) => s.sectionKey === selSection) ?? null;
  useEffect(() => { setPlanDraft(section?.planFields ?? EMPTY_PLAN); }, [section]);
  const savePlan = useCallback(() => {
    if (!reviewApi?.saveSectionPlan || !selSection) { onToast?.('Section plans are reviewer-only.'); return; }
    reviewApi.saveSectionPlan(projectId, docKey, selSection, planDraft).then(() => { onToast?.('Section plan saved as a new version.'); onReload(); loadVersions(); }).catch(() => onToast?.('Could not save the section plan.'));
  }, [reviewApi, selSection, projectId, docKey, planDraft, onReload, loadVersions, onToast]);

  const canEditPlan = !!reviewApi?.saveSectionPlan;

  // Seed the Edit textarea from the current version's content whenever Edit opens or the content changes.
  useEffect(() => { if (mode === 'edit') setEditText(content?.contentHtml ?? ''); }, [mode, content]);

  const saveEdit = useCallback(async () => {
    if (!reviewApi?.editDocument || !docKey) return;
    const html = editText.trim();
    if (!html) { onToast?.('Edit content is required.'); return; }
    setSaving(true);
    try {
      const r = await reviewApi.editDocument(projectId, docKey, html);
      onToast?.(r.passes ? 'Saved — the edit passes the checks.' : r.resumed ? 'Saved — still below bar, the agent is revising.' : 'Saved as a new version.');
      setMode('paper');
      onReload(); loadVersions();
    } catch { onToast?.('Could not save the edit.'); } finally { setSaving(false); }
  }, [reviewApi, projectId, docKey, editText, onReload, loadVersions, onToast]);

  const rows = outlineRows(content?.sections, doc?.pageLimit);

  return (
    <div className="gps-view">
      <div className="gps-vh"><div><h2>Draft &amp; versions</h2><p>One working copy per document. Each agent pass or human edit saves a new version with its check scores, so you can compare versions or roll back.</p></div>
        <div className="gps-act">
          <div className="gps-tabs" role="tablist" aria-label="Editor view">
            <button className={`gps-btn sm ${mode === 'paper' ? 'primary' : ''}`} role="tab" aria-selected={mode === 'paper'} onClick={() => setMode('paper')}>Paper</button>
            <button className={`gps-btn sm ${mode === 'outline' ? 'primary' : ''}`} role="tab" aria-selected={mode === 'outline'} onClick={() => setMode('outline')}>Outline</button>
            {canEdit && <button className={`gps-btn sm ${mode === 'edit' ? 'primary' : ''}`} role="tab" aria-selected={mode === 'edit'} onClick={() => setMode('edit')}>Edit</button>}
          </div>
          <button className="gps-btn agent" disabled={running} onClick={runCycle}>{running ? <><span className="gps-spin" /> Running</> : 'Run review cycle'}</button>
          {reviewApi ? <button className="gps-btn" onClick={toggleDiff}>{diff ? 'Hide diff' : 'Diff vs previous'}</button> : null}
        </div></div>
      <div className="gps-doc-pick">
        {scored.map((d) => (<button key={d.key} className="gps-btn sm" style={d.key === docKey ? { borderColor: 'var(--gps-accent)', color: 'var(--gps-accent)' } : undefined} onClick={() => { setDocKey(d.key); setSelVerId(null); }}>{d.title}</button>))}
      </div>
      {!doc ? <div className="gps-panel gps-muted">No drafted documents yet. Open a document from Document set to draft it.</div> : (
        <div className="gps-ed">
          <div className="gps-paper-wrap">
            {mode === 'outline' ? (
              <div className="gps-panel">
                <h3>Outline <span className="gps-muted gps-small" style={{ fontWeight: 400 }}>{doc.pageLimit ? `${doc.pageLimit}-page limit` : 'no page limit'}</span></h3>
                {rows.length === 0 ? <p className="gps-muted gps-small">No sections yet. Run a review cycle to build the outline.</p> : (
                  <div className="gps-outline">
                    {rows.map((r) => (
                      <div className="gps-outline-row" key={r.sectionKey}>
                        <div style={{ minWidth: 0 }}>
                          <b>{r.heading}</b>{r.suggested && <span className="gps-tag acc" style={{ marginLeft: 6 }}>Suggested</span>}
                          <div className="gps-choice-row" style={{ marginTop: 4 }}>{r.requirementIds.map((id) => <span key={id} className="gps-tag">{id}</span>)}</div>
                        </div>
                        <div className="gps-num gps-small" title="page budget">{r.pageBudget != null ? `${r.pageBudget} pg` : '—'}</div>
                        <span className={`gps-tag ${r.hasContent ? 'ok' : ''}`}>{r.hasContent ? 'Drafted' : 'Empty'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : mode === 'edit' ? (
              <div className="gps-panel">
                <h3>Edit {doc.title}</h3>
                <p className="gps-small gps-muted">Saving writes a human version and re-runs the checks. If it is still below the bar, the agent keeps revising; if it passes, it stops.</p>
                <textarea className="gps-input" style={{ width: '100%', minHeight: 320, fontFamily: 'var(--gps-sans)' }} aria-label="Edit document HTML" value={editText} onChange={(e) => setEditText(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="gps-btn primary" disabled={saving} onClick={saveEdit}>{saving ? 'Saving…' : 'Save edit'}</button><button className="gps-btn" onClick={() => setMode('paper')}>Cancel</button></div>
              </div>
            ) : (
              <div className="gps-paper">
                <div className="gps-run"><span>Colaberry &middot; Response to {view.name}</span><span>{doc.title} &middot; v{selVer?.version ?? doc.version}</span><span>{selVer?.pageCount != null ? `${selVer.pageCount} page${selVer.pageCount === 1 ? '' : 's'}` : ''}</span></div>
                {content?.contentHtml || diff ? (
                  diff ? (
                    <p>{diff.map((seg, i) => (seg.type === 'add' ? <ins key={i}>{seg.text}</ins> : seg.type === 'del' ? <del key={i}>{seg.text}</del> : <span key={i}>{seg.text}</span>))}</p>
                  ) : (
                    // eslint-disable-next-line react/no-danger
                    <div dangerouslySetInnerHTML={{ __html: content?.contentHtml ?? '' }} />
                  )
                ) : <p className="gps-muted" style={{ fontFamily: 'var(--gps-sans)', fontSize: 13 }}>This document has no draft yet. Run a review cycle, or open it from Document set to draft it.</p>}
              </div>
            )}
          </div>
          <div className="gps-side">
            <div className="gps-panel"><h3>Section plan{content && content.sections.length > 1 ? <select value={selSection} onChange={(e) => setSelSection(e.target.value)} style={{ marginLeft: 'auto', maxWidth: 120 }} aria-label="Section">{content.sections.map((s) => <option key={s.sectionKey} value={s.sectionKey}>{s.heading.slice(0, 28)}</option>)}</select> : null}</h3>
              <dl className="gps-small" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: '6px 10px', alignItems: 'center' }}>
                {PLAN_FIELDS.map((f) => (
                  <React.Fragment key={f.k}>
                    <dt className="gps-muted">{f.label}</dt>
                    <dd style={{ margin: 0 }}>{canEditPlan ? <input style={{ width: '100%', border: '1px solid var(--gps-line)', background: 'var(--gps-surface)', borderRadius: 5, padding: '4px 7px', fontSize: 12, minWidth: 0 }} value={planDraft[f.k]} onChange={(e) => setPlanDraft((p) => ({ ...p, [f.k]: e.target.value }))} /> : (section?.planFields?.[f.k] || <span className="gps-muted">—</span>)}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {canEditPlan && <div style={{ marginTop: 8 }}><button className="gps-btn sm primary" onClick={savePlan}>Save plan</button></div>}
            </div>
            <div className="gps-panel"><h3>Checks &middot; v{selVer?.version ?? '—'}</h3>
              <div className="gps-checks">
                {CHECKS.map((c) => { const v = selVer?.scores?.[c.k] ?? 0; return (<div className="gps-ck" key={c.k}><span>{c.n}</span><b className="gps-sc gps-num" style={{ color: colr(v) }}>{v}</b><Bar v={v} /></div>); })}
                <div className="gps-pass-line"><span className="gps-small gps-muted">Weighted score &middot; pass at 95, no check under 85</span><b className="gps-num gps-big" style={{ fontSize: 22, color: colr(sc) }}>{sc}</b></div>
              </div>
            </div>
            <div className="gps-panel"><h3>Version history</h3>
              <ul className="gps-ver">
                {versions.map((v) => (
                  <li key={v.id}><button aria-pressed={v.id === selVerId} onClick={() => setSelVerId(v.id)}>
                    <span className="gps-vt">v{v.version} <span className={`gps-tag ${v.authorKind === 'agent' ? 'agent' : 'acc'}`}>{v.authorKind === 'agent' ? 'Agent' : 'Human'}</span><span className="gps-num" style={{ marginLeft: 'auto', color: colr(weightedScore(v.scores)) }}>{weightedScore(v.scores)}</span></span>
                    <span className="gps-vd">{v.createdAt ? new Date(v.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}{v.changeSummary ? ` · ${v.changeSummary}` : ''}</span>
                  </button></li>
                ))}
                {versions.length === 0 && <li className="gps-muted gps-small">No versions yet.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
