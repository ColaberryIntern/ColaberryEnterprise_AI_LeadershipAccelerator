import React, { useState } from 'react';
import type { TabKey } from './agentDetailV2/AgentDetailV2Header';
import { AgentDetail } from '../../services/agentDetailApi';
import AgentReportsTab from './AgentReportsTab';
import AgentPerformanceTab from './AgentPerformanceTab';
import AgentTrustControlTab from './AgentTrustControlTab';
import AgentOverviewV2ToolsChannels from './agentDetailV2/AgentOverviewV2ToolsChannels';

// Agent Detail dashboard redesign, Slice 1 (2026-09-19) — Ali shared a real
// HTML mockup ("Reese - Employee workspace preview") whose "Performance &
// Settings" destination is one page with 3 sub-tabs: Results & reports,
// Tools & channels, Authority & controls. This consolidates 3 real,
// already-shipped, already-tested top-level tabs (Reports, Performance,
// Trust & Control) into that shape — a pure reorganization, matching this
// page's own established "fold" precedent (see AgentDetailPage.tsx's
// Checkpoint E). None of the 3 relocated components' own internals change;
// only where they're mounted does.
//
// "Results & reports" stacks Reports and Performance (Goals/1:1s) rather
// than interleaving them — each already renders its own real section
// headings, so the grouping the mockup shows is preserved without needing
// to split AgentPerformanceTab's internals apart.
//
// "Tools & channels" hosts the Capabilities section relocated out of
// Overview (Slice 1's R18) — see AgentOverviewV2ToolsChannels.tsx for the
// real content, extracted verbatim from AgentOverviewV2MainColumn.tsx, not
// duplicated.

type SettingsSubTab = 'results' | 'tools' | 'authority';

const SUB_TABS: Array<{ key: SettingsSubTab; label: string }> = [
  { key: 'results', label: 'Results & reports' },
  { key: 'tools', label: 'Tools & channels' },
  { key: 'authority', label: 'Authority & controls' },
];

interface Props {
  agentId: string;
  detail: AgentDetail;
  onNavigate: (tab: TabKey) => void;
}

export default function AgentPerformanceSettingsTab({ agentId, detail, onNavigate }: Props) {
  const [subTab, setSubTab] = useState<SettingsSubTab>('results');

  return (
    <div>
      <nav className="adv2-tabs" role="tablist" aria-label="Performance and settings sections" style={{ marginTop: 0 }}>
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={subTab === tab.key}
            className="adv2-tab"
            onClick={() => setSubTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {subTab === 'results' && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <AgentReportsTab agentId={agentId} />
          <AgentPerformanceTab agentId={agentId} />
        </div>
      )}
      {subTab === 'tools' && (
        <div style={{ marginTop: 18 }}>
          <AgentOverviewV2ToolsChannels detail={detail} />
        </div>
      )}
      {subTab === 'authority' && (
        <div style={{ marginTop: 18 }}>
          <AgentTrustControlTab agentId={agentId} detail={detail} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
}
