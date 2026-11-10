import React from 'react';
import type { StudentGovProjectView, StudentGovMeeting, StudentGovVetting, StudentGovOpportunitySummary } from '../../../../services/govProjectPortalApi';
import { pursuitStageLabel } from './buildHelpers';

/**
 * StageDetail — read-only panels behind the pursuit-stage chips (Snapshot / Solicitation / Fit / Decide / Outcome),
 * so the vetting information that lived in the legacy Qualification Workspace is reachable from inside the Studio
 * instead of disappearing once a contract is assigned. Student-safe: it renders only fields already on the projection
 * (no contacts, pricing, or evaluation internals). Solicitation is the rich one (requirements + key dates + meetings +
 * blueprint); Snapshot / Fit / Decide now carry the saved AI read (the "what they want / what we'd build" summary +
 * the vetting verdict + capability coverage), falling back to a "next increment" note only for a pursuit that has no
 * saved vetting yet.
 */
export type VettingStage = 'snapshot' | 'solicitation' | 'fit' | 'decide' | 'outcome';

const COMING = 'No AI vetting has run for this pursuit yet — the verdict, capability fit and bid-decision read appear here once the automatic checks complete.';

/** The saved AI verdict, as a short student-safe label (the full card lived in the legacy workspace). */
const VERDICT_LABEL: Record<string, string> = {
  pursue: '⭐ Recommends pursuing',
  pass: 'Recommends passing',
  inconclusive: 'Needs your read',
};

function Head({ title, sub }: { title: string; sub: string }): React.ReactElement {
  return <div className="gps-vh"><div><h2>{title}</h2><p>{sub}</p></div></div>;
}

/** The saved "what they want / what we'd build" read — advisory, grounded in the extracted requirements. */
function SummaryPanel({ summary }: { summary: StudentGovOpportunitySummary }): React.ReactElement {
  return (
    <div className="gps-panel" data-testid="stage-summary">
      <h3>What they want / what we&apos;d build</h3>
      {summary.whatTheyWant && (
        <>
          <div className="gps-muted gps-small" style={{ marginBottom: 4 }}>What they want</div>
          <div className="gps-small" style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{summary.whatTheyWant}</div>
        </>
      )}
      {summary.whatWedBuild && (
        <>
          <div className="gps-muted gps-small" style={{ marginBottom: 4 }}>What we&apos;d build</div>
          <div className="gps-small" style={{ whiteSpace: 'pre-wrap' }}>{summary.whatWedBuild}</div>
        </>
      )}
      <div className="gps-muted gps-small" style={{ marginTop: 8 }}>AI summary — advisory, from the requirements found in the solicitation. Verify before relying on it.</div>
    </div>
  );
}

/** The saved vetting verdict + capability coverage + a one-line reason, rendered in the Studio's own row style. */
function VettingRows({ vetting }: { vetting: StudentGovVetting }): React.ReactElement {
  const label = vetting.verdict ? VERDICT_LABEL[vetting.verdict] : null;
  return (
    <>
      {label && <div className="gps-r"><span>AI vetting</span><b data-testid="stage-vetting">{label}</b></div>}
      {typeof vetting.coveragePct === 'number' && (
        <div className="gps-r"><span>Capabilities matched</span><b className="gps-num" data-testid="stage-coverage">{vetting.coveragePct}%</b></div>
      )}
      {vetting.reason && <div className="gps-muted gps-small" style={{ marginTop: 6 }}>{vetting.reason}</div>}
    </>
  );
}

/** Public meeting lines from the dossier (the pre-proposal conference etc.) — never the join contacts. */
function MeetingsPanel({ meetings }: { meetings: StudentGovMeeting[] }): React.ReactElement | null {
  const rows = (meetings ?? []).filter((m) => m.date || m.text);
  if (rows.length === 0) return null;
  return (
    <div className="gps-panel" data-testid="stage-meetings">
      <h3>Pre-proposal &amp; meetings</h3>
      {rows.map((m, i) => (
        <div className="gps-r" key={i}>
          <span>{m.text ?? 'Meeting'}</span>
          {m.date && <b className="gps-num" style={{ marginLeft: 8 }}>{m.date}</b>}
        </div>
      ))}
      <div className="gps-muted gps-small" style={{ marginTop: 6 }}>Detected from the solicitation — confirm the join details (location / link) in the source documents.</div>
    </div>
  );
}

export default function StageDetail({ stage, view }: { stage: VettingStage; view: StudentGovProjectView }): React.ReactElement {
  const agency = view.agency ?? null;
  const readiness = view.proposalReadiness?.pct ?? 0;
  const keyDates = (view.keyDates ?? []).filter((k) => k.date || k.text);
  const vetting = view.vetting ?? null;
  const summary = view.opportunitySummary ?? null;

  if (stage === 'solicitation') {
    const reqs = view.requirements ?? [];
    const bp = view.blueprint ?? null;
    return (
      <div className="gps-view" data-testid="stage-solicitation">
        <Head title="Solicitation" sub="What we must submit, under what rules — the requirements, key dates and meetings extracted from the solicitation." />
        <div className="gps-panel">
          <h3>Key dates</h3>
          {view.closeDate && <div className="gps-r"><span>Proposal due</span><b className="gps-num" data-testid="stage-close">{view.closeDate}</b></div>}
          {keyDates.length === 0 && !view.closeDate && <div className="gps-muted gps-small">No key dates captured yet.</div>}
          {keyDates.map((k, i) => (<div className="gps-r" key={i}><span>{k.text ?? 'Date'}</span><b className="gps-num">{k.date ?? ''}</b></div>))}
        </div>
        <MeetingsPanel meetings={view.meetings ?? []} />
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
          {vetting && <VettingRows vetting={vetting} />}
        </div>
        {summary && <SummaryPanel summary={summary} />}
        {!vetting && !summary && <div className="gps-muted gps-small" data-testid="stage-coming">{COMING}</div>}
      </div>
    );
  }

  if (stage === 'fit') {
    const rollup = view.buildSummary?.rollup;
    return (
      <div className="gps-view" data-testid="stage-fit">
        <Head title="Fit" sub="Can we deliver it — how the opportunity matches Our Services, and what the build proves." />
        <div className="gps-panel">
          <div className="gps-r"><span>Requirements we must meet</span><b className="gps-num">{view.requirementCounts.total}</b></div>
          <div className="gps-r"><span>Of those, build work</span><b className="gps-num">{view.requirementCounts.build}</b></div>
          {rollup && <div className="gps-r"><span>Build stories verified</span><b className="gps-num">{rollup.verified} / {rollup.total}</b></div>}
          {vetting && <VettingRows vetting={vetting} />}
          {!vetting && <div className="gps-r"><span>Fit decision</span><b>Approved — the bid was pursued</b></div>}
        </div>
        {!vetting && <div className="gps-muted gps-small" data-testid="stage-coming">{COMING}</div>}
      </div>
    );
  }

  if (stage === 'decide') {
    const label = vetting?.verdict ? VERDICT_LABEL[vetting.verdict] : null;
    return (
      <div className="gps-view" data-testid="stage-decide">
        <Head title="Decide" sub="Should we bid — the go decision and what still needs you." />
        <div className="gps-panel">
          <div className="gps-r"><span>Bid decision</span><b data-testid="stage-decision">Approved to pursue</b></div>
          {label && <div className="gps-r"><span>AI recommendation</span><b data-testid="stage-vetting">{label}</b></div>}
          {vetting?.reason && <div className="gps-muted gps-small" style={{ marginTop: 6 }}>{vetting.reason}</div>}
          <div className="gps-r"><span>Proposal readiness</span><b className="gps-num">{readiness}%</b></div>
          <div className="gps-r"><span>Open needs</span><b className="gps-num">{view.needsCount ?? 0}</b></div>
          <div className="gps-r"><span>Of those, blocking</span><b className="gps-num">{view.fatalNeedsCount ?? 0}</b></div>
        </div>
        {!vetting && <div className="gps-muted gps-small" data-testid="stage-coming">{COMING}</div>}
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
    </div>
  );
}
