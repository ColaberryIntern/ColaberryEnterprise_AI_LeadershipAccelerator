import React, { useEffect, useState, useMemo } from 'react';
import api from '../../utils/api';
import AdminPreviewStackPanel from '../../components/admin/AdminPreviewStackPanel';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

interface CohortProjectStats {
  cohort_id: string;
  cohort_name: string;
  total_students: number;
  students_with_projects: number;
  phase_distribution: Record<string, number>;
  avg_maturity_score: number | null;
  total_artifacts: number;
  requirements_generated: number;
}

const PHASES = ['discovery', 'architecture', 'implementation', 'portfolio', 'complete'];

// Maturity/stage colors map to brand chart + status tokens (no hardcoded hex).
const PHASE_COLORS: Record<string, string> = {
  discovery: 'var(--text-muted)',
  architecture: 'var(--chart-1)',
  implementation: 'var(--chart-5)',
  portfolio: 'var(--chart-4)',
  complete: 'var(--status-success)',
};

const maturityColor = (pct: number) =>
  pct >= 70 ? 'var(--status-success)' : pct >= 30 ? 'var(--status-warning)' : 'var(--status-danger)';

function AdminProjectOverview() {
  const [stats, setStats] = useState<CohortProjectStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: '', email: '', company: '', title: '', phone: '' });
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);
  const [expandedCohort, setExpandedCohort] = useState<string | null>(null);
  const [cohortStudents, setCohortStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [loadingProject, setLoadingProject] = useState(false);

  useEffect(() => {
    api.get('/api/admin/projects/overview')
      .then(res => setStats(res.data.cohorts || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load project overview'))
      .finally(() => setLoading(false));
  }, []);

  // Per-page trust signal — derived from project-overview coverage.
  const trust: TrustSignal = useMemo(() => {
    const totalStudents = stats.reduce((s, c) => s + c.total_students, 0);
    const withProjects = stats.reduce((s, c) => s + c.students_with_projects, 0);
    const coverage = totalStudents === 0 ? 0 : Math.round((withProjects / totalStudents) * 100);
    return {
      level: 'live',
      score: coverage,
      source: 'projects',
      updatedAt: new Date().toISOString(),
      summary: `${withProjects}/${totalStudents} students with projects across ${stats.length} cohorts.`,
      href: '/admin/trust',
      pillars: [
        {
          name: 'Coverage',
          status: 'live',
          score: coverage,
          evidence: [{ label: 'With projects', value: `${withProjects}/${totalStudents}` }],
        },
      ],
    };
  }, [stats]);

  // Aggregated stats
  const totalStudents = stats.reduce((s, c) => s + c.total_students, 0);
  const totalWithProjects = stats.reduce((s, c) => s + c.students_with_projects, 0);
  const totalArtifacts = stats.reduce((s, c) => s + c.total_artifacts, 0);
  const maturityScores = stats.filter(c => c.avg_maturity_score != null).map(c => c.avg_maturity_score!);
  const avgMaturity = maturityScores.length > 0
    ? Math.round(maturityScores.reduce((a, b) => a + b, 0) / maturityScores.length)
    : null;

  // Aggregate phase distribution
  const globalPhases: Record<string, number> = {};
  for (const phase of PHASES) globalPhases[phase] = 0;
  for (const c of stats) {
    for (const [phase, count] of Object.entries(c.phase_distribution)) {
      globalPhases[phase] = (globalPhases[phase] || 0) + count;
    }
  }

  return (
    <>
      <PageHeader
        title="Projects"
        icon="rocket-2-line"
        subtitle="Cohort project coverage, student stage distribution, and per-project maturity."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Projects' }]}
        trust={trust}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => { setShowAddModal(true); setAddResult(null); }}>
            <i className="ri-user-add-line" aria-hidden="true" /> Add Student
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-md-3 col-6">
            <StatCard label="Total Students" value={totalStudents} icon="group-line" tone="primary" />
          </div>
          <div className="col-md-3 col-6">
            <StatCard label="With Projects" value={totalWithProjects} icon="rocket-2-line" tone="info" />
          </div>
          <div className="col-md-3 col-6">
            <StatCard label="Total Artifacts" value={totalArtifacts} icon="stack-line" tone="neutral" />
          </div>
          <div className="col-md-3 col-6">
            <StatCard
              label="Avg Maturity"
              value={avgMaturity != null ? `${avgMaturity}%` : '—'}
              icon="bar-chart-box-line"
              tone={avgMaturity != null && avgMaturity >= 70 ? 'success' : 'warning'}
            />
          </div>
        </div>
      </PageHeader>

      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}

      {!loading && error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && (
        <>
          {/* Add Student Modal */}
          {showAddModal && (
            <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowAddModal(false)}>
              <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
                <div className="modal-content">
                  <div className="modal-header py-2">
                    <h6 className="modal-title fw-bold" style={{ color: 'var(--text-strong)' }}>
                      <i className="ri-user-add-line me-2" aria-hidden="true" />Add Student to April Cohort
                    </h6>
                    <button className="btn-close" onClick={() => setShowAddModal(false)}></button>
                  </div>
                  <div className="modal-body">
                    {addResult?.success ? (
                      <div className="text-center py-3">
                        <i className="ri-checkbox-circle-line d-block mb-2" style={{ fontSize: 40, color: 'var(--status-success)' }} aria-hidden="true" />
                        <h6 className="fw-bold">{addResult.message}</h6>
                        <p className="text-muted small">They will receive a login email at their address. They can access the portal at enterprise.colaberry.ai → Participant Login.</p>
                        <button className="btn btn-sm btn-primary mt-2" onClick={() => { setShowAddModal(false); setAddForm({ full_name: '', email: '', company: '', title: '', phone: '' }); setAddResult(null); window.location.reload(); }}>
                          Done
                        </button>
                      </div>
                    ) : (
                      <>
                        {addResult?.error && <div className="alert alert-danger small py-2">{addResult.error}</div>}
                        <div className="mb-2">
                          <label className="form-label small fw-medium">Full Name *</label>
                          <input className="form-control form-control-sm" value={addForm.full_name} onChange={e => setAddForm({ ...addForm, full_name: e.target.value })} placeholder="John Smith" />
                        </div>
                        <div className="mb-2">
                          <label className="form-label small fw-medium">Email *</label>
                          <input className="form-control form-control-sm" type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} placeholder="john@company.com" />
                        </div>
                        <div className="mb-2">
                          <label className="form-label small fw-medium">Company</label>
                          <input className="form-control form-control-sm" value={addForm.company} onChange={e => setAddForm({ ...addForm, company: e.target.value })} placeholder="Company Inc." />
                        </div>
                        <div className="row g-2 mb-2">
                          <div className="col-6">
                            <label className="form-label small fw-medium">Title</label>
                            <input className="form-control form-control-sm" value={addForm.title} onChange={e => setAddForm({ ...addForm, title: e.target.value })} placeholder="VP of Engineering" />
                          </div>
                          <div className="col-6">
                            <label className="form-label small fw-medium">Phone</label>
                            <input className="form-control form-control-sm" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} placeholder="+1 555-0100" />
                          </div>
                        </div>
                        <div className="p-2 mb-2" style={{ background: 'var(--surface-subtle)', borderRadius: 6, fontSize: 11 }}>
                          <i className="ri-information-line me-1" style={{ color: 'var(--status-info)' }} aria-hidden="true" />
                          Student will be added to <strong>Cohort — April 2026</strong>, portal access enabled immediately, and a login link emailed to them.
                        </div>
                      </>
                    )}
                  </div>
                  {!addResult?.success && (
                    <div className="modal-footer py-2">
                      <button className="btn btn-sm btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                      <button className="btn btn-sm btn-primary" disabled={adding || !addForm.full_name.trim() || !addForm.email.trim()}
                        onClick={async () => {
                          setAdding(true); setAddResult(null);
                          try {
                            // Get the first cohort ID (April 2026)
                            const cohortId = stats[0]?.cohort_id;
                            if (!cohortId) { setAddResult({ error: 'No cohort found' }); return; }
                            const res = await api.post('/api/admin/accelerator/quick-add-student', {
                              ...addForm, cohort_id: cohortId,
                            });
                            setAddResult({ success: true, message: res.data.message });
                          } catch (err: any) {
                            setAddResult({ error: err.response?.data?.error || 'Failed to add student' });
                          } finally { setAdding(false); }
                        }}>
                        {adding ? <><span className="spinner-border spinner-border-sm me-1"></span>Adding...</> : <><i className="ri-user-add-line me-1" aria-hidden="true" />Add &amp; Send Login Link</>}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Global phase distribution */}
          <SectionCard title="Student Stage Distribution" icon="bar-chart-line" className="mb-4">
            <div className="d-flex gap-2 align-items-end" style={{ height: 120 }}>
              {PHASES.map(phase => {
                const count = globalPhases[phase] || 0;
                const maxCount = Math.max(...Object.values(globalPhases), 1);
                const heightPct = (count / maxCount) * 100;

                return (
                  <div key={phase} className="flex-fill text-center">
                    <div className="small fw-semibold mb-1" style={{ fontSize: '0.75rem' }}>{count}</div>
                    <div
                      style={{
                        height: `${Math.max(heightPct, 4)}%`,
                        background: PHASE_COLORS[phase],
                        borderRadius: '4px 4px 0 0',
                        minHeight: 4,
                        transition: 'height 0.3s ease',
                      }}
                    ></div>
                    <div className="text-capitalize text-muted mt-1" style={{ fontSize: '0.65rem' }}>{phase}</div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Per-cohort breakdown */}
          {stats.length > 0 && (
            <SectionCard title="Cohort Breakdown" icon="group-line" padded={false} className="mb-4">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small">Cohort</th>
                      <th className="small text-center">Students</th>
                      <th className="small text-center">Projects</th>
                      <th className="small text-center">Artifacts</th>
                      <th className="small text-center">Reqs Docs</th>
                      <th className="small text-center">Avg Maturity</th>
                      <th className="small">Phase Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map(cohort => {
                      const phaseTotal = Object.values(cohort.phase_distribution).reduce((a, b) => a + b, 0) || 1;
                      const isExpanded = expandedCohort === cohort.cohort_id;
                      return (
                        <React.Fragment key={cohort.cohort_id}>
                          <tr style={{ cursor: 'pointer' }} onClick={async () => {
                            if (isExpanded) { setExpandedCohort(null); return; }
                            setExpandedCohort(cohort.cohort_id);
                            setLoadingStudents(true);
                            try {
                              const res = await api.get(`/api/admin/projects/cohort/${cohort.cohort_id}/students`);
                              setCohortStudents(res.data.students || []);
                            } catch {} finally { setLoadingStudents(false); }
                          }}>
                            <td className="small fw-medium">
                              <i className={`ri-arrow-${isExpanded ? 'down' : 'right'}-s-line me-1`} style={{ fontSize: 12 }} aria-hidden="true" />
                              {cohort.cohort_name}
                            </td>
                            <td className="small text-center">{cohort.total_students}</td>
                            <td className="small text-center">{cohort.students_with_projects}</td>
                            <td className="small text-center">{cohort.total_artifacts}</td>
                            <td className="small text-center">{cohort.requirements_generated}</td>
                            <td className="small text-center">
                              {cohort.avg_maturity_score != null ? (
                                <span style={{ color: maturityColor(cohort.avg_maturity_score) }}>
                                  {Math.round(cohort.avg_maturity_score)}%
                                </span>
                              ) : '—'}
                            </td>
                            <td>
                              <div className="d-flex" style={{ height: 14 }}>
                                {PHASES.map(phase => {
                                  const count = cohort.phase_distribution[phase] || 0;
                                  if (count === 0) return null;
                                  return (
                                    <div key={phase} title={`${phase}: ${count}`}
                                      style={{ width: `${(count / phaseTotal) * 100}%`, background: PHASE_COLORS[phase], minWidth: count > 0 ? 4 : 0 }}></div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} style={{ background: 'var(--surface-subtle)', padding: 0 }}>
                                {loadingStudents ? (
                                  <div className="text-center py-3"><span className="spinner-border spinner-border-sm"></span></div>
                                ) : (
                                  <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
                                    <thead>
                                      <tr className="table-light">
                                        <th style={{ paddingLeft: 24 }}>Student</th>
                                        <th>Project</th>
                                        <th className="text-center">Stage</th>
                                        <th style={{ width: 140 }}>Progress</th>
                                        <th className="text-center">BPs</th>
                                        <th className="text-center">Portal</th>
                                        <th className="text-center">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {cohortStudents.map(s => {
                                        return (
                                          <React.Fragment key={s.enrollment_id}>
                                            <tr style={{ cursor: s.project_id ? 'pointer' : 'default' }}
                                              onClick={async () => {
                                                if (!s.project_id) return;
                                                if (selectedProject?.project?.id === s.project_id) { setSelectedProject(null); return; }
                                                setLoadingProject(true);
                                                try {
                                                  const res = await api.get(`/api/admin/projects/${s.project_id}/detail`);
                                                  setSelectedProject(res.data);
                                                } catch {} finally { setLoadingProject(false); }
                                              }}>
                                              <td style={{ paddingLeft: 24 }}>
                                                <div className="fw-medium">{s.full_name}</div>
                                                <div className="text-muted" style={{ fontSize: 10 }}>{s.email}{s.company ? ` · ${s.company}` : ''}</div>
                                              </td>
                                              <td>{s.organization_name || <span className="text-muted">Not set</span>}</td>
                                              <td className="text-center">
                                                {s.project_stage ? (
                                                  <StatusBadge label={s.project_stage} tone="info" />
                                                ) : <span className="text-muted">—</span>}
                                              </td>
                                              <td>
                                                {s.project_id ? (
                                                  <div>
                                                    <div className="d-flex justify-content-between" style={{ fontSize: 9 }}>
                                                      <span>{s.req_matched}/{s.req_total} reqs</span>
                                                      <span style={{ color: maturityColor(s.readiness_pct), fontWeight: 700 }}>{s.readiness_pct}%</span>
                                                    </div>
                                                    <div className="progress" style={{ height: 4 }}>
                                                      <div className="progress-bar" style={{ width: `${s.readiness_pct}%`, background: maturityColor(s.readiness_pct) }}></div>
                                                    </div>
                                                  </div>
                                                ) : <span className="text-muted" style={{ fontSize: 10 }}>No project</span>}
                                              </td>
                                              <td className="text-center" style={{ fontSize: 10 }}>{s.bp_count || 0}</td>
                                              <td className="text-center">
                                                {s.portal_enabled ? <StatusBadge label="Active" tone="success" /> : <StatusBadge label="Off" tone="neutral" />}
                                              </td>
                                              <td className="text-center">
                                                <div className="d-flex gap-1 justify-content-center">
                                                  {!s.portal_enabled && (
                                                    <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 10, padding: '1px 6px' }}
                                                      onClick={async (e) => { e.stopPropagation(); try { await api.patch(`/api/admin/accelerator/enrollments/${s.enrollment_id}/portal-access`, { portal_enabled: true }); const r = await api.get(`/api/admin/projects/cohort/${cohort.cohort_id}/students`); setCohortStudents(r.data.students || []); } catch {} }}>
                                                      Enable
                                                    </button>
                                                  )}
                                                  {s.project_id && (
                                                    <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10, padding: '1px 6px' }}
                                                      onClick={(e) => { e.stopPropagation(); }}>
                                                      <i className="ri-eye-line" aria-hidden="true" />
                                                    </button>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                            {/* Project drill-down */}
                                            {selectedProject?.project?.id === s.project_id && (
                                              <tr>
                                                <td colSpan={7} style={{ padding: 0, background: 'var(--surface-subtle)' }}>
                                                  {loadingProject ? (
                                                    <div className="text-center py-3"><span className="spinner-border spinner-border-sm"></span></div>
                                                  ) : (
                                                    <div className="p-3">
                                                      <div className="d-flex justify-content-between align-items-start mb-3">
                                                        <div>
                                                          <h6 className="fw-bold mb-1" style={{ color: 'var(--text-strong)' }}>{selectedProject.project.organization_name || 'Untitled Project'}</h6>
                                                          <div className="text-muted" style={{ fontSize: 11 }}>
                                                            {selectedProject.project.industry && <span className="me-3"><i className="ri-building-line me-1" aria-hidden="true" />{selectedProject.project.industry}</span>}
                                                            <span className="me-3"><i className="ri-equalizer-line me-1" aria-hidden="true" />{selectedProject.project.target_mode}</span>
                                                            {selectedProject.github?.repo_url && <a href={selectedProject.github.repo_url} target="_blank" rel="noopener noreferrer" className="text-decoration-none"><i className="ri-github-line me-1" aria-hidden="true" />Repo</a>}
                                                          </div>
                                                        </div>
                                                        <button className="btn btn-sm btn-outline-secondary" onClick={(e) => { e.stopPropagation(); setSelectedProject(null); }}>
                                                          <i className="ri-close-line" aria-hidden="true" />
                                                        </button>
                                                      </div>

                                                      {/* Summary cards */}
                                                      <div className="row g-2 mb-3">
                                                        <div className="col-3">
                                                          <StatCard label="Coverage" value={`${selectedProject.summary.overall_coverage}%`} tone={selectedProject.summary.overall_coverage >= 70 ? 'success' : 'warning'} />
                                                        </div>
                                                        <div className="col-3">
                                                          <StatCard label="BPs" value={selectedProject.summary.total_bps} tone="primary" />
                                                        </div>
                                                        <div className="col-3">
                                                          <StatCard label="Requirements" value={`${selectedProject.summary.matched_reqs}/${selectedProject.summary.total_reqs}`} tone="info" />
                                                        </div>
                                                        <div className="col-3">
                                                          <StatCard label="Artifacts" value={selectedProject.artifacts?.length || 0} tone="neutral" />
                                                        </div>
                                                      </div>

                                                      {/* Preview Stack Panel */}
                                                      <AdminPreviewStackPanel projectId={s.project_id} />

                                                      {/* Business Processes */}
                                                      <div className="fw-medium small mt-3 mb-2"><i className="ri-flow-chart me-1" aria-hidden="true" />Business Processes</div>
                                                      <div className="table-responsive">
                                                        <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                                                          <thead className="table-light">
                                                            <tr><th>Process</th><th className="text-center">Reqs</th><th style={{ width: 120 }}>Coverage</th><th className="text-center">Type</th></tr>
                                                          </thead>
                                                          <tbody>
                                                            {selectedProject.business_processes.map((bp: any) => (
                                                              <tr key={bp.id}>
                                                                <td>
                                                                  {bp.name}
                                                                  {bp.frontend_route && <span className="text-muted ms-1" style={{ fontSize: 9 }}>{bp.frontend_route}</span>}
                                                                </td>
                                                                <td className="text-center">{bp.req_matched}/{bp.req_total}</td>
                                                                <td>
                                                                  <div className="d-flex align-items-center gap-1">
                                                                    <div className="progress flex-grow-1" style={{ height: 4 }}>
                                                                      <div className="progress-bar" style={{ width: `${bp.coverage_pct}%`, background: maturityColor(bp.coverage_pct) }}></div>
                                                                    </div>
                                                                    <span style={{ fontSize: 9, width: 28 }}>{bp.coverage_pct}%</span>
                                                                  </div>
                                                                </td>
                                                                <td className="text-center">
                                                                  <StatusBadge label={bp.source === 'frontend_page' ? 'Page' : 'Code'} tone={bp.source === 'frontend_page' ? 'info' : 'primary'} />
                                                                </td>
                                                              </tr>
                                                            ))}
                                                          </tbody>
                                                        </table>
                                                      </div>
                                                    </div>
                                                  )}
                                                </td>
                                              </tr>
                                            )}
                                          </React.Fragment>
                                        );
                                      })}
                                      {cohortStudents.length === 0 && (
                                        <tr><td colSpan={7} className="text-center text-muted py-3">No students in this cohort</td></tr>
                                      )}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {stats.length === 0 && (
            <div className="text-center py-5 text-muted">
              <i className="ri-inbox-line d-block mb-3" style={{ fontSize: '2.5rem' }} aria-hidden="true" />
              <p className="small">No cohort project data available yet.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default AdminProjectOverview;
