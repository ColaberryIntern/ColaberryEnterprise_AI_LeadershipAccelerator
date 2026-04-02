import React from 'react';
import type { IndustryDemo } from '../config/industryDemos';
import { getDemoWalkthroughUrl } from '../services/utmService';

interface IndustryDemoCardProps {
  demo: IndustryDemo;
  compact?: boolean;
  trackContext?: string;
}

export default function IndustryDemoCard({ demo, compact, trackContext }: IndustryDemoCardProps) {
  const url = getDemoWalkthroughUrl(demo.scenario);
  const trackLabel = `demo_industry_${demo.scenario}${trackContext ? '_' + trackContext : ''}`;

  if (compact) {
    return (
      <div className="d-flex align-items-center gap-3 py-3 px-3 my-2" style={{ background: 'var(--color-bg-alt, #f7fafc)', borderRadius: 10, border: '1px solid var(--color-border, #e2e8f0)' }}>
        <i className={`bi ${demo.icon}`} style={{ fontSize: 22, color: 'var(--color-primary-light, #2b6cb0)' }} />
        <div className="flex-grow-1">
          <div className="fw-semibold" style={{ fontSize: 14, color: 'var(--color-primary, #1a365d)' }}>{demo.headline}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>{demo.description}</div>
        </div>
        <a
          href={url}
          className="btn btn-outline-primary btn-sm flex-shrink-0"
          data-track={trackLabel}
          target="_blank"
          rel="noopener noreferrer"
          style={{ borderRadius: 20, fontSize: 12, whiteSpace: 'nowrap' }}
        >
          Watch Demo &rarr;
        </a>
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
      <div className="card-body d-flex flex-column p-4">
        <div className="d-flex align-items-center gap-2 mb-2">
          <i className={`bi ${demo.icon}`} style={{ fontSize: 24, color: 'var(--color-primary-light, #2b6cb0)' }} />
          <span className="badge bg-light text-dark fw-normal" style={{ fontSize: 11 }}>{demo.label}</span>
        </div>
        <h5 className="fw-bold mb-2" style={{ fontSize: 16, color: 'var(--color-primary, #1a365d)' }}>
          {demo.headline}
        </h5>
        <p className="text-muted mb-3 flex-grow-1" style={{ fontSize: 13 }}>{demo.description}</p>
        <a
          href={url}
          className="btn btn-primary btn-sm align-self-start"
          data-track={trackLabel}
          target="_blank"
          rel="noopener noreferrer"
          style={{ borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 13 }}
        >
          Watch Demo &rarr;
        </a>
      </div>
    </div>
  );
}
