import { useEffect } from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { AutonomyLevel } from '../../../services/workforceOrgChartApi';

// Agent Detail V2 (2026-09-11) — Ali pasted a full mockup and asked to match
// its format for Reese's page. This file originally rendered the page's own
// header; that render logic moved into AgentDetailLayout.tsx (Track A0,
// 2026-09-21 — the sidebar/topbar contextual shell). This file now only
// holds the shared type/const/hook exports 5 other components still import
// from this exact path (AgentOverviewV2.tsx and its Hero/MainColumn/
// NeedsAli/WorkExplained siblings) — kept here rather than moved, so none of
// those 5 files need an import-path change for an unrelated shell redesign.

// Dashboard redesign, Slice 1 (2026-09-19) — Ali shared a real mockup
// ("Reese - Employee workspace preview") whose Performance & Settings
// destination consolidates 3 real, separate tabs (Reports/Performance/
// Trust & Control) into one page with 3 internal sub-tabs. 'reports' /
// 'performance' / 'trust' retired in favor of one 'performance_settings'
// key — see AgentPerformanceSettingsTab.tsx for the sub-tab shell.
//
// Dashboard redesign, Slice 2a (2026-09-19) — the combined "Work &
// Decisions" tab splits into two real tabs: 'work' now means the ticket
// list + detail (AgentWorkTab.tsx, new), and 'decisions' is the EXISTING
// Pending Approvals + Decision Journal content (AgentWorkDecisionsTab.tsx,
// relocated unchanged, not rewritten).
export type TabKey = 'glance' | 'command' | 'overview' | 'work' | 'decisions' | 'talk' | 'performance_settings';

export const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'glance', label: 'At a Glance' },
  { key: 'command', label: 'Live Status' },
  { key: 'overview', label: 'Overview' },
  { key: 'work', label: 'Work' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'talk', label: 'Talk' },
  { key: 'performance_settings', label: 'Performance & Settings' },
];

export const STATUS_LABEL: Record<AgentDetail['live_status'], string> = {
  online: 'Online', away: 'Away', offline: 'Offline', unknown: 'Status unknown',
};

// UI follow-up to the fleet-wide autonomy-classification work (2026-09-15) —
// Ali, on Reese's page: "why give the user the ability to change it... it
// wouldn't take away capabilities from it... We might as well set the
// default and color coordinate it and then have some type of popup that
// gives an explanation at why it has been given this autonomy level."
// Confirmed via a real code audit before building this: agent.autonomy_level
// IS read by agentAuthorizationService.ts, but that computation is
// shadow-only (abac_enforcement defaults to 'shadow' and nothing in this
// codebase ever flips it live) and the ONE function that actually gates real
// writes (agentPermissionService.ts's validateAgentWrite()) explicitly
// discards that result and gates off a completely separate static
// AGENT_PERMISSIONS map instead. So today, changing this value changes only
// what's stored/displayed/shadow-logged — never what the agent can do.
// Reuses the real .adv2-pill semantic classes already in agentDetailV2.css
// (adv2-trust/ok/warn/bad) rather than inventing new colors — an ascending
// consequence gradient, same as everywhere else that scale is used on this
// page.
export const LEVEL_PILL_CLASS: Record<AutonomyLevel, string> = {
  observe: 'adv2-trust',
  suggest: 'adv2-ok',
  act_audited: 'adv2-warn',
  communicate: 'adv2-bad',
};

// The mockup's Google Fonts link — injected once, scoped to when this page
// is actually visited, rather than added to public/index.html (which would
// cost every page load, not just this one).
export function useAdv2Fonts() {
  useEffect(() => {
    const id = 'adv2-fonts-link';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
  }, []);
}
