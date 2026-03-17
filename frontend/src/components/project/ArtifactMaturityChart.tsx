import React from 'react';

interface Props {
  categories: {
    strategy: number;
    governance: number;
    architecture: number;
    implementation: number;
  };
}

const CATEGORY_CONFIG: { key: string; label: string; color: string }[] = [
  { key: 'strategy', label: 'Strategy', color: 'var(--color-primary)' },
  { key: 'governance', label: 'Governance', color: 'var(--color-secondary)' },
  { key: 'architecture', label: 'Architecture', color: 'var(--color-primary-light)' },
  { key: 'implementation', label: 'Implementation', color: 'var(--color-accent)' },
];

function ArtifactMaturityChart({ categories }: Props) {
  const maxCount = Math.max(...Object.values(categories), 1);
  const total = Object.values(categories).reduce((s, c) => s + c, 0);

  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body py-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="small fw-semibold" style={{ color: 'var(--color-primary)' }}>
            Artifact Distribution
          </div>
          <span className="badge" style={{ background: 'var(--color-primary)', fontSize: '0.65rem' }}>
            {total} total
          </span>
        </div>

        <div className="d-flex flex-column gap-2">
          {CATEGORY_CONFIG.map(({ key, label, color }) => {
            const count = (categories as any)[key] || 0;
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;

            return (
              <div key={key}>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="small" style={{ fontSize: '0.75rem', color: 'var(--color-text)' }}>
                    {label}
                  </span>
                  <span className="small fw-semibold" style={{ fontSize: '0.7rem', color }}>
                    {count}
                  </span>
                </div>
                <div className="progress" style={{ height: 6 }}>
                  <div
                    className="progress-bar"
                    style={{ width: `${pct}%`, background: color, transition: 'width 0.4s ease' }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ArtifactMaturityChart;
