import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PageHeader, SectionCard, StatCard, StatusBadge, EmptyState } from '../../components/admin/shell';
import {
  getGovQualificationWorkspace, createGovQualification, recordGovQualificationDecision, approveGovQualification,
  authorizeGovBuild, getGovOpportunityCandidates, reviewGovQualificationDocuments,
  type GovQualificationWorkspace, type QualRequirementEval, type GovCandidatesResult, type EstablishedRequirement,
} from '../../services/factoryApi';

const AUTHORITATIVE_ROLES = ['solicitation', 'final_pws_sow', 'amendment'];

/**
 * AdminGovQualificationPage — the Phase-2 qualification WORKSPACE + journey.
 *
 * The journey, all reusing the existing server routes (every guard is server-side; the UI mirrors, never replaces):
 *   discovery candidate → open qualification → record evidence + decision → pursuit approval → SEPARATE build auth.
 *
 * Honesty rails the UI must keep:
 *  - The source is SERVER-AUTHORITATIVE; the page renders `sourceState` and only offers Approve when the server
 *    says `canApprove`. It never offers a usable approval when the source is unavailable/degraded/unrecorded.
 *  - Canonical ids come ONLY from the trusted v2 candidate list; when that is unavailable the picker shows the GAP
 *    and offers no start — a canonical id is never derived from a title.
 *  - Every write surfaces its recoverable state: 403 (self-approval), 409 (stale/changed-source → review changes,
 *    not a blind retry), 422 (blocking / insufficient evidence, with reasons), 503 (source unavailable).
 *  - A build authorization is recorded SEPARATELY and never runs a build (the autonomous builder stays parked).
 * Design: Bootstrap 5 + admin-shell + RemixIcon; no hardcoded hex.
 */

const STAGE_ORDER = ['submission', 'award', 'delivery', 'unknown'];
const STAGE_LABEL: Record<string, string> = { submission: 'Due at submission', award: 'Due at award', delivery: 'Due at delivery', unknown: 'Stage unknown' };
const BLOCK_REASON: Record<string, string> = {
  applicability_unknown: 'Applicability unknown — must be resolved before a bid pursuit',
  not_applicable_unevidenced: 'Marked not applicable with no supporting evidence',
  submission_prerequisite_no_evidence: 'Binding submission requirement with no evidence on file',
};
const COVERAGE_REASON: Record<string, string> = {
  no_requirements_established: 'No applicable requirements have been established yet (an empty list is not "no requirements")',
  no_authoritative_source: 'The authoritative solicitation was not established/reviewed',
  authoritative_package_unreviewed: 'An amendment or the base solicitation has not been reviewed',
  document_coverage_unknown: 'Document coverage is unknown or inaccessible',
};

interface ActionError { status: number; message: string; reasons?: string[]; changedSource?: boolean; }

function errToAction(err: any): ActionError {
  const status = err?.response?.status ?? 0;
  const body = err?.response?.data ?? {};
  const reasons: string[] = body.reasons || (Array.isArray(body.blocking) ? body.blocking : undefined);
  return { status, message: body.error ?? 'Request failed.', reasons, changedSource: !!body.changedSource };
}

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

/** The no-canonical landing: a trusted candidate picker, or the gap when v2 is unavailable. */
function CandidatePicker(): React.ReactElement {
  const navigate = useNavigate();
  const [result, setResult] = useState<GovCandidatesResult | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    getGovOpportunityCandidates().then((r) => { if (live) setResult(r); }).catch(() => { if (live) setResult({ available: false, reason: 'source_failed', candidates: [], sourceLive: false }); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  if (loading) return <SectionCard><div className="text-secondary">Loading candidates…</div></SectionCard>;
  if (!result || !result.available) {
    return (
      <SectionCard title="Start a qualification" icon="search-line">
        <div className="alert alert-warning mb-0" role="status">
          <i className="ri-links-line me-1" aria-hidden="true" />
          The trusted canonical mapping is not available{result?.reason === 'not_configured' ? ' (Opportunity Pulse v2 is not configured)' : ' (the source could not be reached)'}.
          A qualification cannot be started until a canonical opportunity id is available from the producer — the id is <strong>never</strong> derived from a title.
        </div>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Start a qualification — pick a candidate" icon="search-line" subtitle="Canonical ids from the Opportunity Pulse v2 list (trusted mapping).">
      {result.candidates.length === 0 && <div className="text-secondary">No candidates returned.</div>}
      <ul className="list-unstyled mb-0">
        {result.candidates.map((c) => (
          <li key={c.canonicalOpportunityId} className="d-flex justify-content-between align-items-center gap-2 py-2 border-bottom">
            <div>
              <div className="fw-semibold">{c.title ?? c.canonicalOpportunityId}</div>
              <div className="small text-secondary">{c.agency ?? ''}{c.noticeType ? ` · ${c.noticeType}` : ''}</div>
            </div>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => navigate(`/admin/gov-qualification?canonical=${encodeURIComponent(c.canonicalOpportunityId)}`)}>
              <i className="ri-arrow-right-line me-1" aria-hidden="true" />Open
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export default function AdminGovQualificationPage(): React.ReactElement {
  const [params] = useSearchParams();
  const canonical = params.get('canonical') ?? '';
  const [biddingEntity, setBiddingEntity] = useState(params.get('biddingEntity') ?? 'colaberry');
  const [ws, setWs] = useState<GovQualificationWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // synchronous guard so a same-tick double-click cannot fire two writes
  const [rationale, setRationale] = useState('');
  const [reqDraft, setReqDraft] = useState({ id: '', text: '', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', docId: '' });
  const [build, setBuild] = useState({ deliveryProjectId: '', scope: '', resourceLimit: '' });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  // Every write runs one at a time (in-flight guard → no duplicate qualification/decision from repeated clicks),
  // reloads the server truth, and maps its error to a recoverable state.
  const run = useCallback(async (fn: () => Promise<any>, okNote: string) => {
    if (inFlight.current) return;         // synchronous: blocks a same-tick double-click before any await
    inFlight.current = true; setBusy(true); setActionError(null); setNotice(null);
    try { await fn(); setNotice(okNote); await load(); }
    catch (err: any) { setActionError(errToAction(err)); }
    finally { inFlight.current = false; setBusy(false); }
  }, [load]);

  const header = (
    <PageHeader
      title="Qualification Workspace"
      subtitle="Review the government opportunity's source evidence before a bid pursuit is approved."
      icon="government-line"
      breadcrumb={[{ label: 'Gov Opportunities', to: '/admin/gov-opportunities' }, { label: 'Qualification' }]}
    />
  );

  if (!canonical) {
    return <div className="admin-page">{header}<CandidatePicker /></div>;
  }

  const record = ws?.qualification ?? null;
  const version = record?.version ?? 0;

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
              <span>Source is a <strong>labeled sample</strong>, not live Opportunity Pulse data (v2 is not wired). Approvals stay blocked while the source cannot be confirmed live.</span>
            </div>
          )}

          <div className="row g-3 mb-3">
            <div className="col-6 col-lg-3"><StatCard label="Source state" value={ws.sourceState} icon="git-commit-line" tone={ws.sourceState === 'available' ? 'success' : ws.sourceState === 'unavailable' || ws.sourceState === 'auth_failed' || ws.sourceState === 'malformed' ? 'danger' : 'warning'} hint={ws.snapshotRecorded ? `snapshot v${ws.sourceSnapshotVersion}` : 'snapshot unrecorded'} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Blocking requirements" value={ws.evaluation ? ws.evaluation.blocking.length : '—'} icon="error-warning-line" tone={ws.evaluation && ws.evaluation.blocking.length > 0 ? 'danger' : 'success'} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Current decision" value={record ? record.decision.replace(/_/g, ' ') : 'not opened'} icon="file-list-3-line" tone="neutral" hint={record ? `v${record.version}` : undefined} /></div>
            <div className="col-6 col-lg-3"><StatCard label="Approval allowed" value={ws.canApprove ? 'yes' : 'no'} icon={ws.canApprove ? 'shield-check-line' : 'shield-cross-line'} tone={ws.canApprove ? 'success' : 'warning'} /></div>
          </div>

          {ws.changedSource && (
            <div className="alert alert-danger d-flex align-items-center justify-content-between gap-2" role="alert">
              <span><i className="ri-alert-line me-1" aria-hidden="true" />The source changed since this qualification was last reviewed. A renewed review is required before it can be approved.</span>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => { void load(); }}>Review changes</button>
            </div>
          )}
          {(ws.sourceState === 'degraded' || ws.sourceState === 'snapshot_unrecorded') && (
            <div className="alert alert-warning" role="status"><i className="ri-alert-line me-1" aria-hidden="true" />{ws.sourceStateLabel} — approval is blocked until the source is current. Research and draft decisions are still allowed.</div>
          )}
          {(ws.sourceState === 'unavailable' || ws.sourceState === 'auth_failed' || ws.sourceState === 'malformed') && (
            <div className="alert alert-danger" role="alert"><i className="ri-close-circle-line me-1" aria-hidden="true" />Source evidence is unavailable ({ws.sourceStateLabel}); approval is not offered.</div>
          )}

          {notice && <div className="alert alert-success py-2" role="status">{notice}</div>}
          {actionError && (
            <div className="alert alert-danger" role="alert">
              <div className="fw-semibold">{actionError.status ? `Blocked (${actionError.status})` : 'Request failed'}: {actionError.message}</div>
              {actionError.reasons && actionError.reasons.length > 0 && (
                <ul className="mb-0 mt-1 small">{actionError.reasons.map((r) => <li key={r}>{COVERAGE_REASON[r] ?? BLOCK_REASON[r.split(':').pop() as string] ?? r}</li>)}</ul>
              )}
              {actionError.changedSource && <div className="small mt-1">Review the changed source before retrying — this is not a retriable conflict.</div>}
            </div>
          )}

          {ws.source && (
            <SectionCard title="Source facts" icon="government-line" subtitle="Server-fetched by canonical id — not editable here.">
              <dl className="row mb-0">
                <dt className="col-sm-3">Buyer</dt><dd className="col-sm-9">{ws.source.publisher.leadBuyer.name} <span className="text-secondary">({ws.source.publisher.leadBuyer.jurisdiction})</span></dd>
                <dt className="col-sm-3">Notice</dt><dd className="col-sm-9">{ws.source.notice.noticeType.value} · {ws.source.notice.procurementType.value}</dd>
                <dt className="col-sm-3">Deadline</dt><dd className="col-sm-9">{ws.source.deadline.originalText ?? 'unstated'} <StatusBadge label={`confidence: ${ws.source.deadline.utcConfidence}`} tone={ws.source.deadline.utcConfidence === 'high' ? 'success' : 'warning'} /></dd>
                <dt className="col-sm-3">Documents</dt><dd className="col-sm-9">{ws.source.documents.coverage} · {ws.source.documents.counts.parsed}/{ws.source.documents.counts.listed} parsed{ws.source.documents.counts.inaccessible > 0 ? `, ${ws.source.documents.counts.inaccessible} inaccessible` : ''}</dd>
              </dl>
            </SectionCard>
          )}

          {ws.evaluation && ws.source && (
            <SectionCard title="Requirements by due stage" icon="list-check-2" subtitle="Missing evidence, unknown applicability, and unevidenced dismissals block a bid pursuit.">
              {ws.evaluation.evals.length === 0 && <div className="text-secondary small">No requirements established yet. Opportunity Pulse supplies none — establish the applicable, cited requirements below before a pursuit can be approved.</div>}
              {STAGE_ORDER.filter((s) => (ws.evaluation!.byDueStage[s]?.length ?? 0) > 0).map((stage) => (
                <div key={stage} className="mb-3">
                  <h3 className="h6 text-secondary text-uppercase small mb-2">{STAGE_LABEL[stage]}</h3>
                  <ul className="list-unstyled mb-0">{ws.evaluation!.byDueStage[stage].map((r) => <RequirementRow key={r.id + r.dueStage} r={r} />)}</ul>
                </div>
              ))}
              {ws.coverage && !ws.coverage.sufficient && (
                <div className="small text-warning-emphasis mt-2"><i className="ri-information-line me-1" aria-hidden="true" />Coverage not yet sufficient for approval: {ws.coverage.reasons.map((r) => COVERAGE_REASON[r] ?? r).join('; ')}.</div>
              )}
            </SectionCard>
          )}

          {/* ── Manual document review (the Bonfire ZIP is downloaded by hand) ─── */}
          {ws.source && record && (() => {
            const items = (ws.source.documents.items ?? []).filter((it) => AUTHORITATIVE_ROLES.includes(it.role));
            const reviewedIds = new Set((record.requirements_json?.reviewedDocuments ?? []).map((d) => d.docId));
            const stateOf = (it: { docId: string; retrieval: { status: string } }) =>
              it.retrieval.status === 'downloaded' ? 'downloaded' : reviewedIds.has(it.docId) ? 'manual' : 'not reviewed';
            const notDownloaded = items.filter((it) => it.retrieval.status !== 'downloaded');
            const toCover = notDownloaded.map((it) => it.docId);
            if (items.length === 0) return null;
            return (
              <SectionCard title="Manual document review" icon="folder-download-line"
                subtitle="Bonfire gates the ZIP behind a portal login — download it by hand, then upload it here to attest the authoritative package was reviewed. The server records a hash of the file; it never stores the bytes.">
                <ul className="list-unstyled mb-3">
                  {items.map((it) => {
                    const st = stateOf(it);
                    return (
                      <li key={it.docId} className="d-flex align-items-center justify-content-between gap-2 py-2 border-bottom">
                        <div className="d-flex align-items-center gap-2">
                          <i className={`ri-${st === 'not reviewed' ? 'error-warning-line text-danger' : 'checkbox-circle-line text-success'}`} aria-hidden="true" />
                          <span className="fw-semibold">{it.filename}</span>
                          <StatusBadge label={it.role} tone="neutral" />
                          <StatusBadge label={st} tone={st === 'downloaded' ? 'success' : st === 'manual' ? 'info' : 'danger'} />
                        </div>
                        {st === 'manual' && (
                          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy}
                            onClick={() => run(() => reviewGovQualificationDocuments(canonical, { biddingEntity, expectedVersion: version, mode: 'revoke', coveredDocIds: [it.docId] }), 'Attestation revoked.')}>
                            Revoke
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {notDownloaded.length > 0 ? (
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <input type="file" className="form-control form-control-sm" style={{ maxWidth: 320 }} accept=".zip"
                      onChange={(e) => setDocFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                    <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || !docFile}
                      onClick={() => run(() => reviewGovQualificationDocuments(canonical, { biddingEntity, expectedVersion: version, mode: 'add', coveredDocIds: toCover, file: docFile }), 'Document review recorded — coverage updated.')}>
                      <i className="ri-upload-2-line me-1" aria-hidden="true" />Upload ZIP &amp; attest {notDownloaded.length} doc(s)
                    </button>
                    <span className="small text-secondary">Attests the {notDownloaded.length} listed-but-undownloaded authoritative doc(s); only OP-listed authoritative docs can be attested.</span>
                  </div>
                ) : (
                  <div className="small text-success"><i className="ri-checkbox-circle-line me-1" aria-hidden="true" />All authoritative documents are reviewed.</div>
                )}
              </SectionCard>
            );
          })()}

          {/* ── Actions ─────────────────────────────────────────────────────── */}
          <SectionCard title="Qualification actions" icon="quill-pen-line">
            <div className="mb-3 d-flex flex-wrap align-items-end gap-2">
              <label className="form-label small mb-0">Bidding entity
                <input className="form-control form-control-sm" value={biddingEntity} onChange={(e) => setBiddingEntity(e.target.value)} />
              </label>
              {!record && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || !ws.sourceAvailable}
                  onClick={() => run(() => createGovQualification(canonical, { biddingEntity }), 'Qualification opened.')}>
                  <i className="ri-add-line me-1" aria-hidden="true" />Open qualification
                </button>
              )}
            </div>

            {record && (
              <>
                <div className="mb-3">
                  <label className="form-label small">Rationale (optional)</label>
                  <textarea className="form-control form-control-sm" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                </div>

                <div className="d-flex flex-wrap gap-2 mb-3">
                  <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy}
                    onClick={() => run(() => recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'needs_evidence', rationale: rationale || undefined }), 'Recorded: needs evidence.')}>Needs evidence</button>
                  <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy}
                    onClick={() => run(() => recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'no_bid', rationale: rationale || undefined }), 'Recorded: no bid.')}>No bid</button>
                </div>

                <div className="border rounded p-2 mb-3">
                  <div className="small fw-semibold mb-2">Establish a cited requirement</div>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    <input className="form-control form-control-sm" style={{ maxWidth: 90 }} placeholder="id" value={reqDraft.id} onChange={(e) => setReqDraft({ ...reqDraft, id: e.target.value })} />
                    <input className="form-control form-control-sm" style={{ maxWidth: 220 }} placeholder="text" value={reqDraft.text} onChange={(e) => setReqDraft({ ...reqDraft, text: e.target.value })} />
                    <select className="form-select form-select-sm" style={{ maxWidth: 140 }} value={reqDraft.applicability} onChange={(e) => setReqDraft({ ...reqDraft, applicability: e.target.value })}>
                      <option value="always">always</option><option value="conditional">conditional</option><option value="not_applicable">not_applicable</option><option value="unknown">unknown</option>
                    </select>
                    <select className="form-select form-select-sm" style={{ maxWidth: 130 }} value={reqDraft.dueStage} onChange={(e) => setReqDraft({ ...reqDraft, dueStage: e.target.value })}>
                      <option value="submission">submission</option><option value="award">award</option><option value="delivery">delivery</option><option value="unknown">unknown</option>
                    </select>
                    <input className="form-control form-control-sm" style={{ maxWidth: 100 }} placeholder="evidence docId" value={reqDraft.docId} onChange={(e) => setReqDraft({ ...reqDraft, docId: e.target.value })} />
                  </div>
                  <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || !reqDraft.id || !reqDraft.text}
                    onClick={() => {
                      const er: EstablishedRequirement = {
                        id: reqDraft.id, text: reqDraft.text, applicability: reqDraft.applicability as any,
                        dueStage: reqDraft.dueStage as any, bindingStatus: reqDraft.bindingStatus,
                        evidenceRef: reqDraft.docId ? { docId: reqDraft.docId } : null,
                      };
                      const existing = record.requirements_json?.established ?? [];
                      return run(() => recordGovQualificationDecision(canonical, { biddingEntity, expectedVersion: version, decision: 'needs_evidence', establishedRequirements: [...existing, er] }), 'Requirement established.');
                    }}>Add established requirement</button>
                </div>

                <div className="d-flex flex-wrap align-items-center gap-3">
                  <button type="button" className="btn btn-success" disabled={busy || !ws.canApprove}
                    title={ws.canApprove ? undefined : 'Approval is blocked until the source is current and every requirement is established, evidenced, and cleared.'}
                    onClick={() => run(() => approveGovQualification(canonical, { biddingEntity, expectedVersion: version, decision: 'approved_bid_pursuit', rationale: rationale || undefined }), 'Bid pursuit approved.')}>
                    <i className="ri-shield-check-line me-1" aria-hidden="true" />Approve bid pursuit
                  </button>
                  {!ws.canApprove && <span className="small text-secondary">{ws.changedSource ? 'Blocked: source changed since review.' : ws.sourceState !== 'available' ? `Blocked: source ${ws.sourceState}.` : 'Blocked: requirements/coverage not yet sufficient.'}</span>}
                </div>
              </>
            )}
          </SectionCard>

          {/* ── SEPARATE build authorization ────────────────────────────────── */}
          <SectionCard title="Authorize a build (separate)" icon="tools-line" subtitle="A pursuit approval is NOT a build authorization. Recording this does not run any build; the autonomous builder stays parked.">
            <div className="d-flex flex-wrap gap-2 align-items-end">
              <input className="form-control form-control-sm" style={{ maxWidth: 260 }} placeholder="delivery project id (uuid)" value={build.deliveryProjectId} onChange={(e) => setBuild({ ...build, deliveryProjectId: e.target.value })} />
              <input className="form-control form-control-sm" style={{ maxWidth: 180 }} placeholder="scope" value={build.scope} onChange={(e) => setBuild({ ...build, scope: e.target.value })} />
              <input className="form-control form-control-sm" style={{ maxWidth: 180 }} placeholder="resource limit" value={build.resourceLimit} onChange={(e) => setBuild({ ...build, resourceLimit: e.target.value })} />
              <button type="button" className="btn btn-outline-warning btn-sm" disabled={busy || !build.deliveryProjectId || !build.scope || !build.resourceLimit}
                onClick={() => run(() => authorizeGovBuild(canonical, { deliveryProjectId: build.deliveryProjectId, scope: build.scope, resourceLimit: build.resourceLimit, govQualificationId: record?.id }), 'Build authorization recorded (no build started).')}>
                <i className="ri-shield-keyhole-line me-1" aria-hidden="true" />Authorize build
              </button>
            </div>
            <p className="small text-secondary mt-2 mb-0">The approver is your identity (a reviewer cannot approve their own pursuit; both are enforced server-side).</p>
          </SectionCard>
        </>
      )}
    </div>
  );
}
