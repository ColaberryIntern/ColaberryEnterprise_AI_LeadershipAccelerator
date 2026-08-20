import type { OrgChartHuman, OrgChartLeadershipAgent, OrgChartStaffAgent } from './orgChartService';

/**
 * orgChartColorAssignment — Org Chart v3 (2026-08-19, session
 * CC-20260818-x4nk continued). Ali, live: "Humans should have their own
 * color - AI Leadership should be same color coordinated and every AI Agent
 * that reports to them should be that color... Only a few staff have agents
 * so use the main colors for the people that have AI Agent staff. Human, AI
 * Leadership, AI Staff should all have the same colors."
 *
 * Pure function, no I/O, no Sequelize — takes the already-built
 * humans/leadership/staff arrays orgChartService.ts's getOrgChart() produces
 * and returns per-id color maps. Kept as its own module (not inlined into
 * orgChartService.ts, which is already sized close to CLAUDE.md's target)
 * so this logic is trivially unit-testable in isolation, with zero mocks.
 */

/** The real, already-documented --chart-1..8 tokens from
 * frontend/src/colaberry/tokens/colors.css (lines 74-81) — "ordered for max
 * adjacent separation and color-blind safety." Backend can't import CSS, so
 * this is a deliberate, documented mirror (same convention
 * workforceOrgChartApi.ts already uses for NAMED_DEPARTMENTS) — never an
 * invented hex. Identical to frontend/src/utils/agentAvatarColor.ts's
 * AGENT_AVATAR_PALETTE, which this replaces for anyone in a colored
 * hierarchy branch (kept as the frontend's own fallback for everyone else). */
export const CHART_PALETTE: readonly string[] = [
  '#367895', // chart-1 — berry blue
  '#FB2832', // chart-2 — cherry red
  '#5BA63C', // chart-3 — leaf green
  '#E8920C', // chart-4 — amber
  '#7A5AF0', // chart-5 — violet
  '#2BA39A', // chart-6 — teal
  '#C2185B', // chart-7 — magenta
  '#6B6B6B', // chart-8 — neutral
];

export interface HierarchyColorMaps {
  humanColors: Map<string, string>;
  leadershipColors: Map<string, string>;
  staffColors: Map<string, string>;
}

/**
 * Assigns each human who has at least one AI Leadership agent reporting to
 * them a DISTINCT color from CHART_PALETTE, deterministically ordered by
 * `id` (matches assignDistinctAvatarColors()'s own sort-before-assign
 * convention, so the same person gets the same color across every page
 * load/deploy, never a per-request-random pick). That color then propagates
 * to every AI Leadership agent reporting to them, and from there to every AI
 * Staff agent reporting through that leadership agent — one color per
 * hierarchy branch, all 3 tiers, per Ali's exact ask.
 *
 * Humans with ZERO AI Leadership agents (the majority) are simply absent
 * from `humanColors` — this function has no opinion on their fallback
 * color; the caller (frontend) decides that, per this run's
 * execution-contract.md Assumption 5.
 *
 * Palette exhaustion (>8 humans with agents) is handled by cycling back to
 * the start of CHART_PALETTE rather than crashing or inventing a 9th color
 * — mathematically impossible with today's real data (3 people), but
 * documented rather than silently wrong if it ever happens.
 */
export function assignHierarchyColors(
  humans: OrgChartHuman[],
  leadership: OrgChartLeadershipAgent[],
  staff: OrgChartStaffAgent[],
): HierarchyColorMaps {
  const humansWithAgents = humans
    .filter((h) => h.leadership_agent_ids.length > 0)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  const humanColors = new Map<string, string>();
  humansWithAgents.forEach((human, index) => {
    humanColors.set(human.id, CHART_PALETTE[index % CHART_PALETTE.length]);
  });

  const leadershipColors = new Map<string, string>();
  for (const l of leadership) {
    const color = humanColors.get(l.reports_to_human_id);
    if (color) leadershipColors.set(l.id, color);
  }

  const staffColors = new Map<string, string>();
  for (const s of staff) {
    const color = leadershipColors.get(s.reports_to_agent_id);
    if (color) staffColors.set(s.id, color);
  }

  return { humanColors, leadershipColors, staffColors };
}
