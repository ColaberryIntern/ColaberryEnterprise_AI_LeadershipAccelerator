import React from 'react';

interface OrchSkeletonProps {
  variant: 'card' | 'table' | 'metrics' | 'text';
  rows?: number;
  cols?: number;
}

const ShimmerBlock: React.FC<{ width?: string; height?: string; className?: string }> = ({
  width = '100%',
  height = '16px',
  className = '',
}) => (
  <div
    className={`orch-shimmer ${className}`}
    style={{ width, height, borderRadius: 'var(--orch-radius-sm)' }}
  />
);

const OrchSkeleton: React.FC<OrchSkeletonProps> = ({
  variant,
  rows = 5,
  cols = 4,
}) => {
  if (variant === 'metrics') {
    return (
      <div className="d-flex gap-3 mb-4 orch-fade-in">
        {[0, 1, 2].map(i => (
          <div key={i} className="orch-card flex-fill" style={{ padding: 20 }}>
            <ShimmerBlock width="60%" height="12px" className="mb-3" />
            <ShimmerBlock width="40%" height="32px" className="mb-2" />
            <ShimmerBlock width="50%" height="10px" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="orch-card orch-fade-in" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--orch-border)' }}>
          <ShimmerBlock width="30%" height="14px" />
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="d-flex gap-3 align-items-center"
            style={{ padding: '10px 16px', borderBottom: '1px solid var(--orch-border)' }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <ShimmerBlock key={c} width={c === 0 ? '20%' : '15%'} height="12px" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="orch-fade-in">
        <div className="d-flex gap-3 mb-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="orch-card flex-fill" style={{ padding: 20 }}>
              <ShimmerBlock width="60%" height="12px" className="mb-3" />
              <ShimmerBlock width="40%" height="32px" className="mb-2" />
              <ShimmerBlock width="50%" height="10px" />
            </div>
          ))}
        </div>
        <div className="orch-card" style={{ padding: 20 }}>
          <ShimmerBlock width="25%" height="14px" className="mb-3" />
          {Array.from({ length: rows }).map((_, r) => (
            <ShimmerBlock key={r} width={`${70 + Math.random() * 30}%`} height="12px" className="mb-2" />
          ))}
        </div>
      </div>
    );
  }

  // text variant
  return (
    <div className="orch-fade-in">
      {Array.from({ length: rows }).map((_, r) => (
        <ShimmerBlock key={r} width={`${50 + Math.random() * 50}%`} height="12px" className="mb-2" />
      ))}
    </div>
  );
};

export default OrchSkeleton;
