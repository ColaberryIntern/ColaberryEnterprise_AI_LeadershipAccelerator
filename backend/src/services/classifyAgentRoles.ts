/**
 * classifyAgentRoles — single source of truth for "what roles do these
 * agent files cover."
 *
 * Tier-3 A+E (2026-05-20): persists role classification on the cap at
 * scan/discovery time so the engine refresh doesn't need to hit GitHub
 * for every refresh (the old design silently degraded when rate-limited
 * or token-less — see PROGRESS.md "1h cache for pre-fetched agent
 * contents" for the symptom).
 *
 * Callers:
 *   - brownfieldDiscoveryService: at scan time, with file contents
 *     pulled from the repo file tree (local fs in dev, fetched via
 *     GitHub API in prod) — same source-of-truth as the scanner itself
 *   - backfillAgentRoles script: one-time over all existing caps, uses
 *     readFileFromRepo per cap
 *   - Engine refresh: NO LONGER calls this — reads cap.agent_roles_cache
 *     from DB and surfaces staleness if classified_at > 7 days ago
 */
import { inferAgentRole, AgentRole } from '../intelligence/systemStateEngine/scoring/codeEvidence';

export interface AgentRolesCachePayload {
  detected: AgentRole[];
  files_inspected: number;
  classified_at: string; // ISO
  agent_paths: string[];
}

/**
 * Classify a set of agent file paths into roles. Caller supplies a
 * contents map (typically built by fetching the agent files from
 * whatever source — local fs, GitHub API, etc.). Paths NOT in the
 * contents map fall back to filename-only inference (still better
 * than nothing; the tokenizer catches operator-named intent).
 *
 * Returns the payload to persist as `cap.agent_roles_cache`.
 */
export function classifyAgentRoles(
  agentPaths: ReadonlyArray<string>,
  contents: ReadonlyMap<string, string | null>,
): AgentRolesCachePayload {
  const detected = new Set<AgentRole>();
  let filesInspected = 0;
  for (const p of agentPaths) {
    const content = contents.get(p) ?? null;
    if (typeof content === 'string') filesInspected++;
    detected.add(inferAgentRole(p, content));
  }
  return {
    detected: [...detected],
    files_inspected: filesInspected,
    classified_at: new Date().toISOString(),
    agent_paths: [...agentPaths],
  };
}

/**
 * Staleness check (2026-05-20). A cap's classification is "fresh" if
 * (a) it exists and (b) classified_at is within MAX_AGE_DAYS, and
 * (c) the agent_paths snapshot matches the cap's current linked_agents
 * (so we re-classify when files drift).
 *
 * 7-day TTL matches the Tier-3 plan; can be relaxed once we observe
 * the rate of cap-data drift in practice.
 */
const MAX_AGE_DAYS = 7;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export function isClassificationFresh(
  cache: AgentRolesCachePayload | null | undefined,
  currentAgentPaths: ReadonlyArray<string>,
): { fresh: boolean; reason?: string; ageDays?: number } {
  if (!cache) return { fresh: false, reason: 'never classified' };
  if (!cache.classified_at) return { fresh: false, reason: 'no classified_at timestamp' };
  const ageMs = Date.now() - new Date(cache.classified_at).getTime();
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  if (ageMs > MAX_AGE_MS) return { fresh: false, reason: `${ageDays}d old (max ${MAX_AGE_DAYS}d)`, ageDays };
  // Drift check — agent_paths set changed since classification
  const cachedSet = new Set(cache.agent_paths || []);
  const currentSet = new Set(currentAgentPaths);
  if (cachedSet.size !== currentSet.size) return { fresh: false, reason: 'agent file set changed', ageDays };
  for (const p of currentSet) {
    if (!cachedSet.has(p)) return { fresh: false, reason: 'agent file set changed', ageDays };
  }
  return { fresh: true, ageDays };
}

export const MAX_CLASSIFICATION_AGE_DAYS = MAX_AGE_DAYS;
