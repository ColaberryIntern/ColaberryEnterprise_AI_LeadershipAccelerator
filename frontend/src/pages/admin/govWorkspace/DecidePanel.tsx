import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  recordGovQualificationDecision, approveGovQualification, requestGovApproval, sendBackGovApproval, listAdminMembers,
  type QualificationRecord, type AdminMemberRow, type GovApprovalState,
} from '../../../services/factoryApi';

/**
 * DecidePanel (P4) — Step 4 "Should we bid?". The first-class Decide card that replaces the old "Open, decide &
 * approve" drawer. It carries the separation-of-duties approval LOOP:
 *   1. the establisher writes a DECISION BRIEF (recommend approved_bid_pursuit / rfi_response, with rationale) and
 *      REQUESTS approval from a DIFFERENT program-capable admin (requestApproval — advisory, persisted on the record);
 *   2. the requested approver APPROVES (approveGovQualification — the real, un-bypassable gate: source current +
 *      evidence sufficient + approver != establisher) or SENDS BACK for revision (sendBack);
 *   3. needs_evidence / no_bid stay as direct establisher decisions (no second admin needed).
 * Self-contained like FitCapabilitiesPanel: owns its fetches and writes; the page passes `record` + callbacks.
 *
 * The approver picker lists admin members whose mgmt_role is PROGRAM-CAPABLE and excludes the establisher by email.
 * This is a UX convenience only — the server re-enforces separation of duties (SelfApprovalError /
 * ApprovalRequestSelfError 403) and the section gate regardless of what the picker offers.
 */

// Management-portal roles that grant the 'program' section (mirrors backend access/mgmtRoles.ts: owner, admin,
// curriculum). Kept in sync by hand; if it drifts, the server still blocks a non-program approver at /approve.
const PROGRAM_CAPABLE_MGMT_ROLES = new Set(['owner', 'admin', 'curriculum']);

type ApprovalDecision = 'approved_bid_pursuit' | 'rfi_response';

export function DecidePanel({
  canonicalOpportunityId, biddingEntity, record, canApprove, blockedReason, canOpen, onOpen, onChanged, onApproved,
}: {
  canonicalOpportunityId: string;
  biddingEntity: string;
  record: QualificationRecord | null;
  canApprove: boolean;
  blockedReason?: string | null;
  canOpen: boolean;
  onOpen: () => void;
  onChanged: () => void;
  onApproved: () => void;
}): React.ReactElement {
  const version = record?.version ?? 0;
  const decision = record?.decision ?? null;
  const isApproved = decision === 'approved_bid_pursuit' || decision === 'rfi_response';
  const approval: GovApprovalState | null = record?.requirements_json?.approval ?? null;
  const brief = record?.requirements_json?.decisionBrief ?? null;
  const establisher = record?.reviewer_identity_id ?? null;

  const [proposed, setProposed] = useState<ApprovalDecision>('approved_bid_pursuit');
  const [summary, setSummary] = useState('');
  const [rationale, setRationale] = useState('');
  const [approverId, setApproverId] = useState('');
  const [note, setNoteField] = useState('');
  const [members, setMembers] = useState<AdminMemberRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Seed the brief fields from any persisted brief so a sent-back pursuit reopens with the establisher's last words.
  useEffect(() => {
    if (brief) {
      if (brief.proposedDecision === 'rfi_response' || brief.proposedDecision === 'approved_bid_pursuit') setProposed(brief.proposedDecision);
      if (typeof brief.summary === 'string') setSummary(brief.summary);
      if (typeof brief.rationale === 'string') setRationale(brief.rationale);
    }
  }, [brief]);

  const loadMembers = useCallback(async () => {
    try {
      const { members: rows } = await listAdminMembers();
      setMembers(rows);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not load the list of approvers.');
    }
  }, []);
  useEffect(() => { if (record && !isApproved) void loadMembers(); }, [record, isApproved, loadMembers]);

  const approvers = useMemo(() => (members ?? []).filter((m) => (
    m.mgmt_role && PROGRAM_CAPABLE_MGMT_ROLES.has(m.mgmt_role) && (!establisher || m.email !== establisher)
  )), [members, establisher]);

  const run = useCallback(async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    setBusy(true); setError(null); setStatus(null);
    try {
      await fn();
      setStatus(ok);
      onChanged();
      if (after) after();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'The action could not be completed.');
    } finally { setBusy(false); }
  }, [onChanged]);

  const doRequest = useCallback(() => run(
    () => requestGovApproval(canonicalOpportunityId, {
      biddingEntity, expectedVersion: version, approverIdentityId: approverId,
      decisionBrief: { proposedDecision: proposed, summary: summary || undefined, rationale: rationale || undefined },
    }),
    'Approval requested.',
  ), [run, canonicalOpportunityId, biddingEntity, version, approverId, proposed, summary, rationale]);

  const doApprove = useCallback(() => run(
    () => approveGovQualification(canonicalOpportunityId, {
      biddingEntity, expectedVersion: version, decision: proposed, rationale: rationale || brief?.rationale || undefined,
    }),
    'Bid pursuit approved.', onApproved,
  ), [run, canonicalOpportunityId, biddingEntity, version, proposed, rationale, brief, onApproved]);

  const doSendBack = useCallback(() => run(
    () => sendBackGovApproval(canonicalOpportunityId, { biddingEntity, expectedVersion: version, note: note || undefined }),
    'Sent back to the establisher for revision.',
  ), [run, canonicalOpportunityId, biddingEntity, version, note]);

  const doQuick = useCallback((d: 'needs_evidence' | 'no_bid') => run(
    () => recordGovQualificationDecision(canonicalOpportunityId, { biddingEntity, expectedVersion: version, decision: d, rationale: rationale || undefined }),
    d === 'no_bid' ? 'Recorded: no bid.' : 'Recorded: needs evidence.',
  ), [run, canonicalOpportunityId, biddingEntity, version, rationale]);

  // ── no record yet: offer to open it ──
  if (!record) {
    return (
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <h2 className="h6 fw-semibold mb-2"><i className="ri-thumb-up-line me-1" aria-hidden="true" />Should we bid?</h2>
          <p className="small text-secondary mb-3">Open the qualification to record a decision and route it for approval.</p>
          {error && <div className="alert alert-warning py-2 small" role="alert">{error}</div>}
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !canOpen} onClick={onOpen}>
            <i className="ri-folder-open-line me-1" aria-hidden="true" />Open qualification
          </button>
          {!canOpen && <div className="small text-secondary mt-2">The source is not available yet, so the qualification cannot be opened.</div>}
        </div>
      </div>
    );
  }

  // ── approved: terminal success ──
  if (isApproved) {
    return (
      <div className="card shadow-sm mb-3 border-success">
        <div className="card-body">
          <h2 className="h6 fw-semibold mb-2 text-success-emphasis"><i className="ri-shield-check-line me-1" aria-hidden="true" />Bid pursuit approved</h2>
          <p className="small text-secondary mb-0">
            Decision <strong>{decision?.replace(/_/g, ' ')}</strong> (v{version}){approval?.approverIdentityId ? <> — approved by <strong>{approval.approverIdentityId}</strong></> : null}. Move to <strong>Build the bid</strong> to continue. A pursuit approval is not a build authorization; the build is authorized separately.
          </p>
        </div>
      </div>
    );
  }

  const pending = approval?.status === 'requested';
  const sentBack = approval?.status === 'sent_back';

  return (
    <div className="card shadow-sm mb-3">
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h2 className="h6 fw-semibold mb-0"><i className="ri-thumb-up-line me-1" aria-hidden="true" />Should we bid?</h2>
          <span className="small text-secondary">current: <strong>{decision?.replace(/_/g, ' ')}</strong> · v{version}</span>
        </div>

        {error && <div className="alert alert-warning py-2 small" role="alert">{error}</div>}
        {status && <div className="alert alert-success py-2 small" role="status">{status}</div>}

        {sentBack && (
          <div className="alert alert-warning py-2 small" role="status">
            <i className="ri-arrow-go-back-line me-1" aria-hidden="true" />
            Sent back for revision{approval?.sentBackBy ? <> by <strong>{approval.sentBackBy}</strong></> : null}.
            {approval?.sentBackNote ? <> Note: “{approval.sentBackNote}”</> : null} Revise and request approval again.
          </div>
        )}

        {pending && (
          <div className="alert alert-info py-2 small" role="status">
            <i className="ri-time-line me-1" aria-hidden="true" />
            Awaiting approval from <strong>{approval?.approverIdentityId}</strong>{approval?.requestedBy ? <> (requested by {approval.requestedBy})</> : null}.
          </div>
        )}

        {/* ── Quick decisions (establisher, no second admin) ── */}
        <div className="mb-3">
          <label htmlFor="decide-rationale" className="form-label small fw-semibold mb-1">Rationale (optional)</label>
          <textarea id="decide-rationale" className="form-control form-control-sm" rows={2} value={rationale}
            onChange={(e) => setRationale(e.target.value)} placeholder="Why this decision — carried onto the brief and the recorded decision." />
          <div className="d-flex flex-wrap gap-2 mt-2">
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => doQuick('needs_evidence')}>
              <i className="ri-search-eye-line me-1" aria-hidden="true" />Needs evidence
            </button>
            <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => doQuick('no_bid')}>
              <i className="ri-close-circle-line me-1" aria-hidden="true" />No bid
            </button>
          </div>
        </div>

        <hr />

        {/* ── Request a bid-pursuit approval (separation of duties) ── */}
        <div className="small fw-semibold text-uppercase text-secondary mb-2">Request a pursuit approval</div>
        <p className="small text-secondary mb-2">
          The admin who established the requirements cannot approve the pursuit — a <strong>different</strong> program admin must. Write the brief, pick the approver, and request it. A master admin may approve their own in an emergency; it is audit-logged.
        </p>

        <div className="row g-2 mb-2">
          <div className="col-12 col-md-5">
            <label htmlFor="decide-proposed" className="form-label small fw-semibold mb-1">Recommended decision</label>
            <select id="decide-proposed" className="form-select form-select-sm" value={proposed} disabled={busy}
              onChange={(e) => setProposed(e.target.value as ApprovalDecision)}>
              <option value="approved_bid_pursuit">Approve bid pursuit</option>
              <option value="rfi_response">RFI response</option>
            </select>
          </div>
          <div className="col-12 col-md-7">
            <label htmlFor="decide-approver" className="form-label small fw-semibold mb-1">Send to (program-capable admin)</label>
            <select id="decide-approver" className="form-select form-select-sm" value={approverId} disabled={busy}
              onChange={(e) => setApproverId(e.target.value)}>
              <option value="">Choose an approver…</option>
              {approvers.map((m) => (
                <option key={m.id} value={m.email ?? m.id}>{m.display_name}{m.email ? ` (${m.email})` : ''} — {m.mgmt_role}</option>
              ))}
            </select>
            {members && approvers.length === 0 && (
              <div className="small text-secondary mt-1">No other program-capable admin is available to approve. A master admin can still approve directly.</div>
            )}
          </div>
        </div>

        <div className="mb-2">
          <label htmlFor="decide-summary" className="form-label small fw-semibold mb-1">Brief summary</label>
          <textarea id="decide-summary" className="form-control form-control-sm" rows={2} value={summary}
            onChange={(e) => setSummary(e.target.value)} placeholder="One or two lines the approver needs: what we'd bid, why it's worth it, what the risk is." />
        </div>

        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !approverId}
            title={!approverId ? 'Choose an approver first.' : undefined} onClick={doRequest}>
            <i className="ri-send-plane-line me-1" aria-hidden="true" />{pending || sentBack ? 'Re-request approval' : 'Request approval'}
          </button>

          {pending && (
            <>
              <button type="button" className="btn btn-success btn-sm" disabled={busy || !canApprove}
                title={canApprove ? undefined : (blockedReason ?? 'Approval is blocked until the source is current and every requirement is established, evidenced, and cleared.')}
                onClick={doApprove}>
                <i className="ri-shield-check-line me-1" aria-hidden="true" />Approve as {approval?.approverIdentityId ?? 'approver'}
              </button>
            </>
          )}
        </div>
        {pending && !canApprove && blockedReason && <div className="small text-danger mt-2">{blockedReason}</div>}

        {pending && (
          <div className="mt-3">
            <label htmlFor="decide-sendback" className="form-label small fw-semibold mb-1">Send back for revision</label>
            <div className="input-group input-group-sm">
              <input id="decide-sendback" type="text" className="form-control" value={note} disabled={busy}
                onChange={(e) => setNoteField(e.target.value)} placeholder="What the establisher should change." />
              <button type="button" className="btn btn-outline-warning" disabled={busy} onClick={doSendBack}>
                <i className="ri-arrow-go-back-line me-1" aria-hidden="true" />Send back
              </button>
            </div>
            <div className="small text-secondary mt-1">Only the requested approver ({approval?.approverIdentityId}) may approve or send back; the server enforces it.</div>
          </div>
        )}
      </div>
    </div>
  );
}
