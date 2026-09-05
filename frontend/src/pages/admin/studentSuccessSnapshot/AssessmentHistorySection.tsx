import React, { useEffect, useState } from 'react';
import { SectionCard, StatusBadge } from '../../../components/admin/shell';
import { Tone } from '../../../components/admin/shell/StatusBadge';
import { AssessmentStatus, fetchAssessmentHistory, StudentAssessment } from '../../../services/assessmentHistoryApi';

const STATUS_TONE: Record<AssessmentStatus, Tone> = {
  on_track: 'success', watch: 'warning', at_risk: 'warning', critical: 'danger', unknown: 'neutral',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function humanize(v: string | null): string {
  return v ? v.replace(/_/g, ' ') : '—';
}

const AssessmentRow: React.FC<{ assessment: StudentAssessment }> = ({ assessment }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-bottom py-2">
      <button
        type="button"
        className="btn btn-link p-0 text-decoration-none d-flex justify-content-between align-items-center w-100"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-start">
          <span className="fw-medium">{fmtDate(assessment.createdAt)}</span>
          <span className="text-muted small ms-2">confidence {assessment.confidenceScore}/100 ({humanize(assessment.confidenceBand)})</span>
        </span>
        <span className="d-flex gap-2 align-items-center">
          {assessment.requiresHumanReview && <span className="badge bg-danger-subtle text-danger border border-danger-subtle">Needs review</span>}
          <StatusBadge label={humanize(assessment.status)} tone={STATUS_TONE[assessment.status]} />
          <i className={`ri-arrow-${expanded ? 'up' : 'down'}-s-line`} aria-hidden="true"></i>
        </span>
      </button>
      {expanded && (
        <div className="mt-2 ps-2" style={{ fontSize: '0.85rem' }}>
          <div><span className="text-muted">Root cause:</span> {humanize(assessment.primaryRootCause)}{assessment.secondaryRootCause ? `, ${humanize(assessment.secondaryRootCause)}` : ''}</div>
          {assessment.recommendedIntervention && (
            <div className="mt-1"><span className="text-muted">Suggested approach:</span> {assessment.recommendedIntervention}</div>
          )}
          {assessment.supportingEvidence.length > 0 && (
            <div className="mt-2">
              <div className="text-muted small mb-1">Supporting evidence</div>
              <ul className="mb-0 ps-3">
                {assessment.supportingEvidence.map((e) => <li key={e.category}>{e.category}: {e.summary}</li>)}
              </ul>
            </div>
          )}
          {assessment.contradictingEvidence.length > 0 && (
            <div className="mt-2">
              <div className="text-muted small mb-1">Contradicting evidence</div>
              <ul className="mb-0 ps-3">
                {assessment.contradictingEvidence.map((e) => <li key={e.category}>{e.category}: {e.summary}</li>)}
              </ul>
            </div>
          )}
          {assessment.unansweredQuestions.length > 0 && (
            <div className="mt-2">
              <div className="text-muted small mb-1">Unanswered questions</div>
              <ul className="mb-0 ps-3">{assessment.unansweredQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          )}
          {assessment.model && (
            <div className="text-muted mt-2" style={{ fontSize: '0.72rem' }}>Model: {assessment.model} · Rules: {assessment.rulesVersion}</div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Assessment History — Reese Agentic AI Employee mission, Checkpoint D's
 * admin drill-down (the second of Ali's chosen "wire into Reese + admin
 * drill-down" pair, mirroring Checkpoint C's own two-step sequencing).
 * Self-fetching (independent of the parent page's own snapshot fetch) so a
 * slow/failed history load never blocks the rest of the page. Every run is
 * shown exactly as the engine reported it — a row's status/root-cause/
 * evidence is never summarized into something friendlier than what was
 * actually recorded, matching this whole page's own honesty contract.
 */
export default function AssessmentHistorySection({ enrollmentId }: { enrollmentId: string }) {
  const [assessments, setAssessments] = useState<StudentAssessment[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchAssessmentHistory(enrollmentId)
      .then((data) => { if (live) setAssessments(data); })
      .catch(() => { if (live) setAssessments([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [enrollmentId]);

  return (
    <SectionCard title="Assessment History" icon="pulse-line">
      {loading ? (
        <div className="text-muted small">Loading assessment history…</div>
      ) : !assessments || assessments.length === 0 ? (
        <div className="text-muted small">No assessments have been run for this student yet.</div>
      ) : (
        <div>{assessments.map((a) => <AssessmentRow key={a.id} assessment={a} />)}</div>
      )}
    </SectionCard>
  );
}
