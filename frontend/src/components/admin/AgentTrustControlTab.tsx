import React from 'react';
import type { TabKey } from './agentDetailV2/AgentDetailV2Header';
import { AgentDetail } from '../../services/agentDetailApi';
import AgentTrustControlGoalsScore from './agentDetailV2/AgentTrustControlGoalsScore';
import AgentTrustControlMemory from './agentDetailV2/AgentTrustControlMemory';
import AgentTrustControlEnforcement from './agentDetailV2/AgentTrustControlEnforcement';
import AgentTrustControlDirectives from './agentDetailV2/AgentTrustControlDirectives';
import AgentTrustControlArchitecture from './agentDetailV2/AgentTrustControlArchitecture';
import AgentTrustControlAuthority from './agentDetailV2/AgentTrustControlAuthority';

// AI Agent Dashboard redesign, Checkpoint E: Trust & Control, slice 1
// (2026-09-03) — the fifth and last design section. Consolidated Governed
// Memory (the approval gate that makes an agent's runtime memory real
// rather than a dead flag — status must visually read as an actual gate,
// not decoration) and a consolidated Directives view (view + revoke;
// creating a new directive stays in Talk's Ask/Direct composer, its natural
// home). Deliberately does NOT re-render authorization_summary/tools
// capabilities/persona_version_history a second time — AgentOverviewTab's
// AgentTrustSummaryCard + tools cards already show all of that, live and
// tested; duplicating it here would drift. An Architecture Drawer
// (execution limits, department/scope — real AiAgent columns not yet
// surfaced anywhere) is real, deliberately deferred scope for the next
// slice.
//
// Overview sub-tabs (2026-09-10) — Ali: "The role character stored in
// Trust & Control shoudl be moved to Identify." The Charter tab that
// Checkpoint E folded in above is moved out again — it now lives on
// Overview's Identity section (real relocation, not a duplicate). Since
// the 2026-09-11 Overview redesign (Ali's pasted mockup) that's
// AgentOverviewV2Sidebar.tsx's own inline Role Charter card, reusing
// agentRoleCharterApi.ts directly. The old standalone AgentCharterTab.tsx
// component was deleted the same pass — nothing rendered it any more.
//
// Track A2 (2026-09-22) — this file hit the repo's 500-line ceiling once 2
// new real cards (Independence with boundaries, Work controls link) were
// needed for Ali's real mockup. Split into one adv2-styled sub-component per
// section (GOALS score, Governed Memory, Authorization Enforcement, Standing
// Directives, Architecture — each a pure extraction, zero logic change) plus
// the 2 new cards. This file is now a thin orchestrator.

interface Props {
  agentId: string;
  detail: AgentDetail;
  onNavigate: (tab: TabKey) => void;
}

export default function AgentTrustControlTab({ agentId, detail, onNavigate }: Props) {
  return (
    <>
      <AgentTrustControlGoalsScore detail={detail} />
      <AgentTrustControlMemory agentId={agentId} />
      <AgentTrustControlEnforcement agentId={agentId} detail={detail} />
      <AgentTrustControlAuthority agentId={agentId} />

      <div className="adv2-card" style={{ marginTop: 22 }}>
        <h2>Work controls</h2>
        <div className="adv2-body">
          <p className="adv2-muted" style={{ marginTop: 0 }}>
            Behaviour switches live on the Overview tab's Employee Facts card.
          </p>
          <button className="adv2-btn" onClick={() => onNavigate('overview')}>Go to Employee Facts</button>
        </div>
      </div>

      <AgentTrustControlDirectives agentId={agentId} />
      <AgentTrustControlArchitecture detail={detail} />
    </>
  );
}
