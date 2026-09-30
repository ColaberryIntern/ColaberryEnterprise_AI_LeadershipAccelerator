import React from 'react';
import { ClassActivityPanel, CurriculumPanel } from '../../../adminOs/personTypes';
import { EmptyPanel, Stat, StatusBars, fmtDate, fmtDateTime } from './primitives';

/**
 * Class activity and curriculum usage — what an enrolled person actually did.
 *
 * The 360 could previously say somebody was enrolled and could not say whether
 * they had ever turned up or opened a single card. These two panels are the
 * answer, and they are deliberately on one tab: attendance without curriculum
 * progress reads as disengagement when it often means the cohort simply never
 * took a register.
 */
export default function ClassActivityTab({ classActivity, curriculum }: {
  classActivity: ClassActivityPanel | null | undefined;
  curriculum: CurriculumPanel | null | undefined;
}) {
  if (!classActivity && !curriculum) {
    return <EmptyPanel>No enrolment, so there is no class or curriculum activity to show.</EmptyPanel>;
  }

  return (
    <>
      {classActivity && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Class attendance</div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <Stat
                label="Attendance rate"
                value={classActivity.attendanceRate === null ? null : `${classActivity.attendanceRate}%`}
                tone={classActivity.attendanceRate !== null && classActivity.attendanceRate < 60 ? 'danger' : undefined}
                hint={classActivity.attendanceTotal > 0
                  ? `across ${classActivity.attendanceTotal} recorded sessions`
                  : 'no register taken'}
              />
              <Stat label="Live-room events" value={classActivity.presenceEvents} hint="joins and leaves" />
              <Stat label="Polls answered" value={classActivity.pollResponses} />
              <Stat label="Pulse checks" value={classActivity.pulseChecks} />
            </div>

            <div className="mb-3">
              <StatusBars rows={classActivity.attendanceByStatus} total={classActivity.attendanceTotal} />
            </div>

            {classActivity.lastSeenInClass && (
              <p className="text-muted small mb-3">
                Last seen in a live room {fmtDateTime(classActivity.lastSeenInClass)}.
              </p>
            )}

            {classActivity.recentSessions.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-hover table-sm mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Session</th><th>Date</th><th>Status</th><th className="text-end">Minutes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classActivity.recentSessions.map((s, i) => (
                      <tr key={`${s.title ?? 'session'}-${i}`}>
                        <td>{s.title ?? <span className="text-muted">Untitled session</span>}</td>
                        <td className="text-muted small">{fmtDate(s.sessionDate) ?? '—'}</td>
                        <td>
                          <span className={`badge bg-${
                            s.status === 'present' ? 'success' : s.status === 'late' ? 'warning' : 'danger'
                          }-subtle text-${
                            s.status === 'present' ? 'success' : s.status === 'late' ? 'warning' : 'danger'
                          }-emphasis`}>
                            {s.status ?? 'unknown'}
                          </span>
                        </td>
                        <td className="text-end">{s.durationMinutes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyPanel>
                No attendance was recorded for this person. That is a gap in the register,
                not evidence they did not attend.
              </EmptyPanel>
            )}
          </div>
        </div>
      )}

      {curriculum && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Curriculum usage</div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <Stat
                label="Cards completed"
                value={curriculum.completed.toLocaleString()}
                hint={`of ${curriculum.total.toLocaleString()} available to them`}
              />
              <Stat
                label="Completion"
                value={curriculum.completionRate === null ? null : `${curriculum.completionRate}%`}
              />
              <Stat label="Weeks touched" value={curriculum.weeksTouched} />
              <Stat
                label="Average quiz"
                value={curriculum.averageQuizScore}
                hint={curriculum.quizzesTaken > 0 ? `${curriculum.quizzesTaken} taken` : 'none taken'}
              />
            </div>

            <div className="mb-3">
              <StatusBars rows={curriculum.byStatus} total={curriculum.total} />
            </div>

            <div className="row g-3">
              <div className="col-md-6">
                <div className="border rounded p-3 h-100">
                  <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                    Last completed
                  </div>
                  {curriculum.lastCompleted ? (
                    <>
                      <div className="fw-medium">{curriculum.lastCompleted.title ?? 'Untitled card'}</div>
                      <div className="text-muted small">
                        {curriculum.lastCompleted.type ?? 'card'}
                        {curriculum.lastCompleted.week !== null && ` · week ${curriculum.lastCompleted.week}`}
                        {curriculum.lastCompleted.at && ` · ${fmtDate(curriculum.lastCompleted.at)}`}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted small">Nothing completed yet.</span>
                  )}
                </div>
              </div>
              <div className="col-md-6">
                <div className="border rounded p-3 h-100">
                  <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                    Written work
                  </div>
                  <div className="d-flex gap-4">
                    <div>
                      <div className="fs-5 fw-semibold">{curriculum.reflections}</div>
                      <div className="text-muted small">reflections</div>
                    </div>
                    <div>
                      <div className="fs-5 fw-semibold">{curriculum.surveys}</div>
                      <div className="text-muted small">surveys</div>
                    </div>
                    <div>
                      <div className="fs-5 fw-semibold">{curriculum.totalAttempts}</div>
                      <div className="text-muted small">quiz attempts</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
