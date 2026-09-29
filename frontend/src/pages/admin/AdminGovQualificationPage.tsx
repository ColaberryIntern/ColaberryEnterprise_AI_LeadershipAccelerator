import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, SectionCard, StatCard, StatusBadge, EmptyState } from '../../components/admin/shell';
import { getGovQualificationWorkspace, type GovQualificationWorkspace, type QualRequirementEval } from '../../services/factoryApi';

/**
 * AdminGovQualificationPage — the Phase-2 qualification workspace (READ VIEW).
 *
 * WHAT IT SHOWS, and why the framing matters:
 *  - The source facts are SERVER-AUTHORITATIVE: the page renders what the backend re-fetched by canonical id, it
 *    never sends source facts back for an approval. When OP's live v2 detail endpoint is not yet wired the source
 *    is a labeled fixture (`sourceLive:false`) — the banner says so, so nobody mistakes it for live data.
 *  - Requirements are grouped BY DUE STAGE and each carries the server's blocking verdict. Missing evidence,
 *    unknown applicability, and an unevidenced "not applicable" are shown as BLOCKING — never silently passed.
 *  - Legacy fit/priority and OP's legacy verdict are rendered in a single neutral "advisory" panel: they inform,
 *    they do not qualify. Qualification depends on evidence.
 *  - The approve control is DISABLED whenever the server says an approval is not permitted (a blocking
 *    requirement, or the source changed under a prior review), and the exact reason is shown. Recording a
 *    decision/approval is a Phase-2 write wired in a later slice; this read view is the honest window onto state.
 *
 * Reached with ?canonical=op:gov:<hex> (and optional &biddingEntity=…), typically from Gov Opportunities.
 * Design: Bootstrap 5 + admin-shell + RemixIcon; no hardcoded hex.
 */

const fmtMinor = (a: number | null, currency: string): string =>
  a === null ? 'unstated' : `${currency} ${(a / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const STAGE_ORDER = ['submission', 'award', 'delivery', 'unknown'];
const STAGE_LABEL: Record<string, string> = { submission: 'Due at submission', award: 'Due at award', delivery: 'Due at delivery', unknown: 'Stage unknown' };
const BLOCK_REASON: Record<string, string> = {
  applicability_unknown: 'Applicability unknown — must be resolved before a bid pursuit',
  not_applicable_unevidenced: 'Marked not applicable with no supporting evidence',
  submission_prerequisite_no_evidence: 'Binding submission requirement with no evidence on file',
};
const DECISION_TONE: Record<string, string> = {
  pending_review: 'neutral', needs_evidence: 'warning', no_bid: 'danger',
  rfi_response: 'info', approved_bid_pursuit: 'success',
};

function RequirementRow({ r }: { r: QualRequirementEval }): React.ReactElement {
  return (
    <li className="d-flex align-items-start gap-2 py-2 border-bottom">
      <i className={`ri-${r.blocking ? 'error-warning-line text-danger' : 'checkbox-circle-line text-success'} mt-1`} aria-hidden="true" />
      <div className="flex-grow-1">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="fw-semibold">{r.id}</span>
          <StatusBadge label={r.applicability} tone={r.applicability === 'unknown' ? 'warning' : 'neutral'} />
          {r.blocking && <StatusBadge label="blocking" tone="danger" />}
        </div>
        {r.blocking && r.reason && <div className="small text-danger mt-1">{BLOCK_REASON[r.reason] ?? r.reason}</div>}
      </div>
    </li>
  );
}

export default function AdminGovQualificationPage(): React.ReactElement {
  const [params] = useSearchParams();
  const canonical = params.get('canonical') ?? '';
  const biddingEntity = params.get('biddingEntity') ?? '';
  const [ws, setWs] = useState<GovQualificationWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canonical) return;
    setLoading(true); setError(null);
    try {
      setWs(await getGovQualificationWorkspace(canonical, biddingEntity || undefined));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load the qualification workspace.');
    } finally {
      setLoading(false);
    }
  }, [canonical, biddingEntity]);

  useEffect(() => { void load(); }, [load]);

  const header = (
    <PageHeader
      title="Qualification Workspace"
      subtitle="Review the government opportunity's source evidence before a bid pursuit is approved."
      icon="government-line"
      breadcrumb={[{ label: 'Gov Opportunities', to: '/admin/gov-opportunities' }, { label: 'Qualification' }]}
    />
  );

  if (!canonical) {
    return (
      <div className="admin-page">
        {header}
        <EmptyState icon="search-line" title="No opportunity selected"
          description="Open a candidate from Gov Opportunities to review its source evidence and qualification state."
          actionLabel="Go to Gov Opportunities" to="/admin/gov-opportunities" />
      </div>
    );
  }

  return (
    <div className="admin-page">
      {header}

      {loading && <SectionCard><div className="text-secondary">Loading source evidence…</div></SectionCard>}
      {error && <SectionCard><div className="text-danger" role="alert">{error}</div></SectionCard>}

      {ws && (
        <>
          {!ws.sourceLive && (
            <div className="alert alert-warning d-flex align-items-center gap-2" role="status">
              <i className="ri-flask-line" aria-hidden="true" />
              <span>Source is a <strong>labeled sample</strong>, not live Opportunity Pulse data. Live integration is pending; approvals stay blocked while the source cannot be confirmed.</span>
            </div>
          )}

          <div className="row g-3 mb-3">
            <div className="col-6 col-lg-3"><StatCard label="Source snapshot" value={ws.source ? `v${ws.source.sourceSnapshotVersion}` : '—'} icon="git-commit-line" tone="primary" hint={ws.sourceAvailable ? 'available' : 'unavailable'} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Blocking requirements" value={ws.evaluation ? ws.evaluation.blocking.length : '—'} icon="error-warning-line" tone={ws.evaluation && ws.evaluation.blocking.length > 0 ? 'danger' : 'success'} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Current decision" value={ws.qualification ? ws.qualification.decision.replace(/_/g, ' ') : 'not opened'} icon="file-list-3-line" tone="neutral" hint={ws.qualification ? `v${ws.qualification.version}` : undefined} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Approval allowed" value={ws.canApprove ? 'yes' : 'no'} icon={ws.canApprove ? 'shield-check-line' : 'shield-cross-line'} tone={ws.canApprove ? 'success' : 'warning'} /></div>
          </div>

          {ws.changedSource && (
            <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
              <i className="ri-alert-line" aria-hidden="true" />
              <span>The source changed since this qualification was last reviewed. A renewed review is required before it can be approved.</span>
            </div>
          )}

          {ws.source && (
            <SectionCard title="Source facts" icon="government-line" subtitle="Server-fetched by canonical id — not editable here.">
              <dl className="row mb-0">
                <dt className="col-sm-3">Buyer</dt><dd className="col-sm-9">{ws.source.publisher.leadBuyer.name} <span className="text-secondary">({ws.source.publisher.leadBuyer.jurisdiction})</span></dd>
                <dt className="col-sm-3">Notice</dt><dd className="col-sm-9">{ws.source.notice.noticeType.value} · {ws.source.notice.procurementType.value}{ws.source.notice.noticeType.isBindingSolicitation ? ' · binding solicitation' : ''}</dd>
                <dt className="col-sm-3">Deadline</dt>
                <dd className="col-sm-9">
                  {ws.source.deadline.originalText ?? 'unstated'}
                  <StatusBadge label={`confidence: ${ws.source.deadline.utcConfidence}`} tone={ws.source.deadline.utcConfidence === 'high' ? 'success' : 'warning'} />
                  {ws.source.deadline.conflicts.length > 0 && (
                    <div className="small text-warning mt-1"><i className="ri-time-line" aria-hidden="true" /> {ws.source.deadline.conflicts.length} conflicting deadline value(s) — verify against the portal.</div>
                  )}
                </dd>
                <dt className="col-sm-3">Value</dt>
                <dd className="col-sm-9">
                  {ws.source.value.published
                    ? `${fmtMinor(ws.source.value.published.amountMinorUnits, ws.source.value.published.currency)} (${ws.source.value.published.valueType}, buyer-stated)`
                    : ws.source.value.modelEstimate
                      ? <span>{fmtMinor(ws.source.value.modelEstimate.amountMinorUnits, ws.source.value.modelEstimate.currency)} <span className="text-warning">— model estimate, not for revenue planning</span></span>
                      : 'unstated'}
                </dd>
                <dt className="col-sm-3">Documents</dt><dd className="col-sm-9">{ws.source.documents.coverage} · {ws.source.documents.counts.parsed}/{ws.source.documents.counts.listed} parsed{ws.source.documents.counts.inaccessible > 0 ? `, ${ws.source.documents.counts.inaccessible} inaccessible` : ''}</dd>
              </dl>
            </SectionCard>
          )}

          {ws.evaluation && ws.source && (
            <SectionCard title="Requirements by due stage" icon="list-check-2" subtitle="Missing evidence, unknown applicability, and unevidenced dismissals block a bid pursuit.">
              {STAGE_ORDER.filter((s) => (ws.evaluation!.byDueStage[s]?.length ?? 0) > 0).map((stage) => (
                <div key={stage} className="mb-3">
                  <h3 className="h6 text-secondary text-uppercase small mb-2">{STAGE_LABEL[stage]}</h3>
                  <ul className="list-unstyled mb-0">
                    {ws.evaluation!.byDueStage[stage].map((r) => <RequirementRow key={r.id + r.dueStage} r={r} />)}
                  </ul>
                </div>
              ))}
            </SectionCard>
          )}

          {ws.source && (
            <SectionCard title="Advisory signals" icon="information-line" subtitle="From Opportunity Pulse — advisory only; they inform review, they do not qualify a pursuit.">
              <div className="d-flex flex-wrap gap-3">
                <StatusBadge label={`legacy fit: ${ws.source.legacy.fitScore ?? '—'}`} tone="neutral" />
                <StatusBadge label={`legacy priority: ${ws.source.legacy.priorityScore ?? '—'}`} tone="neutral" />
                {ws.source.sourceAssessment.legacyVerdict && (
                  <StatusBadge
                    label={`legacy verdict: ${ws.source.sourceAssessment.legacyVerdict.status ?? 'unassessed'}${ws.source.sourceAssessment.legacyVerdict.evidence ? '' : ' (no evidence)'}`}
                    tone="neutral"
                  />
                )}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Decision" icon="checkbox-circle-line">
            <div className="d-flex flex-wrap align-items-center gap-3">
              <StatusBadge
                label={ws.qualification ? ws.qualification.decision.replace(/_/g, ' ') : 'not yet opened'}
                tone={(ws.qualification && DECISION_TONE[ws.qualification.decision]) as any || 'neutral'}
              />
              <button type="button" className="btn btn-success" disabled={!ws.canApprove}
                title={ws.canApprove ? undefined : 'Approval is blocked until every requirement is cleared and the reviewed source is current.'}>
                <i className="ri-shield-check-line me-1" aria-hidden="true" /> Approve bid pursuit
              </button>
              {!ws.canApprove && (
                <span className="small text-secondary">
                  {ws.changedSource ? 'Blocked: source changed since review.' : 'Blocked: unresolved requirements above.'}
                </span>
              )}
            </div>
            <p className="small text-secondary mt-2 mb-0">Recording a decision or approval is server-side and identity-checked (a reviewer cannot approve their own pursuit). The write action wires in the next slice; this view reflects the current, server-computed state.</p>
          </SectionCard>
        </>
      )}
    </div>
  );
}
