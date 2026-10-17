import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listAdminMembers, type QualificationRecord, type AdminMemberRow, type GovApprovalState, type GovDecisionBrief } from '../../../services/factoryApi';

/**
 * DecidePanel (P4) — Step 4 "Should we bid?". The first-class Decide card that replaces the old de-emphasized
 * "Open, decide & approve" drawer. It keeps the direct controls the drawer had (open / needs-evidence / no-bid /
 * approve-bid-pursuit) AND adds the separation-of-duties approval LOOP on top:
 *   - the establisher writes a DECISION BRIEF and REQUESTS approval from a DIFFERENT program-capable admin;
 *   - the requested approver APPROVES (the same, un-bypassable approveGovQualification gate) or SENDS BACK.
 *
 * It is a PRESENTATION component: every write is a callback the page wraps in its one-at-a-time `run()` helper, so
 * the page keeps ownership of the busy guard, the re-load, and the 409/422 error-to-banner mapping (the controls
 * behaved this way as the inline drawer, and the page's behaviour is what the journey tests pin). The only thing it
 * owns is reading the approver list for the picker.
 *
 * The approver picker lists admin members whose mgmt_role is PROGRAM-CAPABLE and excludes the establisher by email.
 * That is a UX convenience only — the server re-enforces separation of duties (SelfApprovalError /
 * ApprovalRequestSelfError 403) and the section gate regardless of what the picker offers.
 */

// Management-portal roles that grant the 'program' section (mirrors backend access/mgmtRoles.ts: owner, admin,
// curriculum). Kept in sync by hand; if it drifts, the server still blocks a non-program approver at /approve.
const PROGRAM_CAPABLE_MGMT_ROLES = new Set(['owner', 'admin', 'curriculum']);

type ApprovalDecision = 'approved_bid_pursuit' | 'rfi_response';

export function DecidePanel({
  record, canApprove, blockedReason, canOpen, busy, onOpen, onApprove, onQuickDecision, onRequest, onSendBack,
}: {
  record: QualificationRecord | null;
  canApprove: boolean;
  blockedReason?: string | null;
  canOpen: boolean;
  busy: boolean;
  onOpen: () => void;
  onApprove: (rationale: string) => void;
  onQuickDecision: (decision: 'needs_evidence' | 'no_bid', rationale: string) => void;
  onRequest: (approverIdentityId: string, brief: GovDecisionBrief) => void;
  onSendBack: (note: string) => void;
}): React.ReactElement {
  const decision = record?.decision ?? null;
  const isApproved = decision === 'approved_bid_pursuit' || decision === 'rfi_response';
  const approval: GovApprovalState | null = record?.requirements_json?.approval ?? null;
  const brief = record?.requirements_json?.decisionBrief ?? null;
  const establisher = record?.reviewer_identity_id ?? null;

  const [rationale, setRationale] = useState('');
  const [proposed, setProposed] = useState<ApprovalDecision>('approved_bid_pursuit');
  const [summary, setSummary] = useState('');
  const [approverId, setApproverId] = useState('');
  const [note, setNote] = useState('');
  const [members, setMembers] = useState<AdminMemberRow[] | null>(null);

  // Reopen a sent-back pursuit with the establisher's last brief so a revision starts from it.
  useEffect(() => {
    if (brief) {
      if (brief.proposedDecision === 'rfi_response' || brief.proposedDecision === 'approved_bid_pursuit') setProposed(brief.proposedDecision);
      if (typeof brief.summary === 'string') setSummary(brief.summary);
    }
  }, [brief]);

  const loadMembers = useCallback(async () => {
    try {
      const res = await listAdminMembers();
      setMembers(res?.members ?? []);
    } catch { setMembers([]); }
  }, []);
  useEffect(() => { if (record && !isApproved) void loadMembers(); }, [record, isApproved, loadMembers]);

  const approvers = useMemo(() => (members ?? []).filter((m) => (
    m.mgmt_role && PROGRAM_CAPABLE_MGMT_ROLES.has(m.mgmt_role) && (!establisher || m.email !== establisher)
  )), [members, establisher]);

  // ── no record yet: offer to open it ──
  if (!record) {
    return (
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <h2 className="h6 fw-semibold mb-2"><i className="ri-thumb-up-line me-1" aria-hidden="true" />Should we bid?</h2>
          <p className="small text-secondary mb-3">Open the qualification to record a decision and route it for approval.</p>
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
            Decision <strong>{decision?.replace(/_/g, ' ')}</strong> (v{record.version}){approval?.approverIdentityId ? <> — approved by <strong>{approval.approverIdentityId}</strong></> : null}. Move to <strong>Build the bid</strong> to continue. A pursuit approval is not a build authorization; the build is authorized separately.
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
          <span className="small text-secondary">current: <strong>{decision?.replace(/_/g, ' ')}</strong> · v{record.version}</span>
        </div>

        {sentBack && (
          <div className="alert alert-warning py-2 small" role="status">
            <i className="ri-arrow-go-back-line me-1" aria-hidden="true" />
            Sent back for revision{approval?.sentBackBy ? <> by <strong>{approval.sentBackBy}</strong></> : null}.
            {approval?.sentBackNote ? <> Note: &ldquo;{approval.sentBackNote}&rdquo;</> : null} Revise and request approval again.
          </div>
        )}
        {pending && (
          <div className="alert alert-info py-2 small" role="status">
            <i className="ri-time-line me-1" aria-hidden="true" />
            Awaiting approval from <strong>{approval?.approverIdentityId}</strong>{approval?.requestedBy ? <> (requested by {approval.requestedBy})</> : null}.
          </div>
        )}

        <div className="mb-3">
          <label htmlFor="decide-rationale" className="form-label small fw-semibold mb-1">Rationale (optional)</label>
          <textarea id="decide-rationale" className="form-control form-control-sm" rows={2} value={rationale}
            onChange={(e) => setRationale(e.target.value)} placeholder="Why this decision — carried onto the brief and the recorded decision." />
        </div>

        {/* Direct decisions (establisher). Approve is the hinge; a second admin must click it (server-enforced). */}
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => onQuickDecision('needs_evidence', rationale)}>
            <i className="ri-search-eye-line me-1" aria-hidden="true" />Needs evidence
          </button>
          <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => onQuickDecision('no_bid', rationale)}>
            <i className="ri-close-circle-line me-1" aria-hidden="true" />No bid
          </button>
          <button type="button" className="btn btn-success btn-sm" disabled={busy || !canApprove}
            title={canApprove ? undefined : (blockedReason ?? 'Approval is blocked until the source is current and every requirement is established, evidenced, and cleared.')}
            onClick={() => onApprove(rationale)}>
            <i className="ri-shield-check-line me-1" aria-hidden="true" />Approve bid pursuit
          </button>
        </div>
        {!canApprove && blockedReason && <div className="small text-secondary mb-2">{blockedReason}</div>}
        <div className="small text-secondary mb-3">
          <i className="ri-group-line me-1" aria-hidden="true" />
          <strong>Separation of duties:</strong> the admin who established the requirements cannot approve the pursuit — a <em>different</em> admin must. A <strong>master admin</strong> may approve their own (audit-logged); for everyone else it is refused server-side (a 403), by design.
        </div>

        <hr />

        {/* Route it to a second admin, with a brief. */}
        <div className="small fw-semibold text-uppercase text-secondary mb-2">Request a pursuit approval</div>
        <p className="small text-secondary mb-2">Write the brief, pick a program-capable admin, and request it. They approve or send it back.</p>
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
              <div className="small text-secondary mt-1">No other program-capable admin is available. A master admin can still approve directly.</div>
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
            title={!approverId ? 'Choose an approver first.' : undefined}
            onClick={() => onRequest(approverId, { proposedDecision: proposed, summary: summary || undefined, rationale: rationale || undefined })}>
            <i className="ri-send-plane-line me-1" aria-hidden="true" />{pending || sentBack ? 'Re-request approval' : 'Request approval'}
          </button>
        </div>

        {pending && (
          <div className="mt-3">
            <label htmlFor="decide-sendback" className="form-label small fw-semibold mb-1">Send back for revision</label>
            <div className="input-group input-group-sm">
              <input id="decide-sendback" type="text" className="form-control" value={note} disabled={busy}
                onChange={(e) => setNote(e.target.value)} placeholder="What the establisher should change." />
              <button type="button" className="btn btn-outline-warning" disabled={busy} onClick={() => onSendBack(note)}>
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
