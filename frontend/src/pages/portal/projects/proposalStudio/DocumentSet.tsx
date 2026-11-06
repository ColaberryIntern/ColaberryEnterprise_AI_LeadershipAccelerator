import React, { useCallback, useState } from 'react';
import type { GovProposalDocument, GovStudioApi, StudentGovProjectView } from '../../../../services/govProjectPortalApi';
import { docScore, Bar, teamTag, docTypeMeta } from './studioHelpers';
import { docStageLabel, libraryPickerItems, type LibraryItem } from './buildHelpers';

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
      <div className="gps-vh"><div><h2>Document set</h2><p>The deliverables for this contract, shaped by its blueprint. Each has a type that sets how it is produced, a stage, the needs holding it, and a current score.</p></div>
        <div className="gps-act"><button className="gps-btn" onClick={() => setPicker((v) => !v)}>Add from library</button></div></div>

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

      <div className="gps-tbl-wrap"><table>
        <thead><tr><th>Document</th><th>Type</th><th>Stage</th><th className="gps-num">Needs</th><th className="gps-num">Pages</th><th>Ver</th><th>Gate</th><th style={{ width: 150 }}>Score</th></tr></thead>
        <tbody>
          {docs.map((d) => {
            const sc = docScore(d);
            const meta = docTypeMeta(d);
            const over = d.pageLimit != null && d.latest?.pageCount != null && d.latest.pageCount > d.pageLimit;
            const needs = d.needsCount ?? d.openGapCount ?? 0;
            const notStarted = d.status === 'not_started' && d.key !== 'pricing' && !d.superseded;
            return (
              <tr className="gps-click" key={d.key} onClick={() => (d.key === 'pricing' ? onToast?.('Price proposal — admin only, sealed separate file.') : onOpen(d))}>
                <td><b>{d.title}</b>{d.key === 'pricing' ? <div className="gps-small gps-muted">Hidden from interns</div> : null}{d.superseded ? <div className="gps-small" style={{ color: 'var(--gps-warn)' }}>No longer required</div> : null}</td>
                <td><span className={`gps-tag ${meta.tagClass}`}>{meta.label}</span></td>
                <td><span className="gps-tag">{docStageLabel(d)}</span>{notStarted ? <div style={{ marginTop: 4 }}><button className="gps-btn sm primary" disabled={busy === d.key} onClick={(e) => { e.stopPropagation(); buildIt(d); }}>Build it</button></div> : null}</td>
                <td className="gps-num">{needs > 0 ? <span style={{ color: (d.fatalNeedsCount ?? d.fatalCount ?? 0) > 0 ? 'var(--gps-bad)' : 'var(--gps-warn)' }}>{needs}</span> : '—'}</td>
                <td className="gps-num">{d.pageLimit != null ? <span style={{ color: over ? 'var(--gps-bad)' : 'inherit' }}>{d.latest?.pageCount ?? 0}/{d.pageLimit}</span> : '—'}</td>
                <td className="gps-mono">v{d.latest?.version ?? d.version}</td>
                <td>{d.latest?.passes ? <span className="gps-tag ok">Passed</span> : (teamTag(d.currentGate) ?? <span className="gps-tag">—</span>)}</td>
                <td><div className="gps-gate-cell"><Bar v={sc} /><b className="gps-num">{sc}</b></div></td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </div>
  );
}
