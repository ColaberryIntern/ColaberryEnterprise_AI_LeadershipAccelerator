import React from 'react';

interface Props {
  size?: number;
  glowing?: boolean;
  label?: string;
}

export default function CoryMentorIcon({ size = 40, glowing = true, label }: Props) {
  const half = size / 2;
  const outerR = half - 2;
  const innerR = half * 0.55;

  return (
    <div className="d-inline-flex align-items-center gap-2" title={label || 'Cory — AI Leadership Mentor'}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label || 'AI Mentor'}>
        <defs>
          <radialGradient id="cory-orb-grad" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="var(--color-primary-light, #2b6cb0)" stopOpacity="0.9" />
            <stop offset="70%" stopColor="var(--color-primary, #1a365d)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--color-primary, #1a365d)" stopOpacity="1" />
          </radialGradient>
          <radialGradient id="cory-halo-grad" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="var(--color-primary-light, #2b6cb0)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--color-primary-light, #2b6cb0)" stopOpacity="0.15" />
          </radialGradient>
        </defs>
        {glowing && (
          <circle cx={half} cy={half} r={outerR} fill="url(#cory-halo-grad)" className="cory-halo" />
        )}
        <circle cx={half} cy={half} r={innerR} fill="url(#cory-orb-grad)" />
        <circle cx={half * 0.75} cy={half * 0.7} r={innerR * 0.18} fill="rgba(255,255,255,0.35)" />
      </svg>
      {label && <span className="small fw-medium" style={{ color: 'var(--color-primary, #1a365d)', fontSize: 11 }}>{label}</span>}
      <style>{`
        .cory-halo { animation: coryPulse 3s ease-in-out infinite; }
        @keyframes coryPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cory-halo { animation: none; opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
