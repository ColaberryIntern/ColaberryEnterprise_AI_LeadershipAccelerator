import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

interface Recommendation {
  category: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
}

interface Risk {
  risk: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface PortfolioSummary {
  artifact_count: number;
  average_score: number | null;
  category_counts: Record<string, number>;
}

interface MentorGuidance {
  project_stage: string;
  portfolio_summary: PortfolioSummary;
  recommendations: Recommendation[];
  risks: Risk[];
  next_steps: string[];
}

const STAGE_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  strategy: 'Strategy',
  governance: 'Governance',
  architecture: 'Architecture',
  implementation: 'Implementation',
  portfolio: 'Portfolio Review',
};

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-danger',
  medium: 'bg-warning text-dark',
  low: 'bg-info',
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-danger',
  high: 'bg-warning text-dark',
  medium: 'bg-secondary',
  low: 'bg-light text-dark',
};

const SEVERITY_ICON: Record<string, string> = {
  critical: 'bi-exclamation-triangle-fill',
  high: 'bi-exclamation-circle-fill',
  medium: 'bi-info-circle-fill',
  low: 'bi-dash-circle',
};

function ProjectMentorPanel() {
  const [guidance, setGuidance] = useState<MentorGuidance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    portalApi.get('/api/portal/project/mentor')
      .then(res => setGuidance(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">
          <i className="bi bi-mortarboard me-2"></i>AI Project Mentor
        </div>
        <div className="card-body text-center py-4">
          <div className="spinner-border spinner-border-sm" style={{ color: 'var(--color-primary)' }} role="status">
            <span className="visually-hidden">Analyzing project...</span>
          </div>
          <span className="small text-muted ms-2">Analyzing your project...</span>
        </div>
      </div>
    );
  }

  if (error || !guidance) {
    return null; // Silently skip if mentor unavailable
  }

  const { project_stage, portfolio_summary, recommendations, risks, next_steps } = guidance;
  const stageLabel = STAGE_LABELS[project_stage] || project_stage;

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
        <span><i className="bi bi-mortarboard me-2"></i>AI Project Mentor</span>
        <span className="badge" style={{ background: 'var(--color-primary)' }}>
          Stage: {stageLabel}
        </span>
      </div>
      <div className="card-body">
        {/* Portfolio Summary */}
        <div className="d-flex gap-3 mb-3 flex-wrap">
          <div className="d-flex align-items-center gap-1">
            <i className="bi bi-collection" style={{ color: 'var(--color-primary)' }}></i>
            <span className="small">
              <strong>{portfolio_summary.artifact_count}</strong> artifacts
            </span>
          </div>
          {portfolio_summary.average_score != null && (
            <div className="d-flex align-items-center gap-1">
              <i className="bi bi-speedometer2" style={{ color: portfolio_summary.average_score >= 70 ? 'var(--color-accent)' : 'var(--color-secondary)' }}></i>
              <span className="small">
                <strong>{Math.round(portfolio_summary.average_score)}%</strong> avg score
              </span>
            </div>
          )}
          {Object.entries(portfolio_summary.category_counts).map(([cat, count]) => (
            count > 0 && (
              <span key={cat} className="badge bg-light text-dark small text-capitalize">
                {cat}: {count}
              </span>
            )
          ))}
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="mb-3">
            <h6 className="fw-semibold small mb-2" style={{ color: 'var(--color-primary)' }}>
              <i className="bi bi-lightbulb me-1"></i>Recommendations
            </h6>
            {recommendations.map((rec, idx) => (
              <div key={idx} className="d-flex align-items-start gap-2 mb-2">
                <span className={`badge ${PRIORITY_BADGE[rec.priority]} mt-1`} style={{ fontSize: '0.65rem', minWidth: 48 }}>
                  {rec.priority}
                </span>
                <div className="small">
                  <span className="fw-medium text-capitalize">{rec.category}:</span>{' '}
                  <span className="text-muted">{rec.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Risks */}
        {risks.length > 0 && (
          <div className="mb-3">
            <h6 className="fw-semibold small mb-2" style={{ color: 'var(--color-secondary)' }}>
              <i className="bi bi-shield-exclamation me-1"></i>Risks
            </h6>
            {risks.map((risk, idx) => (
              <div key={idx} className="d-flex align-items-start gap-2 mb-2">
                <i className={`${SEVERITY_ICON[risk.severity]} mt-1`} style={{
                  color: risk.severity === 'critical' ? 'var(--color-secondary)' :
                    risk.severity === 'high' ? '#d69e2e' :
                      'var(--color-text-light)',
                  fontSize: '0.85rem',
                }}></i>
                <div className="small text-muted">{risk.risk}</div>
              </div>
            ))}
          </div>
        )}

        {/* Next Steps */}
        {next_steps.length > 0 && (
          <div>
            <h6 className="fw-semibold small mb-2" style={{ color: 'var(--color-accent)' }}>
              <i className="bi bi-arrow-right-circle me-1"></i>Next Steps
            </h6>
            <ol className="small text-muted mb-0 ps-3">
              {next_steps.map((step, idx) => (
                <li key={idx} className="mb-1">{step}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectMentorPanel;
