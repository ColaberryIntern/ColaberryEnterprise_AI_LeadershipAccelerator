/**
 * domainBuilderAgentAccess — "may this builder READ the agent they were assigned to build?"
 *
 * ## The report that produced it
 *
 * Mihret Netsereab, 5 Nov 2026, 8:20 PM CT, with screenshots: My Domain loads and shows product
 * experience, and clicking into the agent returns **"This agent is not in your reporting chain."**
 * She was right, and the gate was right. `requireAgentManagerOrAdmin` authorizes exactly two kinds
 * of caller — a platform super admin, or the human the agent REPORTS TO — and
 * `ProductExperienceDomainAgent` reports to `aleem@colaberry.com`. The gate has no concept of a
 * builder at all, so it read her as an unrelated admin.
 *
 * Measured in production the same evening, which is what turned one report into a rule:
 *
 *   - **0 of 7** builders are the manager of their own domain agent
 *   - **2** platform super admins exist in the entire system
 *
 * So every builder hits that same refusal at that same click. She reached it first because she
 * got further than anyone else that day.
 *
 * ## Why this is a separate module and not a few lines in the middleware
 *
 * The middleware already carries one definition of "related to this agent" (the reporting chain).
 * A second one written inline beside it is how two definitions of ownership drift apart — the
 * exact failure `orgChartHierarchyService` warns about in its own header, where the server check
 * and the UI's options are deliberately built from one function so they cannot disagree.
 *
 * So this does not re-derive anything. It calls `loadProvisionedDomainsForBuilder`, the SAME
 * resolver `/api/admin/agent-domains-mine` already uses to decide which domains are yours, and
 * which already carries the hard-won guards: the caller is resolved from their verified token's
 * email, the email is turned into a display name through `community_members`, and a name matching
 * more than one row returns NOTHING rather than guessing. If that resolver ever changes its mind
 * about who builds what, this gate changes with it.
 *
 * ## Read only, and that is enforced by the caller
 *
 * Being the builder grants READ. It does not grant approving the agent's memory proposals,
 * flipping its behaviour switches, sending manager messages, or revoking directives — those are
 * the accountable manager's decisions and they stay that way. This module answers a question; the
 * middleware is where the GET-only restriction lives, because that is where the request method is.
 */

import type { Sequelize } from 'sequelize';
import { loadProvisionedDomainsForBuilder } from './agentDomainProvisionedReader';

/**
 * The shared connection, resolved at CALL time rather than imported at module load.
 *
 * `config/database` constructs a Sequelize instance as a side effect of being imported, and this
 * module is reached from `agentManagerAuthMiddleware`, which every admin route file imports. A
 * top-level import here therefore put a live database handle in the import graph of every one of
 * them — which broke `agentManagerAuthMiddleware.test.ts` instantly ("The url argument must be of
 * type string. Received undefined") and would have broken any other suite that imports a route
 * module without mocking the database.
 *
 * Adding a mock to those tests would have hidden the coupling rather than removed it. The handle
 * is genuinely not needed until someone calls the function, so it is fetched then.
 */
function sharedConnection(): Sequelize {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  return require('../../config/database').sequelize as Sequelize;
}

/**
 * The ONE builder state that grants read access.
 *
 * `intended_builder_state` also takes `onboarding_pending` (Ruth Kumera on curriculum today) and
 * `unassigned`. A name written against a domain before that person has been verified is an
 * intention, not an identity, so it grants nothing.
 */
export const BUILDER_STATE_THAT_GRANTS_READ = 'verified_active';

/**
 * Is `email` the verified-active intended builder of the domain whose agent is `agentId`?
 *
 * Returns false — never throws — for an unknown email, an unknown agent, an ambiguous identity,
 * or a builder whose state is anything other than verified_active.
 */
export async function isVerifiedDomainBuilderOfAgent(
  email: string,
  agentId: string,
  db?: Sequelize,
): Promise<boolean> {
  const wantedAgentId = String(agentId ?? '').trim();
  const callerEmail = String(email ?? '').trim();

  // BOTH early returns are load-bearing, and the first one is the subtle one. Six of the ten
  // domain rows can carry a NULL `agent_id` (the LEFT JOIN in the reader's BASE_SQL means "no
  // employee yet" is a real state). Without this guard, an empty agentId would be compared
  // against `String(null ?? '')` and MATCH every such row, so a builder with an unprovisioned
  // domain would be waved through on a request carrying no agent id at all.
  if (!wantedAgentId) return false;
  if (!callerEmail) return false;

  const built = await loadProvisionedDomainsForBuilder(db ?? sharedConnection(), callerEmail);

  return built.some((row) => (
    String(row.agent_id ?? '').trim() === wantedAgentId
    && row.intended_builder_state === BUILDER_STATE_THAT_GRANTS_READ
  ));
}
