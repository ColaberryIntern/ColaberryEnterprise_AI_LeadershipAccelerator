import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

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

const PHASE_COLORS: Record<string, string> = {
  discovery: 'var(--color-text-light)',
  architecture: 'var(--color-primary-light)',
  implementation: 'var(--color-primary)',
  portfolio: 'var(--color-accent)',
  complete: '#38a169',
};

function AdminProjectOverview() {
  const [stats, setStats] = useState<CohortProjectStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/admin/projects/overview')
      .then(res => setStats(res.data.cohorts || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load project overview'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: 'var(--color-primary)' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  // Aggregated stats
  const totalStudents = stats.reduce((s, c) => s + c.total_students, 0);
  const totalWithProjects = stats.reduce((s, c) => s + c.students_with_projects, 0);
  const totalArtifacts = stats.reduce((s, c) => s + c.total_artifacts, 0);
  const totalReqs = stats.reduce((s, c) => s + c.requirements_generated, 0);
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
      <h1 className="h4 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>
        <i className="bi bi-rocket-takeoff me-2"></i>Project Overview
      </h1>

      {/* Summary cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-3 col-6">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="fw-bold fs-4" style={{ color: 'var(--color-primary)' }}>{totalStudents}</div>
              <div className="small text-muted">Total Students</div>
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="fw-bold fs-4" style={{ color: 'var(--color-accent)' }}>{totalWithProjects}</div>
              <div className="small text-muted">With Projects</div>
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="fw-bold fs-4" style={{ color: 'var(--color-primary-light)' }}>{totalArtifacts}</div>
              <div className="small text-muted">Total Artifacts</div>
            </div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="fw-bold fs-4" style={{ color: avgMaturity != null && avgMaturity >= 70 ? 'var(--color-accent)' : 'var(--color-secondary)' }}>
                {avgMaturity != null ? `${avgMaturity}%` : '—'}
              </div>
              <div className="small text-muted">Avg Maturity</div>
            </div>
          </div>
        </div>
      </div>

      {/* Global phase distribution */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">
          <i className="bi bi-bar-chart me-2"></i>Student Stage Distribution
        </div>
        <div className="card-body">
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
        </div>
      </div>

      {/* Per-cohort breakdown */}
      {stats.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-people me-2"></i>Cohort Breakdown
          </div>
          <div className="card-body p-0">
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
                    return (
                      <tr key={cohort.cohort_id}>
                        <td className="small fw-medium">{cohort.cohort_name}</td>
                        <td className="small text-center">{cohort.total_students}</td>
                        <td className="small text-center">{cohort.students_with_projects}</td>
                        <td className="small text-center">{cohort.total_artifacts}</td>
                        <td className="small text-center">{cohort.requirements_generated}</td>
                        <td className="small text-center">
                          {cohort.avg_maturity_score != null ? (
                            <span style={{ color: cohort.avg_maturity_score >= 70 ? 'var(--color-accent)' : 'var(--color-secondary)' }}>
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
                                <div
                                  key={phase}
                                  title={`${phase}: ${count}`}
                                  style={{
                                    width: `${(count / phaseTotal) * 100}%`,
                                    background: PHASE_COLORS[phase],
                                    minWidth: count > 0 ? 4 : 0,
                                  }}
                                ></div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {stats.length === 0 && (
        <div className="text-center py-5 text-muted">
          <i className="bi bi-inbox fs-1 d-block mb-3"></i>
          <p className="small">No cohort project data available yet.</p>
        </div>
      )}
    </>
  );
}

export default AdminProjectOverview;
