import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import ProjectHeader from '../../components/project/ProjectHeader';
import ProjectProgress from '../../components/project/ProjectProgress';
import ProjectMentorPanel from '../../components/project/ProjectMentorPanel';
import ProjectWorkflowPanel from '../../components/project/ProjectWorkflowPanel';
import ProjectIntelligencePanel from '../../components/project/ProjectIntelligencePanel';
import ProjectTimeline from '../../components/project/ProjectTimeline';
import ProjectMentorAlerts from '../../components/project/ProjectMentorAlerts';

interface ProjectData {
  id: string;
  organization_name?: string;
  industry?: string;
  project_stage: string;
  primary_business_problem?: string;
  selected_use_case?: string;
  automation_goal?: string;
  data_sources?: any;
  project_variables?: Record<string, any>;
  github_repo_url?: string;
  portfolio_url?: string;
  executive_summary?: string;
  portfolio_updated_at?: string;
  executive_updated_at?: string;
  maturity_score?: number;
  portfolio_cache?: any;
  created_at: string;
  updated_at: string;
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function ProjectDashboard() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi.get('/api/portal/project')
      .then(res => setProject(res.data))
      .catch(err => {
        if (err.response?.status === 404) {
          setError('no-project');
        } else {
          setError(err.response?.data?.error || 'Failed to load project');
        }
      })
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

  if (error === 'no-project') {
    return (
      <div className="text-center py-5">
        <i className="bi bi-rocket-takeoff fs-1 d-block mb-3" style={{ color: 'var(--color-text-light)' }}></i>
        <h5 className="fw-semibold" style={{ color: 'var(--color-primary)' }}>No Project Yet</h5>
        <p className="text-muted small">Your enterprise AI project will be created when you begin the curriculum.</p>
        <Link to="/portal/curriculum" className="btn btn-sm btn-primary">
          <i className="bi bi-book me-1"></i>Go to Curriculum
        </Link>
      </div>
    );
  }

  if (error || !project) {
    return <div className="alert alert-danger">{error || 'Failed to load project.'}</div>;
  }

  const variables = project.project_variables || {};

  return (
    <>
      <ProjectHeader
        organizationName={project.organization_name}
        industry={project.industry}
        projectStage={project.project_stage}
        selectedUseCase={project.selected_use_case}
        primaryBusinessProblem={project.primary_business_problem}
      />

      <ProjectProgress currentStage={project.project_stage} />

      {/* Project Workflow */}
      <ProjectWorkflowPanel />

      {/* Project Intelligence */}
      <ProjectIntelligencePanel
        maturityScore={project.maturity_score}
        executiveUpdatedAt={project.executive_updated_at}
        portfolioCache={project.portfolio_cache}
      />

      {/* Mentor Alerts */}
      <ProjectMentorAlerts />

      {/* AI Project Mentor */}
      <ProjectMentorPanel />

      {/* Project Timeline */}
      <ProjectTimeline />

      {/* Quick links */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <Link to="/portal/project/artifacts" className="card border-0 shadow-sm text-decoration-none h-100">
            <div className="card-body text-center py-4">
              <i className="bi bi-collection fs-3 d-block mb-2" style={{ color: 'var(--color-primary)' }}></i>
              <div className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>Project Artifacts</div>
              <div className="text-muted small">View all deliverables</div>
            </div>
          </Link>
        </div>
        <div className="col-md-4">
          <Link to="/portal/project/portfolio" className="card border-0 shadow-sm text-decoration-none h-100">
            <div className="card-body text-center py-4">
              <i className="bi bi-briefcase fs-3 d-block mb-2" style={{ color: 'var(--color-accent)' }}></i>
              <div className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>Portfolio</div>
              <div className="text-muted small">Generate portfolio view</div>
            </div>
          </Link>
        </div>
        <div className="col-md-4">
          <Link to="/portal/project/executive" className="card border-0 shadow-sm text-decoration-none h-100">
            <div className="card-body text-center py-4">
              <i className="bi bi-file-earmark-richtext fs-3 d-block mb-2" style={{ color: 'var(--color-secondary)' }}></i>
              <div className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>Executive Deliverable</div>
              <div className="text-muted small">Board-level report</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Portfolio Status */}
      {(project.portfolio_updated_at || project.executive_updated_at || project.maturity_score != null) && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-graph-up me-2"></i>Portfolio Status
          </div>
          <div className="card-body">
            <div className="d-flex gap-4 flex-wrap">
              {project.maturity_score != null && (
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-speedometer2" style={{ color: project.maturity_score >= 70 ? 'var(--color-accent)' : 'var(--color-secondary)', fontSize: '1.25rem' }}></i>
                  <div>
                    <div className="small fw-semibold">{project.maturity_score}%</div>
                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>Maturity Score</div>
                  </div>
                </div>
              )}
              {project.portfolio_updated_at && (
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-briefcase" style={{ color: 'var(--color-primary)', fontSize: '1.25rem' }}></i>
                  <div>
                    <div className="small fw-semibold">{formatTimeAgo(project.portfolio_updated_at)}</div>
                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>Portfolio Last Updated</div>
                  </div>
                </div>
              )}
              {project.executive_updated_at && (
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-file-earmark-richtext" style={{ color: 'var(--color-secondary)', fontSize: '1.25rem' }}></i>
                  <div>
                    <div className="small fw-semibold">{formatTimeAgo(project.executive_updated_at)}</div>
                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>Executive Report Last Updated</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Project Variables */}
      {Object.keys(variables).length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-sliders me-2"></i>Project Variables
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="small">Variable</th>
                    <th className="small">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(variables).map(([key, value]) => (
                    <tr key={key}>
                      <td className="small fw-medium text-capitalize">{key.replace(/_/g, ' ')}</td>
                      <td className="small text-muted">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Automation goal & data sources */}
      {(project.automation_goal || project.data_sources) && (
        <div className="row g-3">
          {project.automation_goal && (
            <div className="col-md-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white fw-semibold small">
                  <i className="bi bi-robot me-2"></i>Automation Goal
                </div>
                <div className="card-body">
                  <p className="small text-muted mb-0">{project.automation_goal}</p>
                </div>
              </div>
            </div>
          )}
          {project.data_sources && (
            <div className="col-md-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white fw-semibold small">
                  <i className="bi bi-database me-2"></i>Data Sources
                </div>
                <div className="card-body">
                  <p className="small text-muted mb-0">
                    {Array.isArray(project.data_sources)
                      ? project.data_sources.join(', ')
                      : typeof project.data_sources === 'object'
                        ? JSON.stringify(project.data_sources)
                        : String(project.data_sources)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default ProjectDashboard;
