import React, { useEffect, useState, useCallback } from 'react';

interface Props { token: string; apiUrl: string; }

interface EnrollmentSummary { total: number; byStatus: Record<string, number>; }
interface StudentProgress {
  enrollment_id: string; name: string; email: string; company: string;
  status: string; lessonsCompleted: number; lessonsTotal: number; pct: number;
}
interface SkillMasteryRow {
  skill_id: string; name: string; layer_id: string; domain_id: string;
  studentsTracked: number; avgLevel: number;
}
interface ArtifactTrackerData {
  artifacts: { id: string; name: string; artifact_type: string }[];
  students: { enrollment_id: string; name: string; email: string; submissions: Record<string, boolean> }[];
}

const statusBadge: Record<string, string> = {
  active: 'bg-success', completed: 'bg-primary', withdrawn: 'bg-danger', suspended: 'bg-warning text-dark',
};

const AnalyticsTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [subTab, setSubTab] = useState<'students' | 'skills' | 'artifacts'>('students');
  const [summary, setSummary] = useState<EnrollmentSummary | null>(null);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [skills, setSkills] = useState<SkillMasteryRow[]>([]);
  const [artifactData, setArtifactData] = useState<ArtifactTrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/analytics/program/summary`, { headers });
      if (res.ok) setSummary(await res.json());
    } catch (err: any) { setError(err.message); }
  }, [token, apiUrl]);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/analytics/program/student-progress`, { headers });
      if (res.ok) setStudents(await res.json());
    } catch (err: any) { setError(err.message); }
  }, [token, apiUrl]);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/analytics/program/skill-mastery`, { headers });
      if (res.ok) setSkills(await res.json());
    } catch (err: any) { setError(err.message); }
  }, [token, apiUrl]);

  const fetchArtifacts = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/analytics/program/artifact-tracker`, { headers });
      if (res.ok) setArtifactData(await res.json());
    } catch (err: any) { setError(err.message); }
  }, [token, apiUrl]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSummary(), fetchStudents()])
      .finally(() => setLoading(false));
  }, [fetchSummary, fetchStudents]);

  useEffect(() => {
    if (subTab === 'skills' && skills.length === 0) fetchSkills();
    if (subTab === 'artifacts' && !artifactData) fetchArtifacts();
  }, [subTab]);

  const activeCount = summary?.byStatus?.active || 0;
  const avgPct = students.length > 0 ? Math.round(students.reduce((a, s) => a + s.pct, 0) / students.length) : 0;

  if (loading) return (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
    </div>
  );

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}

      {/* Summary Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm text-center p-3">
            <div className="fw-bold" style={{ fontSize: 28, color: 'var(--color-primary, #1a365d)' }}>
              {summary?.total || 0}
            </div>
            <div className="text-muted small">Total Enrollments</div>
            <div className="mt-1" style={{ fontSize: 10 }}>
              {summary && Object.entries(summary.byStatus).map(([status, count]) => (
                <span key={status} className={`badge ${statusBadge[status] || 'bg-secondary'} me-1`} style={{ fontSize: 9 }}>
                  {count} {status}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm text-center p-3">
            <div className="fw-bold" style={{ fontSize: 28, color: 'var(--color-accent, #38a169)' }}>
              {activeCount}
            </div>
            <div className="text-muted small">Active Students</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm text-center p-3">
            <div className="fw-bold" style={{ fontSize: 28, color: 'var(--color-primary-light, #2b6cb0)' }}>
              {avgPct}%
            </div>
            <div className="text-muted small">Avg Completion</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm text-center p-3">
            <div className="fw-bold" style={{ fontSize: 28, color: 'var(--color-secondary, #e53e3e)' }}>
              {skills.length || '...'}
            </div>
            <div className="text-muted small">Skills Tracked</div>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <ul className="nav nav-pills mb-3">
        {(['students', 'skills', 'artifacts'] as const).map(tab => (
          <li key={tab} className="nav-item">
            <button className={`nav-link ${subTab === tab ? 'active' : ''}`}
              onClick={() => setSubTab(tab)} style={{ fontSize: 13 }}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          </li>
        ))}
      </ul>

      {/* Students sub-tab */}
      {subTab === 'students' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between" style={{ fontSize: 14 }}>
            <span>Student Progress</span>
            <span className="badge bg-info" style={{ fontSize: 11 }}>{students.length} students</span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead className="table-light">
                <tr>
                  <th style={{ fontSize: 12 }}>Name</th>
                  <th style={{ fontSize: 12 }}>Email</th>
                  <th style={{ fontSize: 12 }}>Company</th>
                  <th style={{ fontSize: 12 }}>Status</th>
                  <th style={{ fontSize: 12 }}>Progress</th>
                  <th style={{ fontSize: 12, width: 60 }}>%</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.enrollment_id}>
                    <td className="fw-medium">{s.name}</td>
                    <td style={{ fontSize: 12 }}>{s.email}</td>
                    <td style={{ fontSize: 12 }}>{s.company || '-'}</td>
                    <td>
                      <span className={`badge ${statusBadge[s.status] || 'bg-secondary'}`} style={{ fontSize: 10 }}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div className="progress flex-grow-1" style={{ height: 6 }}>
                          <div className="progress-bar bg-success" style={{ width: `${s.pct}%` }} />
                        </div>
                        <span style={{ fontSize: 11, minWidth: 50 }}>{s.lessonsCompleted}/{s.lessonsTotal}</span>
                      </div>
                    </td>
                    <td className="fw-medium">{s.pct}%</td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted py-4">No enrollments found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Skills sub-tab */}
      {subTab === 'skills' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between" style={{ fontSize: 14 }}>
            <span>Skill Mastery Overview</span>
            <span className="badge bg-info" style={{ fontSize: 11 }}>{skills.length} skills</span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead className="table-light">
                <tr>
                  <th style={{ fontSize: 12 }}>Skill ID</th>
                  <th style={{ fontSize: 12 }}>Name</th>
                  <th style={{ fontSize: 12 }}>Layer</th>
                  <th style={{ fontSize: 12 }}>Domain</th>
                  <th style={{ fontSize: 12 }}>Students Tracked</th>
                  <th style={{ fontSize: 12 }}>Avg Level</th>
                </tr>
              </thead>
              <tbody>
                {skills.map(s => (
                  <tr key={s.skill_id}>
                    <td className="font-monospace" style={{ fontSize: 11 }}>{s.skill_id}</td>
                    <td className="fw-medium">{s.name}</td>
                    <td><span className="badge bg-secondary" style={{ fontSize: 10 }}>{s.layer_id}</span></td>
                    <td style={{ fontSize: 12 }}>{s.domain_id}</td>
                    <td>{s.studentsTracked}</td>
                    <td>
                      <span className={`badge ${s.avgLevel >= 3 ? 'bg-success' : s.avgLevel >= 1 ? 'bg-warning text-dark' : 'bg-secondary'}`}
                        style={{ fontSize: 10 }}>
                        {s.avgLevel}
                      </span>
                    </td>
                  </tr>
                ))}
                {skills.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted py-4">No skill mastery data yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Artifacts sub-tab */}
      {subTab === 'artifacts' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between" style={{ fontSize: 14 }}>
            <span>Artifact Submissions</span>
            <span className="badge bg-info" style={{ fontSize: 11 }}>
              {artifactData?.artifacts.length || 0} artifacts
            </span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 12 }}>
              <thead className="table-light">
                <tr>
                  <th style={{ fontSize: 11, position: 'sticky', left: 0, backgroundColor: '#f8f9fa', zIndex: 1 }}>Student</th>
                  {artifactData?.artifacts.map(a => (
                    <th key={a.id} style={{ fontSize: 10, writingMode: 'vertical-rl', textOrientation: 'mixed', maxWidth: 30, whiteSpace: 'nowrap' }}>
                      {a.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {artifactData?.students.map(s => (
                  <tr key={s.enrollment_id}>
                    <td className="fw-medium" style={{ position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 1, fontSize: 11 }}>
                      {s.name}
                    </td>
                    {artifactData.artifacts.map(a => (
                      <td key={a.id} className="text-center">
                        {s.submissions[a.id]
                          ? <span className="text-success" style={{ fontSize: 14 }}>&#10003;</span>
                          : <span className="text-muted" style={{ fontSize: 14 }}>&#8212;</span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
                {(!artifactData || artifactData.students.length === 0) && (
                  <tr>
                    <td colSpan={(artifactData?.artifacts.length || 0) + 1} className="text-center text-muted py-4">
                      No artifact submission data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsTab;
