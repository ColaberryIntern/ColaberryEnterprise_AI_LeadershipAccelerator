import React, { useState, useMemo } from 'react';
import type { IndustryDemo } from '../config/industryDemos';
import { INDUSTRY_DEMOS } from '../config/industryDemos';
import { getAdvisoryUrl, getDemoWalkthroughUrl } from '../services/utmService';

interface IndustryDemoGridProps {
  demos?: IndustryDemo[];
  headline?: string;
  subtext?: string;
  trackContext: string;
  compact?: boolean;
}

export default function IndustryDemoGrid({
  demos = INDUSTRY_DEMOS,
  headline,
  subtext,
  trackContext,
}: IndustryDemoGridProps) {
  const [showDemo, setShowDemo] = useState(false);
  const advisoryUrl = getAdvisoryUrl();

  // Pick a random demo from the provided list
  const demo = useMemo(() => {
    const idx = Math.floor(Math.random() * demos.length);
    return demos[idx];
  }, [demos]);

  const demoUrl = getDemoWalkthroughUrl(demo.scenario);

  return (
    <div className="my-4">
      {!showDemo ? (
        <div className="text-center py-4 px-3" style={{ background: 'var(--color-bg-alt, #f7fafc)', borderRadius: 12, border: '1px solid var(--color-border, #e2e8f0)' }}>
          {headline && (
            <p className="text-muted small fw-semibold mb-1" style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 11 }}>
              {headline}
            </p>
          )}
          <h5 className="fw-bold mb-2" style={{ color: 'var(--color-primary, #1a365d)', fontSize: 18 }}>
            See a <span style={{ color: 'var(--color-primary-light, #2b6cb0)' }}>{demo.label}</span> AI Organization Get Configured in Seconds
          </h5>
          {subtext && <p className="text-muted mb-3" style={{ fontSize: 13 }}>{subtext}</p>}
          <button
            className="btn btn-dark rounded-pill px-4 py-2"
            data-track={`demo_inline_play_${demo.scenario}_${trackContext}`}
            onClick={() => setShowDemo(true)}
            style={{ fontSize: 14 }}
          >
            <i className="bi bi-play-fill me-1" />Watch It Build
          </button>
        </div>
      ) : (
        <div>
          <div
            style={{
              position: 'relative',
              width: '100%',
              paddingBottom: '65%',
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid var(--color-border, #e2e8f0)',
              background: '#0f172a',
            }}
          >
            <iframe
              src={demoUrl}
              title={`AI Workforce Designer Demo - ${demo.label}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              allow="autoplay"
            />
          </div>
          <div className="text-center mt-3">
            <p className="text-muted mb-2" style={{ fontSize: 14 }}>
              Now design one for <strong>your</strong> business
            </p>
            <a
              href={advisoryUrl}
              className="btn btn-primary rounded-pill px-4 py-2"
              data-track={`demo_inline_start_own_${trackContext}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 14 }}
            >
              Design My AI Organization &rarr;
            </a>
            <button
              className="btn btn-link btn-sm text-muted ms-3"
              onClick={() => setShowDemo(false)}
              style={{ fontSize: 12 }}
            >
              Close demo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
