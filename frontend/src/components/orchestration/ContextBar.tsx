import React, { ReactNode } from 'react';

interface ContextBarMetric {
  label: string;
  value: string | number;
  color?: string;
}

interface ContextBarProps {
  title: string;
  description: string;
  metrics?: ContextBarMetric[];
  actions?: ReactNode;
}

const ContextBar: React.FC<ContextBarProps> = ({
  title,
  description,
  metrics,
  actions,
}) => {
  return (
    <div className="orch-context-bar orch-fade-in">
      <div className="orch-context-bar-info">
        <div className="orch-context-bar-title">{title}</div>
        <div className="orch-context-bar-desc">{description}</div>
      </div>
      {metrics && metrics.length > 0 && (
        <div className="orch-context-bar-metrics">
          {metrics.map((m, i) => (
            <div key={i} className="orch-context-bar-metric">
              <span className="orch-context-bar-metric-value" style={{ color: m.color || 'var(--orch-text)' }}>
                {m.value}
              </span>
              <span className="orch-context-bar-metric-label">{m.label}</span>
            </div>
          ))}
        </div>
      )}
      {actions && (
        <div className="orch-context-bar-actions">{actions}</div>
      )}
    </div>
  );
};

export default ContextBar;
