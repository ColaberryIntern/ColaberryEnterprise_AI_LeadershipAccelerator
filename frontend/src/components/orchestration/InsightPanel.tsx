import React from 'react';

interface InsightItem {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  category?: string;
}

interface InsightPanelProps {
  title: string;
  items: InsightItem[];
  emptyMessage?: string;
}

const severityColors: Record<string, string> = {
  critical: 'var(--orch-accent-red)',
  warning: 'var(--orch-accent-yellow)',
  info: 'var(--orch-accent-blue)',
};

const InsightPanel: React.FC<InsightPanelProps> = ({
  title,
  items,
  emptyMessage = 'No issues detected',
}) => {
  return (
    <div className="orch-card orch-fade-in">
      <div className="orch-card-header">
        <div className="orch-card-title">
          <i className="bi bi-lightbulb me-2" style={{ color: 'var(--orch-accent-purple)' }} />
          {title}
        </div>
      </div>
      <div className="orch-card-body" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <div className="text-center py-4" style={{ color: 'var(--orch-accent-green)' }}>
            <i className="bi bi-check-circle me-2" style={{ fontSize: 18 }} />
            <span style={{ fontSize: 13 }}>{emptyMessage}</span>
          </div>
        ) : (
          <div className="orch-insight-list">
            {items.map((item, i) => (
              <div
                key={i}
                className="orch-insight-item"
                style={{
                  borderLeft: `3px solid ${severityColors[item.severity]}`,
                  boxShadow: item.severity === 'critical' ? `inset 4px 0 12px -4px ${severityColors.critical}` : undefined,
                }}
              >
                <span
                  className="orch-insight-dot"
                  style={{ background: severityColors[item.severity] }}
                />
                <span className="orch-insight-message">{item.message}</span>
                {item.category && (
                  <span className="orch-badge" style={{ fontSize: 10, marginLeft: 'auto' }}>
                    {item.category}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InsightPanel;
