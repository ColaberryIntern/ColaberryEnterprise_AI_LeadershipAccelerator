import React from 'react';
import type { StudentGovProjectView, GovProposalBlueprint, GovRequiredForm, GovBlueprintRule } from '../../../../services/govProjectPortalApi';
import { docTypeMeta } from './studioHelpers';

const titleCase = (k: string): string => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const FACTOR_COLORS = ['var(--gps-accent)', 'var(--gps-agent)', 'var(--gps-pink)', 'var(--gps-gold)', 'var(--gps-ok)', 'var(--gps-red)'];

function dispositionTag(d: GovRequiredForm['disposition']): React.ReactElement {
  if (d === 'required') return <span className="gps-tag warn">Required</span>;
  if (d === 'at_award') return <span className="gps-tag">At award, not now</span>;
  if (d === 'needs_input') return <span className="gps-tag warn">Needs input</span>;
  return <span className="gps-tag ok">Not required</span>;
}
const severityTag = (s: GovBlueprintRule['severity']): React.ReactElement => (s === 'fatal' ? <span className="gps-tag bad">fatal</span> : s === 'curable' ? <span className="gps-tag warn">curable</span> : <span className="gps-tag">—</span>);

/**
 * Blueprint — the quoted, cited rulebook the agent derives from the stored solicitation ZIP: how it's scored
 * (Section M), the Section L submission rules, the state forms rules (loaded only in a Texas jurisdiction — otherwise
 * the "No state forms rules loaded for <State>" note), and the required documents. Ported from the approved design.
 */
export default function Blueprint(
  { view, onReanalyze, reanalyzing, onToast }:
  { view: StudentGovProjectView; onReanalyze?: () => void; reanalyzing?: boolean; onToast?: (m: string) => void },
): React.ReactElement {
  const bp: GovProposalBlueprint | null | undefined = view.blueprint;
  if (!bp) {
    return (
      <div className="gps-view"><div className="gps-vh"><div><h2>Proposal blueprint</h2><p>Re-analyze the stored solicitation package to build the rulebook this proposal must follow.</p></div>
        <div className="gps-act"><button className="gps-btn agent" data-testid="bp-reanalyze" disabled={reanalyzing} onClick={onReanalyze}>{reanalyzing ? <><span className="gps-spin" /> Analyzing</> : 'Re-analyze ZIP'}</button></div></div>
        <div className="gps-panel gps-muted">No blueprint yet. Re-analyze the stored solicitation package to build it.</div></div>
    );
  }

  const factorTotal = bp.scoring.totalPoints || bp.scoring.factors.reduce((a, f) => a + (f.points ?? f.percent ?? 0), 0) || 1;
  const texasLoaded = bp.stateFormsStatus?.loaded !== false; // undefined (older backend) defaults to showing the forms
  const namedForms = bp.forms.filter((f) => f.quote);
  const formsToShow = texasLoaded ? bp.forms : namedForms;

  return (
    <div className="gps-view">
      <div className="gps-vh"><div><h2>Proposal blueprint <button type="button" data-testid="help" className="gps-help" title="About this view" onClick={() => onToast?.('Blueprint: the cited rulebook the agent derives from the solicitation ZIP — scoring, submission rules, forms.')}>i</button></h2><p>The agent re-reads the stored solicitation ZIP and writes the rules this proposal has to follow. Each rule quotes the source text and cites its file and page, so you can check it.</p></div>
        <div className="gps-act"><button className="gps-btn agent" data-testid="bp-reanalyze" disabled={reanalyzing} onClick={onReanalyze}>{reanalyzing ? <><span className="gps-spin" /> Analyzing</> : 'Re-analyze ZIP'}</button></div></div>

      <div className="gps-panel"><h3>Solicitation package <span className="gps-tag ok">stored</span></h3>
        <div className="gps-log" data-testid="bp-log">
          {bp.sourceFiles.map((f) => (<div key={f}><span className="ok">✓</span> {f}</div>))}
          <div className="ok">{view.requirementCounts.total} requirements · {bp.scoring.factors.length} evaluation factors · {bp.rules.length} submission rules · {(view.proposalDocuments ?? []).length} documents</div>
        </div>
      </div>

      <div className="gps-grid2">
        <div className="gps-panel"><h3>How it is scored <span className="gps-tag">Section M</span></h3>
          {bp.scoring.factors.length > 0 ? (
            <div className="gps-weights" data-testid="bp-weights">
              {bp.scoring.factors.map((f, i) => { const w = f.points ?? f.percent ?? 0; return (<div key={i} style={{ flex: w || 1, background: FACTOR_COLORS[i % FACTOR_COLORS.length] }} title={`${f.label} ${w}`}>{f.label} {w}</div>); })}
            </div>
          ) : <p className="gps-muted gps-small">No weighted scoring factors were detected in this solicitation.</p>}
          {bp.scoring.basisQuote && <div className="gps-quote">{bp.scoring.basisQuote}</div>}
          <p className="gps-small gps-muted" style={{ margin: '10px 0 0' }}>The agent spends drafting effort by weight; the Red-team evaluators score against these factors. Pass/fail items such as the HUB plan earn no points.</p>
        </div>
        <div className="gps-panel"><h3>Submission rules <span className="gps-tag">Section L</span></h3>
          <ul className="gps-bp-list" data-testid="bp-rules">
            {bp.rules.map((r, i) => (
              <li key={i}><div className="gps-bp-k">{titleCase(r.key)}{r.value && r.value !== 'required' ? `: ${r.value}` : ''} {r.severity === 'fatal' ? <span className="gps-tag bad">elimination risk</span> : null}</div>
                {r.quote && <div className="gps-quote">{r.quote}</div>}<div className="gps-src">{r.sourceFile}{r.page ? ` p.${r.page}` : ''}</div></li>
            ))}
            {bp.rules.length === 0 && <li className="gps-muted gps-small">No Section L mechanics were extracted.</li>}
          </ul>
        </div>
      </div>

      <div className="gps-panel" data-testid="bp-state-forms"><h3>State forms rules <span className="gps-tag">{texasLoaded ? 'applied to this contract' : (bp.stateFormsStatus?.state ?? 'jurisdiction')}</span></h3>
        {!texasLoaded && <p className="gps-small gps-muted" style={{ margin: '0 0 8px' }}>{bp.stateFormsStatus?.note ?? 'No state forms rulebook loaded for this jurisdiction. Forms named in the solicitation are listed below.'}</p>}
        {formsToShow.length > 0 ? (
          <div className="gps-tbl-wrap" style={{ border: 0 }}><table style={{ minWidth: 560 }}>
            <thead><tr><th>Form</th><th>Trigger</th><th>This contract</th><th>Miss it</th></tr></thead>
            <tbody>
              {formsToShow.map((f) => (
                <tr key={f.key}><td><b>{f.label}</b></td><td className="gps-small">{f.triggerReason}<div className="gps-small gps-muted">{f.citation}</div></td><td>{dispositionTag(f.disposition)}{f.timing === 'at_award' ? <div className="gps-small gps-muted">Filed with the signed contract</div> : null}</td><td>{severityTag(f.severity)}</td></tr>
              ))}
            </tbody>
          </table></div>
        ) : <p className="gps-small gps-muted">No forms named in the solicitation.</p>}
        {texasLoaded && <p className="gps-small gps-muted" style={{ margin: '8px 0 0' }}>The same rules switch on for other buyers; the engine keys on the detected jurisdiction and buyer type.</p>}
      </div>

      <div className="gps-panel"><h3>Required documents</h3>
        <p className="gps-small gps-muted" style={{ margin: '0 0 8px' }}>Named by the solicitation, plus standard forms and our additions that help the score.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(view.proposalDocuments ?? []).map((d) => (<span className={`gps-tag ${docTypeMeta(d).tagClass}`} key={d.key} onClick={() => onToast?.(`${d.title} — ${docTypeMeta(d).how.toLowerCase()}.`)} style={{ cursor: 'default' }}>{d.title}</span>))}
        </div>
      </div>
    </div>
  );
}
