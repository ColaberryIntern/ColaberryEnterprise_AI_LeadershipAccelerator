import React, { useEffect, useMemo, useState } from 'react';
import { SectionCard, StatCard } from '../../../components/admin/shell';
import MermaidDiagram from '../../../components/visuals/MermaidDiagram';
import { fmtValue } from '../govOppFormat';
import { getGovRiskNarrative } from '../../../services/factoryApi';
import type { EstablishedRequirement, ServiceMatch, GovRiskNarrative } from '../../../services/factoryApi';
import {
  assessBid, bidAssessmentMermaid, PWIN_FACTORS,
  type BidAssessmentInput, type KnockoutStatus, type PWinFactorKey,
} from '../govBidAssessment';

/**
 * BidDecisionDashboard — the "should we pursue this?" surface (2026-10 upgrade).
 *
 * Renders the deterministic `assessBid` engine as a dashboard: a go/no-go band, KPIs (PWin %,
 * Expected Value, Probability of Award, compliance gaps), the Stage-A knockout/eligibility screen
 * with operator status controls, the Stage-B PWin factor breakdown with operator ratings for the
 * judgment factors, and the decision PATH as a Mermaid flowchart. Operator ratings/overrides live in
 * local state and re-score live — the number is deterministic and advisory; it gates nothing.
 */
export interface BidSignals {
  established: EstablishedRequirement[];
  serviceMatches: ServiceMatch[];
  capability: 'strong' | 'moderate' | 'none';
  priorPursuitCount: number;
  daysLeft: number | null;
  estimatedValue: number | null;
  openSubmissionCount: number;
  establishedCount: number;
  buyer?: string | null;
  title?: string | null;
}

const BAND_TONE: Record<string, string> = { bid: 'success', bid_with_conditions: 'warning', no_bid: 'danger' };
const KO_TONE: Record<KnockoutStatus, string> = { pass: 'success', conditional: 'warning', hard_fail: 'danger' };
const KO_LABEL: Record<KnockoutStatus, string> = { pass: 'we hold it', conditional: 'verify / obtain', hard_fail: "can't meet in time" };
const KO_CYCLE: KnockoutStatus[] = ['pass', 'conditional', 'hard_fail'];
const JUDGMENT: PWinFactorKey[] = ['relationship', 'competition', 'price_to_win', 'teaming', 'strategic'];

export function BidDecisionDashboard({ signals, canonical }: { signals: BidSignals; canonical: string }): React.ReactElement {
  const [operatorFactors, setOperatorFactors] = useState<Partial<Record<PWinFactorKey, number>>>({});
  const [overrides, setOverrides] = useState<Record<string, KnockoutStatus>>({});
  const [pursuitType, setPursuitType] = useState<'new' | 'recompete'>('new');
  const [bidCost, setBidCost] = useState<string>('');

  const input: BidAssessmentInput = useMemo(() => ({
    ...signals,
    pursuitType,
    operatorFactors,
    operatorKnockoutOverrides: overrides,
    bidCostEstimate: bidCost ? Number(bidCost) : null,
  }), [signals, pursuitType, operatorFactors, overrides, bidCost]);

  const a = useMemo(() => assessBid(input), [input]);
  const tone = BAND_TONE[a.band] ?? 'secondary';

  const narrativeKey = `govRiskNarrative:${canonical}`;
  const [narrative, setNarrative] = useState<GovRiskNarrative | null>(null);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const [narrativeErr, setNarrativeErr] = useState<string | null>(null);
  // Keep the previously-generated read (per-viewer convenience) so a revisit does not force a re-run.
  useEffect(() => {
    try { const raw = localStorage.getItem(narrativeKey); if (raw) setNarrative(JSON.parse(raw) as GovRiskNarrative); } catch { /* storage may be unavailable */ }
  }, [narrativeKey]);
  const explain = async (): Promise<void> => {
    setNarrativeBusy(true); setNarrativeErr(null);
    try {
      const n = await getGovRiskNarrative(canonical, {
        band: a.band, pwin: a.pwin, preliminary: a.preliminary, expectedValue: a.expectedValue, daysLeft: a.daysLeft,
        knockouts: a.knockouts.map((k) => ({ category: k.categoryLabel, text: k.text, status: k.status })),
        factors: a.factors.map((f) => ({ label: f.label, score: f.score, weight: f.weight })),
        buyer: signals.buyer ?? null, title: signals.title ?? null,
      });
      setNarrative(n);
      try { localStorage.setItem(narrativeKey, JSON.stringify(n)); } catch { /* ignore */ }
    } catch {
      setNarrativeErr('Could not generate the AI read right now.');
    } finally {
      setNarrativeBusy(false);
    }
  };
  const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

  return (
    <SectionCard title="Bid decision — should we pursue this?" icon="scales-3-line"
      subtitle="A deterministic, auditable read (Shipley / APMP bid-decision model): a hard eligibility screen, then a weighted win-probability score. You decide — it feeds no gate and fabricates nothing; rate the judgment factors to sharpen it.">

      {/* Band + headline */}
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <span className={`badge bg-${tone}-subtle text-${tone}-emphasis fs-6 px-3 py-2`}>{a.bandLabel}</span>
        {a.pwin !== null && (
          <span className="h4 mb-0">{a.pwin}%<span className="text-secondary fs-6"> PWin{a.preliminary ? ' (preliminary)' : ''}</span></span>
        )}
        <span className="fw-semibold">{a.headline}</span>
      </div>

      {/* AI read — advisory narrative over the deterministic result */}
      <div className="mb-3">
        <button type="button" className="btn btn-outline-primary btn-sm" disabled={narrativeBusy} onClick={() => { void explain(); }}>
          <i className="ri-sparkling-2-line me-1" aria-hidden="true" />{narrativeBusy ? 'Analyzing…' : narrative ? 'Re-run AI read' : 'Explain this decision (AI)'}
        </button>
        {narrativeErr && <div className="alert alert-warning py-2 mt-2 mb-0 small" role="status">{narrativeErr}</div>}
        {narrative && narrative.narrative && (
          <div className="alert alert-light border mt-2 mb-0" role="status">
            <div className="small text-secondary mb-1"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI read — advisory; it explains the deterministic score, never changes it.</div>
            <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{narrative.narrative}</div>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3"><StatCard label="Win probability" value={a.pwin === null ? '—' : `${a.pwin}%`} icon="percent-line" tone={a.band === 'no_bid' ? 'danger' : a.band === 'bid' ? 'success' : 'warning'} hint={a.pwinRaw !== null && a.pwin !== a.pwinRaw ? `raw ${a.pwinRaw}%, capped` : a.preliminary ? `${Math.round(a.pwinConfidence * 100)}% of factors rated` : undefined} /></div>
        <div className="col-6 col-lg-3"><StatCard label="Expected value" value={a.expectedValue === null ? '—' : fmtValue(a.expectedValue)} icon="money-dollar-circle-line" tone="neutral" hint={a.probabilityOfAward !== null ? `${pct(a.probabilityOfAward)} prob. of award` : 'value × PWin'} /></div>
        <div className="col-6 col-lg-3"><StatCard label="Eligibility gaps" value={a.hardFailCount > 0 ? `${a.hardFailCount} hard` : `${a.conditionalCount} to close`} icon="shield-cross-line" tone={a.hardFailCount > 0 ? 'danger' : a.conditionalCount > 0 ? 'warning' : 'success'} hint={a.hardFailCount > 0 ? `+${a.conditionalCount} conditional` : a.conditionalCount === 0 ? 'none flagged' : 'conditional'} /></div>
        <div className="col-6 col-lg-3"><StatCard label="Deadline" value={a.daysLeft === null ? 'unknown' : `${a.daysLeft}d`} icon="timer-line" tone={a.daysLeft !== null && a.daysLeft < 0 ? 'danger' : !a.feasibleWindow ? 'warning' : 'success'} hint={a.daysLeft !== null && a.daysLeft < 0 ? 'closed' : !a.feasibleWindow ? 'tight window' : 'workable window'} /></div>
      </div>

      {/* Stage A — knockout / eligibility screen */}
      <div className="border rounded p-3 mb-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
          <div className="fw-semibold"><i className="ri-shield-keyhole-line me-1" aria-hidden="true" />Eligibility screen (mandatory "shall" requirements)</div>
          <span className="small text-secondary">A hard fail is an automatic no-bid; a conditional gap caps the bid at "with conditions".</span>
        </div>
        {a.knockouts.length === 0 ? (
          <div className="small text-secondary"><i className="ri-information-line me-1" aria-hidden="true" />No mandatory-eligibility requirements detected among the established requirements (SAM, set-asides, certifications, references, bonding, clearances). Establish the cited ones to screen them.</div>
        ) : (
          <ul className="list-unstyled mb-0">
            {a.knockouts.map((k) => (
              <li key={k.id} className="py-2 border-bottom">
                <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2">
                      <span className={`badge bg-${KO_TONE[k.status]}-subtle text-${KO_TONE[k.status]}-emphasis`}>{k.status === 'hard_fail' ? 'HARD FAIL' : k.status === 'conditional' ? 'CONDITIONAL' : 'PASS'}</span>
                      <span className="fw-semibold small">{k.id}</span>
                      <span className="badge bg-secondary-subtle text-secondary-emphasis">{k.categoryLabel}</span>
                      {k.longLead && <span className="badge bg-light text-dark border" title="Long-lead item">long-lead</span>}
                    </div>
                    <div className="small">{k.text}</div>
                    <div className="small text-secondary">{k.basis}</div>
                  </div>
                  <div className="btn-group btn-group-sm" role="group" aria-label={`Status for ${k.id}`}>
                    {KO_CYCLE.map((st) => (
                      <button key={st} type="button"
                        className={`btn btn-outline-${KO_TONE[st]} ${k.status === st ? 'active' : ''}`}
                        aria-pressed={k.status === st}
                        onClick={() => setOverrides((o) => ({ ...o, [k.id]: st }))}>{KO_LABEL[st]}</button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Stage B — PWin factor breakdown */}
      <div className="border rounded p-3 mb-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
          <div className="fw-semibold"><i className="ri-bar-chart-grouped-line me-1" aria-hidden="true" />Win-probability factors (Shipley / APMP weighted)</div>
          <div className="btn-group btn-group-sm" role="group" aria-label="Pursuit type">
            <button type="button" className={`btn btn-outline-secondary ${pursuitType === 'new' ? 'active' : ''}`} aria-pressed={pursuitType === 'new'} onClick={() => setPursuitType('new')}>New business</button>
            <button type="button" className={`btn btn-outline-secondary ${pursuitType === 'recompete' ? 'active' : ''}`} aria-pressed={pursuitType === 'recompete'} onClick={() => setPursuitType('recompete')}>Recompete</button>
          </div>
        </div>
        <ul className="list-unstyled mb-0">
          {a.factors.map((f) => {
            const canRate = JUDGMENT.includes(f.key);
            const widthPct = f.score === null ? 0 : (f.score / 5) * 100;
            return (
              <li key={f.key} className="py-2 border-bottom">
                <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                  <div style={{ minWidth: 220 }}>
                    <span className="fw-semibold small">{f.label}</span>
                    <span className="text-secondary small"> · {Math.round(f.weight * 100)}%</span>
                    {f.source === 'derived' && <span className="badge bg-info-subtle text-info-emphasis ms-1">auto</span>}
                    {f.source === 'unrated' && <span className="badge bg-secondary-subtle text-secondary-emphasis ms-1">unrated</span>}
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 120, maxWidth: 240 }}>
                    <div className="progress" style={{ height: 8 }} role="img" aria-label={`${f.label}: ${f.score === null ? 'unrated' : f.score + ' of 5'}`}>
                      <div className={`progress-bar bg-${f.score === null ? 'light' : f.score >= 4 ? 'success' : f.score >= 2 ? 'warning' : 'danger'}`} style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                  {canRate ? (
                    <div className="btn-group btn-group-sm" role="group" aria-label={`Rate ${f.label} 0 to 5`}>
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" className={`btn btn-outline-secondary ${f.source === 'operator' && f.score === n ? 'active' : ''}`} aria-pressed={f.source === 'operator' && f.score === n}
                          onClick={() => setOperatorFactors((of) => ({ ...of, [f.key]: n }))}>{n}</button>
                      ))}
                    </div>
                  ) : (
                    <span className="small text-secondary" style={{ minWidth: 60, textAlign: 'right' }}>{f.score}/5</span>
                  )}
                </div>
                <div className="small text-secondary mt-1">{f.detail}</div>
              </li>
            );
          })}
        </ul>
        <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
          <label className="small text-secondary mb-0">Bid cost estimate (B&amp;P $)
            <input type="number" className="form-control form-control-sm" style={{ maxWidth: 160 }} value={bidCost} min={0}
              onChange={(e) => setBidCost(e.target.value)} placeholder="e.g. 40000" />
          </label>
          {a.bidRoi !== null && <span className="small">Bid ROI: <strong>{a.bidRoi}×</strong> <span className="text-secondary">(expected value ÷ bid cost)</span></span>}
          {a.preliminary && <span className="small text-warning-emphasis"><i className="ri-information-line me-1" aria-hidden="true" />Preliminary — rate the judgment factors above to firm up PWin and lift the "with conditions" ceiling.</span>}
        </div>
      </div>

      {/* Decision path */}
      <div className="mb-1">
        <div className="fw-semibold mb-2"><i className="ri-route-line me-1" aria-hidden="true" />Decision path</div>
        <MermaidDiagram chart={bidAssessmentMermaid(a)} caption="Where this pursuit sits in the bid-decision gate (highlighted)." />
      </div>
    </SectionCard>
  );
}
