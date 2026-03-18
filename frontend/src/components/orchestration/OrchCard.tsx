import React, { ReactNode } from 'react';

interface OrchCardProps {
  title?: string;
  subtitle?: string;
  status?: 'healthy' | 'degraded' | 'critical' | 'active' | 'inactive';
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

const statusColors: Record<string, string> = {
  healthy: 'var(--orch-accent-green)',
  degraded: 'var(--orch-accent-yellow)',
  critical: 'var(--orch-accent-red)',
  active: 'var(--orch-accent-blue)',
  inactive: 'var(--orch-text-dim)',
};

const OrchCard: React.FC<OrchCardProps> = ({
  title,
  subtitle,
  status,
  headerRight,
  children,
  className = '',
  noPadding = false,
}) => {
  return (
    <div className={`orch-card orch-fade-in ${className}`}>
      {(title || headerRight) && (
        <div className="orch-card-header">
          <div className="d-flex align-items-center gap-2">
            {status && (
              <span
                className="orch-status-dot"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: statusColors[status] || 'var(--orch-text-dim)',
                  display: 'inline-block',
                  flexShrink: 0,
                  boxShadow: status === 'critical' ? 'var(--orch-glow-red)' : status === 'healthy' ? 'var(--orch-glow-green)' : 'none',
                }}
              />
            )}
            <div>
              {title && <div className="orch-card-title">{title}</div>}
              {subtitle && <div className="orch-card-subtitle">{subtitle}</div>}
            </div>
          </div>
          {headerRight && <div className="d-flex align-items-center gap-2">{headerRight}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'orch-card-body'}>
        {children}
      </div>
    </div>
  );
};

export default OrchCard;
