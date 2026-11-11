import React from 'react';
import type { GovProposalBlueprint, GovRuleSeverity, GovFormDisposition } from '../../../../services/govProjectPortalApi';

/**
 * StageBlueprint — the FULL student-safe solicitation blueprint, the read the admin Qualification Workspace shows on
 * its Solicitation tab, rendered read-only for the intern instead of the bare counts the Studio used to show. Every
 * field here is already on the student projection and is student-safe: the evaluation basis + factors (Section M), the
 * submission rules (Section L), the required forms, the elimination risks and addenda — each with the solicitation
 * QUOTE it was derived from. It carries NO pricing dollars (scoring "points" are the buyer's evaluation points, not
 * money), NO buyer contacts, and NO internal win/price strategy. Extracted from StageDetail so each file keeps one job.
 */

/** Rule/form severity → a plain-language label + tone class, so an intern reads urgency without the jargon. */
const SEV: Record<GovRuleSeverity, { label: string; cls: string }> = {
  fatal: { label: 'Must do', cls: 'bad' },
  curable: { label: 'Fixable', cls: 'warn' },
  info: { label: 'Note', cls: 'ok' },
};

/** Form disposition → a short human label (we never show the "not required" ones). */
const DISPOSITION: Record<GovFormDisposition, string> = {
  required: 'Required',
  not_required: 'Not required',
  needs_input: 'Needs input',
  at_award: 'At award',
};

function Sev({ severity }: { severity: GovRuleSeverity }): React.ReactElement {
  const s = SEV[severity] ?? SEV.info;
  return <span className={`gps-tag gps-small ${s.cls}`} style={{ marginLeft: 8 }}>{s.label}</span>;
}

/** A solicitation quote, shown as the source behind a rule/factor so the intern can trace every claim. */
function Quote({ children }: { children: React.ReactNode }): React.ReactElement | null {
  if (!children) return null;
  return (
    <blockquote
      className="gps-small gps-muted"
      style={{ borderLeft: '2px solid var(--gps-line, #d7dce3)', paddingLeft: 8, margin: '4px 0 2px' }}
    >
      {children}
    </blockquote>
  );
}

export default function StageBlueprint({ bp }: { bp: GovProposalBlueprint }): React.ReactElement {
  const scoring = bp.scoring ?? null;
  const factors = scoring?.factors ?? [];
  const rules = bp.rules ?? [];
  const forms = (bp.forms ?? []).filter((f) => f.disposition !== 'not_required');
  const risks = bp.eliminationRisks ?? [];
  const addenda = bp.addenda ?? [];
  const juris = bp.jurisdiction?.state ?? null;

  return (
    <div className="gps-view" data-testid="stage-blueprint">
      {/* How they score it — Section M evaluation basis + factors */}
      <div className="gps-panel" data-testid="stage-scoring">
        <h3>How they score it {scoring?.totalPoints != null && <span className="gps-tag gps-small">{scoring.totalPoints} pts</span>}</h3>
        {scoring?.basis && <div className="gps-r"><span>Basis of award</span><b>{scoring.basis}</b></div>}
        <Quote>{scoring?.basisQuote}</Quote>
        {factors.length === 0 && <div className="gps-muted gps-small">No scored factors captured in the solicitation.</div>}
        {factors.map((f, i) => (
          <div key={i} data-testid="stage-scoring-factor">
            <div className="gps-r">
              <span>{f.label}</span>
              <b className="gps-num">{f.points != null ? `${f.points} pts` : f.percent != null ? `${f.percent}%` : ''}</b>
            </div>
            <Quote>{f.quote}</Quote>
          </div>
        ))}
      </div>

      {/* Submission rules — Section L mechanics */}
      <div className="gps-panel" data-testid="stage-rules">
        <h3>Submission rules <span className="gps-tag gps-small">{rules.length}</span></h3>
        {rules.length === 0 && <div className="gps-muted gps-small">No submission rules captured.</div>}
        {rules.map((r, i) => (
          <div key={r.key || i} data-testid="stage-rule">
            <div className="gps-r"><span>{r.value}<Sev severity={r.severity} /></span></div>
            <Quote>{r.quote}</Quote>
          </div>
        ))}
      </div>

      {/* Required forms */}
      {forms.length > 0 && (
        <div className="gps-panel" data-testid="stage-forms">
          <h3>Required forms <span className="gps-tag gps-small">{forms.length}</span></h3>
          {forms.map((f, i) => (
            <div key={f.key || i} data-testid="stage-form">
              <div className="gps-r">
                <span>{f.label}<Sev severity={f.severity} /></span>
                <b className="gps-small gps-muted">{DISPOSITION[f.disposition] ?? f.disposition}{f.timing ? ` · ${f.timing}` : ''}</b>
              </div>
              <Quote>{f.quote}</Quote>
            </div>
          ))}
        </div>
      )}

      {/* Elimination risks — the ways a bid gets thrown out */}
      {risks.length > 0 && (
        <div className="gps-panel" data-testid="stage-risks">
          <h3>Elimination risks <span className="gps-tag gps-small bad">{risks.length}</span></h3>
          <div className="gps-muted gps-small" style={{ marginBottom: 6 }}>Miss one of these and the bid is non-responsive.</div>
          {risks.map((r, i) => (
            <div key={i} data-testid="stage-risk">
              <div className="gps-r"><span>{r.statement}</span></div>
              <Quote>{r.quote}</Quote>
            </div>
          ))}
        </div>
      )}

      {/* Addenda — amendments issued after the solicitation */}
      {addenda.length > 0 && (
        <div className="gps-panel" data-testid="stage-addenda">
          <h3>Addenda <span className="gps-tag gps-small">{addenda.length}</span></h3>
          {addenda.map((a, i) => (
            <div key={a.key || i} data-testid="stage-addendum">
              <div className="gps-r"><span>{a.value}<Sev severity={a.severity} /></span></div>
              <Quote>{a.quote}</Quote>
            </div>
          ))}
        </div>
      )}

      {/* Where it's from — buyer type + jurisdiction, no contacts */}
      {(bp.buyerType || juris) && (
        <div className="gps-panel" data-testid="stage-bp-meta">
          {bp.buyerType && <div className="gps-r"><span>Buyer type</span><b>{bp.buyerType}</b></div>}
          {juris && <div className="gps-r"><span>Jurisdiction</span><b>{juris}</b></div>}
          {bp.stateFormsStatus?.note && <div className="gps-muted gps-small" style={{ marginTop: 6 }}>{bp.stateFormsStatus.note}</div>}
        </div>
      )}
    </div>
  );
}
