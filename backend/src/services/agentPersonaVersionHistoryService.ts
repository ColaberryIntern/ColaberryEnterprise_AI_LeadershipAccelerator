import AgentPersonaVersionHistory from '../models/AgentPersonaVersionHistory';

// Trust Contract Phase 1 (2026-08-26) — see ensureAgentPersonaVersionHistorySchema.ts
// for the full "why this table exists" context. This file owns both real
// operations: the one write path (called from agentRegistrySeed.ts's real
// upsert loop, the only place persona_version genuinely changes) and the read
// path (called from agentDetailService.ts).

interface PersonaVersionCandidate {
  agent_name: string;
  persona_version?: string;
  system_prompt?: string;
  tools_granted?: string[];
}

export interface PersonaVersionHistoryRow {
  id: string;
  persona_version: string;
  previous_version: string | null;
  source: string;
  created_at: Date;
}

/**
 * Writes a history row ONLY when `entry.persona_version` genuinely differs
 * from `previousVersion` (the value stored on the AiAgent row BEFORE this
 * boot's seed update applies it) — never on a no-op reseed, which is every
 * boot for the ~200 agents whose registry entry hasn't changed. This is what
 * makes the caller idempotent: re-running the exact same boot twice writes
 * the same zero or one row both times, not two.
 *
 * `previousVersion` is passed in rather than re-read here so the caller (which
 * already has the pre-update `agent` row in memory) is the single source of
 * truth for "what it was before" — this function never re-queries it, so
 * there's no window where a concurrent update could make the comparison stale.
 *
 * Swallow-safe by design: this is a side audit trail bolted onto
 * `seedAgentRegistry()`, the boot-time loop that registers/refreshes ~200
 * real production agents. A failure writing ONE history row (a lock, a
 * transient DB hiccup, a schema not yet migrated on a fresh environment)
 * must never abort that entire loop and leave every agent AFTER this one
 * unregistered — same "one bad row must not abort seeding for everything
 * else" posture this file's own `enforceRetiredAgents()` already follows.
 */
export async function recordPersonaVersionChangeIfNeeded(
  agentId: string,
  previousVersion: string | null,
  entry: PersonaVersionCandidate,
): Promise<void> {
  if (entry.persona_version === undefined) return; // this registry entry doesn't declare one at all
  if (entry.persona_version === previousVersion) return; // no real change — the common case on every boot

  try {
    await AgentPersonaVersionHistory.create({
      agent_id: agentId,
      agent_name: entry.agent_name,
      persona_version: entry.persona_version,
      previous_version: previousVersion,
      system_prompt: entry.system_prompt ?? null,
      tools_granted: entry.tools_granted ?? null,
      source: 'registry_seed',
    });
  } catch (err: any) {
    console.warn(`[AI Ops] Failed to record persona_version change for ${entry.agent_name}: ${err?.message}`);
  }
}

/** Real version history for one agent, most-recent first. `[]` for an agent
 * whose persona_version has never changed since this table started tracking —
 * an honest empty state, not evidence that no version has ever existed. */
export async function getPersonaVersionHistory(agentId: string): Promise<PersonaVersionHistoryRow[]> {
  const rows = await AgentPersonaVersionHistory.findAll({
    where: { agent_id: agentId },
    order: [['created_at', 'DESC']],
  });
  return rows.map((r) => ({
    id: r.id,
    persona_version: r.persona_version,
    previous_version: r.previous_version,
    source: r.source,
    created_at: r.created_at,
  }));
}
