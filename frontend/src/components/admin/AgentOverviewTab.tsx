import React, { useState } from 'react';
import { AgentDetail } from '../../services/agentDetailApi';
import { SectionCard } from './shell';
import AgentTicketActivityTable from './AgentTicketActivityTable';
import AgentScheduledTasksCard from './AgentScheduledTasksCard';
import OverviewIdentityTab from './overview/OverviewIdentityTab';
import OverviewTrustTab from './overview/OverviewTrustTab';
import OverviewReportsToTab from './overview/OverviewReportsToTab';
import OverviewToolsTab from './overview/OverviewToolsTab';

// AI Workforce Management, Checkpoint B — the Overview tab. Everything that
// used to render unconditionally on AgentDetailPage.tsx, extracted verbatim
// (no behavior change) so the tab shell in AgentDetailPage.tsx stays under
// this repo's file-size guidance. See AgentCharterTab.tsx for the sibling tab.
//
// Overview sub-tabs (2026-09-10) — Ali, on Reese's own page: "Overview
// should have subtabs - Identity / Trust / System prompt / Reports to /
// Tools / Scheduled tasks / Tickets." What used to be nine flat sections on
// this tab becomes seven sub-tabs, same content, no data lost: Identity now
// also carries the Role Charter (moved out of Trust & Control, Ali's own
// wording), Trust groups the Trust Contract stats with their evidence
// (AgentTrustSummaryCard), Reports to gains a real Mermaid chart built from
// the same reports_to data the plain-text list already showed, and Tools
// merges the per-tool capability card with the reads/produces summary.
// Identity is the default sub-tab — it's what a click-through from the "Role
// Charter" tile on At a Glance now lands on (see AgentAtAGlanceTab.tsx).

type OverviewSubTab = 'identity' | 'trust' | 'prompt' | 'reportsTo' | 'tools' | 'scheduled' | 'tickets';

const SUB_TABS: Array<{ key: OverviewSubTab; label: string; icon: string }> = [
  { key: 'identity', label: 'Identity', icon: 'user-star-line' },
  { key: 'trust', label: 'Trust', icon: 'shield-check-line' },
  { key: 'prompt', label: 'System prompt', icon: 'chat-3-line' },
  { key: 'reportsTo', label: 'Reports to', icon: 'git-branch-line' },
  { key: 'tools', label: 'Tools', icon: 'tools-line' },
  { key: 'scheduled', label: 'Scheduled tasks', icon: 'calendar-check-line' },
  { key: 'tickets', label: 'Tickets', icon: 'ticket-2-line' },
];

interface Props {
  detail: AgentDetail;
}

export default function AgentOverviewTab({ detail }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<OverviewSubTab>('identity');
  const { agent, identity, tickets, ticket_breakdown, related_tasks, capabilities, reports_to } = detail;
  const agentName = identity?.display_name || agent.agent_name;

  return (
    <>
      <ul className="nav nav-pills mb-4" style={{ fontSize: '0.85rem' }}>
        {SUB_TABS.map((tab) => (
          <li key={tab.key} className="nav-item me-1 mb-1">
            <button
              className={`nav-link ${activeSubTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveSubTab(tab.key)}
            >
              <i className={`ri-${tab.icon} me-1`} aria-hidden="true" />
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {activeSubTab === 'identity' && <OverviewIdentityTab detail={detail} agentId={agent.id} agentName={agentName} />}
      {activeSubTab === 'trust' && <OverviewTrustTab detail={detail} />}
      {activeSubTab === 'prompt' && (
        <SectionCard title="System prompt" icon="chat-3-line" subtitle="The real, current text sent to the model for every conversation this agent has.">
          {agent.system_prompt ? (
            <pre className="bg-light p-3 rounded" style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', maxHeight: '420px', overflowY: 'auto' }}>
              {agent.system_prompt}
            </pre>
          ) : (
            <p className="text-muted mb-0">No system prompt recorded.</p>
          )}
        </SectionCard>
      )}
      {activeSubTab === 'reportsTo' && <OverviewReportsToTab reportsTo={reports_to} agentDisplayName={agentName} />}
      {activeSubTab === 'tools' && <OverviewToolsTab capabilities={capabilities} />}
      {activeSubTab === 'scheduled' && <AgentScheduledTasksCard tasks={related_tasks} />}
      {activeSubTab === 'tickets' && <AgentTicketActivityTable tickets={tickets} ticketBreakdown={ticket_breakdown} />}
    </>
  );
}
