import React from 'react';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';
import { pursuitStageLabel } from './buildHelpers';

/**
 * StageDetail — read-only panels behind the pursuit-stage chips (Snapshot / Solicitation / Fit / Decide / Outcome),
 * so the vetting information that lived in the legacy Qualification Workspace is reachable from inside the Studio
 * instead of disappearing once a contract is assigned. Student-safe: it renders only fields already on the projection
 * (no contacts, pricing, or evaluation internals). Solicitation is the rich one (requirements + key dates + blueprint);
 * the others surface what the projection carries today, with the deeper vetting record flagged as the next increment.
 */
export type VettingStage = 'snapshot' | 'solicitation' | 'fit' | 'decide' | 'outcome';

const COMING = 'Fuller detail from the qualification record (AI vetting verdict, capability fit, bid-decision math, win/loss) is the next increment of this view.';

function Head({ title, sub }: { title: string; sub: string }): React.ReactElement {
  return <div className="gps-vh"><div><h2>{title}</h2><p>{sub}</p></div></div>;
}

export default function StageDetail({ stage, view }: { stage: VettingStage; view: StudentGovProjectView }): React.ReactElement {
  const agency = view.agency ?? null;
  const readiness = view.proposalReadiness?.pct ?? 0;
  const keyDates = (view.keyDates ?? []).filter((k) => k.date || k.text);

  if (stage === 'solicitation') {
    const reqs = view.requirements ?? [];
    const bp = view.blueprint ?? null;
    return (
      <div className="gps-view" data-testid="stage-solicitation">
        <Head title="Solicitation" sub="What we must submit, under what rules — the requirements and key dates extracted from the solicitation." />
        <div className="gps-panel">
          <h3>Key dates</h3>
          {view.closeDate && <div className="gps-r"><span>Proposal due</span><b className="gps-num" data-testid="stage-close">{view.closeDate}</b></div>}
          {keyDates.length === 0 && !view.closeDate && <div className="gps-muted gps-small">No key dates captured yet.</div>}
          {keyDates.map((k, i) => (<div className="gps-r" key={i}><span>{k.text ?? 'Date'}</span><b className="gps-num">{k.date ?? ''}</b></div>))}
        </div>
        <div className="gps-panel">
          <h3>Requirements <span className="gps-tag gps-small" data-testid="stage-reqcount">{view.requirementCounts.total}</span></h3>
          <div className="gps-muted gps-small" style={{ marginBottom: 8 }}>{view.requirementCounts.proposal} for the proposal &middot; {view.requirementCounts.build} for the build</div>
          {reqs.length === 0 && <div className="gps-muted gps-small">No requirements established yet.</div>}
          {reqs.map((r) => (
            <div className="gps-r" key={r.canonicalReqId} data-testid="stage-req">
              <span>{r.statement}</span>
              <span className="gps-tag gps-small" style={{ marginLeft: 8 }}>{r.priority}</span>
            </div>
          ))}
        </div>
        {bp && (
          <div className="gps-panel" data-testid="stage-blueprint">
            <h3>Solicitation blueprint</h3>
            {bp.buyerType && <div className="gps-r"><span>Buyer type</span><b>{bp.buyerType}</b></div>}
            <div className="gps-r"><span>Evaluation (Section M)</span><b className="gps-num">{bp.scoring?.totalPoints ?? '—'} pts</b></div>
            <div className="gps-r"><span>Section L rules</span><b className="gps-num">{bp.rules?.length ?? 0}</b></div>
            <div className="gps-r"><span>Required forms</span><b className="gps-num">{bp.forms?.length ?? 0}</b></div>
            <div className="gps-r"><span>Elimination risks</span><b className="gps-num">{bp.eliminationRisks?.length ?? 0}</b></div>
          </div>
        )}
      </div>
    );
  }

  if (stage === 'snapshot') {
    return (
      <div className="gps-view" data-testid="stage-snapshot">
        <Head title="Snapshot" sub="The at-a-glance advisory read: is this worth pursuing?" />
        <div className="gps-panel">
          <div className="gps-r"><span>Soliciting agency</span><b>{agency ?? 'Not captured'}</b></div>
          <div className="gps-r"><span>Current stage</span><b>{pursuitStageLabel(view)}</b></div>
          <div className="gps-r"><span>Advisory read</span><b>Complete — this pursuit advanced into build</b></div>
          <div className="gps-r"><span>Proposal readiness</span><b className="gps-num">{readiness}%</b></div>
        </div>
        <div className="gps-muted gps-small" data-testid="stage-coming">{COMING}</div>
      </div>
    );
  }

  if (stage === 'fit') {
    const rollup = view.buildSummary?.rollup;
    return (
      <div className="gps-view" data-testid="stage-fit">
        <Head title="Fit" sub="Can we deliver it — what the build proves we can do." />
        <div className="gps-panel">
          <div className="gps-r"><span>Requirements we must meet</span><b className="gps-num">{view.requirementCounts.total}</b></div>
          <div className="gps-r"><span>Of those, build work</span><b className="gps-num">{view.requirementCounts.build}</b></div>
          {rollup && <div className="gps-r"><span>Build stories verified</span><b className="gps-num">{rollup.verified} / {rollup.total}</b></div>}
          <div className="gps-r"><span>Fit decision</span><b>Approved — the bid was pursued</b></div>
        </div>
        <div className="gps-muted gps-small" data-testid="stage-coming">{COMING}</div>
      </div>
    );
  }

  if (stage === 'decide') {
    return (
      <div className="gps-view" data-testid="stage-decide">
        <Head title="Decide" sub="Should we bid — the go decision and what still needs you." />
        <div className="gps-panel">
          <div className="gps-r"><span>Bid decision</span><b data-testid="stage-decision">Approved to pursue</b></div>
          <div className="gps-r"><span>Proposal readiness</span><b className="gps-num">{readiness}%</b></div>
          <div className="gps-r"><span>Open needs</span><b className="gps-num">{view.needsCount ?? 0}</b></div>
          <div className="gps-r"><span>Of those, blocking</span><b className="gps-num">{view.fatalNeedsCount ?? 0}</b></div>
        </div>
        <div className="gps-muted gps-small" data-testid="stage-coming">{COMING}</div>
      </div>
    );
  }

  // outcome
  return (
    <div className="gps-view" data-testid="stage-outcome">
      <Head title="Outcome" sub="Did we win — recorded after the bid is submitted." />
      <div className="gps-panel">
        <div className="gps-r"><span>Pursuit status</span><b>{view.status}</b></div>
        <div className="gps-r"><span>Outcome</span><b data-testid="stage-outcome-status">Pending submission</b></div>
      </div>
      <div className="gps-muted gps-small" data-testid="stage-coming">{COMING}</div>
    </div>
  );
}
