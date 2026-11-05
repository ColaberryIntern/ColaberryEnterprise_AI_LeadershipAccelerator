import React from 'react';
import type { GovProposalDocument } from '../../../../services/govProjectPortalApi';
import { docScore, Bar, teamTag, docTypeMeta } from './studioHelpers';

/**
 * DocumentSet — the deliverables table shaped by the blueprint: each document's type (how it's produced), source
 * file, page count vs limit, requirement count, version, gate (current color team or Passed), and score. Narrative /
 * build / generated rows open the drafting drawer; form rows record the signed copy. Ported from the approved design.
 */
export default function DocumentSet(
  { docs, onOpen, onToast }:
  { docs: GovProposalDocument[]; onOpen: (d: GovProposalDocument) => void; onToast?: (m: string) => void },
): React.ReactElement {
  const TYPE_CARDS: Array<{ label: string; cls: string; body: string }> = [
    { label: 'Narrative', cls: 'acc', body: 'The agent writes it from the blueprint and the company library. It goes through every check and the color-team gates.' },
    { label: 'Form', cls: 'glove', body: 'The agent pre-fills it from company records. A person checks and signs. Scored on completeness and signature.' },
    { label: 'From build', cls: 'agent', body: 'Assembled from verified build stories, screenshots and the demo URL. Proves the requirements with working software.' },
    { label: 'Generated', cls: 'ok', body: 'Generated from the blueprint and kept in sync automatically, like the compliance matrix and the page-limit report.' },
  ];

  return (
    <div className="gps-view">
      <div className="gps-vh"><div><h2>Document set</h2><p>The deliverables for this contract, shaped by its blueprint. Each has a type that sets how it is produced, a page limit, the requirements it must cover, and a current score.</p></div>
        <div className="gps-act"><button className="gps-btn" onClick={() => onToast?.('Library: Texas forms, resumes, case studies, and standard sections.')}>Add from library</button></div></div>
      <div className="gps-tbl-wrap"><table>
        <thead><tr><th>Document</th><th>Type</th><th>Source</th><th className="gps-num">Pages</th><th className="gps-num">Reqs</th><th>Ver</th><th>Gate</th><th style={{ width: 150 }}>Score</th></tr></thead>
        <tbody>
          {docs.map((d) => {
            const sc = docScore(d);
            const meta = docTypeMeta(d);
            const over = d.pageLimit != null && d.latest?.pageCount != null && d.latest.pageCount > d.pageLimit;
            return (
              <tr className="gps-click" key={d.key} onClick={() => (d.key === 'pricing' ? onToast?.('Price proposal — admin only, sealed separate file.') : onOpen(d))}>
                <td><b>{d.title}</b>{d.key === 'pricing' ? <div className="gps-small gps-muted">Hidden from interns</div> : null}{d.superseded ? <div className="gps-small" style={{ color: 'var(--gps-warn)' }}>No longer required</div> : null}</td>
                <td><span className={`gps-tag ${meta.tagClass}`}>{meta.label}</span><div className="gps-small gps-muted">{meta.how}</div></td>
                <td className="gps-small gps-mono">{d.fileName ?? '—'}</td>
                <td className="gps-num">{d.pageLimit != null ? <span style={{ color: over ? 'var(--gps-bad)' : 'inherit' }}>{d.latest?.pageCount ?? 0}/{d.pageLimit}</span> : '—'}</td>
                <td className="gps-num">{d.requirementIds.length}</td>
                <td className="gps-mono">v{d.latest?.version ?? d.version}</td>
                <td>{d.latest?.passes ? <span className="gps-tag ok">Passed</span> : (teamTag(d.currentGate) ?? <span className="gps-tag">—</span>)}</td>
                <td><div className="gps-gate-cell"><Bar v={sc} /><b className="gps-num">{sc}</b></div></td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <div className="gps-grid3">
        {TYPE_CARDS.map((t) => (
          <div className="gps-panel gps-small" key={t.label}><span className={`gps-tag ${t.cls}`}>{t.label}</span><p style={{ margin: '6px 0 0' }} className="gps-muted">{t.body}</p></div>
        ))}
      </div>
    </div>
  );
}
