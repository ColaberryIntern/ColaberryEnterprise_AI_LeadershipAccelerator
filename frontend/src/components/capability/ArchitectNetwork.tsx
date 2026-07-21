import React from 'react';
import { Card } from '../../colaberry/components/core/Card';
import { Badge } from '../../colaberry/components/core/Badge';
import { Avatar } from '../../colaberry/components/core/Avatar';
import { ARCHITECTS } from '../../data/capabilityModel';

const phaseTone = (phase: string): 'red' | 'green' | 'blue' | 'warning' =>
  phase === 'AI Architect' ? 'warning' : phase === 'AI Builder' ? 'green' : 'blue';

/**
 * The architect network — a living community of AI Architects across different
 * companies and different phases, that members interact with through the platform.
 */
export default function ArchitectNetwork() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {ARCHITECTS.map((a) => (
        <Card key={a.name} padded elevation="sm" hoverable style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <Avatar name={a.name} ring />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-body)', color: 'var(--text-strong)' }}>{a.name}</div>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', marginBottom: 6 }}>{a.company}</div>
            <Badge tone={phaseTone(a.phase)}>{a.phase}</Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}
