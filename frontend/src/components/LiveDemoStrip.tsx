import React, { useState, useMemo } from 'react';
import { getAdvisoryUrl, getDemoWalkthroughUrl } from '../services/utmService';
import { INDUSTRY_DEMOS } from '../config/industryDemos';

export default function LiveDemoStrip() {
  const [showDemo, setShowDemo] = useState(false);
  const advisoryUrl = getAdvisoryUrl();

  // Pick a random industry on mount
  const demo = useMemo(() => {
    const idx = Math.floor(Math.random() * INDUSTRY_DEMOS.length);
    return INDUSTRY_DEMOS[idx];
  }, []);

  const demoUrl = getDemoWalkthroughUrl(demo.scenario);

  return (
    <div className="py-4" style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
      <div className="container" style={{ maxWidth: 900 }}>
        {!showDemo ? (
          <div className="text-center">
            <p className="text-muted mb-2" style={{ fontSize: 14 }}>
              See a <strong>{demo.label}</strong> AI Organization Get Configured in Seconds
            </p>
            <button
              className="btn btn-dark rounded-pill px-4 py-2"
              data-track={`demo_inline_play_${demo.scenario}`}
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
                border: '1px solid #e2e8f0',
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
                data-track="demo_inline_start_own"
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
    </div>
  );
}
