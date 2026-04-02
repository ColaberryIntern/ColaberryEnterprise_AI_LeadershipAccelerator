import React from 'react';
import type { IndustryDemo } from '../config/industryDemos';
import { INDUSTRY_DEMOS } from '../config/industryDemos';
import IndustryDemoCard from './IndustryDemoCard';

interface IndustryDemoGridProps {
  demos?: IndustryDemo[];
  maxVisible?: number;
  columns?: 2 | 3;
  headline?: string;
  subtext?: string;
  trackContext: string;
  compact?: boolean;
}

export default function IndustryDemoGrid({
  demos = INDUSTRY_DEMOS,
  maxVisible,
  columns = 3,
  headline = 'See an AI Organization Get Built for Your Industry',
  subtext,
  trackContext,
  compact,
}: IndustryDemoGridProps) {
  const visible = maxVisible ? demos.slice(0, maxVisible) : demos;
  const colClass = columns === 2 ? 'col-md-6' : 'col-md-6 col-lg-4';

  if (compact) {
    return (
      <div className="my-4">
        {headline && (
          <p className="text-center text-muted small fw-semibold mb-3" style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 11 }}>
            {headline}
          </p>
        )}
        {visible.map(d => (
          <IndustryDemoCard key={d.scenario} demo={d} compact trackContext={trackContext} />
        ))}
      </div>
    );
  }

  return (
    <div className="my-5">
      {headline && (
        <h4 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary, #1a365d)', fontSize: 22 }}>
          {headline}
        </h4>
      )}
      {subtext && (
        <p className="text-center text-muted mb-4" style={{ fontSize: 14, maxWidth: 560, margin: '0 auto' }}>
          {subtext}
        </p>
      )}
      <div className="row g-3 justify-content-center">
        {visible.map(d => (
          <div key={d.scenario} className={colClass}>
            <IndustryDemoCard demo={d} trackContext={trackContext} />
          </div>
        ))}
      </div>
    </div>
  );
}
