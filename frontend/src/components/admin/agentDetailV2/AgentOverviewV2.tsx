import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { ManagerInboxItem } from '../../../services/managerInboxApi';
import AgentOverviewV2MainColumn from './AgentOverviewV2MainColumn';
import AgentOverviewV2Sidebar from './AgentOverviewV2Sidebar';
import AgentOverviewV2Hero from './AgentOverviewV2Hero';
import AgentOverviewV2Metrics from './AgentOverviewV2Metrics';
import AgentOverviewV2NeedsAli from './AgentOverviewV2NeedsAli';
import type { TabKey } from './AgentDetailV2Header';

// Agent Detail V2, Overview (2026-09-11) — Ali pasted a full mockup and
// asked to match its format: one flowing two-column page (main content +
// sidebar), replacing the sub-tabbed Overview from Checkpoint H earlier
// this session. Same real content as that version — nothing dropped, see
// the two column components for exactly where each field landed.
//
// Dashboard redesign, Slice 2b (2026-09-19) — the mockup's hero sentence,
// 4-tile KPI shape, and "Needs Ali" card, added above the existing
// two-column grid (a full-width banner, matching the mockup's own
// placement, not squeezed into either column).
//
// Agent Detail redesign, Track A1 (2026-09-21) — Overview becomes the
// default landing tab (AgentDetailPage.tsx); the hero/KPI top is rebuilt in
// the mockup's own dark-gradient `.adv2-hero`/`.adv2-metrics` visual
// language (was plain Bootstrap StatCards — see AgentOverviewV2Hero.tsx's
// and AgentOverviewV2Metrics.tsx's own header comments for the full
// honest-relabeling reasoning). Every one of the 11 real sections that
// existed before this run (6 in MainColumn, 5 in Sidebar) is UNCHANGED —
// this run only touched the top-of-page composition and appended one new
// static explainer card at the end of MainColumn.

interface Props {
  detail: AgentDetail;
  inboxItems: ManagerInboxItem[];
  inboxLoading: boolean;
  onNavigate: (tab: TabKey) => void;
}

export default function AgentOverviewV2({ detail, inboxItems, inboxLoading, onNavigate }: Props) {
  const agentDisplayName = detail.identity?.display_name || detail.agent.agent_name;

  return (
    <div className="adv2-wrap">
      <AgentOverviewV2Hero detail={detail} onNavigate={onNavigate} />
      <AgentOverviewV2Metrics detail={detail} inboxItems={inboxItems} onNavigate={onNavigate} />
      <div style={{ marginBottom: 20 }}>
        <AgentOverviewV2NeedsAli inboxItems={inboxItems} inboxLoading={inboxLoading} onNavigate={onNavigate} />
      </div>
      <div className="adv2-grid">
        <AgentOverviewV2MainColumn detail={detail} onNavigate={onNavigate} />
        <AgentOverviewV2Sidebar detail={detail} agentId={detail.agent.id} agentDisplayName={agentDisplayName} />
      </div>
    </div>
  );
}
