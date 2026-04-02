import React from 'react';
import { getAdvisoryUrl } from '../services/utmService';

interface AdvisoryCTABlockProps {
  headline?: string;
  subtext?: string;
  buttonText?: string;
  trackLabel?: string;
  variant?: 'default' | 'compact' | 'dark';
}

export default function AdvisoryCTABlock({
  headline = 'Curious what this would look like for your company?',
  subtext = 'Design your AI-powered organization in 5 minutes - free, no signup required.',
  buttonText = 'Design Your AI Organization',
  trackLabel = 'section_cta_design_ai_org',
  variant = 'default',
}: AdvisoryCTABlockProps) {
  const url = getAdvisoryUrl();

  if (variant === 'compact') {
    return (
      <div className="text-center py-3 my-3" style={{ borderTop: '1px solid var(--color-border, #e2e8f0)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
        <p className="text-muted mb-2" style={{ fontSize: 14 }}>{headline}</p>
        <a href={url} className="btn btn-primary btn-sm" data-track={trackLabel} target="_blank" rel="noopener noreferrer">
          {buttonText}
        </a>
      </div>
    );
  }

  if (variant === 'dark') {
    return (
      <div className="text-center py-5 my-4" style={{ background: '#0f172a', borderRadius: 12 }}>
        <h3 className="text-white fw-bold mb-2" style={{ fontSize: 22 }}>{headline}</h3>
        <p className="mb-3" style={{ color: '#94a3b8', fontSize: 15 }}>{subtext}</p>
        <a
          href={url}
          className="btn btn-lg text-white fw-semibold"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: 8, padding: '12px 32px' }}
          data-track={trackLabel}
          target="_blank"
          rel="noopener noreferrer"
        >
          {buttonText} &rarr;
        </a>
        <div className="mt-3" style={{ fontSize: 12, color: '#64748b' }}>
          Free - Based on real AI system patterns - Used by enterprise teams
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div className="text-center py-4 my-4 px-3" style={{ background: 'var(--color-bg-alt, #f7fafc)', borderRadius: 12, border: '1px solid var(--color-border, #e2e8f0)' }}>
      <h4 className="fw-bold mb-2" style={{ color: 'var(--color-primary, #1a365d)', fontSize: 20 }}>{headline}</h4>
      <p className="text-muted mb-3" style={{ fontSize: 14, maxWidth: 500, margin: '0 auto' }}>{subtext}</p>
      <a
        href={url}
        className="btn btn-primary"
        data-track={trackLabel}
        target="_blank"
        rel="noopener noreferrer"
        style={{ borderRadius: 8, padding: '10px 28px', fontWeight: 600 }}
      >
        {buttonText} &rarr;
      </a>
    </div>
  );
}
