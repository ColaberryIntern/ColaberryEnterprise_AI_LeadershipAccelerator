import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { adv2PillClass } from './adv2PillTone';

// Track A2 (2026-09-22) — extracted out of AgentTrustControlTab.tsx (which
// hit this repo's 500-line ceiling once the 2 new Authority & controls cards
// were added) and reflowed to this page's adv2-* visual language. Pure
// extraction: zero logic change from the original GOALS™ Score section.

interface Props {
  detail: AgentDetail;
}

function goalsDimensionSource(source: 'live' | 'fixed') {
  return source === 'live'
    ? <span className={adv2PillClass('success')}>Live</span>
    : <span className={adv2PillClass('neutral')}>Declared</span>;
}

export default function AgentTrustControlGoalsScore({ detail }: Props) {
  return (
    <div className="adv2-card">
      <h2>GOALS™ Score<span className="adv2-hint">Colaberry's operational-excellence framework, from Ram Katamaraja's Trust Before Intelligence — how you measure whether an agent stays trustworthy after it's built. Real score, computed from this agent's own real data.</span></h2>
      <div className="adv2-body" style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid var(--adv2-rule)' }}>
        <span style={{ fontSize: '2.25rem', fontWeight: 700, lineHeight: 1 }}>{detail.goals_overall.toFixed(1)}</span>
        <span className="adv2-muted">/ 5 overall</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {detail.goals.map((g) => (
          <div key={g.key} className="adv2-body" style={{ borderTop: '1px solid var(--adv2-rule)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{g.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{g.score}/5</span>
                {goalsDimensionSource(g.source)}
              </span>
            </div>
            <p className="adv2-muted" style={{ margin: 0, fontSize: 13.5 }}>{g.evidence}</p>
          </div>
        ))}
      </div>
      <p className="adv2-muted adv2-body" style={{ fontSize: 13, borderTop: '1px solid var(--adv2-rule)' }}>
        G-O-A-L-S maps back to the book's own INPACT™ needs: Governance→Permitted, Observability→Transparent, Availability→Instant, Lexicon→Natural/Contextual, Solid→Adaptive.
      </p>
    </div>
  );
}
