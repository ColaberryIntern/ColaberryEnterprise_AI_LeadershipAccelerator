import React from 'react';
import type { StudentGovProjectView, StudentGovMeeting, StudentGovVetting, StudentGovOpportunitySummary, StudentGovRequirementView } from '../../../../services/govProjectPortalApi';
import { pursuitStageLabel } from './buildHelpers';
import StageBlueprint from './StageBlueprint';

/**
 * StageDetail — read-only panels behind the pursuit-stage chips (Snapshot / Solicitation / Fit / Decide / Outcome),
 * so the opportunity read that lived in the legacy Qualification Workspace is reachable from inside the Studio instead
 * of disappearing once a contract is assigned. Student-safe: it renders only fields already on the projection (no
 * contacts, pricing, or evaluation internals). It carries the SAME cards the legacy workspace showed — the two-column
 * "What they want / what we'd build" summary and the full AI vetting card (verdict + capability coverage + source
 * quote) — plus the Solicitation requirements / key dates / meetings / blueprint. The placeholder note shows only for a
 * pursuit that has no saved vetting yet.
 */
export type VettingStage = 'snapshot' | 'solicitation' | 'fit' | 'decide' | 'outcome';

const COMING = 'No AI vetting has run for this pursuit yet — the verdict, capability fit and bid-decision read appear here once the automatic checks complete.';

/** Verdict badge label + Bootstrap class, matching the legacy AI vetting card. */
const VERDICT: Record<string, { label: string; cls: string }> = {
  pursue: { label: '⭐ AI vetted: recommends pursuing', cls: 'bg-success text-white' },
  pass: { label: 'AI recommends passing', cls: 'bg-danger-subtle text-danger-emphasis' },
  inconclusive: { label: 'AI could not call it: needs your read', cls: 'bg-warning-subtle text-warning-emphasis' },
};

/** When no verdict has landed yet, say WHY from the vetting status — running/queued (in progress) vs AI turned off,
 *  so a pending card reads as a state rather than an empty box. Null ⇒ nothing to say (the stage placeholder covers it). */
function vettingPending(status: string | null | undefined): string | null {
  const s = (status ?? '').toLowerCase();
  if (/run|queue|progress|pending|process/.test(s)) return 'AI vetting is still running — the verdict appears here once the automatic checks finish.';
  if (/disabled|off|skip/.test(s)) return 'Automatic AI vetting is off for this pursuit — the verdict will be a human read.';
  return null;
}

function Head({ title, sub }: { title: string; sub: string }): React.ReactElement {
  return <div className="gps-vh"><div><h2>{title}</h2><p>{sub}</p></div></div>;
}

/** The two-column "What they want / what we'd build" card — the legacy workspace's advisory opportunity read. */
function SummaryCard({ summary }: { summary: StudentGovOpportunitySummary }): React.ReactElement | null {
  if (!summary.whatTheyWant && !summary.whatWedBuild) return null;
  return (
    <div className="row g-3 mt-1" data-testid="stage-summary">
      <div className="col-md-6">
        <div className="border rounded p-3 h-100">
          <div className="fw-semibold small mb-1"><i className="ri-government-line me-1" aria-hidden="true" />What they want</div>
          <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{summary.whatTheyWant}</div>
        </div>
      </div>
      <div className="col-md-6">
        <div className="border rounded p-3 h-100">
          <div className="fw-semibold small mb-1"><i className="ri-tools-line me-1" aria-hidden="true" />What we&apos;d build</div>
          <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{summary.whatWedBuild}</div>
        </div>
      </div>
      <div className="col-12"><div className="small text-secondary"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI summary — advisory, from the requirements found in the solicitation. Verify before relying on it.</div></div>
    </div>
  );
}

/** The full AI vetting card — verdict badge, capability coverage, reason, source quote, advisory footer. */
function VettingCard({ vetting }: { vetting: StudentGovVetting }): React.ReactElement {
  const v = vetting.verdict ? VERDICT[vetting.verdict] : null;
  const pending = v ? null : vettingPending(vetting.status);
  return (
    <div className="card shadow-sm mt-3 mb-0" data-testid="ai-vetting-card">
      <div className="card-body">
        <h3 className="h6 fw-semibold mb-2"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI vetting</h3>
        {v && <div><span className={`badge ${v.cls} mb-2`} data-testid="stage-vetting">{v.label}</span></div>}
        {pending && <p className="small text-secondary mb-2" data-testid="stage-vetting-pending"><i className="ri-time-line me-1" aria-hidden="true" />{pending}</p>}
        {typeof vetting.coveragePct === 'number' && (
          <div className="small mb-2"><span className="fw-semibold" data-testid="stage-coverage">{vetting.coveragePct}%</span> of the capabilities this bid needs match Our Services.</div>
        )}
        {vetting.reason && <p className="small mb-2">{vetting.reason}</p>}
        {vetting.quote && <blockquote className="small text-secondary border-start ps-2 mb-2">{vetting.quote}</blockquote>}
        <p className="small text-secondary mb-0">Advisory, from the requirements found in the solicitation before anyone confirmed them. Next: read the proposal, confirm the real requirements, then request approval.</p>
      </div>
    </div>
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

/** Humanize a requirement's evidence state into a short, non-jargon tag. Unknown strings pass through unchanged. */
function evidenceLabel(state: string): string {
  const s = (state ?? '').toLowerCase();
  if (/covered|complete|done|verified/.test(s)) return 'Covered';
  if (/partial|progress/.test(s)) return 'In progress';
  if (/none|missing|open|todo|not/.test(s)) return 'Not yet covered';
  return state || 'Unknown';
}

/** Due-stage order + labels, matching the admin Qualification Workspace's "Requirements by due stage" grouping. */
const DUE_STAGE_ORDER = ['submission', 'award', 'delivery', 'unknown'] as const;
const DUE_STAGE_LABEL: Record<string, string> = {
  submission: 'Due with the submission', award: 'Due at award', delivery: 'Due during delivery', unknown: 'Stage not classified',
};

/** The requirements-coverage read behind the Fit step: each established requirement with its priority and the evidence
 *  state of our coverage, GROUPED BY DUE STAGE (submission / award / delivery) like the admin workspace. A projection
 *  without due-stage data falls back to the single flat list. Student-safe — no eval internals, no service matches. */
function RequirementsEvidence({ requirements }: { requirements: StudentGovRequirementView[] }): React.ReactElement | null {
  const rows = requirements ?? [];
  if (rows.length === 0) return null;

  const row = (r: StudentGovRequirementView): React.ReactElement => (
    <div className="gps-r" key={r.canonicalReqId} data-testid="fit-req">
      <span>{r.statement}</span>
      <span style={{ marginLeft: 8, whiteSpace: 'nowrap' }}>
        <span className="gps-tag gps-small">{r.priority}</span>
        <span className="gps-tag gps-small" style={{ marginLeft: 4 }} data-testid="fit-req-evidence">{evidenceLabel(r.evidenceState)}</span>
      </span>
    </div>
  );

  const groups = DUE_STAGE_ORDER
    .map((stage) => ({ stage, items: rows.filter((r) => (r.dueStage || 'unknown') === stage) }))
    .filter((g) => g.items.length > 0);
  const grouped = rows.some((r) => r.dueStage) && groups.length > 1;

  return (
    <div className="gps-panel" data-testid="fit-requirements">
      <h3>Requirements &amp; coverage <span className="gps-tag gps-small">{rows.length}</span></h3>
      {grouped
        ? groups.map((g) => (
          <div key={g.stage} data-testid="fit-req-group">
            <div className="gps-eyebrow" style={{ marginTop: 10 }}>{DUE_STAGE_LABEL[g.stage] ?? g.stage} <span className="gps-tag gps-small">{g.items.length}</span></div>
            {g.items.map(row)}
          </div>
        ))
        : rows.map(row)}
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
        {/* Blueprint (how they score it, submission rules, required forms, elimination risks) leads here,
            above the full requirements list, to match the admin Qualification Workspace's prominence: the
            "under what rules" read is the point of this step and must not sit below a 200-row requirement dump. */}
        {bp && <StageBlueprint bp={bp} />}
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
      </div>
    );
  }

  if (stage === 'snapshot') {
    return (
      <div className="gps-view" data-testid="stage-snapshot">
        <Head title="Snapshot" sub="The at-a-glance advisory read: is this worth pursuing?" />
        <div className="gps-panel">
          <div className="gps-r"><span>Soliciting agency</span><b>{agency ?? 'Not captured'}</b></div>
          {view.closeDate && <div className="gps-r"><span>Closes</span><b className="gps-num" data-testid="snapshot-close">{view.closeDate}</b></div>}
          {view.priorityScore != null && <div className="gps-r"><span>Priority</span><b className="gps-num" data-testid="snapshot-priority">{view.priorityScore}</b></div>}
          <div className="gps-r"><span>Current stage</span><b>{pursuitStageLabel(view)}</b></div>
          <div className="gps-r"><span>Advisory read</span><b>Complete — this pursuit advanced into build</b></div>
          <div className="gps-r"><span>Proposal readiness</span><b className="gps-num">{readiness}%</b></div>
        </div>
        {summary && <SummaryCard summary={summary} />}
        {vetting && <VettingCard vetting={vetting} />}
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
          {!vetting && <div className="gps-r"><span>Fit decision</span><b>Approved — the bid was pursued</b></div>}
        </div>
        <RequirementsEvidence requirements={view.requirements ?? []} />
        {vetting && <VettingCard vetting={vetting} />}
        {!vetting && <div className="gps-muted gps-small" data-testid="stage-coming">{COMING}</div>}
      </div>
    );
  }

  if (stage === 'decide') {
    const label = vetting?.verdict ? VERDICT[vetting.verdict].label : null;
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
