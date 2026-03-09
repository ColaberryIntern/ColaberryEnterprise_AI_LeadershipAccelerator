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

// Drill-down detail interfaces
interface LessonDetail {
  lesson_id: string; lesson_title: string; module_name: string;
  status: string; started_at: string | null; completed_at: string | null;
}
interface SkillDetail {
  skill_id: string; skill_name: string; layer_id: string;
  proficiency_level: number; assessed_at: string | null;
}
interface ArtifactDetail {
  artifact_id: string; artifact_name: string; artifact_type: string;
  submitted: boolean; status: string | null; submitted_at: string | null;
}
interface StudentDetailData {
  info: { enrollment_id: string; name: string; email: string; company: string; status: string };
  lessonProgress: LessonDetail[];
  skillMastery: SkillDetail[];
  artifactSubmissions: ArtifactDetail[];
}
interface SkillDetailData {
  info: { skill_id: string; name: string; layer_id: string; domain_id: string; description: string };
  students: { enrollment_id: string; name: string; proficiency_level: number; assessed_at: string | null }[];
}

const statusBadge: Record<string, string> = {
  active: 'bg-success', completed: 'bg-primary', withdrawn: 'bg-danger', suspended: 'bg-warning text-dark',
};
const lessonStatusBadge: Record<string, string> = {
  completed: 'bg-success', in_progress: 'bg-info', not_started: 'bg-secondary', locked: 'bg-dark',
};

const AnalyticsTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [subTab, setSubTab] = useState<'students' | 'skills' | 'artifacts'>('students');
  const [summary, setSummary] = useState<EnrollmentSummary | null>(null);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [skills, setSkills] = useState<SkillMasteryRow[]>([]);
  const [artifactData, setArtifactData] = useState<ArtifactTrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Drill-down state
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentDetailData | null>(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [skillDetail, setSkillDetail] = useState<SkillDetailData | null>(null);
  const [skillDetailLoading, setSkillDetailLoading] = useState(false);

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

  // Drill-down fetchers
  const fetchStudentDetail = useCallback(async (enrollmentId: string) => {
    setStudentDetailLoading(true);
    setStudentDetail(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/analytics/program/student-detail/${enrollmentId}`, { headers });
      if (res.ok) setStudentDetail(await res.json());
    } catch (err: any) { setError(err.message); }
    setStudentDetailLoading(false);
  }, [token, apiUrl]);

  const fetchSkillDetail = useCallback(async (skillId: string) => {
    setSkillDetailLoading(true);
    setSkillDetail(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/analytics/program/skill-detail/${skillId}`, { headers });
      if (res.ok) setSkillDetail(await res.json());
    } catch (err: any) { setError(err.message); }
    setSkillDetailLoading(false);
  }, [token, apiUrl]);

  const toggleStudentExpand = (enrollmentId: string) => {
    if (expandedStudentId === enrollmentId) {
      setExpandedStudentId(null);
      setStudentDetail(null);
    } else {
      setExpandedStudentId(enrollmentId);
      fetchStudentDetail(enrollmentId);
    }
  };

  const toggleSkillExpand = (skillId: string) => {
    if (expandedSkillId === skillId) {
      setExpandedSkillId(null);
      setSkillDetail(null);
    } else {
      setExpandedSkillId(skillId);
      fetchSkillDetail(skillId);
    }
  };

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

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '-';

  // Proficiency level badge
  const profBadge = (level: number) => {
    if (level >= 4) return 'bg-success';
    if (level >= 3) return 'bg-info';
    if (level >= 2) return 'bg-warning text-dark';
    if (level >= 1) return 'bg-secondary';
    return 'bg-light text-muted border';
  };
  const profLabel = (level: number) => {
    if (level >= 4) return 'Expert';
    if (level >= 3) return 'Proficient';
    if (level >= 2) return 'Developing';
    if (level >= 1) return 'Beginner';
    return 'Not assessed';
  };

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

      {/* ==================== STUDENTS SUB-TAB ==================== */}
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
                  <th style={{ fontSize: 12, width: 30 }}></th>
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
                  <React.Fragment key={s.enrollment_id}>
                    <tr
                      onClick={() => toggleStudentExpand(s.enrollment_id)}
                      style={{ cursor: 'pointer' }}
                      className={expandedStudentId === s.enrollment_id ? 'table-active' : ''}
                    >
                      <td className="text-center" style={{ fontSize: 11 }}>
                        {expandedStudentId === s.enrollment_id ? '\u25BC' : '\u25B6'}
                      </td>
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

                    {/* Student Detail Expansion */}
                    {expandedStudentId === s.enrollment_id && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div style={{ backgroundColor: 'var(--color-bg-alt, #f7fafc)', borderTop: '2px solid var(--color-primary-light, #2b6cb0)' }}>
                            {studentDetailLoading ? (
                              <div className="text-center py-4">
                                <div className="spinner-border spinner-border-sm text-primary" role="status">
                                  <span className="visually-hidden">Loading...</span>
                                </div>
                                <span className="ms-2 text-muted small">Loading student details...</span>
                              </div>
                            ) : studentDetail ? (
                              <div className="p-3">
                                {/* Three-column detail layout */}
                                <div className="row g-3">

                                  {/* Lesson Progress Column */}
                                  <div className="col-md-5">
                                    <div className="card border-0 shadow-sm h-100">
                                      <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                                        <span className="fw-semibold" style={{ fontSize: 12 }}>Lesson Progress</span>
                                        <span className="badge bg-info" style={{ fontSize: 9 }}>
                                          {studentDetail.lessonProgress.filter(l => l.status === 'completed').length}/{studentDetail.lessonProgress.length}
                                        </span>
                                      </div>
                                      <div className="card-body p-0" style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                                          <thead className="table-light">
                                            <tr>
                                              <th style={{ fontSize: 10 }}>Lesson</th>
                                              <th style={{ fontSize: 10 }}>Module</th>
                                              <th style={{ fontSize: 10 }}>Status</th>
                                              <th style={{ fontSize: 10 }}>Completed</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {studentDetail.lessonProgress.map(l => (
                                              <tr key={l.lesson_id}>
                                                <td className="fw-medium">{l.lesson_title}</td>
                                                <td className="text-muted">{l.module_name}</td>
                                                <td>
                                                  <span className={`badge ${lessonStatusBadge[l.status] || 'bg-secondary'}`} style={{ fontSize: 9 }}>
                                                    {l.status}
                                                  </span>
                                                </td>
                                                <td className="text-muted">{formatDate(l.completed_at)}</td>
                                              </tr>
                                            ))}
                                            {studentDetail.lessonProgress.length === 0 && (
                                              <tr><td colSpan={4} className="text-center text-muted py-3">No lesson data</td></tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Skill Mastery Column */}
                                  <div className="col-md-3">
                                    <div className="card border-0 shadow-sm h-100">
                                      <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                                        <span className="fw-semibold" style={{ fontSize: 12 }}>Skills</span>
                                        <span className="badge bg-info" style={{ fontSize: 9 }}>
                                          {studentDetail.skillMastery.length}
                                        </span>
                                      </div>
                                      <div className="card-body p-0" style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                                          <thead className="table-light">
                                            <tr>
                                              <th style={{ fontSize: 10 }}>Skill</th>
                                              <th style={{ fontSize: 10 }}>Level</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {studentDetail.skillMastery.map(sk => (
                                              <tr key={sk.skill_id}>
                                                <td>
                                                  <div className="fw-medium">{sk.skill_name}</div>
                                                  <div className="text-muted" style={{ fontSize: 9 }}>{sk.layer_id}</div>
                                                </td>
                                                <td>
                                                  <span className={`badge ${profBadge(sk.proficiency_level)}`} style={{ fontSize: 9 }}>
                                                    {sk.proficiency_level} - {profLabel(sk.proficiency_level)}
                                                  </span>
                                                </td>
                                              </tr>
                                            ))}
                                            {studentDetail.skillMastery.length === 0 && (
                                              <tr><td colSpan={2} className="text-center text-muted py-3">No skill data</td></tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Artifact Submissions Column */}
                                  <div className="col-md-4">
                                    <div className="card border-0 shadow-sm h-100">
                                      <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                                        <span className="fw-semibold" style={{ fontSize: 12 }}>Artifacts</span>
                                        <span className="badge bg-info" style={{ fontSize: 9 }}>
                                          {studentDetail.artifactSubmissions.filter(a => a.submitted).length}/{studentDetail.artifactSubmissions.length}
                                        </span>
                                      </div>
                                      <div className="card-body p-0" style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                                          <thead className="table-light">
                                            <tr>
                                              <th style={{ fontSize: 10 }}>Artifact</th>
                                              <th style={{ fontSize: 10 }}>Type</th>
                                              <th style={{ fontSize: 10 }}>Status</th>
                                              <th style={{ fontSize: 10 }}>Date</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {studentDetail.artifactSubmissions.map(a => (
                                              <tr key={a.artifact_id}>
                                                <td className="fw-medium">{a.artifact_name}</td>
                                                <td>
                                                  <span className="badge bg-light text-muted border" style={{ fontSize: 9 }}>
                                                    {a.artifact_type}
                                                  </span>
                                                </td>
                                                <td>
                                                  {a.submitted ? (
                                                    <span className={`badge ${a.status === 'reviewed' ? 'bg-success' : 'bg-info'}`} style={{ fontSize: 9 }}>
                                                      {a.status || 'submitted'}
                                                    </span>
                                                  ) : (
                                                    <span className="badge bg-light text-muted border" style={{ fontSize: 9 }}>pending</span>
                                                  )}
                                                </td>
                                                <td className="text-muted">{formatDate(a.submitted_at)}</td>
                                              </tr>
                                            ))}
                                            {studentDetail.artifactSubmissions.length === 0 && (
                                              <tr><td colSpan={4} className="text-center text-muted py-3">No artifact data</td></tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>

                                </div>
                              </div>
                            ) : (
                              <div className="text-center text-muted py-4" style={{ fontSize: 12 }}>
                                Unable to load student details.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {students.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted py-4">No enrollments found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== SKILLS SUB-TAB ==================== */}
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
                  <th style={{ fontSize: 12, width: 30 }}></th>
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
                  <React.Fragment key={s.skill_id}>
                    <tr
                      onClick={() => toggleSkillExpand(s.skill_id)}
                      style={{ cursor: 'pointer' }}
                      className={expandedSkillId === s.skill_id ? 'table-active' : ''}
                    >
                      <td className="text-center" style={{ fontSize: 11 }}>
                        {expandedSkillId === s.skill_id ? '\u25BC' : '\u25B6'}
                      </td>
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

                    {/* Skill Detail Expansion */}
                    {expandedSkillId === s.skill_id && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div style={{ backgroundColor: 'var(--color-bg-alt, #f7fafc)', borderTop: '2px solid var(--color-primary-light, #2b6cb0)' }}>
                            {skillDetailLoading ? (
                              <div className="text-center py-4">
                                <div className="spinner-border spinner-border-sm text-primary" role="status">
                                  <span className="visually-hidden">Loading...</span>
                                </div>
                                <span className="ms-2 text-muted small">Loading skill details...</span>
                              </div>
                            ) : skillDetail ? (
                              <div className="p-3">
                                {skillDetail.info.description && (
                                  <p className="text-muted mb-3" style={{ fontSize: 12 }}>{skillDetail.info.description}</p>
                                )}
                                <div className="card border-0 shadow-sm">
                                  <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                                    <span className="fw-semibold" style={{ fontSize: 12 }}>Per-Student Mastery</span>
                                    <span className="badge bg-info" style={{ fontSize: 9 }}>
                                      {skillDetail.students.length} students
                                    </span>
                                  </div>
                                  <div className="card-body p-0" style={{ maxHeight: 250, overflowY: 'auto' }}>
                                    <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                                      <thead className="table-light">
                                        <tr>
                                          <th style={{ fontSize: 10 }}>Student</th>
                                          <th style={{ fontSize: 10 }}>Proficiency Level</th>
                                          <th style={{ fontSize: 10 }}>Last Assessed</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {skillDetail.students.map(st => (
                                          <tr key={st.enrollment_id}>
                                            <td className="fw-medium">{st.name}</td>
                                            <td>
                                              <div className="d-flex align-items-center gap-2">
                                                <div className="progress flex-grow-1" style={{ height: 6, maxWidth: 80 }}>
                                                  <div
                                                    className={`progress-bar ${profBadge(st.proficiency_level).replace('bg-', 'bg-')}`}
                                                    style={{ width: `${(st.proficiency_level / 5) * 100}%` }}
                                                  />
                                                </div>
                                                <span className={`badge ${profBadge(st.proficiency_level)}`} style={{ fontSize: 9 }}>
                                                  {st.proficiency_level} - {profLabel(st.proficiency_level)}
                                                </span>
                                              </div>
                                            </td>
                                            <td className="text-muted">{formatDate(st.assessed_at)}</td>
                                          </tr>
                                        ))}
                                        {skillDetail.students.length === 0 && (
                                          <tr><td colSpan={3} className="text-center text-muted py-3">No students tracked for this skill yet.</td></tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center text-muted py-4" style={{ fontSize: 12 }}>
                                Unable to load skill details.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {skills.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted py-4">No skill mastery data yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== ARTIFACTS SUB-TAB ==================== */}
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
                  <th style={{ fontSize: 11 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {artifactData?.students.map(s => {
                  const submittedCount = artifactData.artifacts.filter(a => s.submissions[a.id]).length;
                  return (
                    <tr
                      key={s.enrollment_id}
                      onClick={() => { setSubTab('students'); toggleStudentExpand(s.enrollment_id); }}
                      style={{ cursor: 'pointer' }}
                      title={`Click to see ${s.name}'s full detail`}
                    >
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
                      <td className="fw-medium text-center">
                        <span className={`badge ${submittedCount === artifactData.artifacts.length ? 'bg-success' : submittedCount > 0 ? 'bg-warning text-dark' : 'bg-secondary'}`}
                          style={{ fontSize: 10 }}>
                          {submittedCount}/{artifactData.artifacts.length}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {(!artifactData || artifactData.students.length === 0) && (
                  <tr>
                    <td colSpan={(artifactData?.artifacts.length || 0) + 2} className="text-center text-muted py-4">
                      No artifact submission data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {artifactData && artifactData.students.length > 0 && (
            <div className="card-footer bg-white text-muted" style={{ fontSize: 10 }}>
              Click any student row to see their full progress detail.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalyticsTab;
