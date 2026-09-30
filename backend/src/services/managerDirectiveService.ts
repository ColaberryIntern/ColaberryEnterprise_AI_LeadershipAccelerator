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
): Promise<ManagerDirectiveView> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) throw new AgentNotFoundError(agentId);

  const row = await ManagerDirective.create({
    agent_id: agentId,
    created_by_org_member_id: orgMemberId,
    created_by_email: createdByEmail,
    directive_text: directiveText,
    status: 'active',
  });
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
export async function getActiveDirectiveTexts(agentId: string): Promise<string[]> {
  try {
    const rows = await ManagerDirective.findAll({
      where: { agent_id: agentId, status: 'active' },
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
