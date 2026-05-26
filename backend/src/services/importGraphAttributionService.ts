/**
 * importGraphAttributionService — automatic agent → capability attribution
 * driven by the TypeScript import graph.
 *
 * What it does: for a target project, walks the agent universe (.ts/.js
 * files whose path contains an `agents` directory segment or whose
 * basename contains "agent"), runs D3's `agentImportAttributor` per file
 * against the project's `linked_backend_services`, and writes any
 * (cap, agent) pair scoring at or above the high-confidence threshold
 * (default 3) to `capability_agent_maps` with
 * `linked_by='auto-import-graph-2026-05-26'`.
 *
 * Designed to run automatically inside `discoverBrownfieldCapabilities`
 * (Step 5a, before the LLM attribution classifier). No operator action
 * required — every brownfield scan triggers this for free.
 *
 * Idempotent: reuses `agentOrphanService.adoptOrphan` for the upsert,
 * which flips disabled rows back to active and tags `linked_by`
 * additively without duplicating.
 *
 * Multi-tenant note: scans the local filesystem (`/app/dist` in prod,
 * `backend/src` locally). For Colaberry's own projects (Accelerator,
 * Platform) this maps platform-agent files to their caps. For customer
 * projects whose agents live in a connected GitHub repo (not on this
 * filesystem), the walker finds no overlap with their cap names and
 * cleanly no-ops. A future Phase 2 could walk customer repos via the
 * GitHub API when needed.
 */
import { listOrphanAgents, adoptOrphan } from './agentOrphanService';

export interface ImportGraphAttributionStats {
  readonly scanned: number;
  readonly skippedDeclared: number;
  readonly skippedAlreadyMapped: number;
  readonly suggestionsConsidered: number;
  readonly autoAttached: number;
  readonly reactivated: number;
  readonly alreadyActive: number;
  readonly belowThreshold: number;
}

export interface RunOptions {
  /** Minimum score for auto-attachment. Default 3 (≥2 import matches OR 1 match + name-stem boost + buffer). */
  readonly minScore?: number;
  /** Tag base for `linked_by` (caller can append context). */
  readonly linkedByTag?: string;
}

const DEFAULT_MIN_SCORE = 3;
const DEFAULT_TAG = 'auto-import-graph-2026-05-26';

/**
 * Run import-graph attribution for one project. Returns counts of what
 * happened. Never throws — failures are caught and counted as
 * belowThreshold (so brownfield scan never falls over on this).
 */
export async function runImportGraphAttribution(
  projectId: string,
  opts: RunOptions = {},
): Promise<ImportGraphAttributionStats> {
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  const tag = opts.linkedByTag ?? DEFAULT_TAG;

  const orphans = await listOrphanAgents(projectId);

  let suggestionsConsidered = 0;
  let autoAttached = 0;
  let reactivated = 0;
  let alreadyActive = 0;
  let belowThreshold = 0;

  for (const o of orphans.orphans) {
    const top = o.suggestions[0];
    if (!top) { belowThreshold++; continue; }
    suggestionsConsidered++;
    if (top.score < minScore) { belowThreshold++; continue; }
    try {
      const result = await adoptOrphan({
        projectId,
        agentName: o.agentName,
        capabilityId: top.capId,
        adoptedBy: tag,
      });
      if (result.action === 'inserted') autoAttached++;
      else if (result.action === 'reactivated') reactivated++;
      else alreadyActive++;
    } catch {
      // Cap-not-found or DB error — count as below threshold rather than
      // bubbling. Brownfield scan must not fail because of attribution.
      belowThreshold++;
    }
  }

  return {
    scanned: orphans.scannedCount,
    skippedDeclared: orphans.skippedDeclared,
    skippedAlreadyMapped: orphans.skippedAlreadyMapped,
    suggestionsConsidered,
    autoAttached,
    reactivated,
    alreadyActive,
    belowThreshold,
  };
}
