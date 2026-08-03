import React from 'react';
import { Button } from '../../colaberry/components/core/Button';
import { AICI_DIMENSIONS } from '../../data/capabilityModel';

const barColor = (pct: number): string => (pct >= 67 ? '#5BA63C' : pct >= 45 ? '#E8920C' : '#FB2832');

interface CapabilityIndexProps {
  /** where the CTA points; omit to hide the CTA */
  ctaHref?: string;
}

/**
 * AICI teaser — overall Capability Index score (SVG donut) + the seven dimension
 * bars. Illustrative sample organization. Colaberry DS idiom.
 */
export default function CapabilityIndex({ ctaHref }: CapabilityIndexProps) {
  const overall = Math.round(AICI_DIMENSIONS.reduce((s, d) => s + d.sample, 0) / AICI_DIMENSIONS.length);
  const r = 66;
  const c = 2 * Math.PI * r;

  return (
    <div style={{
      background: 'var(--surface-card)', border: 'var(--border-1) solid var(--border-subtle)',
      borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-lg)', padding: 'var(--space-8)',
      display: 'grid', gap: 'var(--space-8)', gridTemplateColumns: 'minmax(180px, 220px) 1fr', alignItems: 'center',
    }} className="cb-aici">
      <div style={{ textAlign: 'center' }}>
        <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={`AI Capability Index score ${overall} out of 100`}>
          <defs>
            <linearGradient id="aiciGrad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#FB2832" />
              <stop offset="50%" stopColor="#E8920C" />
              <stop offset="100%" stopColor="#5BA63C" />
            </linearGradient>
          </defs>
          <circle cx="90" cy="90" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="14" />
          <circle cx="90" cy="90" r={r} fill="none" stroke="url(#aiciGrad)" strokeWidth="14" strokeLinecap="round"
            strokeDasharray={`${(c * overall / 100).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 90 90)" />
          <text x="90" y="84" textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '44px', fill: 'var(--text-strong)' }}>{overall}</text>
          <text x="90" y="108" textAnchor="middle" style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '13px', fill: 'var(--text-muted)' }}>out of 100</text>
        </svg>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-strong)', marginTop: 'var(--space-2)' }}>AI Capability Index&trade;</div>
        <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>Illustrative organization</div>
      </div>

      <div>
        {AICI_DIMENSIONS.map((d) => (
          <div key={d.key} style={{ marginBottom: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--fs-body-sm)', fontWeight: 600, color: 'var(--text-body)' }}>{d.name}</span>
              <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--text-muted)' }}>{d.sample}</span>
            </div>
            <div style={{ height: 8, borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)', overflow: 'hidden' }}>
              <div style={{ width: `${d.sample}%`, height: '100%', background: barColor(d.sample), borderRadius: 'var(--radius-pill)' }} />
            </div>
          </div>
        ))}
        {ctaHref && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button as="a" href={ctaHref} size="sm" data-track="aici_get_index">
              Get your Capability Index
            </Button>
          </div>
        )}
      </div>
      <style>{`@media (max-width: 640px){ .cb-aici { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
