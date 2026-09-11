import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import AgentOverviewV2MainColumn from './AgentOverviewV2MainColumn';
import AgentOverviewV2Sidebar from './AgentOverviewV2Sidebar';

// Agent Detail V2, Overview (2026-09-11) — Ali pasted a full mockup and
// asked to match its format: one flowing two-column page (main content +
// sidebar), replacing the sub-tabbed Overview from Checkpoint H earlier
// this session. Same real content as that version — nothing dropped, see
// the two column components for exactly where each field landed.

interface Props {
  detail: AgentDetail;
}

export default function AgentOverviewV2({ detail }: Props) {
  const agentDisplayName = detail.identity?.display_name || detail.agent.agent_name;

  return (
    <div className="adv2-wrap adv2-grid">
      <AgentOverviewV2MainColumn detail={detail} />
      <AgentOverviewV2Sidebar detail={detail} agentId={detail.agent.id} agentDisplayName={agentDisplayName} />
    </div>
  );
}
