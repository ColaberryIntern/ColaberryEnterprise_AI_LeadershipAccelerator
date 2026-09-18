import React from 'react';
import { StatCard } from '../../../components/admin/shell';
import InternshipProjectAuthor from '../components/InternshipProjectAuthor';
import { useReview } from './reviewContext';
import { StandingBadge } from './badges';

const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' };

/**
 * Activity & Project tab — what the intern is doing: training (weeks 1-3 gate),
 * project (author it when there's none, review it with AI when there is), cert
 * prep and case studies. Read-only reads; the project author is the one place
 * that writes, and it does so in its own step rather than nested four levels deep.
 */
const TabActivity: React.FC = () => {
  const r = useReview();
  const { activity, activityError, selected } = r;

  if (activityError) return <div className="alert alert-warning py-2 mb-0" role="alert">{activityError}</div>;
  if (!activity) return <p className="text-muted mb-0">Loading activity…</p>;

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap gap-2">
        <div style={{ flex: '1 1 150px' }}>
          <StatCard label="Training" value={activity.training ? `${activity.training.first_three_weeks.done}/${activity.training.first_three_weeks.total}` : '—'} unit="weeks" icon="graduation-cap-line" tone={activity.training?.first_three_weeks.ready ? 'success' : 'warning'} hint="Weeks 1-3" />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <StatCard label="Stories verified" value={activity.project ? `${activity.project.verified_stories}/${activity.project.total_stories}` : '—'} icon="check-double-line" tone="info" hint={activity.project ? (activity.project.stage ?? 'project') : 'no project'} />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <StatCard label="Cert readiness" value={activity.cert_prep ? (activity.cert_prep.overall_scaled ?? activity.cert_prep.state.replace(/_/g, ' ')) : '—'} icon="award-line" tone="neutral" hint="Certification" />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <StatCard label="Sessions attended" value={activity.attendance.total} icon="calendar-check-line" tone={activity.attendance.total > 0 ? 'success' : 'neutral'} hint={activity.attendance.last_attended_at ? `last ${new Date(activity.attendance.last_attended_at).toLocaleDateString()}` : 'none yet'} />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <StatCard label="Full profile" value="Success 360" icon="dashboard-line" tone="primary" to={`/admin/accelerator/enrollments/${activity.enrollment_id}/success-snapshot`} hint="Open dashboard" />
        </div>
      </div>

      {/* Training — the first-3-weeks gate */}
      <div>
        <div className="d-flex align-items-center gap-2 mb-2">
          <span className="text-muted" style={eyebrow}>Training (weeks 1-3)</span>
          {activity.training ? (
            <span className="badge" style={{ background: activity.training.first_three_weeks.ready ? '#2e7d5b' : '#a8690f', color: '#fff', fontSize: 11, fontWeight: 600 }}>
              {activity.training.first_three_weeks.ready ? 'Ready for a project' : `${activity.training.first_three_weeks.done} of ${activity.training.first_three_weeks.total} weeks done`}
            </span>
          ) : <span className="text-muted" style={{ fontSize: 12 }}>no training data yet</span>}
        </div>
        {activity.training && (
          <div className="d-flex flex-column gap-1">
            {activity.training.weeks.filter((w) => w.week >= 1 && w.week <= 3).map((w) => (
              <div key={w.week} className="d-flex align-items-center gap-2" style={{ fontSize: 13.5 }}>
                <span aria-hidden="true" style={{ flex: 'none', width: 10, height: 10, borderRadius: '50%', background: w.done ? '#2e7d5b' : '#cbd5e0' }} />
                <span style={{ minWidth: 56 }}>Week {w.week}</span>
                <div style={{ flex: '1 1 auto', maxWidth: 180, height: 6, background: '#eef1f4', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.max(0, w.completed_pct))}%`, height: '100%', background: w.done ? '#2e7d5b' : '#a8690f' }} />
                </div>
                <span className="text-muted" style={{ whiteSpace: 'nowrap' }}>{w.completed}/{w.published} ({w.completed_pct}%)</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Project */}
      <div>
        <div className="text-muted mb-1" style={eyebrow}>Project</div>
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
        ) : <span className="text-muted" style={{ fontSize: 13.5 }}>No project assigned yet.</span>}

        {!activity.project && selected && (
          <InternshipProjectAuthor applicationId={selected} onAuthored={r.reloadActivity} />
        )}

        {activity.project && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid #f1f3f5' }}>
            <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
              <button type="button" className="btn btn-sm btn-dark" onClick={r.runProjectReview} disabled={r.reviewing}>
                {r.reviewing ? 'Reading the build…' : r.review ? 'Re-run review' : 'Review with AI'}
              </button>
              <span className="text-muted" style={{ fontSize: 12.5 }}>A management read of where the build stands — or ask a question below.</span>
            </div>
            <input
              type="text"
              className="form-control form-control-sm mb-2"
              style={{ maxWidth: 480 }}
              placeholder="Ask about the project (optional), e.g. is the data pipeline actually built?"
              value={r.reviewQuestion}
              onChange={(e) => r.setReviewQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); r.runProjectReview(); } }}
              disabled={r.reviewing}
            />
            {r.review && r.review.has_project && (
              <div className="d-flex flex-column gap-2">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <StandingBadge value={r.review.standing} />
                  {!r.review.model_generated && (
                    <span className="badge bg-secondary" title="The language model was unavailable; showing the deterministic facts only.">facts only</span>
                  )}
                </div>
                <p className="mb-0" style={{ fontSize: 14, lineHeight: 1.55 }}>{r.review.summary}</p>
                {r.review.answer && <p className="mb-0" style={{ fontSize: 13.5, lineHeight: 1.55 }}><strong>Answer:</strong> {r.review.answer}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cert prep + case studies */}
      <div className="d-flex flex-wrap gap-4">
        <div>
          <div className="text-muted mb-1" style={eyebrow}>Cert prep</div>
          <span style={{ fontSize: 13.5 }}>
            {activity.cert_prep
              ? `${activity.cert_prep.state.replace(/_/g, ' ')}${activity.cert_prep.overall_scaled != null ? ` · ${activity.cert_prep.overall_scaled}` : ''}`
              : <span className="text-muted">Not measured yet.</span>}
          </span>
        </div>
        <div>
          <div className="text-muted mb-1" style={eyebrow}>Case studies</div>
          {activity.case_studies.length === 0
            ? <span className="text-muted" style={{ fontSize: 13.5 }}>None yet.</span>
            : (
              <ul className="mb-0" style={{ fontSize: 13.5 }}>
                {activity.case_studies.map((c) => <li key={c.id}>{c.title} <span className="text-muted">({c.status})</span></li>)}
              </ul>
            )}
        </div>
      </div>
    </div>
  );
};

export default TabActivity;
