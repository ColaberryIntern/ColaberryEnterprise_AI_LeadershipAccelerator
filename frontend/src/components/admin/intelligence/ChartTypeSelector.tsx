import React from 'react';

interface ChartType {
  key: string;
  label: string;
  icon: string;
}

const CHART_TYPES: ChartType[] = [
  { key: 'line', label: 'Line', icon: '—' },
  { key: 'bar', label: 'Bar', icon: '\u2581\u2583\u2585' },
  { key: 'heatmap', label: 'Heatmap', icon: '\u25A6' },
  { key: 'geo', label: 'Geo', icon: '\u25CB' },
  { key: 'network', label: 'Network', icon: '\u25C7' },
  { key: 'radar', label: 'Radar', icon: '\u25CE' },
  { key: 'waterfall', label: 'Waterfall', icon: '\u2587\u2585\u2583' },
  { key: 'forecast', label: 'Forecast', icon: '\u223F' },
  { key: 'risk', label: 'Risk', icon: '\u26A0' },
  { key: 'tree', label: 'Tree', icon: '\u25B7' },
  { key: 'root_cause', label: 'Root Cause', icon: '\u2261' },
  { key: 'cluster', label: 'Clusters', icon: '\u25CE' },
  { key: 'combo', label: 'Combo', icon: '\u2581\u223F' },
];

const TYPE_ALIASES: Record<string, string> = {
  risk_matrix: 'risk',
  forecast_cone: 'forecast',
  decomposition_tree: 'tree',
  root_cause_split: 'root_cause',
};

interface ChartTypeSelectorProps {
  activeType: string | null;
  onTypeChange: (type: string | null) => void;
  applicableTypes?: string[] | null;
}

function normalizeType(type: string): string {
  return TYPE_ALIASES[type] || type;
}

export default function ChartTypeSelector({
  activeType,
  onTypeChange,
  applicableTypes,
}: ChartTypeSelectorProps) {
  const applicableSet = applicableTypes
    ? new Set(applicableTypes.map(normalizeType))
    : null;

  return (
    <div className="d-flex gap-1 flex-wrap align-items-center py-2">
      {CHART_TYPES.map((ct) => {
        const isActive = activeType === ct.key;
        const isApplicable = !applicableSet || applicableSet.has(ct.key);

        return (
          <button
            key={ct.key}
            className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'}`}
            style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              opacity: isApplicable ? 1 : 0.35,
            }}
            onClick={() => onTypeChange(isActive ? null : ct.key)}
            disabled={!isApplicable}
          >
            <span className="me-1">{ct.icon}</span>
            {ct.label}
          </button>
        );
      })}
    </div>
  );
}

export { normalizeType, TYPE_ALIASES };
