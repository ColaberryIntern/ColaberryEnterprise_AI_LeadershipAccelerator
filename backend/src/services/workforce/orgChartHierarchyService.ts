import { Op } from 'sequelize';
import OrgMember from '../../models/OrgMember';
import AiAgent from '../../models/AiAgent';
import { NAMED_DEPARTMENTS, OrgChartResponse } from './orgChartService';

/**
 * orgChartHierarchyService — org-chart admin write actions (Org Chart v3,
 * 2026-08-19, session CC-20260818-x4nk continued). New sibling module to
 * orgChartService.ts (which stays a pure, read-only builder) rather than
 * appended in place, matching this codebase's own extraction precedent
 * (ticketCreatorReportsToResolver.ts split out of ticketService.ts for the
 * exact same "keep the read path and the write/derivation path in separate,
 * independently-testable files" reason — see this run's execution-contract.md).
 *
 * Two capabilities live here:
 *   1. updateOrgMemberTeam() — Ali, live: "Give me the ability to switch the
 *      people between teams."
 *   2. resolveHumanDownstreamAgents() / isAgentInHumanDownstream() — the
 *      downward hierarchy walk (human -> their AI Leadership -> that
 *      leadership's AI Staff) that didn't exist anywhere in this repo before
 *      this build. Powers Task 5's assign-task authorization boundary
 *      (orgChartTaskAssignmentService.ts) and the frontend's agent picker.
 *      Deliberately symmetric with (not a copy of) the existing UPWARD walk
 *      in ticketCreatorReportsToResolver.ts's resolveReportsToChainWithTrail()
 *      — same depth-guard philosophy, opposite direction.
 */

/** Thrown when a PATCH targets an org_members.id that doesn't exist.
 * `status` is read by workforceController.ts's existing `fail()` helper
 * (`if (err && typeof err.status === 'number') return res.status(err.status)...`)
 * with zero changes to that helper. */
export class OrgMemberNotFoundError extends Error {
  readonly error_class = 'OrgMemberNotFoundError' as const;
  readonly status = 404;

  constructor(orgMemberId: string) {
    super(`No org_members row found for id "${orgMemberId}".`);
    this.name = 'OrgMemberNotFoundError';
  }
}

/** Thrown when a PATCH's `team` value is neither `null` nor one of
 * NAMED_DEPARTMENTS. Defense-in-depth: the route's own Zod schema
 * (workforceController.ts) already rejects this at the boundary with a 400,
 * but this service validates independently too, since it's a real,
 * reusable write path (a future script or a second caller must not be able
 * to bypass this rule just because it skips the HTTP layer). */
export class InvalidDepartmentError extends Error {
  readonly error_class = 'InvalidDepartmentError' as const;
  readonly status = 400;

  constructor(team: string) {
    super(`"${team}" is not a recognized department. Valid values: ${NAMED_DEPARTMENTS.join(', ')}, or null.`);
    this.name = 'InvalidDepartmentError';
  }
}

function isValidDepartment(team: string | null): boolean {
  return team === null || (NAMED_DEPARTMENTS as readonly string[]).includes(team);
}

/**
 * Updates one org_members row's `team`. `team: null` clears the department
 * (the row buckets into orgChartService.ts's OTHER_DEPARTMENT on next read —
 * this function itself has no department-grouping opinion, it just writes
 * the column). Idempotent by construction: writing the SAME team twice
 * produces the same end state both times (a plain UPDATE, no counters, no
 * side effects beyond the one row).
 */
export async function updateOrgMemberTeam(orgMemberId: string, team: string | null): Promise<OrgMember> {
  if (!isValidDepartment(team)) {
    throw new InvalidDepartmentError(team as string);
  }

  const member = await OrgMember.findByPk(orgMemberId);
  if (!member) {
    throw new OrgMemberNotFoundError(orgMemberId);
  }

  await member.update({ team });
  return member;
}

/** Cycle/misconfiguration guard for the downward walk — same rationale as
 * ticketCreatorReportsToResolver.ts's MAX_CHAIN_DEPTH: today's real data is
 * exactly 2 hops (Leadership -> Staff), but nothing here hardcodes "exactly
 * 2"; a future 3rd tier works with zero code change, and a broken/cyclic
 * reports_to graph fails closed (stops walking) rather than looping
 * forever. */
const MAX_DOWNWARD_DEPTH = 5;

export interface HumanDownstreamAgents {
  leadership: AiAgent[];
  staff: AiAgent[];
}

/**
 * Every AI agent that reports, directly or through one or more leadership
 * hops, to the given human — the downward mirror of
 * ticketCreatorReportsToResolver.ts's upward resolveReportsToHuman(). Level
 * 1 is this human's direct AI Leadership (reports_to_type='human',
 * reports_to_id=orgMemberId). Every subsequent level is whichever agents
 * report to the PREVIOUS level's agents (reports_to_type='agent'), walked
 * breadth-first until a level comes back empty or MAX_DOWNWARD_DEPTH is hit.
 * `staff` accumulates every level after the first, so a future 3rd tier
 * still comes back correctly with zero code change here (today's real data
 * only ever populates level 2, per the "AI Staff only reports to AI
 * Leadership" invariant this build was told to preserve, not re-derive).
 */
export async function resolveHumanDownstreamAgents(orgMemberId: string): Promise<HumanDownstreamAgents> {
  const leadership = await AiAgent.findAll({ where: { reports_to_type: 'human', reports_to_id: orgMemberId } });

  const staff: AiAgent[] = [];
  let currentLevelIds = leadership.map((a) => a.id);
  let depth = 0;

  while (currentLevelIds.length > 0 && depth < MAX_DOWNWARD_DEPTH) {
    // eslint-disable-next-line no-await-in-loop -- bounded by MAX_DOWNWARD_DEPTH; real data is 1 iteration (today's 2-tier hierarchy), mirrors the upward walk's own await-in-loop precedent.
    const nextLevel = await AiAgent.findAll({ where: { reports_to_type: 'agent', reports_to_id: { [Op.in]: currentLevelIds } } });
    if (nextLevel.length === 0) break;
    staff.push(...nextLevel);
    currentLevelIds = nextLevel.map((a) => a.id);
    depth += 1;
  }

  return { leadership, staff };
}

/**
 * The real authorization check Task 5 needs: is `agentId` genuinely
 * somewhere in `orgMemberId`'s downstream hierarchy (their direct AI
 * Leadership OR any AI Staff reporting through it)? Built from the exact
 * same resolveHumanDownstreamAgents() result the frontend picker itself
 * would show, so the server-side check and the UI's own options can never
 * silently drift apart. Always re-derived live — never trusts a
 * client-supplied claim about the hierarchy shape.
 */
export async function isAgentInHumanDownstream(orgMemberId: string, agentId: string): Promise<boolean> {
  const { leadership, staff } = await resolveHumanDownstreamAgents(orgMemberId);
  return leadership.some((a) => a.id === agentId) || staff.some((a) => a.id === agentId);
}

/**
 * Org chart "My team" view (Track B, 2026-09-22) — scopes an already-built
 * OrgChartResponse down to one human's own downstream, given the ids
 * resolveHumanDownstreamAgents() already returned. Pure and synchronous: no
 * new query, no re-derivation of the hierarchy itself — a post-hoc filter
 * over the SAME response the unscoped path already builds, so the two paths
 * can never silently drift on what "downstream" means.
 *
 * Real composition gotcha this function exists to get right (caught in
 * plan-audit before any code was written): resolveHumanDownstreamAgents()'s
 * own leadership/staff split is structural (level-1 direct reports vs.
 * level-2+), but orgChartService.ts's getOrgChart() (Org Chart v5) re-splits
 * chart.leadership/chart.staff by whether an agent HAS SUBORDINATES of its
 * own — an individual-contributor agent reporting straight to a human with
 * no subordinates is level-1 (so it's in downstream.leadership) but lands in
 * chart.staff, not chart.leadership (Taiwo's real FinanceIntelligenceArchitect/
 * StudentSuccessArchitect are exactly this shape). Filtering chart.leadership
 * against downstream.leadership and chart.staff against downstream.staff as
 * two SEPARATE comparisons would silently drop these agents from both output
 * arrays. Building one combined id set and testing both chart arrays against
 * it avoids that entirely.
 */
export function scopeOrgChartToHuman(
  chart: OrgChartResponse,
  human: OrgMember,
  downstream: HumanDownstreamAgents,
): OrgChartResponse {
  const downstreamIds = new Set([...downstream.leadership, ...downstream.staff].map((a) => a.id));

  return {
    organization: chart.organization,
    humans: chart.humans.filter((h) => h.id === human.id),
    leadership: chart.leadership.filter((l) => downstreamIds.has(l.id)),
    staff: chart.staff.filter((s) => downstreamIds.has(s.id)),
    // An unresolved agent has no resolvable chain to any human by
    // definition, so it can never belong to anyone's "my team" — always
    // empty in the scoped view, never re-derived from the unscoped list.
    unresolved: [],
    generated_at: chart.generated_at,
  };
}

/**
 * Resolves "who is asking" for the "My team" toggle: the real org_members
 * row matching the authenticated admin's own JWT-verified email — the exact
 * one-line pattern already proven in agentManagerAuthMiddleware.ts's
 * requireAgentManagerOrAdmin(), copied here rather than reused directly
 * since that middleware's job is authorization (403 on a mismatch), and
 * this one is a display filter with an honest-empty-state fallback instead.
 * Returns null (never throws) when no org_members row matches — the caller
 * decides how to render that as an honest empty state, not an error.
 */
export async function resolveDownstreamForAdminEmail(
  email: string,
): Promise<{ human: OrgMember; downstream: HumanDownstreamAgents } | null> {
  const human = await OrgMember.findOne({ where: { email } });
  if (!human) return null;
  const downstream = await resolveHumanDownstreamAgents(human.id);
  return { human, downstream };
}

/**
 * The honest empty-arrays response for an admin whose email matches no real
 * org_members row — same OrgChartResponse shape as every other path, never
 * an error, never a fabricated placeholder. Built directly rather than by
 * calling scopeOrgChartToHuman() with a fake human, since there is no real
 * human row to scope from.
 */
export function emptyOrgChartResponse(chart: OrgChartResponse): OrgChartResponse {
  return {
    organization: chart.organization,
    humans: [],
    leadership: [],
    staff: [],
    unresolved: [],
    generated_at: chart.generated_at,
  };
}
