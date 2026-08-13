/**
 * Legacy creator aliases — the "resolve at read time, don't rewrite history" fix for
 * ticket-creator identity. Ali (live, Workforce OS "Live Agents"): "why create agents
 * with no tickets or have the tickets not been mapped?" Root cause: the 5 processes
 * registered by Agent Registration Stage 1 (cory-engine, CoryBrain, InboxCaseEngine,
 * workforce_intelligence_engine, bpos_orchestrator) have a combined 12,302 historical
 * tickets, ALL of them stamped with the raw literal `created_by_id` string (e.g.
 * 'cory-engine') and 100% NULL `assigned_to_id` (verified live against production
 * Postgres) — so any query keyed only on the new AdminUser id finds nothing.
 *
 * This module never mutates a single historical ticket. Instead, each agent's real
 * AiAgent row carries its own known legacy identifier(s) in
 * `AiAgent.config.legacy_creator_ids` (existing JSONB column, no new schema — same
 * "structured metadata on the existing config bag" pattern already proven by
 * `pilot_cohort_ids` in agentIdentitySeed.ts), and callers build a match list of
 * [real AdminUser.id, ...legacy aliases] to query tickets keyed on EITHER identifier.
 * Generic by construction: an agent with zero legacy aliases (e.g. Reese, who never had
 * a pre-existing raw-string ticket history) gets a match list of exactly one id — its
 * own — so this is a pure superset behavior change, never a regression for agents that
 * don't need it.
 */

interface AgentConfigLike {
  config?: Record<string, any> | null;
}

/**
 * Reads `agent.config.legacy_creator_ids`, validated to a string array. Never trusts
 * the untyped JSONB blob raw — a corrupted or hand-edited config (non-array, or an
 * array containing a non-string) degrades to an empty list rather than throwing or
 * silently including a garbage value in a SQL IN-list.
 */
export function getLegacyCreatorIds(agent: AgentConfigLike): string[] {
  const raw = agent?.config?.legacy_creator_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

/**
 * Every identifier string a ticket could plausibly carry for this agent: its real,
 * current `AdminUser.id` (used going forward — see the per-source-file forward-fix
 * tasks) plus every known legacy raw string this process used to stamp before the fix.
 * Deduplicated; order is [real id, ...aliases] but callers should treat it as an
 * unordered IN-list.
 */
export function buildCreatorIdMatchList(adminUserId: string, agent: AgentConfigLike): string[] {
  const aliases = getLegacyCreatorIds(agent);
  return Array.from(new Set([adminUserId, ...aliases]));
}
