/**
 * Ticket Board UX fixes (2026-08-17) — "when will this ticket next be
 * automatically re-checked?"
 *
 * As of 2026-08-16/17, 6 real, registered agents own an autonomous re-check +
 * close mechanism for a specific, narrow slice of the tickets table (see each
 * resolver's own file for its full design rationale — this module only reads
 * their live schedule, it never touches their resolution logic):
 *
 *   - CoryEngineTicketAutoResolver        (intelligence/autonomy/coryEngineTicketAutoResolver.ts)
 *   - CoryBrainInitiativeTicketAutoResolver (intelligence/autonomy/corybrainInitiativeTicketAutoResolver.ts)
 *   - InboxCaseSourceCompletionResolver   (intelligence/autonomy/inboxCaseSourceCompletionResolver.ts)
 *   - ReeseStudentSupportSupersessionResolver (intelligence/autonomy/reeseStudentSupportSupersessionResolver.ts)
 *   - BposCapabilityTicketAutoResolver    (services/company/bposCapabilityTicketAutoResolver.ts)
 *   - WorkforceTicketAutoResolver         (services/company/workforceTicketAutoResolver.ts)
 *
 * Every other ticket (the 16 unrelated "Architect" agents, manually-created
 * tickets, anything not matching one of the 6 scopes below) has NO real
 * re-check mechanism today — this module must never invent a plausible-looking
 * timer for one of those; `hasAutoCheck: false` with an honest `reason` is the
 * correct, deliberate answer for the majority of tickets on this board.
 *
 * Ownership rules below are copied from each resolver's own real `where`
 * scope (verified by reading each file directly — see this run's
 * execution-contract.md "Repository facts" for the full trail), not guessed
 * from ticket `type` alone. Schedule truth is read via the SAME function the
 * real scheduler uses to decide what to run (`resolveCronSchedule()` in
 * governanceResolutionService.ts) rather than a second, possibly-stale
 * hardcoded copy — a live governance-UI edit to one of the 5
 * SCHEDULE_REGISTRY-registered resolvers' schedules is reflected here
 * automatically. `ReeseStudentSupportSupersessionResolver` is the one
 * exception: it is wired via a raw `cron.schedule()` call in
 * schedulerService.ts with no governance-override path at all, so its
 * hardcoded literal IS its live schedule — resolveCronSchedule() still
 * degrades to that same hardcoded value correctly when no config row exists,
 * so the call is uniform across all 6 regardless.
 *
 * Two independent "is this really going to run" gates are checked, matching
 * how the two systems actually work: (1) `resolveCronSchedule()`'s own
 * `enabled` (the cron_schedule_configs governance-level gate — when false, the
 * scheduler literally stops the cron task, see aiOpsScheduler.ts's
 * reloadAIOpsSchedules()), and (2) AiAgent.enabled (the runAgent()-level
 * execution no-op gate the resolver's own deploy playbook uses as a
 * hold-until-reviewed switch). Both must be true for an honest "next check"
 * claim — either one false means the tick either never fires or fires and
 * does nothing, so a next-check estimate would be fiction either way.
 */
import { Op } from 'sequelize';
import AiAgent from '../models/AiAgent';
import { resolveCronSchedule } from './governanceResolutionService';
import { calculateNextRun, formatNextRun } from '../utils/cronNextRun';
import { getReeseAdminUserId } from './reese/reeseIdentitySeed';

export interface TicketAutoCheckInput {
  created_by_type: string;
  created_by_id: string;
  type: string;
  source: string;
  entity_type: string | null;
  status: string;
}

export interface TicketAutoCheckInfo {
  hasAutoCheck: boolean;
  resolverAgentName: string | null;
  nextCheckAt: string | null;
  nextCheckLabel: string | null;
  reason?: string;
}

interface OwnershipRule {
  resolverAgentName: string;
  hardcodedSchedule: string;
  matches: (ticket: TicketAutoCheckInput, reeseAdminUserId: string | null) => boolean;
}

const TERMINAL_STATUSES = new Set(['done', 'cancelled']);

// Schedule literals here are the SAME hardcoded defaults each resolver's own
// registration carries (aiOpsScheduler.ts SCHEDULE_REGISTRY / schedulerService.ts)
// — used only as the fallback resolveCronSchedule() itself falls back to when no
// live governance override row exists, never trusted directly for "enabled".
const OWNERSHIP_RULES: OwnershipRule[] = [
  {
    resolverAgentName: 'CoryEngineTicketAutoResolver',
    hardcodedSchedule: '25 */6 * * *',
    matches: (t) =>
      t.created_by_id === 'cory-engine' &&
      t.type === 'agent_action' &&
      t.source === 'cory_autonomous_cycle',
  },
  {
    resolverAgentName: 'CoryBrainInitiativeTicketAutoResolver',
    hardcodedSchedule: '40 */6 * * *',
    // No type/source narrowing — CORY_BRAIN_TICKET_SCOPE in
    // corybrainInitiativeTicketAutoResolver.ts is created_by_id only, confirmed
    // exhaustive against production by that file's own header comment.
    matches: (t) => t.created_by_id === 'CoryBrain',
  },
  {
    resolverAgentName: 'InboxCaseSourceCompletionResolver',
    hardcodedSchedule: '19 * * * *',
    // inboxCaseSourceCompletionResolver.ts's general closure-guard sweep re-checks
    // EVERY non-RESOLVED InboxCase each hourly pass (not just basecamp_todo-sourced
    // ones) — so every open type:'inbox_case' ticket genuinely gets re-checked,
    // even ones with no live signal likely to close them. "A check happens" is
    // honest for all of them; "it will close" is never claimed by this module.
    matches: (t) => t.type === 'inbox_case',
  },
  {
    resolverAgentName: 'BposCapabilityTicketAutoResolver',
    hardcodedSchedule: '55 */6 * * *',
    matches: (t) =>
      t.created_by_id === 'bpos_orchestrator' &&
      t.type === 'bpos_execution' &&
      t.entity_type === 'capability',
  },
  {
    resolverAgentName: 'WorkforceTicketAutoResolver',
    hardcodedSchedule: '15 */6 * * *',
    matches: (t) =>
      t.created_by_id === 'workforce_intelligence_engine' &&
      t.type === 'workforce_decision' &&
      t.entity_type === 'agent',
  },
  {
    resolverAgentName: 'ReeseStudentSupportSupersessionResolver',
    hardcodedSchedule: '0 17 * * *',
    matches: (t, reeseAdminUserId) =>
      !!reeseAdminUserId && t.created_by_id === reeseAdminUserId && t.type === 'student_support',
  },
];

const RESOLVER_AGENT_NAMES = OWNERSHIP_RULES.map((r) => r.resolverAgentName);

/**
 * Builds a per-request resolver function. Fetches each of the 6 agents' live
 * `enabled` flag and Reese's real AdminUser id ONCE (not once per ticket), then
 * returns a cheap, synchronous, in-memory function to call per ticket — this is
 * the shape that keeps a 16,000+-row board load from paying N DB round trips
 * for a handful of static facts.
 */
export async function buildTicketAutoCheckResolver(): Promise<
  (ticket: TicketAutoCheckInput) => TicketAutoCheckInfo
> {
  const [reeseAdminUserId, agentRows] = await Promise.all([
    getReeseAdminUserId().catch(() => null),
    AiAgent.findAll({
      where: { agent_name: { [Op.in]: RESOLVER_AGENT_NAMES } },
      attributes: ['agent_name', 'enabled'],
    }).catch(() => []),
  ]);

  const agentEnabledByName = new Map<string, boolean>(
    agentRows.map((a: any) => [a.agent_name as string, a.enabled as boolean]),
  );

  const scheduleByAgent = new Map<string, { schedule: string; enabled: boolean }>();
  await Promise.all(
    OWNERSHIP_RULES.map(async (rule) => {
      const resolved = await resolveCronSchedule(rule.resolverAgentName, rule.hardcodedSchedule).catch(
        () => null,
      );
      scheduleByAgent.set(rule.resolverAgentName, {
        schedule: resolved?.schedule ?? rule.hardcodedSchedule,
        enabled: resolved?.enabled ?? true,
      });
    }),
  );

  return (ticket: TicketAutoCheckInput): TicketAutoCheckInfo => {
    const noAutoCheck = (reason: string, resolverAgentName: string | null = null): TicketAutoCheckInfo => ({
      hasAutoCheck: false,
      resolverAgentName,
      nextCheckAt: null,
      nextCheckLabel: null,
      reason,
    });

    if (TERMINAL_STATUSES.has(ticket.status)) {
      return noAutoCheck('Ticket is already closed');
    }

    const rule = OWNERSHIP_RULES.find((r) => r.matches(ticket, reeseAdminUserId));
    if (!rule) {
      return noAutoCheck('No automated resolver owns this ticket type');
    }

    // AiAgent row missing entirely (e.g. registration hasn't run in this
    // environment) is treated the same as explicitly disabled — honest, not a
    // crash, never assumed enabled by default the way resolveCronSchedule()'s
    // OWN internal fallback does (that fallback is for "no live schedule
    // override exists", a different question from "does this agent exist and
    // run at all").
    const agentEnabled = agentEnabledByName.get(rule.resolverAgentName) ?? false;
    const schedule = scheduleByAgent.get(rule.resolverAgentName);

    if (!agentEnabled) {
      return noAutoCheck('Auto-check is currently paused for this ticket type', rule.resolverAgentName);
    }
    if (!schedule?.enabled) {
      return noAutoCheck('Auto-check schedule is currently disabled', rule.resolverAgentName);
    }

    const nextRun = calculateNextRun(schedule.schedule);
    const label = formatNextRun(schedule.schedule);
    if (!nextRun || !label) {
      return noAutoCheck('Auto-check schedule could not be parsed', rule.resolverAgentName);
    }

    return {
      hasAutoCheck: true,
      resolverAgentName: rule.resolverAgentName,
      nextCheckAt: nextRun.toISOString(),
      nextCheckLabel: label,
    };
  };
}
