import { Op, type Transaction } from 'sequelize';
import AiAgent from '../models/AiAgent';
import ManagerDirective from '../models/ManagerDirective';

// AI Workforce Management, Checkpoint C. Generic by construction — works off
// AiAgent.id, not hardcoded to any one agent. Multiple directives may be
// active for one agent simultaneously (independent standing instructions,
// e.g. "always loop in the manager on financial tickets" AND "never discuss
// pricing before Tuesday") — each has its own active/revoked lifecycle
// rather than one directive silently replacing another.

export class AgentNotFoundError extends Error {
  readonly error_class = 'AgentNotFoundError' as const;
  readonly status = 404;

  constructor(agentId: string) {
    super(`Agent "${agentId}" does not exist.`);
    this.name = 'AgentNotFoundError';
  }
}

export class DirectiveNotFoundError extends Error {
  readonly error_class = 'DirectiveNotFoundError' as const;
  readonly status = 404;

  constructor(directiveId: string) {
    super(`Directive "${directiveId}" does not exist.`);
    this.name = 'DirectiveNotFoundError';
  }
}

export interface ManagerDirectiveView {
  id: string;
  directiveText: string;
  /** AF11.8. The capability this instruction is scoped to, or null for the whole agent. */
  capabilityId: string | null;
  status: 'active' | 'revoked';
  createdByEmail: string;
  createdByOrgMemberId: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  revokedByEmail: string | null;
}

function toView(row: ManagerDirective): ManagerDirectiveView {
  return {
    id: row.id,
    directiveText: row.directive_text,
    capabilityId: row.capability_id ?? null,
    status: row.status,
    createdByEmail: row.created_by_email,
    createdByOrgMemberId: row.created_by_org_member_id,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    revokedByEmail: row.revoked_by_email,
  };
}

/** Authorization (is the caller allowed to direct this agent) is the route
 * layer's job (requireAgentManagerOrAdmin) — matches assignTaskToAgent()'s
 * and upsertRoleCharter()'s own "auth first, at the route/middleware layer"
 * convention. This function trusts it already happened.
 *
 * `orgMemberId` is nullable — a platform super_admin's identity is never
 * resolved to an org_member by the auth gate (see ManagerDirective.ts's own
 * comment on the column). `createdByEmail` is always populated and is the
 * real attribution regardless. */
export async function createDirective(
  agentId: string,
  orgMemberId: string | null,
  createdByEmail: string,
  directiveText: string,
  /**
   * AF11.8. Optional and trailing, so every caller that predates it is untouched and still writes
   * an agent-wide directive outside any transaction.
   *
   * `capabilityId` scopes the instruction to one capability. `transaction` exists because a tool
   * approval writes the decision and Ali's standing instructions as ONE act: see
   * `toolRequestDecisionService.ts` for why that one is not best-effort the way the duplicate
   * check is.
   */
  options: { capabilityId?: string | null; transaction?: Transaction } = {},
): Promise<ManagerDirectiveView> {
  const { capabilityId, transaction } = options;
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'], transaction });
  if (!agent) throw new AgentNotFoundError(agentId);

  const scoped = typeof capabilityId === 'string' && capabilityId.trim().length > 0
    ? capabilityId.trim()
    : null;

  const row = await ManagerDirective.create({
    agent_id: agentId,
    created_by_org_member_id: orgMemberId,
    created_by_email: createdByEmail,
    directive_text: directiveText,
    capability_id: scoped,
    status: 'active',
  }, { transaction });
  return toView(row);
}

/** Full history (active + revoked) for the manager-facing directive list —
 * newest first. `null` return means the agent itself doesn't exist. */
export async function listDirectives(agentId: string): Promise<ManagerDirectiveView[] | null> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) return null;

  const rows = await ManagerDirective.findAll({
    where: { agent_id: agentId },
    order: [['created_at', 'DESC']],
  });
  return rows.map(toView);
}

export async function revokeDirective(directiveId: string, revokedByEmail: string): Promise<ManagerDirectiveView> {
  const row = await ManagerDirective.findByPk(directiveId);
  if (!row) throw new DirectiveNotFoundError(directiveId);

  if (row.status === 'active') {
    await row.update({ status: 'revoked', revoked_at: new Date(), revoked_by_email: revokedByEmail });
  }
  return toView(row);
}

/** The ONLY function the runtime prompt-assembly path (agentSystemPrompt.ts)
 * calls — deliberately narrow (just the text, newest first), so a hot-path
 * caller never has to reason about the full CRUD shape above. Fails safe:
 * a DB error returns [] rather than throwing, matching
 * buildAgentSystemPrompt()'s own "never throws — degrades gracefully"
 * contract for the learner-context block it already has. */
export async function getActiveDirectiveTexts(
  agentId: string,
  /**
   * AF11.8. The capability about to run, when the caller knows it.
   *
   * THE RULE, and it is the whole reason the parameter exists: an agent-wide directive
   * (`capability_id IS NULL`) is always in force, and a capability-scoped one is in force ONLY
   * when its capability is the one running. Omitting this argument therefore returns agent-wide
   * directives alone — never every scoped instruction the agent has ever been given.
   *
   * Getting that backwards is the failure that would make the column worse than useless:
   * "never write a headline longer than eight words" is good guidance while drafting a landing
   * page and is noise the agent will try to obey on a turn that has nothing to do with headlines.
   * A test pins both halves.
   */
  capabilityId?: string | null,
): Promise<string[]> {
  try {
    const scoped = typeof capabilityId === 'string' && capabilityId.trim().length > 0
      ? capabilityId.trim()
      : null;
    const rows = await ManagerDirective.findAll({
      where: {
        agent_id: agentId,
        status: 'active',
        capability_id: scoped === null
          ? { [Op.is]: null }
          : { [Op.or]: [{ [Op.is]: null }, { [Op.eq]: scoped }] },
      },
      order: [['created_at', 'DESC']],
      attributes: ['directive_text'],
    });
    return rows.map((r) => r.directive_text);
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'managerDirective', event: 'active_directives_fetch_failed',
      agent_id: agentId, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    return [];
  }
}
