import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { SectionCard } from '../shell';
import AgentCharterTab from '../AgentCharterTab';

// Overview sub-tabs (2026-09-10) — Ali, on Reese's own page: "Overview
// should have subtabs." Identity is the first/default sub-tab. Role Charter
// moves here (out of Trust & Control, per Ali's explicit "moved to
// Identify") — reused wholesale, unchanged, same pattern as every prior
// section relocation on this page (Checkpoint B->F->G in AgentDetailPage.tsx).

interface Props {
  detail: AgentDetail;
  agentId: string;
  agentName: string;
}

export default function OverviewIdentityTab({ detail, agentId, agentName }: Props) {
  const { agent, identity } = detail;

  return (
    <>
      <SectionCard title="Identity" icon="user-star-line">
        {identity ? (
          <dl className="row mb-0">
            <dt className="col-sm-3">Real staff account</dt>
            <dd className="col-sm-9">{identity.display_name || identity.email} ({identity.email})</dd>
            <dt className="col-sm-3">AI-operated</dt>
            <dd className="col-sm-9">
              {identity.is_ai_operated ? (
                <span className="badge bg-info-subtle text-info-emphasis">AI-operated (admin view only — never shown to students)</span>
              ) : (
                'No'
              )}
            </dd>
            <dt className="col-sm-3">Agent type</dt>
            <dd className="col-sm-9"><code>{agent.agent_type}</code>{agent.category && <> · <code>{agent.category}</code></>}</dd>
          </dl>
        ) : (
          <p className="text-muted mb-0">No linked staff identity yet.</p>
        )}
      </SectionCard>

      <AgentCharterTab agentId={agentId} agentName={agentName} />
    </>
  );
}
