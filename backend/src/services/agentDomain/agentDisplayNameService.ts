import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import AiAgent from '../../models/AiAgent';
import { loadMyDomains, resolveOwnerIdentityIds } from './agentDomainProvisionedReader';

/**
 * AF10.6 — store the name an intern gives their own agent.
 *
 * The name lands on `ai_agents.config.display_name`. Not a new column, and not `agent_name`:
 * `agent_name` is what `agentRegistrySeed.ts` findOrCreates on at every boot, so renaming it
 * orphans the row and recreates the original as a second agent on the next deploy.
 *
 * ## A boot reseed cannot wipe a stored name, and that was checked rather than assumed
 *
 * `agentRegistrySeed.ts:3299` only writes `config` behind
 * `Object.keys(agent.config || {}).length === 0 && entry.config`. Once a name is stored the
 * config is non-empty, so the key is absent from the update object entirely. Independently,
 * `DOMAIN_AGENT_ENTRIES` sets no `config` at all. Two reasons, either sufficient.
 *
 * ## Ownership comes from the same chain that gates the page
 *
 * `loadMyDomains` is what `/api/admin/agent-domains-mine` already uses, so an intern can name
 * exactly the agent they can already see and nothing else. An agent that is not theirs is a 403
 * rather than a 404 — they are authenticated and on their own surface, so there is nothing to
 * hide by pretending the row is absent. An id that does not exist at all also lands here, which
 * is the right answer for a different reason: it is not theirs either.
 */

/** The caller does not build the agent they tried to name. */
export class AgentNotYoursError extends Error {
  constructor() {
    super('That agent is not one of yours.');
    this.name = 'AgentNotYoursError';
  }
}

/** Another agent already answers to this name. Carries what collided, and where. */
export class AgentDisplayNameTakenError extends Error {
  readonly takenName: string;

  readonly source: CollisionSource;

  constructor(takenName: string, source: CollisionSource) {
    super(`"${takenName}" is already taken by another agent.`);
    this.name = 'AgentDisplayNameTakenError';
    this.takenName = takenName;
    this.source = source;
  }
}

export type CollisionSource =
  | 'agent_name'
  | 'display_name'
  | 'config_agent_name'
  | 'admin_display_name';

interface CollisionRow {
  readonly source: CollisionSource;
  readonly name: string | null;
}

/**
 * Every place a name can already be spoken for, in one query, minus the agent being renamed.
 *
 * ## THERE IS NO `enabled` FILTER HERE, AND ADDING ONE IS THE BUG THIS TICKET EXISTS TO PREVENT
 *
 * Measured in production 2026-10-28: `Maya` exists with `enabled: false`, and Maya is the name
 * the admissions builder chose. A disabled agent still owns its name — it can be re-enabled, it
 * still appears in the registry, and the org chart still renders it. Filtering on `enabled` would
 * let two agents answer to "Maya" and would pass any test that only used enabled fixtures. A test
 * pins this.
 *
 * ## Four sources, because three of them are not the one that gets rendered
 *
 *  - `agent_name` is the registry key and the fallback every renderer lands on.
 *  - `config.display_name` is what this service writes, so interns collide with each other here.
 *  - `config.agent_name` sits on 16 rows already and would otherwise be an unchecked name.
 *  - `admin_users.display_name` is the name the platform ACTUALLY shows: both
 *    `workforce/orgChartService.ts:306` and `resolveActorDisplayName.ts` prefer it over
 *    `agent_name`. Omitting it would let two agents render identically while this check reported
 *    clean.
 *
 * Comparison is `lower(btrim(...))` on both sides, so "  Maya  " and "MAYA" both collide with
 * "Maya". The trim also happens in the Zod schema; doing it here too means the service is correct
 * even when called directly.
 */
async function findCollision(
  sequelize: Sequelize,
  agentId: string,
  name: string,
  transaction?: Transaction,
): Promise<CollisionRow | null> {
  const rows = await sequelize.query<CollisionRow>(
    `SELECT 'agent_name' AS source, a.agent_name AS name
       FROM ai_agents a
      WHERE a.id::text <> $1 AND lower(btrim(a.agent_name)) = lower(btrim($2))
     UNION ALL
     SELECT 'display_name' AS source, a.config->>'display_name' AS name
       FROM ai_agents a
      WHERE a.id::text <> $1 AND lower(btrim(a.config->>'display_name')) = lower(btrim($2))
     UNION ALL
     SELECT 'config_agent_name' AS source, a.config->>'agent_name' AS name
       FROM ai_agents a
      WHERE a.id::text <> $1 AND lower(btrim(a.config->>'agent_name')) = lower(btrim($2))
     UNION ALL
     SELECT 'admin_display_name' AS source, u.display_name AS name
       FROM admin_users u
      WHERE (u.agent_id IS NULL OR u.agent_id::text <> $1)
        AND lower(btrim(u.display_name)) = lower(btrim($2))
      LIMIT 1`,
    { bind: [agentId, name], type: QueryTypes.SELECT, transaction },
  );
  return rows[0] ?? null;
}

export interface SetAgentDisplayNameResult {
  readonly agent_id: string;
  readonly display_name: string;
  /** True when the stored value already matched, so the call changed nothing. */
  readonly unchanged: boolean;
}

/**
 * Name one agent, if it is yours and the name is free.
 *
 * Idempotent: calling it twice with the same name leaves the same stored state and answers the
 * same way, with `unchanged: true` the second time. There is no outbound effect of any kind — no
 * email, no ticket, no activation — so there is nothing a replay could duplicate.
 */
export async function setAgentDisplayName(
  sequelize: Sequelize,
  email: string,
  agentId: string,
  displayName: string,
): Promise<SetAgentDisplayNameResult> {
  const name = displayName.trim();

  // Ownership first, before the row is read or any name is disclosed.
  const identityIds = await resolveOwnerIdentityIds(sequelize, email);
  const mine = await loadMyDomains(sequelize, email, identityIds);
  if (!mine.some((d) => d.agent_id && d.agent_id === agentId)) {
    throw new AgentNotYoursError();
  }

  const collision = await findCollision(sequelize, agentId, name);
  if (collision) throw new AgentDisplayNameTakenError(collision.name ?? name, collision.source);

  return sequelize.transaction(async (transaction) => {
    const agent = await AiAgent.findByPk(agentId, { transaction });
    // Ownership said this agent is theirs, so an absent row here is a race with a delete, not an
    // authorization question. Same answer either way.
    if (!agent) throw new AgentNotYoursError();

    // Re-check inside the transaction. This narrows check-then-write to milliseconds; it does not
    // close it, because a JSONB key cannot carry a unique constraint and there is no cross-row
    // lock to take. Two DIFFERENT agents claiming one name in the same instant can both succeed.
    // Accepted: seven interns, naming once, and the ticket calls the field reversible by design.
    const raced = await findCollision(sequelize, agentId, name, transaction);
    if (raced) throw new AgentDisplayNameTakenError(raced.name ?? name, raced.source);

    const current = (agent.config || {}) as Record<string, unknown>;
    if (current.display_name === name) {
      return { agent_id: agentId, display_name: name, unchanged: true };
    }

    // The house config-merge idiom (reeseBehaviourSwitchService.ts:88). The `|| {}` above is
    // load-bearing: `config` is nullable and rows do hold null.
    await agent.update({ config: { ...current, display_name: name } }, { transaction });
    return { agent_id: agentId, display_name: name, unchanged: false };
  });
}
