import React from 'react';

interface ArtifactCardProps {
  title: string;
  status: string;
  version: number;
  stage?: string;
  score?: number;
  submittedAt?: string;
  artifactDefinitionName?: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-secondary',
  submitted: 'bg-info',
  reviewed: 'bg-success',
  flagged: 'bg-danger',
};

function ArtifactCard({ title, status, version, stage, score, submittedAt, artifactDefinitionName }: ArtifactCardProps) {
  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body d-flex flex-column">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: '0.9rem' }}>
            {artifactDefinitionName || title}
          </h6>
          <span className={`badge ${STATUS_BADGE[status] || 'bg-secondary'}`}>{status}</span>
        </div>
        {title !== artifactDefinitionName && artifactDefinitionName && (
          <p className="text-muted small mb-2">{title}</p>
        )}
        <div className="mt-auto d-flex justify-content-between align-items-center small">
          <span className="text-muted">
            <i className="bi bi-layers me-1"></i>v{version}
            {stage && <span className="ms-2"><i className="bi bi-tag me-1"></i>{stage}</span>}
          </span>
          {score != null && (
            <span className="fw-medium" style={{ color: score >= 70 ? 'var(--color-accent)' : 'var(--color-secondary)' }}>
              {Math.round(score)}%
            </span>
          )}
        </div>
        {submittedAt && (
          <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}>
            {new Date(submittedAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}

export default ArtifactCard;
