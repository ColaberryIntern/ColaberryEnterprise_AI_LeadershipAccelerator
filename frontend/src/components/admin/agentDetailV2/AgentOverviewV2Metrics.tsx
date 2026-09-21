import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { ManagerInboxItem } from '../../../services/managerInboxApi';
import type { TabKey } from './AgentDetailV2Header';

// Agent Detail redesign, Track A1 (2026-09-21) — split out of
// AgentOverviewV2Hero.tsx (which owned these 4 tiles as Bootstrap
// StatCards before this run) to match the mockup's own `.metrics`/
// `.metric` 4-tile row, relabeled to the mockup's case-centric language.
// Every tile is real, reusing data already fetched at the page level — no
// new fetch. See this run's own execution-contract.md for the honest
// mapping each relabel is built on:
//   - "Owned cases" = the same "actionable" derivation (status_bucket !==
//     null) the Work tab itself uses, NOT the old lifetime total.
//   - "Needs your decision" = inboxItems.length, the same real
//     ProposedAgentAction count AgentOverviewV2NeedsAli.tsx renders.
//   - "Ready for your review" = status_bucket === 'ready_to_verify' — an
//     honest PARTIAL proxy for the mockup's "Waiting on a person" (no real
//     3-way waiting-on-Ali/staff/student field exists anywhere in this
//     codebase, see AgentWorkTab.tsx's own established finding) —
//     deliberately relabeled rather than overclaiming.
//   - "Completed (30d)" = detail.completed_ticket_count_30d, a small new
//     backend count (see liveAgentsService.ts's countCompletedTicketsForAgent)
//     — relabeled from the mockup's "Verified complete" since nothing here
//     is actually verified.

interface Props {
  detail: AgentDetail;
  inboxItems: ManagerInboxItem[];
  onNavigate: (tab: TabKey) => void;
}

export default function AgentOverviewV2Metrics({ detail, inboxItems, onNavigate }: Props) {
  const ownedCases = detail.tickets.filter((t) => t.status_bucket !== null).length;
  const readyForReview = detail.tickets.filter((t) => t.status_bucket === 'ready_to_verify').length;

  const tiles: Array<{ key: string; label: string; value: number; hint: string }> = [
    { key: 'owned', label: 'Owned cases', value: ownedCases, hint: 'Every case has a next step' },
    { key: 'needs', label: 'Needs your decision', value: inboxItems.length, hint: 'Open the Decisions tab' },
    { key: 'ready', label: 'Ready for your review', value: readyForReview, hint: 'In review, waiting on you' },
    { key: 'completed', label: 'Completed (30d)', value: detail.completed_ticket_count_30d, hint: 'Closed in the last 30 days' },
  ];

  return (
    <div className="adv2-metrics">
      {tiles.map((tile) => (
        <button key={tile.key} className="adv2-metric" onClick={() => onNavigate(tile.key === 'needs' ? 'decisions' : 'work')}>
          <div className="adv2-k">{tile.label}</div>
          <div className="adv2-v">{tile.value}</div>
          <div className="adv2-hint">{tile.hint}</div>
        </button>
      ))}
    </div>
  );
}
