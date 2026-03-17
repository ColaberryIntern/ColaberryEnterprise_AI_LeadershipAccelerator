import React from 'react';

interface CategoryStatus {
  strategy: number;
  governance: number;
  architecture: number;
  implementation: number;
}

interface Props {
  maturityScore: number | null | undefined;
  categories?: CategoryStatus;
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'var(--color-accent)';
  if (score >= 40) return '#d69e2e';
  return 'var(--color-secondary)';
}

function getScoreLabel(score: number): string {
  if (score >= 70) return 'Strong';
  if (score >= 40) return 'Developing';
  return 'Early Stage';
}

const CATEGORY_ICONS: Record<string, string> = {
  strategy: 'bi-compass',
  governance: 'bi-shield-check',
  architecture: 'bi-diagram-3',
  implementation: 'bi-gear',
};

function ProjectMaturityGauge({ maturityScore, categories }: Props) {
  const score = maturityScore ?? 0;
  const color = getScoreColor(score);
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body text-center py-3">
        <div className="small fw-semibold mb-2" style={{ color: 'var(--color-primary)' }}>
          Project Maturity
        </div>

        {/* SVG circular gauge */}
        <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto' }}>
          <svg viewBox="0 0 100 100" width="100" height="100">
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="6"
            />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}>
            <div className="fw-bold" style={{ fontSize: '1.25rem', color }}>{score}%</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--color-text-light)' }}>{getScoreLabel(score)}</div>
          </div>
        </div>

        {/* Category indicators */}
        {categories && (
          <div className="d-flex justify-content-center gap-3 mt-2 flex-wrap">
            {(Object.entries(categories) as [string, number][]).map(([cat, count]) => (
              <div key={cat} className="text-center" style={{ minWidth: 50 }}>
                <i className={`bi ${CATEGORY_ICONS[cat] || 'bi-circle'}`} style={{
                  color: count > 0 ? 'var(--color-accent)' : 'var(--color-border)',
                  fontSize: '0.85rem',
                }}></i>
                <div className="text-capitalize" style={{ fontSize: '0.6rem', color: 'var(--color-text-light)' }}>
                  {cat}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectMaturityGauge;
