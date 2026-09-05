import React from 'react';
import { StatusBadge } from '../../../components/admin/shell';
import {
  AssessmentTrendValue, AttendanceValue, ArtifactsEvidenceValue, CertReadinessValue,
  CommunityActivityValue, CompetencyEvidenceValue, IdentityValue, InstructorFeedbackValue,
  PreviousReeseCommunicationsValue, ProjectProgressValue, ReflectionCompletionValue,
  TicketsInterventionsValue, TimelineProgressValue,
} from '../../../services/studentSuccessSnapshotApi';

// Small shared presentational pieces — the label/value row and a chip list
// repeat across every category's real-value rendering below.
export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="d-flex justify-content-between py-1" style={{ fontSize: '0.85rem' }}>
    <span className="text-muted">{label}</span>
    <span className="fw-medium text-end">{children}</span>
  </div>
);

export const ChipList: React.FC<{ items: string[]; emptyLabel?: string }> = ({ items, emptyLabel }) => (
  items.length === 0
    ? <span className="text-muted small">{emptyLabel ?? 'None'}</span>
    : <div className="d-flex flex-wrap gap-1">{items.map((i) => <span key={i} className="badge bg-light text-dark border">{i}</span>)}</div>
);

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n)}%`;
}

export function renderIdentity(v: IdentityValue): React.ReactNode {
  return (
    <>
      <Row label="Status">{v.status ?? '—'}</Row>
      <Row label="Cohort">{v.cohortName ?? '—'}</Row>
    </>
  );
}

export function renderAttendance(v: AttendanceValue): React.ReactNode {
  return (
    <>
      <Row label="Sessions attended">{v.sessionsPresent} / {v.sessionsHeldSoFar}</Row>
      <Row label="Attendance rate">{pct(v.attendancePct)}</Row>
    </>
  );
}

export function renderTimelineProgress(v: TimelineProgressValue): React.ReactNode {
  return (
    <>
      <Row label="Cards completed">{v.cardsCompleted} / {v.totalCardsSeen}</Row>
      <Row label="Last activity">{fmtDate(v.lastActivityAt)}</Row>
    </>
  );
}

const TREND_ICON: Record<AssessmentTrendValue['trend'], string> = { up: 'arrow-up-line', down: 'arrow-down-line', flat: 'arrow-right-line' };
const TREND_TONE: Record<AssessmentTrendValue['trend'], 'success' | 'danger' | 'neutral'> = { up: 'success', down: 'danger', flat: 'neutral' };

export function renderAssessmentTrend(v: AssessmentTrendValue): React.ReactNode {
  return (
    <>
      <Row label="Evaluations taken">{v.evalsTaken}</Row>
      <Row label="Passed">{v.evalsPassed}</Row>
      <Row label="Average score">{pct(v.avgEvalPct)}</Row>
      <Row label="Trend"><i className={`ri-${TREND_ICON[v.trend]} me-1`} aria-hidden="true"></i><span className={`text-${TREND_TONE[v.trend]}`}>{v.trend}</span></Row>
      {v.weakCompetencies.length > 0 && (
        <div className="mt-2"><div className="text-muted small mb-1">Weak competencies</div><ChipList items={v.weakCompetencies} /></div>
      )}
    </>
  );
}

export function renderReflectionCompletion(v: ReflectionCompletionValue): React.ReactNode {
  return (
    <>
      <Row label="Reflections submitted">{v.count}</Row>
      <Row label="Last submitted">{fmtDate(v.lastSubmittedAt)}</Row>
      <Row label="Last readiness score">{v.lastReadiness == null ? '—' : v.lastReadiness}</Row>
    </>
  );
}

export function renderCompetencyEvidence(v: CompetencyEvidenceValue): React.ReactNode {
  if (v.domains.length === 0) return <div className="text-muted small">No competency domains recorded yet.</div>;
  return (
    <div className="d-flex flex-column gap-2">
      {v.domains.map((d) => (
        <div key={d.domainId} className="d-flex justify-content-between align-items-center" style={{ fontSize: '0.85rem' }}>
          <span>{d.domainName}</span>
          <span className="text-muted">{Math.round(d.confidence)}% confidence · {d.evidenceCount} evidence item{d.evidenceCount === 1 ? '' : 's'}</span>
        </div>
      ))}
    </div>
  );
}

export function renderProjectProgress(v: ProjectProgressValue): React.ReactNode {
  return (
    <>
      <Row label="Project">{v.name ?? '—'}</Row>
      <Row label="Stage">{v.stage ?? '—'}</Row>
      <Row label="Requirements complete">{pct(v.requirementsCompletionPct)}</Row>
      <Row label="Repo connected">{v.repoConnected ? 'Yes' : 'No'}</Row>
      <Row label="Stories (verified / total)">{v.verifiedStories} / {v.totalStories}</Row>
    </>
  );
}

const CERT_STATE_TONE: Record<CertReadinessValue['overallState'], 'neutral' | 'warning' | 'info' | 'success'> = {
  not_measured: 'neutral', building: 'warning', approaching: 'info', sustained: 'success',
};

export function renderCertReadiness(v: CertReadinessValue): React.ReactNode {
  return (
    <>
      <Row label="Readiness"><StatusBadge label={v.overallState.replace('_', ' ')} tone={CERT_STATE_TONE[v.overallState]} /></Row>
      <Row label="Overall score">{v.overallScaled == null ? '—' : `${Math.round(v.overallScaled)}/100`}</Row>
      <Row label="Knowledge score">{v.knowledgeScaled == null ? '—' : `${Math.round(v.knowledgeScaled)}/100`}</Row>
      <Row label="Evidence coverage">{pct(v.evidenceCoveragePct)}</Row>
      {!v.weightsAvailable && <div className="text-muted small fst-italic mt-1">Coverage estimate, not exam-weighted.</div>}
    </>
  );
}

export function renderArtifactsEvidence(v: ArtifactsEvidenceValue): React.ReactNode {
  const bySource = Object.entries(v.bySourceType);
  return (
    <>
      <Row label="Validated artifacts">{v.totalValidated}</Row>
      {bySource.length > 0 && (
        <div className="mt-2">
          <div className="text-muted small mb-1">By source</div>
          {bySource.map(([source, count]) => <Row key={source} label={source}>{count}</Row>)}
        </div>
      )}
    </>
  );
}

export function renderCommunityActivity(v: CommunityActivityValue): React.ReactNode {
  return (
    <>
      <Row label="Posts">{v.postCount}</Row>
      <Row label="Likes received">{v.totalLikesReceived}</Row>
      <Row label="Comments received">{v.totalCommentsReceived}</Row>
      <Row label="Community points">{v.communityPoints}</Row>
      <Row label="Community level">{v.communityLevel}</Row>
    </>
  );
}

const TICKET_STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = { done: 'success', backlog: 'warning' };

export function renderTicketsInterventions(v: TicketsInterventionsValue): React.ReactNode {
  return (
    <>
      <Row label="Open tickets">{v.openCount}</Row>
      <Row label="Total tickets">{v.totalCount}</Row>
      {v.recentTickets.length > 0 && (
        <div className="mt-2 d-flex flex-column gap-1">
          {v.recentTickets.map((t) => (
            <div key={t.id} className="d-flex justify-content-between align-items-center" style={{ fontSize: '0.82rem' }}>
              <span className="text-truncate" style={{ maxWidth: '65%' }} title={t.title}>{t.title}</span>
              <StatusBadge label={t.status} tone={TICKET_STATUS_TONE[t.status] ?? 'neutral'} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function renderPreviousReeseCommunications(v: PreviousReeseCommunicationsValue): React.ReactNode {
  return (
    <>
      <Row label="Messages exchanged">{v.messageCount}</Row>
      <Row label="Last message">{fmtDate(v.lastMessageAt)}</Row>
    </>
  );
}

export function renderInstructorFeedback(v: InstructorFeedbackValue): React.ReactNode {
  return (
    <>
      <Row label="Released feedback items">{v.releasedCount}</Row>
      <Row label="Last released">{fmtDate(v.lastReleasedAt)}</Row>
      <Row label="Average confidence">{v.avgConfidence == null ? '—' : `${Math.round(v.avgConfidence)}%`}</Row>
    </>
  );
}
