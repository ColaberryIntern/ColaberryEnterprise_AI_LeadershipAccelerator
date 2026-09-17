import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ApplicationDetail, QueueBucket, QueueResponse, ReviewerDecision,
  ApplicantAssessment, InternActivity, ProjectReview, InternshipKpi,
  ActivationBlocker,
  assessInternshipApplication, fetchInternshipActivity, reviewInternshipProject,
  decideInternshipApplication, fetchInternshipApplication, fetchInternshipQueue,
  fetchInternshipKpis, activateInternshipApplication,
} from '../../../services/adminInternshipApi';

/**
 * All the review state and actions for the internship Applications view, in one
 * hook exposed through context. The old page held this same state inline in a
 * 1000-line component and prop-drilled nothing because everything was in one
 * scope; splitting the screen into a queue + a tabbed detail would have meant
 * threading ~30 values through several layers, so it lives here instead and each
 * piece reads what it needs with `useReview()`.
 *
 * The behaviour is preserved verbatim from the original: what loads when, which
 * decisions need a reason, and the honest email-outcome reporting.
 */

/** Decisions that require a reason drawn from the reject/waitlist/info families. */
const NEEDS_SCOPED_REASON: Record<ReviewerDecision, 'rejected' | 'waitlisted' | 'information_requested' | null> = {
  approve: null,
  approve_with_conditions: null,
  reject: 'rejected',
  waitlist: 'waitlisted',
  request_information: 'information_requested',
  schedule_human_follow_up: 'information_requested',
};

export function useInternshipReview() {
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

  const [activating, setActivating] = useState(false);
  const [activateBlockers, setActivateBlockers] = useState<ActivationBlocker[] | null>(null);
  const [activateNote, setActivateNote] = useState<string | null>(null);

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
      .catch(() => { if (alive) setKpis(null); });
    return () => { alive = false; };
  }, [bucket]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setDecisionNote(null);
    setDecisionError(null);
    setActivateBlockers(null);
    setActivateNote(null);
    try {
      const d = await fetchInternshipApplication(id);
      setDetail(d);
      setReasonCode('');
      setStudentMessage('');
      setReviewerNotes('');
      setConditions('');
      setAssessment(null);
      setAssessError(null);
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

  const reloadActivity = useCallback(() => {
    if (!selected) return;
    fetchInternshipActivity(selected).then(setActivity).catch(() => { /* keep prior view */ });
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

  const reasonOptions = useMemo(() => {
    const all = detail?.reason_options ?? [];
    const scope = NEEDS_SCOPED_REASON[decision];
    if (!scope) return all;
    return all.filter((r) => r.applies_to.includes(scope));
  }, [detail, decision]);

  const chosenReason = reasonOptions.find((r) => r.code === reasonCode) ?? null;
  const needsMessage = reasonCode === 'other_see_message';
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
      setDecisionNote(
        `Recorded. Application is now ${res.state}.`
        + (res.email.attempted ? ` Email: ${res.email.outcome ?? 'unknown'}.` : ' No email for this decision.'),
      );
      await Promise.all([loadDetail(selected), loadQueue(bucket)]);
    } catch (err: any) {
      setDecisionError(err?.response?.data?.error ?? 'Could not record that decision.');
    } finally {
      setSaving(false);
    }
  }, [selected, canSubmit, decision, reasonCode, studentMessage, reviewerNotes, conditions, loadDetail, loadQueue, bucket]);

  const activate = useCallback(async () => {
    if (!selected) return;
    setActivating(true);
    setActivateBlockers(null);
    setActivateNote(null);
    try {
      const res = await activateInternshipApplication(selected);
      if (res.ok) {
        setActivateNote('Activated. They are in the internship cohort.');
        await Promise.all([loadDetail(selected), loadQueue(bucket)]);
      } else {
        setActivateBlockers(res.blockers);
        if (res.blockers.length === 0) setActivateNote(res.error);
      }
    } finally {
      setActivating(false);
    }
  }, [selected, loadDetail, loadQueue, bucket]);

  return {
    bucket, setBucket, queue, kpis, queueError, queueLoading,
    selected, setSelected, detail, detailError, detailLoading,
    assessment, assessing, assessError, runAssessment,
    activity, activityError, reloadActivity,
    review, reviewing, reviewQuestion, setReviewQuestion, runProjectReview,
    decision, setDecision, reasonCode, setReasonCode, studentMessage, setStudentMessage,
    reviewerNotes, setReviewerNotes, conditions, setConditions, saving, decisionError, decisionNote,
    reasonOptions, chosenReason, needsMessage, reasonRequired, canSubmit, submit,
    activating, activateBlockers, activateNote, activate,
    loadDetail, loadQueue,
  };
}

export type ReviewApi = ReturnType<typeof useInternshipReview>;

const Ctx = createContext<ReviewApi | null>(null);

export const ReviewProvider: React.FC<{ value: ReviewApi; children: React.ReactNode }> = ({ value, children }) => (
  <Ctx.Provider value={value}>{children}</Ctx.Provider>
);

export function useReview(): ReviewApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useReview must be used within a ReviewProvider');
  return v;
}
