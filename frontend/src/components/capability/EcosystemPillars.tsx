import React from 'react';
import { Card } from '../../colaberry/components/core/Card';
import { ECOSYSTEM_PILLARS } from '../../data/capabilityModel';

/**
 * The six parts of the AI Systems Capability ecosystem. Names the bigger picture:
 * self-paced learning is one part, alongside certification, projects, the architect
 * network, weekly live events, and a rolling "stay current" timeline.
 */
export default function EcosystemPillars() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      {ECOSYSTEM_PILLARS.map((p) => (
        <Card key={p.name} padded elevation="sm" hoverable style={{ height: '100%' }}>
          <div aria-hidden="true" style={{
            display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: 'var(--radius-md)',
            background: 'var(--surface-brand-subtle)', color: 'var(--brand-accent)', fontSize: 24, marginBottom: 'var(--space-4)',
          }}>
            <i className={p.icon} />
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-h5)', color: 'var(--text-strong)', margin: '0 0 var(--space-2)' }}>{p.name}</h3>
          <p style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 'var(--lh-relaxed)', color: 'var(--text-muted)', margin: 0 }}>{p.desc}</p>
        </Card>
      ))}
    </div>
  );
}
