import React from 'react';
import { Link } from 'react-router-dom';

interface Props {
  maturityScore: number | null | undefined;
  executiveUpdatedAt?: string;
}

function getReadiness(score: number): { label: string; color: string; icon: string } {
  if (score > 80) return { label: 'Executive Ready', color: 'var(--color-accent)', icon: 'bi-check-circle-fill' };
  if (score >= 60) return { label: 'Preparing', color: '#d69e2e', icon: 'bi-clock-fill' };
  return { label: 'Not Ready', color: 'var(--color-secondary)', icon: 'bi-x-circle-fill' };
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString();
}

function ExecutiveReadinessCard({ maturityScore, executiveUpdatedAt }: Props) {
  const score = maturityScore ?? 0;
  const readiness = getReadiness(score);

  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body py-3 text-center">
        <div className="small fw-semibold mb-2" style={{ color: 'var(--color-primary)' }}>
          Executive Readiness
        </div>

        <i className={`bi ${readiness.icon} d-block mb-1`} style={{ color: readiness.color, fontSize: '1.75rem' }}></i>
        <div className="fw-bold small" style={{ color: readiness.color }}>{readiness.label}</div>

        <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>
          Maturity: {score}%
        </div>

        {executiveUpdatedAt && (
          <div className="text-muted" style={{ fontSize: '0.65rem' }}>
            Report: {formatTimeAgo(executiveUpdatedAt)}
          </div>
        )}

        <Link
          to="/portal/project/executive"
          className="btn btn-sm btn-outline-primary w-100 mt-2"
          style={{ fontSize: '0.75rem' }}
        >
          <i className="bi bi-file-earmark-richtext me-1"></i>View Report
        </Link>
      </div>
    </div>
  );
}

export default ExecutiveReadinessCard;
