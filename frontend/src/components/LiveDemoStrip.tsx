import React from 'react';
import { getAdvisoryUrl } from '../services/utmService';

export default function LiveDemoStrip() {
  const url = getAdvisoryUrl();

  const agents = [
    { icon: '\u{1F9E0}', name: 'Cory', action: 'Analyzed 47 leads', color: '#3b82f6' },
    { icon: '\u{1F4DE}', name: 'Maya', action: 'Made 12 calls today', color: '#10b981' },
    { icon: '\u{2709}\uFE0F', name: 'Dhee', action: 'Sent 156 emails', color: '#8b5cf6' },
    { icon: '\u{1F4CA}', name: 'Strategy', action: '3 meetings booked', color: '#f59e0b' },
  ];

  return (
    <div className="py-4" style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
      <div className="container">
        <p className="text-center text-muted small mb-3 fw-semibold" style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 11 }}>
          See AI Run Your Business
        </p>
        <div className="d-flex flex-wrap justify-content-center gap-3 mb-3">
          {agents.map((a, i) => (
            <div
              key={i}
              className="d-flex align-items-center gap-2 px-3 py-2"
              style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, minWidth: 180 }}
            >
              <span style={{ fontSize: 20 }}>{a.icon}</span>
              <div>
                <div className="fw-semibold" style={{ color: a.color, fontSize: 12 }}>{a.name}</div>
                <div style={{ color: '#475569' }}>{a.action}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center">
          <a
            href={url}
            className="btn btn-outline-primary btn-sm"
            data-track="demo_strip_try_it"
            target="_blank"
            rel="noopener noreferrer"
            style={{ borderRadius: 20, padding: '6px 20px', fontSize: 13 }}
          >
            Try It With Your Business &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
