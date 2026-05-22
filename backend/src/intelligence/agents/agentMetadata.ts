/**
 * agentMetadata — declarative convention for tagging agent files to a capability.
 *
 * Why this exists (2026-05-22): the brownfield agent ingestion pipeline uses
 * keyword stem matching + LLM confidence filtering to confirm agent ↔ capability
 * mappings. That worked but only got us to ~61 distinct mapped agent names against
 * a repo with ~169 agent .ts files. Most of the gap is files the LLM either
 * couldn't link confidently or never saw. The fix is to let the agent file declare
 * the mapping itself, so the ingester can write a `capability_agent_maps` row
 * deterministically without an LLM call.
 *
 * Usage (the only convention this file defines):
 *
 *   // In your agent file, add ONE of these exports at module scope:
 *
 *   // Single-capability agent:
 *   export const SERVES_CAPABILITY: AgentCapabilityRef = 'Lead Scoring';
 *
 *   // Multi-capability agent (rare — most agents serve one cap):
 *   export const SERVES_CAPABILITIES: AgentCapabilityRef[] = ['Lead Scoring', 'Lead Classification'];
 *
 *   // Optional: hint the role for the capability_agent_maps.role column.
 *   export const AGENT_ROLE: AgentRole = 'executor';
 *
 * Matching: the ingester (`scripts/ingestDeclaredAgents.js`) does a case-insensitive
 * match on `capabilities.name` within the target project. Use the capability's
 * display name (the one you see in the BP detail modal), not a slug.
 *
 * Idempotency: re-running ingestion is safe — existing maps are upserted (status
 * flipped to 'active' if previously disabled), and rows for files that have since
 * removed the export are NOT silently disabled (operator must do that explicitly).
 *
 * What this convention does NOT do:
 *  - It does not gate the existing LLM ingestion. Agents without metadata still
 *    get the old pipeline (so we don't regress coverage during the transition).
 *  - It does not replace `capability_agent_maps` — it's a path that WRITES into it.
 *  - It does not validate that the named capability exists at compile time. A
 *    typo in the cap name produces an ingestion warning, not a TS error.
 */

/** Capability reference — currently a display-name string. */
export type AgentCapabilityRef = string;

/**
 * Optional role hint. Mirrors the existing `capability_agent_maps.role` enum the
 * LLM attribution classifier infers (executor, monitor, classifier, orchestrator).
 * If you don't set this, the ingester leaves the column null and the operator
 * can fill it in later.
 */
export type AgentRole = 'executor' | 'monitor' | 'classifier' | 'orchestrator';
