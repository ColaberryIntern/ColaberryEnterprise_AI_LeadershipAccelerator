import React from 'react';
import { Badge } from '../../colaberry/components/core/Badge';
import { TIMELINE_ITEMS } from '../../data/capabilityModel';

/**
 * "What's on the timeline" — the rolling schedule of weekly live events, new
 * modules, pattern drops, model updates, and Demo Day that keeps members current.
 */
export default function EcosystemTimeline() {
  return (
    <div style={{
      background: 'var(--surface-card)', border: 'var(--border-1) solid var(--border-subtle)',
      borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-lg)', padding: 'var(--space-8)',
    }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {TIMELINE_ITEMS.map((it, i) => (
          <li key={i} style={{
            display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-5)', alignItems: 'start',
            paddingBottom: i === TIMELINE_ITEMS.length - 1 ? 0 : 'var(--space-6)', position: 'relative',
          }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--text-muted)' }}>{it.when}</span>
            </div>
            <div style={{ position: 'relative', paddingLeft: 'var(--space-6)', borderLeft: i === TIMELINE_ITEMS.length - 1 ? '2px solid transparent' : '2px solid var(--border-subtle)', paddingBottom: 'var(--space-2)' }}>
              <span aria-hidden="true" style={{
                position: 'absolute', left: -7, top: 4, width: 12, height: 12, borderRadius: '50%',
                background: it.tone === 'red' ? '#FB2832' : it.tone === 'green' ? '#5BA63C' : it.tone === 'warning' ? '#E8920C' : '#367895',
                border: '2px solid var(--surface-card)',
              }} />
              <Badge tone={it.tone} style={{ marginBottom: 'var(--space-2)' }}>{it.kind}</Badge>
              <p style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text-strong)', margin: 0, lineHeight: 'var(--lh-snug)' }}>{it.title}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
