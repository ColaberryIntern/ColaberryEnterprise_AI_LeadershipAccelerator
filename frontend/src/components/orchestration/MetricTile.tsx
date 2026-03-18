import React from 'react';

interface MetricTileProps {
  label: string;
  value: number | string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  color?: 'green' | 'red' | 'blue' | 'yellow' | 'default';
  subtitle?: string;
  icon?: string;
}

const colorMap: Record<string, string> = {
  green: 'var(--orch-accent-green)',
  red: 'var(--orch-accent-red)',
  blue: 'var(--orch-accent-blue)',
  yellow: 'var(--orch-accent-yellow)',
  default: 'var(--orch-text)',
};

const trendArrows: Record<string, string> = {
  up: '\u25B2',
  down: '\u25BC',
  stable: '\u2013',
};

const trendColors: Record<string, string> = {
  up: 'var(--orch-accent-green)',
  down: 'var(--orch-accent-red)',
  stable: 'var(--orch-text-muted)',
};

const MetricTile: React.FC<MetricTileProps> = ({
  label,
  value,
  trend,
  trendValue,
  color = 'default',
  subtitle,
  icon,
}) => {
  const accentColor = colorMap[color];

  return (
    <div className="orch-metric orch-fade-in">
      <div className="orch-metric-header">
        {icon && <i className={`${icon} me-1`} style={{ color: accentColor, fontSize: 14 }} />}
        <span className="orch-metric-label">{label}</span>
      </div>
      <div className="orch-metric-value" style={{ color: accentColor }}>
        {value}
      </div>
      <div className="orch-metric-footer">
        {trend && (
          <span style={{ color: trendColors[trend], fontSize: 12, fontWeight: 600 }}>
            {trendArrows[trend]} {trendValue || ''}
          </span>
        )}
        {subtitle && (
          <span className="orch-metric-subtitle">{subtitle}</span>
        )}
      </div>
    </div>
  );
};

export default MetricTile;
