import React, { useCallback, useState } from 'react';
import type { GovProposalDocument, GovStudioApi, StudentGovProjectView } from '../../../../services/govProjectPortalApi';
import { docScore, Bar, docTypeMeta } from './studioHelpers';
import { docStageLabel, libraryPickerItems, anyNotStarted, type LibraryItem } from './buildHelpers';

/**
 * DocumentSet — the deliverables table shaped by the blueprint (v3, T18). Each document's type, stage, the count of
 * needs holding it, page count vs limit, version, gate, and score. A not-started row offers "Build it" (kicks the
 * agent's create-path). "Add from library" opens a real picker populated from the detected jurisdiction's forms only
 * (D9) plus the standard section/resume/reference library. Narrative/build/generated rows open the editor; form rows
 * record the signed copy.
 */
export default function DocumentSet(
  { view, projectId, docs, studioApi, onOpen, onReload, onToast }:
  { view: StudentGovProjectView; projectId: string; docs: GovProposalDocument[]; studioApi: GovStudioApi; onOpen: (d: GovProposalDocument) => void; onReload: () => void; onToast?: (m: string) => void },
): React.ReactElement {
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [buildingAll, setBuildingAll] = useState(false);
  const canBuildAll = anyNotStarted(docs);

  const buildAllDocs = useCallback(async () => {
    setBuildingAll(true);
    try { const r = await studioApi.buildAll(projectId); onToast?.(r.enqueued.length ? `Building ${r.enqueued.length} document${r.enqueued.length === 1 ? '' : 's'}…` : 'Nothing to build right now.'); onReload(); }
    catch { onToast?.('Could not start Build all.'); } finally { setBuildingAll(false); }
  }, [studioApi, projectId, onReload, onToast]);

  const buildIt = useCallback(async (d: GovProposalDocument) => {
    setBusy(d.key);
    try { await studioApi.startReviewCycle(projectId, d.key); onToast?.(`Building ${d.title}…`); onReload(); }
    catch { onToast?.('Could not start building that document.'); } finally { setBusy(null); }
  }, [studioApi, projectId, onReload, onToast]);

  const pickItem = useCallback((item: LibraryItem) => {
    setPicker(false);
    if (item.key.startsWith('form:')) {
      const docKey = item.key.slice('form:'.length);
      const existing = docs.find((d) => d.key === docKey);
      if (existing) { onOpen(existing); return; }
    }
    onToast?.(`${item.label} is available in the library — the agent adds it when its requirement appears in the set.`);
  }, [docs, onOpen, onToast]);

  const items = libraryPickerItems(view);
  const groups: LibraryItem['group'][] = ['State forms', 'Sections', 'Resumes', 'References'];

  return (
    <div className="gps-view" data-tour="documents">
      <div className="gps-vh"><div><h2>Document set <button type="button" data-testid="help" className="gps-help" title="About this view" onClick={() => onToast?.('Document set: the deliverables shaped by the blueprint. Build a not-started document, or add one from the library.')}>i</button></h2><p>The deliverables for this contract, shaped by its blueprint. Each has a type that sets how it is produced, a stage, the needs holding it, and a current score.</p></div>
        <div className="gps-act"><button className="gps-btn" data-testid="docs-library" onClick={() => setPicker((v) => !v)}>Add from library</button>{canBuildAll && <button className="gps-btn primary" data-testid="btn-build-all" disabled={buildingAll} onClick={buildAllDocs}>Build all documents</button>}</div></div>

      {picker && (
        <div className="gps-panel" style={{ marginBottom: 12 }}>
          <h3>Add from library</h3>
          {groups.map((g) => {
            const gi = items.filter((i) => i.group === g);
            if (!gi.length) return null;
            return (
              <div key={g} style={{ marginTop: 6 }}>
                <div className="gps-small gps-muted">{g}</div>
                <div className="gps-choice-row" style={{ marginTop: 4 }}>
                  {gi.map((i) => <button key={i.key} className="gps-btn sm" onClick={() => pickItem(i)}>{i.label}</button>)}
                </div>
              </div>
            );
          })}
          {!items.some((i) => i.group === 'State forms') && <div className="gps-small gps-muted" style={{ marginTop: 6 }}>No state-specific forms: this solicitation's jurisdiction has no loaded rulebook, so only the standard library is offered.</div>}
        </div>
      )}

      <div className="gps-tbl-wrap"><table data-testid="docs-table">
        <thead><tr><th>Document</th><th>Type</th><th>Stage</th><th className="gps-num">Needs</th><th className="gps-num">Pages</th><th className="gps-num">Reqs</th><th>Ver</th><th style={{ width: 150 }}>Score</th></tr></thead>
        <tbody>
          {docs.map((d) => {
            const sc = docScore(d);
            const meta = docTypeMeta(d);
            const over = d.pageLimit != null && d.latest?.pageCount != null && d.latest.pageCount > d.pageLimit;
            const needs = d.needsCount ?? d.openGapCount ?? 0;
            const fatalNeeds = (d.fatalNeedsCount ?? d.fatalCount ?? 0) > 0;
            const notStarted = d.status === 'not_started' && d.key !== 'pricing' && !d.superseded;
            return (
              <tr className="gps-click" key={d.key} data-testid="docs-row" data-key={d.key} data-stage={docStageLabel(d)} onClick={() => (d.key === 'pricing' ? onToast?.('Price proposal — admin only, sealed separate file.') : onOpen(d))}>
                <td><b>{d.title}</b>{d.fileName ? <div className="gps-small gps-mono gps-muted">{d.fileName}</div> : null}{d.key === 'pricing' ? <div className="gps-small gps-muted">Hidden from interns</div> : null}{d.superseded ? <div className="gps-small" style={{ color: 'var(--gps-warn)' }}>No longer required</div> : null}</td>
                <td><span className={`gps-tag ${meta.tagClass}`}>{meta.label}</span></td>
                <td>{notStarted ? <button className="gps-btn sm primary" data-testid="docs-build-it" disabled={busy === d.key} onClick={(e) => { e.stopPropagation(); buildIt(d); }}>Build it</button> : d.latest?.passes ? <span className="gps-tag ok">Passed</span> : <span className="gps-tag">{docStageLabel(d)}</span>}</td>
                <td className="gps-num">{needs > 0 ? <span data-testid="docs-needs" className={`gps-tag ${fatalNeeds ? 'bad' : 'warn'}`}>{needs} from you</span> : <span className="gps-muted">—</span>}</td>
                <td className="gps-num">{d.pageLimit != null ? <span style={{ color: over ? 'var(--gps-bad)' : 'inherit' }}>{d.latest?.pageCount ?? 0}/{d.pageLimit}</span> : '—'}</td>
                <td className="gps-num">{d.requirementIds.length}</td>
                <td className="gps-mono">v{d.latest?.version ?? d.version}</td>
                <td>{d.latest ? <div className="gps-gate-cell"><Bar v={sc} /><b className="gps-num">{sc}</b></div> : <span className="gps-muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </div>
  );
}
