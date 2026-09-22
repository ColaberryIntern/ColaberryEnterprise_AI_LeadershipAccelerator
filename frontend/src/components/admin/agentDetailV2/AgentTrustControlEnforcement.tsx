import React, { useCallback, useState } from 'react';
import { timeAgo } from '../shell/trust';
import { adv2PillClass } from './adv2PillTone';
import { AgentDetail, setAgentAbacOverride } from '../../../services/agentDetailApi';

// Track A2 (2026-09-22) — extracted out of AgentTrustControlTab.tsx (which
// hit this repo's 500-line ceiling once the 2 new Authority & controls cards
// were added) and reflowed to this page's adv2-* visual language, including
// the new .adv2-radio-row class. Pure extraction: zero logic change from the
// original Authorization Enforcement section (Real-enforcement scoping,
// Phase 3, 2026-09-20).

interface Props {
  agentId: string;
  detail: AgentDetail;
}

type AbacSelection = 'default' | 'shadow' | 'enforce';

// 'off' is included only because AgentDetail's abac_effective_mode type allows it (the
// platform-wide kill switch) — it's not a value this card's own controls can ever select.
function abacModeBadge(mode: 'off' | 'shadow' | 'enforce') {
  if (mode === 'enforce') return <span className={adv2PillClass('success')}>Enforce</span>;
  if (mode === 'off') return <span className={adv2PillClass('neutral')}>Off (platform-wide)</span>;
  return <span className={adv2PillClass('info')}>Shadow</span>;
}

export default function AgentTrustControlEnforcement({ agentId, detail }: Props) {
  const [abacOverride, setAbacOverride] = useState<'shadow' | 'enforce' | null>(detail.agent.abac_mode_override);
  const [abacSetAt, setAbacSetAt] = useState<string | null>(detail.agent.abac_mode_override_set_at);
  const [abacSetBy, setAbacSetBy] = useState<string | null>(detail.agent.abac_mode_override_set_by);
  const [abacSelection, setAbacSelection] = useState<AbacSelection>(detail.agent.abac_mode_override ?? 'default');
  const [abacSaving, setAbacSaving] = useState(false);
  const [abacError, setAbacError] = useState<string | null>(null);
  const abacGlobalDefault = detail.agent.abac_global_default;
  // Global 'off' always wins over any per-agent override, matching the real chokepoint's own
  // behavior (agentAuthorizationService.ts) — reproduced here so a save's local recomputation
  // never shows an override "winning" over a global 'off' state that it never actually can.
  const abacEffectiveMode = abacGlobalDefault === 'off' ? 'off' : (abacOverride ?? abacGlobalDefault);

  const handleSaveAbacOverride = useCallback(async () => {
    setAbacSaving(true);
    setAbacError(null);
    try {
      const value = abacSelection === 'default' ? null : abacSelection;
      const result = await setAgentAbacOverride(agentId, value);
      setAbacOverride(result.override);
      setAbacSetAt(result.setAt);
      setAbacSetBy(result.setBy);
    } catch (err: any) {
      setAbacError(err?.response?.data?.error || 'Failed to update authorization enforcement');
    } finally {
      setAbacSaving(false);
    }
  }, [agentId, abacSelection]);

  return (
    <div className="adv2-card" style={{ marginTop: 22 }}>
      <h2>Authorization Enforcement<span className="adv2-hint">Whether this agent's real actions are actually blocked when policy would deny them, or only logged (shadow mode). Set per agent here, or leave it following the platform-wide default.</span></h2>
      <div className="adv2-body" style={{ borderBottom: '1px solid var(--adv2-rule)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 600 }}>Currently:</span>
          {abacModeBadge(abacEffectiveMode)}
        </div>
        {abacGlobalDefault === 'off' ? (
          <p className="adv2-muted" style={{ margin: 0 }}>
            The platform-wide authorization gate is fully off right now — that always wins over any per-agent setting below.
          </p>
        ) : abacOverride === null ? (
          <p className="adv2-muted" style={{ margin: 0 }}>
            Following the platform-wide default ({abacGlobalDefault}). No one has set an override for this agent.
          </p>
        ) : (
          <p className="adv2-muted" style={{ margin: 0 }}>
            Overridden to <strong>{abacOverride}</strong> by {abacSetBy || 'an admin'}
            {abacSetAt ? `, ${timeAgo(abacSetAt)}` : ''} — the platform-wide default is currently {abacGlobalDefault}.
          </p>
        )}
      </div>
      <div className="adv2-body">
        {abacError && <p style={{ color: 'var(--adv2-bad)' }}>{abacError}</p>}
        <p style={{ color: 'var(--adv2-warn)', marginTop: 0 }}>
          Setting this to Enforce has a real, immediate effect once the platform-wide default isn't also off: this
          agent's held actions actually stop, instead of only being logged.
        </p>
        <div>
          {(['default', 'shadow', 'enforce'] as const).map((choice) => (
            <div key={choice} className="adv2-radio-row">
              <input
                type="radio"
                id={`abac-${agentId}-${choice}`}
                name={`abac-selection-${agentId}`}
                checked={abacSelection === choice}
                onChange={() => setAbacSelection(choice)}
              />
              <label htmlFor={`abac-${agentId}-${choice}`}>
                {choice === 'default' && `Follow platform-wide default (${abacGlobalDefault})`}
                {choice === 'shadow' && 'Shadow — log only, never block'}
                {choice === 'enforce' && 'Enforce — actually block when policy denies'}
              </label>
            </div>
          ))}
        </div>
        <button
          className="adv2-btn adv2-primary"
          style={{ marginTop: 12 }}
          disabled={abacSaving || abacSelection === (abacOverride ?? 'default')}
          onClick={handleSaveAbacOverride}
        >
          {abacSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
