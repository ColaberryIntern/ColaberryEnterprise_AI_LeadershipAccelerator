import React from 'react';
import FeedbackButtons from './FeedbackButtons';

interface Insight {
  title: string;
  severity?: string;
  description?: string;
  metric_value?: string | number;
  trend?: string;
}

interface AutoInsightsGridProps {
  insights: Insight[];
  onInsightClick?: (title: string) => void;
  onInvestigate?: (insight: any) => void;
  loading?: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--color-secondary)',
  high: '#dd6b20',
  medium: '#d69e2e',
  low: 'var(--color-accent)',
};

function getSeverityColor(severity?: string): string {
  if (!severity) return 'var(--color-border)';
  return SEVERITY_COLORS[severity.toLowerCase()] || 'var(--color-border)';
}

function SkeletonCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="intel-card-float">
          <div className="card-body p-3">
            <div className="placeholder-glow">
              <span className="placeholder col-10 placeholder-sm mb-2 d-block" />
              <span className="placeholder col-7 placeholder-xs mb-1 d-block" />
              <span className="placeholder col-4 placeholder-xs d-block" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AutoInsightsGrid({ insights, onInsightClick, onInvestigate, loading }: AutoInsightsGridProps) {
  if (loading) return <SkeletonCards />;
  if (!insights?.length) return null;

  const visible = insights.slice(0, 6);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
      {visible.map((insight, i) => (
        <div
          key={i}
          className="intel-card-float intel-fade-in"
          style={{
            borderLeft: `4px solid ${getSeverityColor(insight.severity)}`,
            cursor: onInsightClick ? 'pointer' : 'default',
          }}
          onClick={() => onInsightClick?.(insight.title)}
          onMouseEnter={(e) => {
            if (onInsightClick) (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow = '';
          }}
          role={onInsightClick ? 'button' : undefined}
          tabIndex={onInsightClick ? 0 : undefined}
          onKeyDown={(e) => {
            if (onInsightClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onInsightClick(insight.title);
            }
          }}
        >
          <div className="card-body p-3">
            <div className="d-flex justify-content-between align-items-start mb-1">
              <span className="fw-semibold small" style={{ color: 'var(--color-primary)', lineHeight: 1.3 }}>
                {insight.title}
              </span>
              {insight.severity && (
                <span
                  className="badge ms-2"
                  style={{
                    background: getSeverityColor(insight.severity),
                    fontSize: '0.6rem',
                    flexShrink: 0,
                  }}
                >
                  {insight.severity.toUpperCase()}
                </span>
              )}
            </div>
            {insight.description && (
              <p className="text-muted mb-1" style={{ fontSize: '0.72rem', lineHeight: 1.4 }}>
                {insight.description.length > 120 ? insight.description.slice(0, 120) + '...' : insight.description}
              </p>
            )}
            <div className="d-flex gap-2 align-items-center">
              {insight.metric_value != null && (
                <span className="fw-bold small" style={{ color: 'var(--color-primary)' }}>
                  {insight.metric_value}
                </span>
              )}
              {insight.trend && (
                <small className="text-muted" style={{ fontSize: '0.65rem' }}>
                  {insight.trend}
                </small>
              )}
            </div>
            <div className="d-flex align-items-center gap-2 mt-2">
              {onInvestigate && (
                <button
                  className="btn btn-sm btn-outline-primary"
                  style={{ fontSize: '0.68rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInvestigate(insight);
                  }}
                >
                  Investigate
                </button>
              )}
              <FeedbackButtons
                contentType="auto_insight"
                contentKey={`auto_${insight.title.replace(/\s+/g, '_').toLowerCase().slice(0, 80)}`}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
