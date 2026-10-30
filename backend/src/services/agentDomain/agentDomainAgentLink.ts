/**
 * Link each agent-domain project to the `ai_agents` row that is its employee.
 *
 * Phase 1 item 3 of `docs/architecture/ai-workforce-management/AUTONOMY_RELEASE_MIGRATION.md`:
 * "Link each agent to its project so the card reads `built: true`."
 *
 * ## The gap this closes
 *
 * `agent_domain_projects.agent_id` is `UUID REFERENCES ai_agents(id) ON DELETE SET NULL`, and the
 * provisioner writes it from `AGENT_DOMAINS[].agent_id`. That registry field is populated for
 * exactly TWO domains -- `learner_success` (Reese) and `curriculum` (Dara) -- because both agents
 * already existed when the registry was written. The other nine `*DomainAgent` rows were created
 * later, in one batch on 2026-10-18, and their ids were never written back. Measured in production
 * 2026-10-30: nine domains with an agent and no link to it.
 *
 * ## Why this RESOLVES instead of pinning the ids
 *
 * `seedAgentRegistry` creates those rows with `findOrCreate` keyed on `agent_name`, so each id is
 * a UUID minted at insert time and is DIFFERENT in every environment. Pinning nine production
 * UUIDs into the registry -- the pattern `AGENT_DOMAIN_PROGRAM_BLUEPRINT_ID` uses legitimately,
 * because that id is derived and therefore identical everywhere -- would have produced a registry
 * that is correct in production and silently wrong in dev, which is worse than the gap.
 *
 * `agent_name` is the only stable link, so `agent_name` is what this resolves on.
 *
 * ## Three safety properties, each one load-bearing
 *
 * 1. **It only ever fills a NULL.** `WHERE agent_id IS NULL` means the two existing links, and any
 *    link a human set by hand, survive untouched. This function cannot repoint an agent.
 * 2. **It is tenant-scoped.** `uq_agent_domain_key` is on `(tenant_id, domain_key)`, so a domain
 *    key is not unique by itself. `reconcileAnchorMetadata` in this same subtree shipped without
 *    the tenant predicate and a verifier reproduced it CLOBBERING another tenant's row. The same
 *    mistake is not available here.
 * 3. **It changes no authority.** No write to `enabled`, `autonomy_level` or `tools_granted`. A
 *    link makes an agent findable from its project; it does not make it able to do anything.
 *
 * Idempotent: a second run matches no rows, because the first run made `agent_id` non-null.
 */

import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { DOMAIN_AGENT_ENTRIES } from '../agentRegistry/domainAgents';
import { AGENT_DOMAIN_KEYS } from './agentDomainRegistry';
import { resolveTenantId } from './agentDomainProvisioner';
import { domainKeyOf } from './domainAgentIdentitySeed';

export type LinkOutcome =
  /** `agent_id` was NULL and this run set it. */
  | 'linked'
  /** `agent_id` was already set -- by the provisioner, or by a human. Left alone. */
  | 'already_linked'
  /** No `ai_agents` row carries this domain's agent name. The agent does not exist yet. */
  | 'no_agent_row'
  /** No `agent_domain_projects` anchor for this domain in this tenant. */
  | 'no_anchor'
  /**
   * The domain has no `*DomainAgent` registry entry, so there is no agent name to resolve.
   *
   * This is NOT an error, and it is reported rather than skipped. `curriculum` is the real case:
   * its employee is Dara, who predates the Agent Factory, so `domainAgents.ts` deliberately omits
   * an entry for it -- "Its employee already exists and is called Dara". A report that silently
   * covered nine of ten domains would read as ten clean domains.
   */
  | 'no_registry_entry';

export interface AgentLinkResult {
  readonly domain_key: string;
  /** Null only for `no_registry_entry`. */
  readonly agent_name: string | null;
  readonly outcome: LinkOutcome;
  /** The id this run wrote, or the id that was already there. Null when neither exists. */
  readonly agent_id: string | null;
}

/**
 * `marketing` -> `MarketingDomainAgent`, read off the registry rather than reconstructed.
 *
 * PURE and exported so the mapping is testable without a database. Built by inverting
 * `domainKeyOf` over the real entry list, so a renamed agent moves both directions at once
 * instead of leaving a second hand-written table to drift.
 */
export function agentNameByDomainKey(): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const e of DOMAIN_AGENT_ENTRIES) out.set(domainKeyOf(e.agent_name), e.agent_name);
  return out;
}

/**
 * Fill in every missing `agent_domain_projects.agent_id`, in one transaction.
 *
 * One transaction for the whole set rather than one per domain: the tenant is resolved once, and
 * there is no partial state worth preserving -- a failure half way through leaves the same nine
 * unlinked domains it started with, which is exactly where a re-run begins.
 */
export async function linkDomainAgents(sequelize: Sequelize): Promise<AgentLinkResult[]> {
  const names = agentNameByDomainKey();
  const out: AgentLinkResult[] = [];

  await sequelize.transaction(async (tx: Transaction) => {
    const tenantId = await resolveTenantId(sequelize, tx);

    // Driven by AGENT_DOMAIN_KEYS, not by the agent registry, so the report covers all ten
    // domains. `DOMAIN_AGENT_ENTRIES` holds nine: a loop over it would quietly omit `curriculum`
    // and nothing in the output would say so.
    for (const domainKey of AGENT_DOMAIN_KEYS) {
      const agentName = names.get(domainKey);
      if (!agentName) {
        out.push({
          domain_key: domainKey, agent_name: null, outcome: 'no_registry_entry', agent_id: null,
        });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const anchors = await sequelize.query<{ id: string; agent_id: string | null }>(
        `SELECT id, agent_id FROM agent_domain_projects
          WHERE domain_key = $1 AND tenant_id = $2
            FOR UPDATE`,
        { bind: [domainKey, tenantId], type: QueryTypes.SELECT, transaction: tx },
      );
      if (anchors.length === 0) {
        out.push({ domain_key: domainKey, agent_name: agentName, outcome: 'no_anchor', agent_id: null });
        continue;
      }
      if (anchors[0].agent_id) {
        out.push({
          domain_key: domainKey, agent_name: agentName,
          outcome: 'already_linked', agent_id: anchors[0].agent_id,
        });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const agents = await sequelize.query<{ id: string }>(
        `SELECT id FROM ai_agents WHERE agent_name = $1`,
        { bind: [agentName], type: QueryTypes.SELECT, transaction: tx },
      );
      if (agents.length !== 1) {
        // Zero means the agent has not been registered in this environment. More than one means
        // `agent_name` is no longer the unique link this whole function rests on, and picking the
        // first would be a guess -- so it is reported as absent rather than resolved wrongly.
        out.push({ domain_key: domainKey, agent_name: agentName, outcome: 'no_agent_row', agent_id: null });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const written = await sequelize.query<{ id: string }>(
        `UPDATE agent_domain_projects
            SET agent_id = $3, updated_at = now()
          WHERE domain_key = $1 AND tenant_id = $2 AND agent_id IS NULL
          RETURNING id`,
        { bind: [domainKey, tenantId, agents[0].id], type: QueryTypes.SELECT, transaction: tx },
      );
      // The outcome is read from RETURNING, never from the fact that an UPDATE was submitted. A
      // statement that matched nothing still ran, and reporting the input as the result is the
      // mistake this subtree's provisioner header calls out by name.
      out.push({
        domain_key: domainKey,
        agent_name: agentName,
        outcome: written.length === 1 ? 'linked' : 'already_linked',
        agent_id: written.length === 1 ? agents[0].id : anchors[0].agent_id,
      });
    }
  });

  return out;
}
