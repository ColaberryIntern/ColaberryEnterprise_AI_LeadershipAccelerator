import React from 'react';
import type { TabKey } from './AgentDetailV2Header';

// Agent Detail redesign, Track A1 (2026-09-21) — the mockup's "What makes
// this agentic?" card. Confirmed with Ali (plan-mode, this run): kept as
// static onboarding copy, clearly framed as an explainer, not a data card —
// zero fabricated numbers, zero per-agent data. The one real thing here is
// the link, which reuses the same real onNavigate('decisions') handler
// AgentOverviewV2WorkExplained.tsx's own "View full decision journal" button
// already uses.

interface Props {
  onNavigate: (tab: TabKey) => void;
}

export default function AgentOverviewV2AgenticExplainer({ onNavigate }: Props) {
  return (
    <div className="adv2-card adv2-explainer">
      <div style={{ padding: '16px 19px' }}>
        <div className="adv2-eyebrow" style={{ color: 'var(--adv2-trust)' }}>What makes this agentic?</div>
        <h3 style={{ marginTop: 8, marginBottom: 6, fontSize: 15, fontWeight: 600 }}>The next step depends on the result.</h3>
        <p className="adv2-muted" style={{ fontSize: 13.5, margin: '0 0 12px' }}>
          Reese investigates, chooses an authorized action, checks what happened, and adjusts her plan.
        </p>
        <button className="adv2-link" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => onNavigate('decisions')}>
          Explore one complete decision →
        </button>
      </div>
    </div>
  );
}
