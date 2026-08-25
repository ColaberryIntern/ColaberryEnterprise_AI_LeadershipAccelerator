/**
 * agentAuthorizationService — the ABAC chokepoint (TBI audit P2-1, design §3.3).
 *
 * SHADOW-FIRST BY DESIGN. `authorizeAgentAction()` evaluates the autonomy ladder + live state
 * (kill switch, registry, HITL rules) for every agent action and records the verdict, but it only
 * BLOCKS when `abac_enforcement === 'enforce'`. Default is `shadow`: the dashboard sees exactly
 * what WOULD be denied (the over-broad-autonomy exposure) without changing a single agent's behavior.
 *
 * Failure posture: SWALLOW-SAFE + FAILS OPEN. A bug here must never break a live agent path — an
 * authz error degrades to allow + logged. Read-level actions always pass (least-privilege floor).
 * Per Ali's §5 sign-off: shadow-first · 4-rung ladder · per-department scope (Phase 4) ·
 * kill-switch keeps reads running · HITL = the 4-rule set in agentAutonomy.
 *
 * Autonomy level source (2026-08-25): defaults to deriving the level from the pre-existing
 * permission-tier map (`levelForTier`, unchanged since this file's original build). An agent
 * reactivated through the AI Workforce Reset flow (`agentReactivationService.ts`) carries a real,
 * human-chosen `AiAgent.autonomy_level` instead — `resolveLevel()` prefers it, but ONLY when
 * `autonomy_level_set_at` proves it was deliberately set, never the untouched migration default.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { AiAgent } from '../models';
import { getSetting } from './settingsService';
import { emitAiEvent } from './aiEventService';
import { getTraceId } from '../utils/requestContext';
import { isKillSwitchActive } from './launchSafety';
import { isSafeModeActive } from './systemControlService';
import {
  levelForTier,
  actionCategory,
  levelAllowsAction,
  actionRequiresApproval,
  type AutonomyLevel,
  type ActionContext,
} from './agentAutonomy';

export type AbacMode = 'off' | 'shadow' | 'enforce';

/** Current ABAC enforcement mode. Defaults to 'shadow' (evaluate + log, never block). */
export async function getAbacMode(): Promise<AbacMode> {
  try {
    const raw = String((await getSetting('abac_enforcement')) ?? 'shadow').toLowerCase();
    if (raw === 'off' || raw === 'enforce') return raw;
    return 'shadow';
  } catch {
    return 'shadow';
  }
}

export interface AuthorizeAgentInput {
  agentId: string;
  agentName: string;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  tier?: string | null; // caller may pass the known permission tier (avoids a lookup + import cycle)
  context?: ActionContext;
}

export interface AuthorizeAgentResult {
  allowed: boolean; // false ONLY when enforced and the policy denies/queues
  enforced: boolean; // mode === 'enforce'
  reason: string;
  requiresApproval: boolean;
  level: AutonomyLevel;
  wouldDeny: boolean; // the policy verdict regardless of mode (the shadow exposure)
  mode: AbacMode;
}

async function resolveTier(input: AuthorizeAgentInput): Promise<string | null> {
  if (input.tier) return input.tier;
  try {
    // Lazy require breaks the static import cycle (agentPermissionService imports this module).
    const { getAgentPermission } = require('./agentPermissionService');
    return getAgentPermission(input.agentName)?.tier ?? null;
  } catch {
    return null;
  }
}

interface AgentRegistryRow {
  enabled: boolean;
  status: string;
  autonomy_level: AutonomyLevel | null;
  autonomy_level_set_at: Date | null;
}

// 2026-08-25 — one shared registry lookup for both the disabled-agent check and
// the (new) deliberate-autonomy-level check, replacing what was a separate
// isAgentDisabled() query. Same fail-safe posture as before: unregistered or
// unreadable → null, never thrown, never blocks on missing data.
async function fetchAgentRegistryRow(agentName: string): Promise<AgentRegistryRow | null> {
  try {
    const agent = await AiAgent.findOne({
      where: { agent_name: agentName },
      attributes: ['enabled', 'status', 'autonomy_level', 'autonomy_level_set_at'],
    });
    if (!agent) return null; // unregistered (e.g. a .js cron) — don't block on it in shadow
    return {
      enabled: agent.enabled,
      status: agent.status,
      autonomy_level: (agent.autonomy_level as AutonomyLevel | undefined) ?? null,
      autonomy_level_set_at: (agent as any).autonomy_level_set_at ?? null,
    };
  } catch {
    return null; // registry read failed → don't block on it
  }
}

function isAgentDisabledFromRow(row: AgentRegistryRow | null): boolean {
  if (!row) return false;
  return row.enabled === false || row.status === 'paused';
}

// 2026-08-25 — AI Workforce Reset, Phase C's reactivation flow
// (agentReactivationService.ts) writes a REAL, human-chosen `autonomy_level` to
// AiAgent, but until now this gate never read it — it derives its own level
// purely from the pre-existing permission-tier map (levelForTier below),
// unaware the column exists. Reconciled here rather than left as two silent,
// disagreeing sources of truth: the deliberate column wins ONLY when
// `autonomy_level_set_at` is stamped (an operator actually chose it via
// reactivation). Every agent that has never been through that flow — which is
// most of the fleet, including long-running agents like Reese and
// cory-engine — keeps the exact tier-derived level this gate has used since
// PR #69, so this change cannot silently demote the existing shadow signal
// the day it ships.
function resolveLevel(row: AgentRegistryRow | null, tier: string | null): AutonomyLevel {
  if (row?.autonomy_level_set_at && row.autonomy_level) return row.autonomy_level;
  return levelForTier(tier);
}

/**
 * Authorize one agent action. Evaluates the ladder + live state, records an `agent.authorization`
 * ai_event, and returns whether the caller may proceed. Only denies when mode === 'enforce'.
 */
export async function authorizeAgentAction(input: AuthorizeAgentInput): Promise<AuthorizeAgentResult> {
  let mode: AbacMode = 'shadow';
  try {
    mode = await getAbacMode();
    if (mode === 'off') {
      return { allowed: true, enforced: false, reason: 'gate_off', requiresApproval: false, level: 'observe', wouldDeny: false, mode };
    }
    const registryRow = await fetchAgentRegistryRow(input.agentName);
    const level = resolveLevel(registryRow, await resolveTier(input));
    const category = actionCategory(input.action);

    // ── Ordered policy checks → a hard-block reason, or null. ──
    let blockReason: string | null = null;

    // 1. Kill switch / safe mode. Per Ali's Q6: reads keep running; only side-effects stop.
    if (category !== 'read') {
      if (await isKillSwitchActive()) blockReason = 'kill_switch_active';
      else if (await isSafeModeActive()) blockReason = 'safe_mode_active';
    }
    // 2. Agent enabled / not paused.
    if (!blockReason && isAgentDisabledFromRow(registryRow)) blockReason = 'agent_disabled';
    // 3. Autonomy level permits this action category.
    if (!blockReason && !levelAllowsAction(level, input.action)) blockReason = `level_forbids:${category}`;
    // (4. Per-resource scope is Phase 4 — advisory no-op here.)

    // HITL: does this action always require a human yes?
    const approval = blockReason ? { required: false } : actionRequiresApproval(input.action, input.context);

    const wouldDeny = !!blockReason || approval.required;
    const enforced = mode === 'enforce';
    const reason = blockReason ?? (approval.required ? `requires_approval:${approval.rule}` : 'ok');

    // mode is 'shadow' | 'enforce' here ('off' returned early). Record every decision.
    {
      const outcome = !enforced || !wouldDeny ? 'success' : blockReason ? 'blocked' : 'escalated';
      await emitAiEvent({
        event_type: 'agent.authorization',
        outcome,
        trace_id: getTraceId() ?? null,
        agent_id: input.agentId,
        actor_type: 'agent',
        external_system: 'internal',
        metadata: {
          agent_name: input.agentName,
          action: input.action,
          category,
          level,
          resource_type: input.resourceType ?? undefined,
          verdict: wouldDeny ? (blockReason ? 'block' : 'approval') : 'allow',
          reason,
          requires_approval: approval.required,
          mode,
          enforced,
          would_deny: wouldDeny && !enforced, // policy says deny but we let it through (shadow)
        },
      });
    }

    return {
      allowed: enforced ? !wouldDeny : true, // shadow never denies
      enforced,
      reason,
      requiresApproval: approval.required,
      level,
      wouldDeny,
      mode,
    };
  } catch (err: any) {
    console.error('[agentAuthorizationService] authz error — failing OPEN:', err?.message);
    return { allowed: true, enforced: false, reason: 'authz_error', requiresApproval: false, level: 'observe', wouldDeny: false, mode };
  }
}

/** Count agent.authorization events in the last N days (for the Trust rubric). */
export async function countAbacChecks(days = 7): Promise<number> {
  try {
    const rows = (await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM ai_events
       WHERE event_type = 'agent.authorization' AND created_at >= NOW() - (:days || ' days')::interval`,
      { type: QueryTypes.SELECT, replacements: { days } }
    )) as Array<{ n: number }>;
    return Number(rows[0]?.n) || 0;
  } catch {
    return 0;
  }
}
