import React, { useCallback, useEffect, useState } from 'react';
import { AgentRoleCharter, getAgentRoleCharter } from '../../../services/agentRoleCharterApi';

// Track A2 (2026-09-22) — Ali's real mockup (preview (3).html's Authority &
// controls sub-tab) shows an "Independence with boundaries" card: 3 tiers of
// what the agent can do unsupervised, what needs Ali first, and what's
// entirely off limits. Real backing exists — the Role Charter's
// authority_autonomous/authority_approval_required/authority_forbidden
// columns (built R4/R5, 2026-09-17/18) — but the backend endpoint's response
// already includes them; nothing on the frontend fetched or rendered them
// until now. Own, independent fetch (not shared with
// AgentOverviewV2Sidebar's own charter fetch) since no cross-component
// coupling exists today and this tab doesn't need the charter's other
// fields (roleTitle/mission/responsibilities/kpis).

interface Props {
  agentId: string;
}

interface Tier {
  key: string;
  label: string;
  pillClass: string;
  items: string[] | null;
}

export default function AgentTrustControlAuthority({ agentId }: Props) {
  const [charter, setCharter] = useState<AgentRoleCharter | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchCharter = useCallback(async () => {
    try {
      const view = await getAgentRoleCharter(agentId);
      setCharter(view.charter);
    } catch (err: any) {
      setLoadError(err?.response?.data?.error || 'Failed to load role charter.');
    }
  }, [agentId]);

  useEffect(() => { fetchCharter(); }, [fetchCharter]);

  const tiers: Tier[] = charter
    ? [
        { key: 'can-act', label: 'Can act', pillClass: 'adv2-pill adv2-ok', items: charter.authorityAutonomous },
        { key: 'ask-first', label: 'Ask Ali first', pillClass: 'adv2-pill adv2-warn', items: charter.authorityApprovalRequired },
        { key: 'outside-role', label: 'Outside role', pillClass: 'adv2-pill adv2-neutral', items: charter.authorityForbidden },
      ]
    : [];

  return (
    <div className="adv2-card" style={{ marginTop: 22 }}>
      <h2>Independence with boundaries<span className="adv2-hint">What this agent can do on its own, what needs your approval first, and what's out of scope entirely — from its own role charter.</span></h2>
      <div className="adv2-body">
        {loadError && <p style={{ color: 'var(--adv2-bad)' }}>{loadError}</p>}
        {charter === undefined && !loadError && <p className="adv2-muted">Loading…</p>}
        {charter === null && <p className="adv2-muted">No role charter has been written yet.</p>}
        {charter && (
          <div className="adv2-tier-list">
            {tiers.map((tier) => (
              <div key={tier.key} className="adv2-tier">
                <span className={tier.pillClass}>{tier.label}</span>
                {tier.items && tier.items.length > 0 ? (
                  <ul>
                    {tier.items.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="adv2-muted">None recorded.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
