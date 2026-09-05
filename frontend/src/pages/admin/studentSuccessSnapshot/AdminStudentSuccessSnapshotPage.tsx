import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader, StatCard } from '../../../components/admin/shell';
import { fetchStudentSuccessSnapshot, StudentSuccessSnapshot } from '../../../services/studentSuccessSnapshotApi';
import CategorySection from './fieldStatus';
import {
  renderAssessmentTrend, renderArtifactsEvidence, renderAttendance, renderCertReadiness,
  renderCommunityActivity, renderCompetencyEvidence, renderIdentity, renderInstructorFeedback,
  renderPreviousReeseCommunications, renderProjectProgress, renderReflectionCompletion,
  renderTicketsInterventions, renderTimelineProgress,
} from './categoryRenderers';

/**
 * Student Success 360 — Reese Agentic AI Employee mission, Checkpoint C's
 * admin drill-down. Renders every one of getStudentSuccessSnapshot()'s 15
 * categories exactly as reported: a genuinely 'known' field shows its real
 * value, anything else (unknown/not_applicable/stale/quarantined/conflicting)
 * shows an honest status badge and reason — this page never fills a gap with
 * a guess. Reached from PersonHistoryDrawer's "Full Success 360" link.
 */
export default function AdminStudentSuccessSnapshotPage() {
  const { id } = useParams<{ id: string }>();
  const [snapshot, setSnapshot] = useState<StudentSuccessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    setLoading(true);
    setNotFound(false);
    fetchStudentSuccessSnapshot(id)
      .then((data) => { if (live) setSnapshot(data); })
      .catch((err) => { if (live) { if (err?.response?.status === 404) setNotFound(true); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading student success snapshot…</span></div></div>;
  }

  if (notFound || !snapshot) {
    return (
      <>
        <PageHeader title="Student Success 360" breadcrumb={[{ label: 'Accelerator', to: '/admin/accelerator' }, { label: 'Not found' }]} />
        <div className="text-muted py-5 text-center">No enrollment found for this id.</div>
      </>
    );
  }

  const name = snapshot.identity.value?.fullName ?? 'Student';
  const cohort = snapshot.identity.value?.cohortName;

  return (
    <>
      <PageHeader
        title={name}
        subtitle={cohort ? `${cohort} · Student Success 360` : 'Student Success 360'}
        breadcrumb={[{ label: 'Accelerator', to: '/admin/accelerator' }, { label: name }]}
      >
        <div className="row g-3">
          <div className="col-6 col-md-3">
            <StatCard label="Attendance" value={snapshot.attendance.value ? `${Math.round(snapshot.attendance.value.attendancePct ?? 0)}%` : '—'} icon="calendar-check-line" tone="info" />
          </div>
          <div className="col-6 col-md-3">
            <StatCard label="Open tickets" value={snapshot.ticketsInterventions.value?.openCount ?? '—'} icon="ticket-line" tone={snapshot.ticketsInterventions.value?.openCount ? 'warning' : 'success'} />
          </div>
          <div className="col-6 col-md-3">
            <StatCard label="Cert readiness" value={snapshot.certReadiness.value?.overallState.replace('_', ' ') ?? 'Not measured'} icon="award-line" tone="primary" />
          </div>
          <div className="col-6 col-md-3">
            <StatCard label="Reese messages" value={snapshot.previousReeseCommunications.value?.messageCount ?? '—'} icon="chat-3-line" tone="neutral" />
          </div>
        </div>
      </PageHeader>

      <div className="row g-3">
        <div className="col-md-6"><CategorySection title="Identity & Cohort" icon="user-line" field={snapshot.identity} renderKnown={renderIdentity} /></div>
        <div className="col-md-6"><CategorySection title="Attendance" icon="calendar-check-line" field={snapshot.attendance} renderKnown={renderAttendance} /></div>
        <div className="col-md-6"><CategorySection title="Timeline Progress" icon="road-map-line" field={snapshot.timelineProgress} renderKnown={renderTimelineProgress} /></div>
        <div className="col-md-6"><CategorySection title="Assessment Trend" icon="line-chart-line" field={snapshot.assessmentTrend} renderKnown={renderAssessmentTrend} /></div>
        <div className="col-md-6"><CategorySection title="Reflection Completion" icon="quill-pen-line" field={snapshot.reflectionCompletion} renderKnown={renderReflectionCompletion} /></div>
        <div className="col-md-6"><CategorySection title="Competency Evidence" icon="stack-line" field={snapshot.competencyEvidence} renderKnown={renderCompetencyEvidence} /></div>
        <div className="col-md-6"><CategorySection title="Project Progress" icon="git-branch-line" field={snapshot.projectProgress} renderKnown={renderProjectProgress} /></div>
        <div className="col-md-6"><CategorySection title="Certification Readiness" icon="award-line" field={snapshot.certReadiness} renderKnown={renderCertReadiness} /></div>
        <div className="col-md-6"><CategorySection title="Artifacts & Evidence" icon="folder-check-line" field={snapshot.artifactsEvidence} renderKnown={renderArtifactsEvidence} /></div>
        <div className="col-md-6"><CategorySection title="Community Activity" icon="group-line" field={snapshot.communityActivity} renderKnown={renderCommunityActivity} /></div>
        <div className="col-md-6"><CategorySection title="Tickets & Interventions" icon="ticket-line" field={snapshot.ticketsInterventions} renderKnown={renderTicketsInterventions} /></div>
        <div className="col-md-6"><CategorySection title="Previous Reese Communications" icon="chat-3-line" field={snapshot.previousReeseCommunications} renderKnown={renderPreviousReeseCommunications} /></div>
        <div className="col-md-6"><CategorySection title="Instructor Feedback" icon="chat-check-line" field={snapshot.instructorFeedback} renderKnown={renderInstructorFeedback} /></div>
        <div className="col-md-6"><CategorySection title="Agreed Next Steps" icon="checkbox-circle-line" field={snapshot.agreedNextSteps} renderKnown={() => null} /></div>
      </div>
    </>
  );
}
