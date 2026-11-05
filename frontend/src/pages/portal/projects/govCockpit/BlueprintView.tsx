import React from 'react';
import type { GovProposalBlueprint, GovBlueprintRule, GovRequiredForm } from '../../../../services/govProjectPortalApi';

/**
 * BlueprintView — the cockpit's BLUEPRINT tab (Proposal Studio P2). It shows the quoted, cited rulebook the system
 * derived from the stored solicitation ZIP: how the bid is scored (Section M), how it must be submitted (Section L),
 * and which forms are required (including the Texas forms rules engine). Every rule shows the literal source quote it
 * came from — the never-fabricate rail, made visible. Read-only; the data is the student-safe projection's blueprint.
 */
const SEV_CLS: Record<string, string> = { fatal: 'warn', curable: '', info: '' };
const DISPOSITION: Record<string, { cls: string; label: string }> = {
  required: { cls: 'warn', label: 'Required' },
  at_award: { cls: '', label: 'At award' },
  needs_input: { cls: 'ai', label: 'Needs input' },
  not_required: { cls: '', label: 'Not required' },
};

function RuleRow({ r }: { r: GovBlueprintRule }): React.ReactElement {
  return (
    <li className="gck-bp-rule">
      <div className="gck-bp-rule-head">
        <span className="gck-bp-key">{r.key.replace(/_/g, ' ')}</span>
        <b className="gck-num">{r.value}</b>
        {r.severity === 'fatal' && <span className="gck-tag warn">fatal</span>}
        <span className="gck-bp-src">{r.sourceFile}{typeof r.page === 'number' ? ` p.${r.page}` : ''}</span>
      </div>
      <blockquote className="gck-bp-quote">&ldquo;{r.quote}&rdquo;</blockquote>
    </li>
  );
}

function FormRow({ f }: { f: GovRequiredForm }): React.ReactElement {
  const d = DISPOSITION[f.disposition] ?? DISPOSITION.not_required;
  return (
    <li className="gck-bp-form">
      <div className="gck-bp-rule-head">
        <span style={{ fontWeight: 700 }}>{f.label}</span>
        <span className={`gck-tag ${d.cls}`}>{d.label}</span>
        {f.disposition === 'at_award' && <span className="gck-tag">due at award</span>}
      </div>
      <div className="gck-hint">{f.triggerReason}</div>
      <div className="gck-bp-src">{f.citation}</div>
    </li>
  );
}

export default function BlueprintView(
  { blueprint, onReanalyze, reanalyzing = false }: { blueprint?: GovProposalBlueprint | null; onReanalyze?: () => void; reanalyzing?: boolean },
): React.ReactElement {
  const reanalyzeBtn = onReanalyze
    ? <button type="button" className="gck-btn" onClick={onReanalyze} disabled={reanalyzing}>{reanalyzing ? 'Re-analyzing…' : 'Re-analyze solicitation'}</button>
    : null;
  if (!blueprint) {
    return (
      <div className="gck-empty" style={{ padding: 16 }}>
        <p style={{ marginTop: 0 }}>No blueprint yet. Re-analyze the stored solicitation package to build it: the scoring, the Section L
        submission rules, and the required forms will appear here, each quoting its source.</p>
        {reanalyzeBtn}
      </div>
    );
  }
  const applicableForms = blueprint.forms.filter((f) => f.disposition !== 'not_required');
  const notRequired = blueprint.forms.filter((f) => f.disposition === 'not_required');

  return (
    <div className="gck-blueprint">
      <div className="gck-tags" style={{ marginBottom: 12, alignItems: 'center' }}>
        {blueprint.buyerType && <span className="gck-tag">Buyer: {blueprint.buyerType.replace(/_/g, ' ')}</span>}
        <span className="gck-tag">{blueprint.rules.length} rule{blueprint.rules.length === 1 ? '' : 's'}</span>
        <span className="gck-tag">{applicableForms.length} form{applicableForms.length === 1 ? '' : 's'}</span>
        {blueprint.droppedRuleCount > 0 && <span className="gck-tag">{blueprint.droppedRuleCount} dropped (unverifiable)</span>}
        {reanalyzeBtn && <span style={{ marginLeft: 'auto' }}>{reanalyzeBtn}</span>}
      </div>

      <section className="gck-panel" style={{ marginBottom: 12 }}>
        <div className="gck-eyebrow">Scoring (Section M)</div>
        {blueprint.scoring.basis
          ? <p style={{ margin: '6px 0' }}>Basis of award: <b>{blueprint.scoring.basis.replace(/_/g, ' ')}</b>{blueprint.scoring.totalPoints ? <> &middot; <b className="gck-num">{blueprint.scoring.totalPoints}</b> points</> : null}</p>
          : <p className="gck-hint" style={{ margin: '6px 0' }}>No explicit scoring basis detected.</p>}
        {blueprint.scoring.factors.length > 0 && (
          <ul className="gck-bp-factors">
            {blueprint.scoring.factors.map((fac, i) => (
              <li key={i}><span>{fac.label}</span><b className="gck-num">{typeof fac.points === 'number' ? `${fac.points} pts` : typeof fac.percent === 'number' ? `${fac.percent}%` : ''}</b></li>
            ))}
          </ul>
        )}
      </section>

      <section className="gck-panel" style={{ marginBottom: 12 }}>
        <div className="gck-eyebrow">Submission rules (Section L)</div>
        {blueprint.rules.length ? <ul className="gck-bp-list">{blueprint.rules.map((r, i) => <RuleRow r={r} key={`${r.key}-${i}`} />)}</ul> : <p className="gck-hint">No submission mechanics detected.</p>}
      </section>

      <section className="gck-panel" style={{ marginBottom: 12 }}>
        <div className="gck-eyebrow">Required forms</div>
        {applicableForms.length ? <ul className="gck-bp-list">{applicableForms.map((f) => <FormRow f={f} key={f.key} />)}</ul> : <p className="gck-hint">No required forms for this buyer.</p>}
        {notRequired.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary className="gck-hint">{notRequired.length} form{notRequired.length === 1 ? '' : 's'} not required — why</summary>
            <ul className="gck-bp-list">{notRequired.map((f) => <FormRow f={f} key={f.key} />)}</ul>
          </details>
        )}
      </section>

      {blueprint.addenda.length > 0 && (
        <section className="gck-panel">
          <div className="gck-eyebrow">Addenda to acknowledge</div>
          <ul className="gck-bp-list">{blueprint.addenda.map((a, i) => <RuleRow r={a} key={`${a.key}-${i}`} />)}</ul>
        </section>
      )}
    </div>
  );
}
