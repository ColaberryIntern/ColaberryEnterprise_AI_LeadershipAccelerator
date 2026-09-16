import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard, StatusBadge } from '../../components/admin/shell';
import {
  ApplicationDetail, QueueBucket, QueueResponse, ReviewerDecision,
  ApplicantAssessment, AssessmentRecommendation, RequirementStatus,
  InternActivity, ProjectReview, ProjectStanding,
  assessInternshipApplication, fetchInternshipActivity, reviewInternshipProject,
  decideInternshipApplication, fetchInternshipApplication, fetchInternshipQueue,
} from '../../services/adminInternshipApi';
import { InternshipKpi, fetchInternshipKpis } from '../../services/adminInternshipApi';
import InternshipDocumentPanel from '../../components/admin/internship/InternshipDocumentPanel';
import InternshipConversionPanel from '../../components/admin/internship/InternshipConversionPanel';
import InternshipProjectAuthor from './components/InternshipProjectAuthor';

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
  const [kpis, setKpis] = useState<InternshipKpi[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [assessment, setAssessment] = useState<ApplicantAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);

  const [activity, setActivity] = useState<InternActivity | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [review, setReview] = useState<ProjectReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewQuestion, setReviewQuestion] = useState('');

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

  useEffect(() => {
    let alive = true;
    fetchInternshipKpis()
      .then((r) => { if (alive) setKpis(r.kpis); })
      // A KPI row that failed to load shows nothing rather than zeros — a zero
      // here is a claim about the database, not about a failed request.
      .catch(() => { if (alive) setKpis(null); });
    return () => { alive = false; };
  }, [bucket]);

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
      // The assessment is per-applicant and generated on demand, so drop the last
      // one whenever a different application is opened.
      setAssessment(null);
      setAssessError(null);
      // Activity is read-only and cheap, so load it eagerly for the opened intern.
      setActivity(null);
      setActivityError(null);
      setReview(null);
      setReviewQuestion('');
      fetchInternshipActivity(id)
        .then(setActivity)
        .catch(() => setActivityError('Could not load the intern activity.'));
    } catch {
      setDetail(null);
      setDetailError('Could not load this application.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { if (selected) void loadDetail(selected); }, [selected, loadDetail]);

  const runAssessment = useCallback(async () => {
    if (!selected) return;
    setAssessing(true);
    setAssessError(null);
    try {
      setAssessment(await assessInternshipApplication(selected));
    } catch {
      setAssessError('Could not generate the assessment. Try again.');
    } finally {
      setAssessing(false);
    }
  }, [selected]);

  const runProjectReview = useCallback(async () => {
    if (!selected) return;
    setReviewing(true);
    try {
      setReview(await reviewInternshipProject(selected, reviewQuestion.trim() || undefined));
    } catch {
      setReview({
        has_project: false, project_name: null, standing: 'unknown',
        summary: 'Could not review the project. Try again.', answer: '', facts: null, model_generated: false,
      });
    } finally {
      setReviewing(false);
    }
  }, [selected, reviewQuestion]);

  /** Reasons legal for the currently chosen decision. */
  const reasonOptions = useMemo(() => {
    const all = detail?.reason_options ?? [];
    const scope = NEEDS_SCOPED_REASON[decision];
    if (!scope) return all;
    return all.filter((r) => r.applies_to.includes(scope));
  }, [detail, decision]);

  const chosenReason = reasonOptions.find((r) => r.code === reasonCode) ?? null;
  const needsMessage = reasonCode === 'other_see_message';
  // A reason is required only for the scoped (negative) decisions. Approving needs
  // none — the offer letter and message are the substance.
  const reasonRequired = NEEDS_SCOPED_REASON[decision] !== null;
  const canSubmit = (!reasonRequired || !!reasonCode) && (!needsMessage || studentMessage.trim().length > 0);

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

      {kpis && kpis.length > 0 && (
        <SectionCard title="At a glance" icon="bar-chart-box-line">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {kpis.map((k) => (
              <button
                key={k.key}
                type="button"
                className="btn btn-light text-start"
                style={{ minWidth: 160, border: '1px solid #e9ecef' }}
                // Every KPI drills down to the students behind the number.
                onClick={() => {
                  if (k.drilldown.bucket) { setBucket(k.drilldown.bucket as QueueBucket); setSelected(null); }
                }}
                disabled={!k.drilldown.bucket}
                title={k.reason ?? undefined}
              >
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {k.reliability === 'unknown' ? '—' : k.count}
                </div>
                <div className="text-muted" style={{ fontSize: 12 }}>{k.label}</div>
                {k.reliability === 'unknown' && (
                  <div className="text-muted" style={{ fontSize: 10.5, fontStyle: 'italic' }}>not measured</div>
                )}
              </button>
            ))}
          </div>
        </SectionCard>
      )}

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

          {/* AI ASSESSMENT — a summary and a recommendation the reviewer reads, never
              a decision. Requirement green/red is deterministic; the summary and
              posture are the model's, generated on demand. */}
          <SectionCard
            title="AI assessment"
            icon="robot-2-line"
            subtitle="A recommendation, not a decision. You decide below."
          >
            {assessError && <div className="alert alert-danger py-2" role="alert">{assessError}</div>}

            {!assessment && (
              <div className="d-flex align-items-center gap-3">
                <button type="button" className="btn btn-sm btn-dark" onClick={runAssessment} disabled={assessing}>
                  {assessing ? 'Reading the application…' : 'Generate AI assessment'}
                </button>
                <span className="text-muted" style={{ fontSize: 13 }}>
                  Summarises the applicant, checks each requirement, and suggests a posture.
                </span>
              </div>
            )}

            {assessment && (
              <div className="d-flex flex-column gap-3">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <RecommendationBadge value={assessment.recommendation} />
                  {!assessment.model_generated && (
                    <span className="badge bg-secondary" title="The language model was unavailable; showing the requirement check only.">
                      requirement check only
                    </span>
                  )}
                  <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={runAssessment} disabled={assessing}>
                    {assessing ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                <p className="mb-0" style={{ fontSize: 14, lineHeight: 1.55 }}>{assessment.summary}</p>

                {assessment.rationale && (
                  <p className="text-muted mb-0" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                    <strong>Why:</strong> {assessment.rationale}
                  </p>
                )}

                <div>
                  <div className="text-uppercase text-muted mb-2" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em' }}>
                    Requirements
                  </div>
                  <div className="d-flex flex-column gap-1">
                    {assessment.requirements.map((r) => (
                      <div key={r.key} className="d-flex align-items-start gap-2" style={{ fontSize: 13.5 }}>
                        <RequirementDot status={r.status} />
                        <span>
                          {r.label}
                          {r.evidence && <span className="text-muted"> — {r.evidence}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {assessment.conditions.length > 0 && (
                  <div>
                    <div className="text-uppercase text-muted mb-1" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em' }}>
                      Suggested conditions
                    </div>
                    <ul className="mb-0" style={{ fontSize: 13.5 }}>
                      {assessment.conditions.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}

                {assessment.follow_up_questions.length > 0 && (
                  <div>
                    <div className="text-uppercase text-muted mb-1" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em' }}>
                      Questions to get answered
                    </div>
                    <ul className="mb-0" style={{ fontSize: 13.5 }}>
                      {assessment.follow_up_questions.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* ACTIVITY — what the intern is doing: training (weeks 1-3 gate),
              project, cert prep, case studies. Read-only, loaded on open. */}
          <SectionCard
            title="Activity"
            icon="pulse-line"
            subtitle="Training, project, cert prep and case studies"
          >
            {activityError && <div className="alert alert-warning py-2 mb-2" role="alert">{activityError}</div>}
            {!activity && !activityError && <p className="text-muted mb-0">Loading activity…</p>}
            {activity && (
              <div className="d-flex flex-column gap-3">
                {/* Training — the first-3-weeks gate front and centre */}
                <div>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span className="text-uppercase text-muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em' }}>
                      Training (weeks 1-3)
                    </span>
                    {activity.training ? (
                      <span
                        className="badge"
                        style={{
                          background: activity.training.first_three_weeks.ready ? '#2e7d5b' : '#a8690f',
                          color: '#fff', fontSize: 11, fontWeight: 600,
                        }}
                      >
                        {activity.training.first_three_weeks.ready
                          ? 'Ready for a project'
                          : `${activity.training.first_three_weeks.done} of ${activity.training.first_three_weeks.total} weeks done`}
                      </span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: 12 }}>no training data yet</span>
                    )}
                  </div>
                  {activity.training && (
                    <div className="d-flex flex-column gap-1">
                      {activity.training.weeks
                        .filter((w) => w.week >= 1 && w.week <= 3)
                        .map((w) => (
                          <div key={w.week} className="d-flex align-items-center gap-2" style={{ fontSize: 13.5 }}>
                            <span
                              aria-hidden="true"
                              style={{
                                flex: 'none', width: 10, height: 10, borderRadius: '50%',
                                background: w.done ? '#2e7d5b' : '#cbd5e0',
                              }}
                            />
                            <span style={{ minWidth: 60 }}>Week {w.week}</span>
                            <span className="text-muted">{w.completed}/{w.published} items ({w.completed_pct}%)</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Project */}
                <div>
                  <div className="text-uppercase text-muted mb-1" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em' }}>
                    Project
                  </div>
                  {activity.project ? (
                    <div style={{ fontSize: 13.5 }}>
                      <strong>{activity.project.name}</strong>
                      <span className="text-muted"> · {activity.project.stage ?? 'no stage'}</span>
                      <div className="text-muted">
                        {activity.project.verified_stories}/{activity.project.total_stories} stories verified
                        {activity.project.requirements_pct != null && ` · ${activity.project.requirements_pct}% requirements`}
                        {activity.project.repo_connected ? ' · repo connected' : ' · no repo yet'}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted" style={{ fontSize: 13.5 }}>No project assigned yet.</span>
                  )}

                  {/* Author & assign the first project — the manager's delivery
                      surface, offered while the intern has no project yet. */}
                  {!activity.project && selected && (
                    <InternshipProjectAuthor
                      applicationId={selected}
                      onAuthored={() => {
                        fetchInternshipActivity(selected).then(setActivity).catch(() => { /* keep prior view */ });
                      }}
                    />
                  )}

                  {/* AI "dig into their project" review — a management read of the
                      build, generated on demand. Deterministic facts anchor it; the
                      model writes the standing/summary and answers a manager's
                      question. Only offered once a project exists. */}
                  {activity.project && (
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid #f1f3f5' }}>
                      <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
                        <button type="button" className="btn btn-sm btn-dark" onClick={runProjectReview} disabled={reviewing}>
                          {reviewing ? 'Reading the build…' : review ? 'Re-run review' : 'Review with AI'}
                        </button>
                        <span className="text-muted" style={{ fontSize: 12.5 }}>
                          A management read of where the build stands — or ask a question below.
                        </span>
                      </div>
                      <input
                        type="text"
                        className="form-control form-control-sm mb-2"
                        style={{ maxWidth: 480 }}
                        placeholder="Ask about the project (optional), e.g. is the data pipeline actually built?"
                        value={reviewQuestion}
                        onChange={(e) => setReviewQuestion(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runProjectReview(); } }}
                        disabled={reviewing}
                      />
                      {review && review.has_project && (
                        <div className="d-flex flex-column gap-2">
                          <div className="d-flex align-items-center gap-2 flex-wrap">
                            <StandingBadge value={review.standing} />
                            {!review.model_generated && (
                              <span className="badge bg-secondary" title="The language model was unavailable; showing the deterministic facts only.">
                                facts only
                              </span>
                            )}
                          </div>
                          <p className="mb-0" style={{ fontSize: 14, lineHeight: 1.55 }}>{review.summary}</p>
                          {review.answer && (
                            <p className="mb-0" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                              <strong>Answer:</strong> {review.answer}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Cert prep + case studies, side by side on wide screens */}
                <div className="d-flex flex-wrap gap-4">
                  <div>
                    <div className="text-uppercase text-muted mb-1" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em' }}>
                      Cert prep
                    </div>
                    <span style={{ fontSize: 13.5 }}>
                      {activity.cert_prep
                        ? `${activity.cert_prep.state.replace(/_/g, ' ')}${activity.cert_prep.overall_scaled != null ? ` · ${activity.cert_prep.overall_scaled}` : ''}`
                        : <span className="text-muted">Not measured yet.</span>}
                    </span>
                  </div>
                  <div>
                    <div className="text-uppercase text-muted mb-1" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em' }}>
                      Case studies
                    </div>
                    {activity.case_studies.length === 0
                      ? <span className="text-muted" style={{ fontSize: 13.5 }}>None yet.</span>
                      : (
                        <ul className="mb-0" style={{ fontSize: 13.5 }}>
                          {activity.case_studies.map((c) => (
                            <li key={c.id}>{c.title} <span className="text-muted">({c.status})</span></li>
                          ))}
                        </ul>
                      )}
                  </div>
                </div>
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

          <InternshipDocumentPanel
            applicationId={selected}
            onChanged={() => { void loadDetail(selected); void loadQueue(bucket); }}
          />

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
                Reason {reasonRequired ? '(required)' : '(optional)'}
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
                {reasonRequired && !reasonCode ? 'Pick a reason first.' : 'This reason needs a message.'}
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

      <InternshipConversionPanel onChanged={() => { void loadQueue(bucket); }} />
    </div>
  );
};

/** The AI's suggested posture, as a coloured badge. Advice, not a decision. */
const RecommendationBadge: React.FC<{ value: AssessmentRecommendation }> = ({ value }) => {
  const map: Record<AssessmentRecommendation, { label: string; bg: string }> = {
    approve: { label: 'Suggests: Approve', bg: '#2e7d5b' },
    approve_with_conditions: { label: 'Suggests: Approve with conditions', bg: '#1f7a8c' },
    concerns: { label: 'Suggests: Concerns', bg: '#b23a3a' },
    follow_up: { label: 'Suggests: Follow up', bg: '#a8690f' },
    not_ready: { label: 'Suggests: Not ready', bg: '#6b7280' },
  };
  const m = map[value];
  return (
    <span
      className="badge"
      style={{ background: m.bg, color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 10px' }}
    >
      {m.label}
    </span>
  );
};

/** Standing pill for the AI project review — how the build is tracking. */
const StandingBadge: React.FC<{ value: ProjectStanding }> = ({ value }) => {
  const map: Record<ProjectStanding, { label: string; bg: string }> = {
    on_track: { label: 'On track', bg: '#2e7d5b' },
    needs_attention: { label: 'Needs attention', bg: '#a8690f' },
    stalled: { label: 'Stalled', bg: '#b23a3a' },
    not_started: { label: 'Not started', bg: '#6b7280' },
    unknown: { label: 'Unknown', bg: '#6b7280' },
  };
  const m = map[value];
  return (
    <span
      className="badge"
      style={{ background: m.bg, color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 10px' }}
    >
      {m.label}
    </span>
  );
};

/** Green / red / amber for a requirement's status. */
const RequirementDot: React.FC<{ status: RequirementStatus }> = ({ status }) => {
  const color = status === 'met' ? '#2e7d5b' : status === 'not_met' ? '#b23a3a' : '#a8690f';
  const label = status === 'met' ? 'Met' : status === 'not_met' ? 'Not met' : 'Unclear';
  return (
    <span
      aria-label={label}
      title={label}
      style={{
        flex: 'none', width: 11, height: 11, borderRadius: '50%', background: color,
        marginTop: 4, display: 'inline-block',
      }}
    />
  );
};

export default AdminInternshipPage;
