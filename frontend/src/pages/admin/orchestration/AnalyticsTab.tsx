import React, { useEffect, useState, useCallback } from 'react';
import OrchCard from '../../../components/orchestration/OrchCard';
import StatusBadge from '../../../components/orchestration/StatusBadge';
import MetricTile from '../../../components/orchestration/MetricTile';
import ContextBar from '../../../components/orchestration/ContextBar';
import OrchSkeleton from '../../../components/orchestration/OrchSkeleton';

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

const statusMap: Record<string, 'healthy' | 'active' | 'critical' | 'pending' | 'error'> = {
  active: 'healthy', completed: 'active', withdrawn: 'critical', suspended: 'pending',
};
const lessonStatusMap: Record<string, 'healthy' | 'active' | 'idle' | 'inactive'> = {
  completed: 'healthy', in_progress: 'active', not_started: 'idle', locked: 'inactive',
};

const AnalyticsTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [subTab, setSubTab] = useState<'students' | 'skills' | 'artifacts'>('students');
  const [summary, setSummary] = useState<EnrollmentSummary | null>(null);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [skills, setSkills] = useState<SkillMasteryRow[]>([]);
  const [artifactData, setArtifactData] = useState<ArtifactTrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  if (loading) return <OrchSkeleton variant="card" />;

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '-';

  const profColor = (level: number): 'green' | 'blue' | 'yellow' | 'default' | 'red' => {
    if (level >= 4) return 'green';
    if (level >= 3) return 'blue';
    if (level >= 2) return 'yellow';
    if (level >= 1) return 'default';
    return 'red';
  };
  const profLabel = (level: number) => {
    if (level >= 4) return 'Expert';
    if (level >= 3) return 'Proficient';
    if (level >= 2) return 'Developing';
    if (level >= 1) return 'Beginner';
    return 'Not assessed';
  };
  const profStatus = (level: number): 'healthy' | 'active' | 'degraded' | 'idle' | 'inactive' => {
    if (level >= 4) return 'healthy';
    if (level >= 3) return 'active';
    if (level >= 2) return 'degraded';
    if (level >= 1) return 'idle';
    return 'inactive';
  };

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}

      {/* Context Bar */}
      <ContextBar
        title="Program Analytics"
        description="Enrollment progress, skill mastery, and artifact tracking"
        metrics={[
          { label: 'Enrollments', value: summary?.total || 0, color: 'var(--orch-accent-blue)' },
          { label: 'Active', value: activeCount, color: 'var(--orch-accent-green)' },
          { label: 'Avg Completion', value: `${avgPct}%`, color: 'var(--orch-accent-blue)' },
        ]}
      />

      {/* Summary Metrics */}
      <div className="d-flex gap-3 mb-4 flex-wrap">
        <div className="flex-fill">
          <MetricTile
            label="Total Enrollments"
            value={summary?.total || 0}
            color="blue"
            icon="bi bi-people"
            subtitle={summary ? Object.entries(summary.byStatus).map(([s, c]) => `${c} ${s}`).join(', ') : undefined}
          />
        </div>
        <div className="flex-fill">
          <MetricTile
            label="Active Students"
            value={activeCount}
            color="green"
            icon="bi bi-person-check"
          />
        </div>
        <div className="flex-fill">
          <MetricTile
            label="Avg Completion"
            value={`${avgPct}%`}
            color="blue"
            icon="bi bi-graph-up"
          />
        </div>
        <div className="flex-fill">
          <MetricTile
            label="Skills Tracked"
            value={skills.length || '...'}
            color="yellow"
            icon="bi bi-lightning"
          />
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="d-flex gap-1 mb-3">
        {(['students', 'skills', 'artifacts'] as const).map(tab => (
          <button
            key={tab}
            className={`orch-tab-btn ${subTab === tab ? 'orch-tab-btn-active' : ''}`}
            onClick={() => setSubTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ==================== STUDENTS SUB-TAB ==================== */}
      {subTab === 'students' && (
        <OrchCard
          title="Student Progress"
          noPadding
          headerRight={<StatusBadge status="active" label={`${students.length} students`} />}
        >
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead>
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
                      className={expandedStudentId === s.enrollment_id ? 'orch-row-active' : ''}
                    >
                      <td className="text-center" style={{ fontSize: 11 }}>
                        {expandedStudentId === s.enrollment_id ? '\u25BC' : '\u25B6'}
                      </td>
                      <td className="fw-medium">{s.name}</td>
                      <td style={{ fontSize: 12 }}>{s.email}</td>
                      <td style={{ fontSize: 12 }}>{s.company || '-'}</td>
                      <td>
                        <StatusBadge status={statusMap[s.status] || 'idle'} label={s.status} size="sm" />
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div className="progress flex-grow-1" style={{ height: 6 }}>
                            <div
                              className="progress-bar"
                              style={{
                                width: `${s.pct}%`,
                                backgroundColor: s.pct >= 80 ? 'var(--orch-accent-green)' : s.pct >= 40 ? 'var(--orch-accent-blue)' : 'var(--orch-accent-yellow)',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 11, minWidth: 50, color: 'var(--orch-text-muted)' }}>
                            {s.lessonsCompleted}/{s.lessonsTotal}
                          </span>
                        </div>
                      </td>
                      <td className="fw-medium">{s.pct}%</td>
                    </tr>

                    {/* Student Detail Expansion */}
                    {expandedStudentId === s.enrollment_id && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="orch-expanded-detail">
                            {studentDetailLoading ? (
                              <div className="text-center py-4">
                                <div className="spinner-border spinner-border-sm" role="status">
                                  <span className="visually-hidden">Loading...</span>
                                </div>
                                <span className="ms-2" style={{ fontSize: 12, color: 'var(--orch-text-muted)' }}>Loading student details...</span>
                              </div>
                            ) : studentDetail ? (
                              <div className="p-3">
                                <div className="row g-3">
                                  {/* Lesson Progress Column */}
                                  <div className="col-md-5">
                                    <OrchCard
                                      title="Lesson Progress"
                                      noPadding
                                      headerRight={
                                        <StatusBadge status="active" label={`${studentDetail.lessonProgress.filter(l => l.status === 'completed').length}/${studentDetail.lessonProgress.length}`} size="sm" />
                                      }
                                    >
                                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                                          <thead>
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
                                                <td style={{ color: 'var(--orch-text-muted)' }}>{l.module_name}</td>
                                                <td>
                                                  <StatusBadge status={lessonStatusMap[l.status] || 'idle'} label={l.status} size="sm" />
                                                </td>
                                                <td style={{ color: 'var(--orch-text-dim)' }}>{formatDate(l.completed_at)}</td>
                                              </tr>
                                            ))}
                                            {studentDetail.lessonProgress.length === 0 && (
                                              <tr><td colSpan={4} className="text-center py-3" style={{ color: 'var(--orch-text-muted)' }}>No lesson data</td></tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </OrchCard>
                                  </div>

                                  {/* Skill Mastery Column */}
                                  <div className="col-md-3">
                                    <OrchCard
                                      title="Skills"
                                      noPadding
                                      headerRight={<StatusBadge status="active" label={`${studentDetail.skillMastery.length}`} size="sm" />}
                                    >
                                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                                          <thead>
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
                                                  <div style={{ fontSize: 9, color: 'var(--orch-text-dim)' }}>{sk.layer_id}</div>
                                                </td>
                                                <td>
                                                  <StatusBadge
                                                    status={profStatus(sk.proficiency_level)}
                                                    label={`${sk.proficiency_level} - ${profLabel(sk.proficiency_level)}`}
                                                    size="sm"
                                                  />
                                                </td>
                                              </tr>
                                            ))}
                                            {studentDetail.skillMastery.length === 0 && (
                                              <tr><td colSpan={2} className="text-center py-3" style={{ color: 'var(--orch-text-muted)' }}>No skill data</td></tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </OrchCard>
                                  </div>

                                  {/* Artifact Submissions Column */}
                                  <div className="col-md-4">
                                    <OrchCard
                                      title="Artifacts"
                                      noPadding
                                      headerRight={
                                        <StatusBadge
                                          status="active"
                                          label={`${studentDetail.artifactSubmissions.filter(a => a.submitted).length}/${studentDetail.artifactSubmissions.length}`}
                                          size="sm"
                                        />
                                      }
                                    >
                                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                                          <thead>
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
                                                  <span className="orch-badge" style={{ fontSize: 9 }}>{a.artifact_type}</span>
                                                </td>
                                                <td>
                                                  {a.submitted ? (
                                                    <StatusBadge
                                                      status={a.status === 'reviewed' ? 'healthy' : 'active'}
                                                      label={a.status || 'submitted'}
                                                      size="sm"
                                                    />
                                                  ) : (
                                                    <StatusBadge status="idle" label="pending" size="sm" />
                                                  )}
                                                </td>
                                                <td style={{ color: 'var(--orch-text-dim)' }}>{formatDate(a.submitted_at)}</td>
                                              </tr>
                                            ))}
                                            {studentDetail.artifactSubmissions.length === 0 && (
                                              <tr><td colSpan={4} className="text-center py-3" style={{ color: 'var(--orch-text-muted)' }}>No artifact data</td></tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </OrchCard>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-4" style={{ color: 'var(--orch-text-muted)', fontSize: 12 }}>
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
                  <tr><td colSpan={7} className="text-center py-4" style={{ color: 'var(--orch-text-muted)' }}>No enrollments found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </OrchCard>
      )}

      {/* ==================== SKILLS SUB-TAB ==================== */}
      {subTab === 'skills' && (
        <OrchCard
          title="Skill Mastery Overview"
          noPadding
          headerRight={<StatusBadge status="active" label={`${skills.length} skills`} />}
        >
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 12, width: 30 }}></th>
                  <th style={{ fontSize: 12 }}>Skill ID</th>
                  <th style={{ fontSize: 12 }}>Name</th>
                  <th style={{ fontSize: 12 }}>Layer</th>
                  <th style={{ fontSize: 12 }}>Domain</th>
                  <th style={{ fontSize: 12 }}>Students</th>
                  <th style={{ fontSize: 12 }}>Avg Level</th>
                </tr>
              </thead>
              <tbody>
                {skills.map(s => (
                  <React.Fragment key={s.skill_id}>
                    <tr
                      onClick={() => toggleSkillExpand(s.skill_id)}
                      style={{ cursor: 'pointer' }}
                      className={expandedSkillId === s.skill_id ? 'orch-row-active' : ''}
                    >
                      <td className="text-center" style={{ fontSize: 11 }}>
                        {expandedSkillId === s.skill_id ? '\u25BC' : '\u25B6'}
                      </td>
                      <td className="font-monospace" style={{ fontSize: 11 }}>{s.skill_id}</td>
                      <td className="fw-medium">{s.name}</td>
                      <td>
                        <span className="orch-badge" style={{ fontSize: 10 }}>
                          <span style={{
                            width: 4, height: 12, borderRadius: 2, display: 'inline-block',
                            background: 'var(--orch-accent-purple)', marginRight: 4,
                          }} />
                          {s.layer_id}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{s.domain_id}</td>
                      <td>{s.studentsTracked}</td>
                      <td>
                        <StatusBadge
                          status={s.avgLevel >= 3 ? 'healthy' : s.avgLevel >= 1 ? 'degraded' : 'idle'}
                          label={String(s.avgLevel)}
                          size="sm"
                        />
                      </td>
                    </tr>

                    {/* Skill Detail Expansion */}
                    {expandedSkillId === s.skill_id && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="orch-expanded-detail">
                            {skillDetailLoading ? (
                              <div className="text-center py-4">
                                <div className="spinner-border spinner-border-sm" role="status">
                                  <span className="visually-hidden">Loading...</span>
                                </div>
                                <span className="ms-2" style={{ fontSize: 12, color: 'var(--orch-text-muted)' }}>Loading skill details...</span>
                              </div>
                            ) : skillDetail ? (
                              <div className="p-3">
                                {skillDetail.info.description && (
                                  <p className="mb-3" style={{ fontSize: 12, color: 'var(--orch-text-muted)' }}>{skillDetail.info.description}</p>
                                )}
                                <OrchCard
                                  title="Per-Student Mastery"
                                  noPadding
                                  headerRight={<StatusBadge status="active" label={`${skillDetail.students.length} students`} size="sm" />}
                                >
                                  <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                                    <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                                      <thead>
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
                                                    className="progress-bar"
                                                    style={{
                                                      width: `${(st.proficiency_level / 5) * 100}%`,
                                                      backgroundColor: `var(--orch-accent-${profColor(st.proficiency_level)})`,
                                                    }}
                                                  />
                                                </div>
                                                <StatusBadge
                                                  status={profStatus(st.proficiency_level)}
                                                  label={`${st.proficiency_level} - ${profLabel(st.proficiency_level)}`}
                                                  size="sm"
                                                />
                                              </div>
                                            </td>
                                            <td style={{ color: 'var(--orch-text-dim)' }}>{formatDate(st.assessed_at)}</td>
                                          </tr>
                                        ))}
                                        {skillDetail.students.length === 0 && (
                                          <tr><td colSpan={3} className="text-center py-3" style={{ color: 'var(--orch-text-muted)' }}>No students tracked for this skill yet.</td></tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </OrchCard>
                              </div>
                            ) : (
                              <div className="text-center py-4" style={{ color: 'var(--orch-text-muted)', fontSize: 12 }}>
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
                  <tr><td colSpan={7} className="text-center py-4" style={{ color: 'var(--orch-text-muted)' }}>No skill mastery data yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </OrchCard>
      )}

      {/* ==================== ARTIFACTS SUB-TAB ==================== */}
      {subTab === 'artifacts' && (
        <OrchCard
          title="Artifact Submissions"
          noPadding
          headerRight={<StatusBadge status="active" label={`${artifactData?.artifacts.length || 0} artifacts`} />}
        >
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 11, position: 'sticky', left: 0, background: 'var(--orch-bg-card)', zIndex: 1 }}>Student</th>
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
                      <td className="fw-medium" style={{ position: 'sticky', left: 0, background: 'var(--orch-bg-card)', zIndex: 1, fontSize: 11 }}>
                        {s.name}
                      </td>
                      {artifactData.artifacts.map(a => (
                        <td key={a.id} className="text-center">
                          {s.submissions[a.id]
                            ? <span style={{ color: 'var(--orch-accent-green)', fontSize: 14 }}>&#10003;</span>
                            : <span style={{ color: 'var(--orch-text-dim)', fontSize: 14 }}>&#8212;</span>
                          }
                        </td>
                      ))}
                      <td className="fw-medium text-center">
                        <StatusBadge
                          status={submittedCount === artifactData.artifacts.length ? 'healthy' : submittedCount > 0 ? 'degraded' : 'idle'}
                          label={`${submittedCount}/${artifactData.artifacts.length}`}
                          size="sm"
                        />
                      </td>
                    </tr>
                  );
                })}
                {(!artifactData || artifactData.students.length === 0) && (
                  <tr>
                    <td colSpan={(artifactData?.artifacts.length || 0) + 2} className="text-center py-4" style={{ color: 'var(--orch-text-muted)' }}>
                      No artifact submission data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {artifactData && artifactData.students.length > 0 && (
            <div className="p-2 text-center" style={{ fontSize: 10, color: 'var(--orch-text-dim)', borderTop: '1px solid var(--orch-border)' }}>
              Click any student row to see their full progress detail.
            </div>
          )}
        </OrchCard>
      )}
    </div>
  );
};

export default AnalyticsTab;
