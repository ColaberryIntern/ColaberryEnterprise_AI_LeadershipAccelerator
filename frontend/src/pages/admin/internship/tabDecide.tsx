import React from 'react';
import { ReviewerDecision } from '../../../services/adminInternshipApi';
import { useReview } from './reviewContext';

const DECISION_LABELS: Array<{ key: ReviewerDecision; label: string }> = [
  { key: 'approve', label: 'Approve' },
  { key: 'approve_with_conditions', label: 'Approve with conditions' },
  { key: 'request_information', label: 'Request information' },
  { key: 'schedule_human_follow_up', label: 'Schedule a human follow-up' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'reject', label: 'Reject' },
];

/** States where activation is the natural next action. */
const ACTIVATABLE = ['documents_verified', 'payment_pending', 'activation_pending'];

/**
 * Decide tab — the reviewer decision, with the applicant-facing consequence shown
 * BEFORE submit, plus the Activate step (the only action that puts someone in the
 * cohort). Activate was previously reachable only from a backend script; here it
 * is a real control that refuses with the outstanding blockers, not a bare error.
 */
const TabDecide: React.FC = () => {
  const r = useReview();
  const d = r.detail;
  if (!d) return null;
  const showActivate = ACTIVATABLE.includes(d.application.state);

  return (
    <div className="d-flex flex-column gap-3">
      {/* Activate — the terminal step, surfaced when the applicant is that far along. */}
      {showActivate && (
        <div className="p-3" style={{ border: '1px solid var(--border-subtle,#e2e6ec)', borderRadius: 12, background: 'var(--surface-subtle,#f7f8fb)' }}>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <strong style={{ fontSize: 14 }}>Place in the internship cohort</strong>
            <button type="button" className="btn btn-success btn-sm ms-auto" onClick={r.activate} disabled={r.activating}>
              {r.activating ? 'Activating…' : '✓ Activate'}
            </button>
          </div>
          <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            This is the only action that grants curriculum access and starts tracking. It refuses if anything is still outstanding.
          </div>
          {r.activateNote && <div className="alert alert-success py-2 mt-2 mb-0" role="status" style={{ fontSize: 13 }}>{r.activateNote}</div>}
          {r.activateBlockers && r.activateBlockers.length > 0 && (
            <div className="alert alert-warning py-2 mt-2 mb-0" role="alert" style={{ fontSize: 13 }}>
              <strong>Not ready yet:</strong>
              <ul className="mb-0 mt-1">
                {r.activateBlockers.map((b) => <li key={b.key}>{b.label}{b.waiting_on ? ` — ${b.waiting_on}` : ''}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div>
        {r.decisionNote && <div className="alert alert-success" role="status">{r.decisionNote}</div>}
        {r.decisionError && <div className="alert alert-danger" role="alert">{r.decisionError}</div>}

        <div className="mb-3">
          <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Decision</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DECISION_LABELS.map((dl) => (
              <button
                key={dl.key}
                type="button"
                className={`btn btn-sm ${r.decision === dl.key ? 'btn-dark' : 'btn-outline-secondary'}`}
                onClick={() => { r.setDecision(dl.key); r.setReasonCode(''); }}
              >
                {dl.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor="ai-reason" style={{ fontSize: 13, fontWeight: 600 }}>
            Reason {r.reasonRequired ? '(required)' : '(optional)'}
          </label>
          <select id="ai-reason" className="form-select form-select-sm" value={r.reasonCode} onChange={(e) => r.setReasonCode(e.target.value)}>
            <option value="">Select a reason…</option>
            {r.reasonOptions.map((ro) => <option key={ro.code} value={ro.code}>{ro.label}</option>)}
          </select>
        </div>

        {r.chosenReason && (
          <div className="alert alert-light border" style={{ fontSize: 13 }}>
            <strong>The applicant will be emailed:</strong>{' '}
            {r.needsMessage
              ? <em>whatever you write below — this reason has no standard wording.</em>
              : <em>the standard wording for &ldquo;{r.chosenReason.label}&rdquo;, plus what would change our answer and any reapply date.</em>}
          </div>
        )}

        {r.decision === 'approve_with_conditions' && (
          <div className="mb-3">
            <label className="form-label" htmlFor="ai-cond" style={{ fontSize: 13, fontWeight: 600 }}>Conditions (emailed to the applicant)</label>
            <textarea id="ai-cond" className="form-control form-control-sm" rows={2} maxLength={2000} value={r.conditions} onChange={(e) => r.setConditions(e.target.value)} />
          </div>
        )}

        <div className="mb-3">
          <label className="form-label" htmlFor="ai-msg" style={{ fontSize: 13, fontWeight: 600 }}>
            Message to the applicant {r.needsMessage && <span className="text-danger">(required for this reason)</span>}
          </label>
          <textarea id="ai-msg" className="form-control form-control-sm" rows={3} maxLength={4000} value={r.studentMessage} onChange={(e) => r.setStudentMessage(e.target.value)} placeholder="They will read this exactly as written. Leave blank to use the standard wording." />
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor="ai-notes" style={{ fontSize: 13, fontWeight: 600 }}>Internal notes</label>
          <textarea id="ai-notes" className="form-control form-control-sm" rows={2} maxLength={4000} value={r.reviewerNotes} onChange={(e) => r.setReviewerNotes(e.target.value)} placeholder="Never emailed. For the record only." />
          <div className="form-text">Never sent to the applicant.</div>
        </div>

        <button type="button" className="btn btn-primary" onClick={r.submit} disabled={r.saving || !r.canSubmit}>
          {r.saving ? 'Recording…' : 'Record decision'}
        </button>
        {!r.canSubmit && (
          <span className="text-muted ms-2" style={{ fontSize: 12 }}>
            {r.reasonRequired && !r.reasonCode ? 'Pick a reason first.' : 'This reason needs a message.'}
          </span>
        )}
      </div>

      {d.decisions.length > 0 && (
        <div>
          <div className="text-muted mb-1" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>Decision history</div>
          {d.decisions.map((dec) => (
            <div key={dec.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f3f5', fontSize: 13 }}>
              <strong>{String(dec.decision).replace(/_/g, ' ')}</strong> · {dec.reason_code}
              {' · '}<span className="text-muted">{dec.decided_by}</span>
              {' · '}<span className="text-muted">{new Date(dec.decided_at).toLocaleString()}</span>
              {dec.reapply_after && <div className="text-muted">May reapply from {dec.reapply_after}</div>}
              {dec.student_message && <div>To applicant: {dec.student_message}</div>}
              {dec.reviewer_notes && <div className="text-muted">Internal: {dec.reviewer_notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TabDecide;
