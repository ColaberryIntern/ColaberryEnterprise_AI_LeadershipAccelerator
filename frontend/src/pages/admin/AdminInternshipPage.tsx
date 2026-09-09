import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard, StatusBadge } from '../../components/admin/shell';
import {
  ApplicationDetail, QueueBucket, QueueResponse, ReviewerDecision,
  decideInternshipApplication, fetchInternshipApplication, fetchInternshipQueue,
} from '../../services/adminInternshipApi';

/**
 * AdminInternshipPage — the AI Internship review queue and decision surface.
 *
 * ── FOUR EMPTY STATES, FOUR SENTENCES ──────────────────────────────────────
 *
 * Following AdminCaseStudiesPage's rule, for the reason it records: "No
 * applications yet" is a claim about the database and must never appear because a
 * request failed. Loading, load-failed, empty-bucket and genuinely-none-at-all
 * each say something different here.
 *
 * ── WHAT THE REVIEWER SEES, AND WHY THAT ORDER ─────────────────────────────
 *
 * The applicant's own answers come FIRST and the AI's reading comes after. A
 * reviewer who reads a machine's summary before the person's words anchors on it —
 * so the layout puts the answers where the eye lands and labels the
 * recommendation as what it is: things to check, not a verdict.
 *
 * ── AND WHY REJECTION IS TWO DELIBERATE STEPS ──────────────────────────────
 *
 * Picking a reason is required, and the applicant-facing consequence of that
 * reason is shown BEFORE the decision is submitted. A reviewer should not be able
 * to reject someone without seeing what that person is about to be told.
 */

const BUCKET_LABELS: Array<{ key: QueueBucket; label: string }> = [
  { key: 'awaiting_review', label: 'Awaiting review' },
  { key: 'information_requested', label: 'Information requested' },
  { key: 'interview_incomplete', label: 'Interview incomplete' },
  { key: 'calls_failed', label: 'Calls failed' },
  { key: 'waitlisted', label: 'Waitlisted' },
  { key: 'approved_awaiting_documents', label: 'Awaiting documents' },
  { key: 'all_open', label: 'All open' },
];

const DECISION_LABELS: Array<{ key: ReviewerDecision; label: string; tone: string }> = [
  { key: 'approve', label: 'Approve', tone: 'success' },
  { key: 'approve_with_conditions', label: 'Approve with conditions', tone: 'success' },
  { key: 'request_information', label: 'Request information', tone: 'warning' },
  { key: 'schedule_human_follow_up', label: 'Schedule a human follow-up', tone: 'warning' },
  { key: 'waitlist', label: 'Waitlist', tone: 'neutral' },
  { key: 'reject', label: 'Reject', tone: 'danger' },
];

/** Decisions that require a reason drawn from the reject/waitlist/info families. */
const NEEDS_SCOPED_REASON: Record<ReviewerDecision, 'rejected' | 'waitlisted' | 'information_requested' | null> = {
  approve: null,
  approve_with_conditions: null,
  reject: 'rejected',
  waitlist: 'waitlisted',
  request_information: 'information_requested',
  schedule_human_follow_up: 'information_requested',
};

const AdminInternshipPage: React.FC = () => {
  const [bucket, setBucket] = useState<QueueBucket>('awaiting_review');
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [decision, setDecision] = useState<ReviewerDecision>('approve');
  const [reasonCode, setReasonCode] = useState('');
  const [studentMessage, setStudentMessage] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [conditions, setConditions] = useState('');
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState<string | null>(null);

  const loadQueue = useCallback(async (b: QueueBucket) => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      setQueue(await fetchInternshipQueue(b));
    } catch {
      setQueue(null);
      setQueueError('Could not load the queue. This is a request failure, not an empty queue.');
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => { void loadQueue(bucket); }, [bucket, loadQueue]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setDecisionNote(null);
    setDecisionError(null);
    try {
      const d = await fetchInternshipApplication(id);
      setDetail(d);
      setReasonCode('');
      setStudentMessage('');
      setReviewerNotes('');
      setConditions('');
    } catch {
      setDetail(null);
      setDetailError('Could not load this application.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { if (selected) void loadDetail(selected); }, [selected, loadDetail]);

  /** Reasons legal for the currently chosen decision. */
  const reasonOptions = useMemo(() => {
    const all = detail?.reason_options ?? [];
    const scope = NEEDS_SCOPED_REASON[decision];
    if (!scope) return all;
    return all.filter((r) => r.applies_to.includes(scope));
  }, [detail, decision]);

  const chosenReason = reasonOptions.find((r) => r.code === reasonCode) ?? null;
  const needsMessage = reasonCode === 'other_see_message';
  const canSubmit = !!reasonCode && (!needsMessage || studentMessage.trim().length > 0);

  const submit = useCallback(async () => {
    if (!selected || !canSubmit) return;
    setSaving(true);
    setDecisionError(null);
    setDecisionNote(null);
    try {
      const res = await decideInternshipApplication(selected, {
        decision,
        reason_code: reasonCode,
        student_message: studentMessage.trim() || null,
        reviewer_notes: reviewerNotes.trim() || null,
        conditions: conditions.trim() || null,
      });
      // Report the email honestly rather than assuming it went. "skipped" is a
      // real, correct outcome (the ledger refused a duplicate) and the reviewer
      // should see the difference between that and "sent".
      setDecisionNote(
        `Recorded. Application is now ${res.state}.`
        + (res.email.attempted ? ` Email: ${res.email.outcome ?? 'unknown'}.` : ' No email for this decision.'),
      );
      await Promise.all([loadDetail(selected), loadQueue(bucket)]);
    } catch (err: any) {
      setDecisionError(
        err?.response?.data?.error
        ?? 'Could not record that decision.',
      );
    } finally {
      setSaving(false);
    }
  }, [selected, canSubmit, decision, reasonCode, studentMessage, reviewerNotes, conditions, loadDetail, loadQueue, bucket]);

  const counts = queue?.counts;

  return (
    <div>
      <PageHeader
        title="AI Internship"
        subtitle="Applications, interviews and decisions"
        icon="user-follow-line"
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'AI Internship' }]}
      />

      <SectionCard title="Queue" icon="inbox-2-line">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {BUCKET_LABELS.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`btn btn-sm ${bucket === b.key ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => { setBucket(b.key); setSelected(null); setDetail(null); }}
            >
              {b.label}
              {counts ? ` (${counts[b.key] ?? 0})` : ''}
            </button>
          ))}
        </div>

        {queueLoading && <p className="text-muted mb-0">Loading the queue…</p>}

        {!queueLoading && queueError && (
          <div className="alert alert-danger mb-0" role="alert">{queueError}</div>
        )}

        {!queueLoading && !queueError && queue && queue.rows.length === 0 && (
          <p className="text-muted mb-0">
            {counts && counts.all_open === 0
              ? 'No internship applications have been started yet.'
              : 'Nothing in this bucket right now. Other buckets have applications.'}
          </p>
        )}

        {!queueLoading && !queueError && queue && queue.rows.length > 0 && (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Status</th>
                  <th>Channel</th>
                  <th>Interview</th>
                  <th>To check</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {queue.rows.map((r) => (
                  <tr key={r.application_id} className={selected === r.application_id ? 'table-active' : ''}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.full_name ?? '—'}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>{r.email ?? '—'}</div>
                    </td>
                    <td><StatusBadge label={r.state.replace(/_/g, ' ')} /></td>
                    <td>{r.interview_channel ?? '—'}</td>
                    <td>{r.progress.resolved}/{r.progress.total}</td>
                    <td>
                      {/* A COUNT of things to look at, never a score. */}
                      {r.blocking_count > 0
                        ? <span className="badge bg-warning text-dark">{r.blocking_count}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => setSelected(r.application_id)}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {selected && detailLoading && (
        <SectionCard title="Application"><p className="text-muted mb-0">Loading…</p></SectionCard>
      )}

      {selected && !detailLoading && detailError && (
        <SectionCard title="Application">
          <div className="alert alert-danger mb-0" role="alert">{detailError}</div>
        </SectionCard>
      )}

      {selected && !detailLoading && detail && (
        <>
          <SectionCard
            title={detail.person.full_name ?? 'Applicant'}
            subtitle={detail.person.email ?? undefined}
            icon="user-line"
          >
            <div className="row g-3">
              <div className="col-md-6">
                <dl className="row mb-0" style={{ fontSize: 13 }}>
                  <dt className="col-6">Status</dt>
                  <dd className="col-6"><StatusBadge label={detail.application.state.replace(/_/g, ' ')} /></dd>
                  <dt className="col-6">Interview channel</dt>
                  <dd className="col-6">{detail.application.interview_channel ?? '—'}</dd>
                  <dt className="col-6">Interview answered</dt>
                  <dd className="col-6">{detail.progress.resolved}/{detail.progress.total}</dd>
                  <dt className="col-6">Not employed full time</dt>
                  <dd className="col-6">{detail.application.attests_not_employed_fulltime ? 'Attested' : 'Not attested'}</dd>
                  <dt className="col-6">Commitment acknowledged</dt>
                  <dd className="col-6">{detail.application.commitment_acknowledged_at ? 'Yes' : 'No'}</dd>
                  <dt className="col-6">Submitted</dt>
                  <dd className="col-6">
                    {detail.application.submitted_at
                      ? new Date(detail.application.submitted_at).toLocaleString()
                      : 'Not yet'}
                  </dd>
                </dl>
              </div>
              <div className="col-md-6">
                <dl className="row mb-0" style={{ fontSize: 13 }}>
                  <dt className="col-6">Phone</dt>
                  <dd className="col-6">{detail.intake?.phone ?? '—'}</dd>
                  <dt className="col-6">Time zone</dt>
                  <dd className="col-6">{detail.intake?.time_zone ?? '—'}</dd>
                  <dt className="col-6">Work authorisation</dt>
                  <dd className="col-6">{detail.intake?.work_auth_category ?? '—'}</dd>
                  <dt className="col-6">GitHub</dt>
                  <dd className="col-6">
                    {detail.intake?.github_url
                      ? <a href={detail.intake.github_url} target="_blank" rel="noopener noreferrer">Open</a>
                      : '—'}
                  </dd>
                  <dt className="col-6">LinkedIn</dt>
                  <dd className="col-6">
                    {detail.intake?.linkedin_url
                      ? <a href={detail.intake.linkedin_url} target="_blank" rel="noopener noreferrer">Open</a>
                      : '—'}
                  </dd>
                  <dt className="col-6">Recording consent</dt>
                  <dd className="col-6">{detail.intake?.consent_recording ? 'Given' : 'Not given'}</dd>
                </dl>
              </div>
            </div>
            {detail.intake?.accommodation_request && (
              <div className="alert alert-info mt-3 mb-0" style={{ fontSize: 13 }}>
                <strong>Accommodation request:</strong> {detail.intake.accommodation_request}
              </div>
            )}
          </SectionCard>

          {/* THE APPLICANT'S OWN WORDS, FIRST. */}
          <SectionCard title="Their answers" icon="chat-quote-line" subtitle="In their own words, exactly as given">
            {detail.summary.length === 0
              ? <p className="text-muted mb-0">No interview answers recorded.</p>
              : detail.summary.map((line) => (
                <div key={line.question_key} style={{ padding: '10px 0', borderBottom: '1px solid #f1f3f5' }}>
                  <div className="text-muted" style={{ fontSize: 12, fontWeight: 600 }}>{line.question}</div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                    {line.answer_display || <em className="text-muted">Not answered</em>}
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                    {line.answered_via && (
                      <span className="badge bg-light text-dark" style={{ fontSize: 10 }}>
                        {line.answered_via === 'phone' ? 'from call' : 'online'}
                      </span>
                    )}
                    {line.state === 'needs_followup' && (
                      <span className="badge bg-warning text-dark" style={{ fontSize: 10 }}>
                        unconfirmed by applicant
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </SectionCard>

          {/* The AI's reading, AFTER, and labelled as what it is. */}
          <SectionCard
            title="Things to check"
            icon="search-eye-line"
            subtitle="Generated from their answers. Not a decision, not a score — every one of these is yours to overrule."
          >
            <p style={{ fontSize: 13 }}>
              Suggested next step: <strong>{detail.recommendation.suggested_action.replace(/_/g, ' ')}</strong>
              {' '}· A human decision is required either way.
            </p>
            {detail.recommendation.factors.length === 0 ? (
              <p className="text-muted mb-0">Nothing flagged.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {detail.recommendation.factors.map((f, i) => (
                  <li key={`${f.code}-${i}`} style={{ marginBottom: 10, fontSize: 13 }}>
                    <span className={`badge me-2 ${
                      f.severity === 'blocking' ? 'bg-danger'
                        : f.severity === 'attention' ? 'bg-warning text-dark' : 'bg-secondary'
                    }`}>{f.severity}</span>
                    {f.detail}
                    {f.evidence && (
                      <div className="text-muted" style={{ fontStyle: 'italic', marginTop: 2 }}>
                        “{f.evidence}”
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {detail.recommendation.excluded_signals.length > 0 && (
              <div className="alert alert-secondary mt-3 mb-0" style={{ fontSize: 12 }}>
                <strong>Excluded from the above (unreliable, not zero):</strong>
                <ul className="mb-0 mt-1">
                  {detail.recommendation.excluded_signals.map((s) => (
                    <li key={s.signal}>{s.signal} — {s.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>

          <SectionCard title="What the platform already knows" icon="database-2-line">
            <table className="table table-sm mb-0" style={{ fontSize: 13 }}>
              <thead><tr><th>Signal</th><th>Value</th><th>Source</th><th>Reliability</th></tr></thead>
              <tbody>
                {detail.signals.map((s) => (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td>{s.value ?? <span className="text-muted">unknown</span>}</td>
                    <td className="text-muted">{s.source}</td>
                    <td>
                      {s.reliability === 'reliable'
                        ? <span className="badge bg-success">reliable</span>
                        : <span className="badge bg-secondary" title={s.reason}>unknown</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          {detail.sessions.length > 0 && (
            <SectionCard title="Interview sessions" icon="phone-line">
              {detail.sessions.map((s) => (
                <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f3f5', fontSize: 13 }}>
                  <StatusBadge label={s.status.replace(/_/g, ' ')} /> <strong>{s.channel}</strong>
                  {s.scheduled_for && ` · booked ${new Date(s.scheduled_for).toLocaleString()}`}
                  {s.completed_at && ` · ended ${new Date(s.completed_at).toLocaleString()}`}
                  {s.failure_reason && <span className="text-danger"> · {s.failure_reason}</span>}
                  {s.transcript_withheld && (
                    <div className="text-muted" style={{ fontStyle: 'italic' }}>
                      Transcript withheld — the applicant did not consent to recording.
                    </div>
                  )}
                  {s.transcript && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ cursor: 'pointer' }}>Transcript</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 6 }}>{s.transcript}</pre>
                    </details>
                  )}
                </div>
              ))}
            </SectionCard>
          )}

          <SectionCard title="Decide" icon="gavel-line">
            {decisionNote && <div className="alert alert-success" role="status">{decisionNote}</div>}
            {decisionError && <div className="alert alert-danger" role="alert">{decisionError}</div>}

            <div className="mb-3">
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600 }}>Decision</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {DECISION_LABELS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className={`btn btn-sm ${decision === d.key ? 'btn-dark' : 'btn-outline-secondary'}`}
                    onClick={() => { setDecision(d.key); setReasonCode(''); }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="ai-reason" style={{ fontSize: 13, fontWeight: 600 }}>
                Reason (required)
              </label>
              <select
                id="ai-reason"
                className="form-select form-select-sm"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
              >
                <option value="">Select a reason…</option>
                {reasonOptions.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* What the applicant will actually be told, BEFORE submitting. */}
            {chosenReason && (
              <div className="alert alert-light border" style={{ fontSize: 13 }}>
                <strong>The applicant will be emailed:</strong>{' '}
                {needsMessage
                  ? <em>whatever you write below — this reason has no standard wording.</em>
                  : <em>the standard wording for “{chosenReason.label}”, plus what would change our answer and any reapply date.</em>}
              </div>
            )}

            {decision === 'approve_with_conditions' && (
              <div className="mb-3">
                <label className="form-label" htmlFor="ai-cond" style={{ fontSize: 13, fontWeight: 600 }}>
                  Conditions (emailed to the applicant)
                </label>
                <textarea
                  id="ai-cond"
                  className="form-control form-control-sm"
                  rows={2}
                  maxLength={2000}
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                />
              </div>
            )}

            <div className="mb-3">
              <label className="form-label" htmlFor="ai-msg" style={{ fontSize: 13, fontWeight: 600 }}>
                Message to the applicant {needsMessage && <span className="text-danger">(required for this reason)</span>}
              </label>
              <textarea
                id="ai-msg"
                className="form-control form-control-sm"
                rows={3}
                maxLength={4000}
                value={studentMessage}
                onChange={(e) => setStudentMessage(e.target.value)}
                placeholder="They will read this exactly as written. Leave blank to use the standard wording."
              />
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="ai-notes" style={{ fontSize: 13, fontWeight: 600 }}>
                Internal notes
              </label>
              <textarea
                id="ai-notes"
                className="form-control form-control-sm"
                rows={2}
                maxLength={4000}
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="Never emailed. For the record only."
              />
              <div className="form-text">Never sent to the applicant.</div>
            </div>

            <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || !canSubmit}>
              {saving ? 'Recording…' : 'Record decision'}
            </button>
            {!canSubmit && (
              <span className="text-muted ms-2" style={{ fontSize: 12 }}>
                {!reasonCode ? 'Pick a reason first.' : 'This reason needs a message.'}
              </span>
            )}
          </SectionCard>

          {detail.decisions.length > 0 && (
            <SectionCard title="Decision history" icon="history-line">
              {detail.decisions.map((d) => (
                <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f3f5', fontSize: 13 }}>
                  <strong>{String(d.decision).replace(/_/g, ' ')}</strong> · {d.reason_code}
                  {' · '}<span className="text-muted">{d.decided_by}</span>
                  {' · '}<span className="text-muted">{new Date(d.decided_at).toLocaleString()}</span>
                  {d.reapply_after && <div className="text-muted">May reapply from {d.reapply_after}</div>}
                  {d.student_message && <div>To applicant: {d.student_message}</div>}
                  {d.reviewer_notes && <div className="text-muted">Internal: {d.reviewer_notes}</div>}
                </div>
              ))}
            </SectionCard>
          )}

          <SectionCard title="Audit trail" icon="route-line">
            <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
              <thead><tr><th>When</th><th>From</th><th>To</th><th>Who</th><th>Why</th></tr></thead>
              <tbody>
                {detail.timeline.map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <td className="text-muted">{new Date(e.at).toLocaleString()}</td>
                    <td>{e.from_state ?? '—'}</td>
                    <td>{e.to_state}</td>
                    <td>{e.actor_type}{e.actor_id ? ` (${e.actor_id})` : ''}</td>
                    <td className="text-muted">{e.reason ?? e.evidence_source ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </>
      )}
    </div>
  );
};

export default AdminInternshipPage;
