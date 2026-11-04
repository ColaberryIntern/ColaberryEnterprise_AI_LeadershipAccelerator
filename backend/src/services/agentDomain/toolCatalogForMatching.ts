/**
 * toolCatalogForMatching — the tool catalog as AF11.2's matcher needs it, read in ONE query.
 *
 * `buildToolCatalog()` in `services/workforce/agentEffectiveAccessService.ts` is the authoritative
 * catalog and the right thing for the `/admin/tools` page, but it calls `resolveEffectiveAccess()`
 * once per agent and there are **270 rows in `ai_agents`** (measured 2026-11-04). Running 270
 * dependent reads on the path where somebody presses Submit would make filing a request feel
 * broken. The duplicate check does not need the per-agent assignment columns that cost those
 * reads: it needs each tool's NAME, READS and PRODUCES, which is three sources and one query.
 *
 * ## The three sources, and why all three are needed
 *
 * Measured in production on 2026-11-04 against what `buildToolCatalog()` actually returns:
 *
 * | Source | Count | Note |
 * |---|---|---|
 * | `TOOL_CAPABILITIES` | 53 | The documented tool chest. The only source carrying `reads`/`produces` |
 * | `ai_agents.tools_granted` | 56 distinct | Adds `assignHandoff`, `materializeHandoffs`, `rankQueue` |
 * | the `GRANTS` table in `agents/tools/agentToolRegistry.ts` | 1 | Adds `read_attachments`, in NEITHER of the above |
 * | **union** | **57** | Matches `buildToolCatalog().tools.length` exactly |
 *
 * Every one of those sources earns its place: dropping the dictionary loses all behavior text,
 * dropping `tools_granted` loses three tools, and dropping the grant table loses exactly one —
 * `read_attachments`, which no agent carries in `tools_granted` and which no documentation
 * describes. That last one matters out of proportion to its count, because a request that
 * duplicates an undocumented tool is precisely the case the matcher is for, and a catalog missing
 * it would make the matcher pass its own test while missing the real thing in production.
 *
 * The compiled handler arrays `REESE_TOOLS` and `DARA_TOOLS` are a FOURTH source the resolver
 * reads and this module deliberately does not. Measured on the same day: every name in both is
 * already in `TOOL_CAPABILITIES`, so they would add nothing, and importing them drags the
 * student-success snapshot subsystem and its Sequelize models into the change-request path for no
 * gain. A first draft of this file did exactly that, and the import chain broke a unit test
 * before any of it reached production.
 *
 * ## Four tools have no behavior text at all, and that is reported rather than hidden
 *
 * `assignHandoff`, `materializeHandoffs`, `rankQueue` and `read_attachments` appear in no
 * documentation, so they arrive here with empty `reads` and `produces`. They are matchable by NAME
 * ONLY. `checkForDuplicateTool` lists them in `behaviorless_tools` on every result for the reason
 * `CLAUDE.md` gives: an absence is indistinguishable from a broken detector unless something says
 * which it is.
 *
 * ## Failure behavior
 *
 * If the query throws, this returns the documented dictionary alone rather than nothing, and says
 * so through `degraded`. A duplicate check run against 53 of 57 tools is worth far more than no
 * duplicate check, and the caller records `catalog_size` on the stored row so a later reader can
 * see the answer was computed against a short catalog. Returning nothing would store a
 * `catalog_absent` result, which reads as "we could not check" when in fact most of the catalog was
 * available.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { TOOL_CAPABILITIES } from '../reese/agentToolCapabilities';
import { allGrantTableToolNames } from '../agents/tools/agentToolRegistry';
import type { CatalogTool } from './toolDuplicateCheck';

export interface MatchingCatalog {
  readonly tools: ReadonlyArray<CatalogTool>;
  /** True when the granted-names query failed and this is the documented dictionary alone. */
  readonly degraded: boolean;
}

/** Distinct names across every agent's `tools_granted`, in one query over `ai_agents`. */
async function grantedToolNames(): Promise<string[]> {
  // `jsonb_array_elements_text` does the flattening in Postgres, so this returns one short column
  // of names rather than 270 JSON arrays for Node to unpack.
  const rows = await sequelize.query<{ tool_name: string }>(
    `SELECT DISTINCT jsonb_array_elements_text(COALESCE(tools_granted, '[]'::jsonb)) AS tool_name
       FROM ai_agents`,
    { type: QueryTypes.SELECT },
  );
  // This driver hands back raw arrays for a single-column select in some paths and objects in
  // others. Both shapes are handled, because the sibling schema modules each got caught by exactly
  // this once and reported a present thing as missing.
  return rows
    .map((r) => (Array.isArray(r) ? String((r as unknown as string[])[0]) : String(r.tool_name)))
    .filter((name) => name.length > 0);
}

/**
 * Build the catalog the matcher compares against.
 *
 * Sorted by name, so two calls over the same data produce the same order and a stored result is
 * reproducible rather than merely equivalent.
 */
export async function loadToolCatalogForMatching(): Promise<MatchingCatalog> {
  const byName = new Map<string, CatalogTool>();

  for (const [tool_name, capability] of Object.entries(TOOL_CAPABILITIES)) {
    byName.set(tool_name, {
      tool_name,
      reads: capability.reads,
      produces: capability.produces,
    });
  }

  let degraded = false;
  let extraNames: string[] = allGrantTableToolNames();
  try {
    extraNames = [...extraNames, ...await grantedToolNames()];
  } catch (err: unknown) {
    degraded = true;
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'tool_matching_catalog_granted_names_unavailable',
      outcome: 'partial',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: {
        message: err instanceof Error ? err.message : String(err),
        documented_tools: byName.size,
      },
    }));
  }

  for (const tool_name of extraNames) {
    // A documented tool keeps its behavior text; an undocumented one arrives name-only and is
    // reported as such by the matcher rather than quietly scoring zero on everything.
    if (!byName.has(tool_name)) byName.set(tool_name, { tool_name, reads: [], produces: [] });
  }

  const tools = [...byName.values()].sort((a, b) => a.tool_name.localeCompare(b.tool_name));
  return { tools, degraded };
}
