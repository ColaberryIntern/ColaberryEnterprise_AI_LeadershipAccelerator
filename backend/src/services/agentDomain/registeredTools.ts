/**
 * registeredTools — the tool names that are actually compiled into this backend.
 *
 * AF3.5. "Registered" means a handler exists in source. Ali chose on 15 Oct to keep registration
 * in code rather than make it data-driven, so a tool CANNOT be created by granting it, and a
 * grant of a name nothing implements would read as success while changing nothing the agent can
 * do. That is what this list exists to refuse.
 *
 * ## There is no single registry in this codebase, and pretending otherwise would be the bug
 *
 * Measured 5 Nov 2026, the names live in four unrelated places and no file unions them:
 *
 *   | Source                                   | Count | What it is                              |
 *   |------------------------------------------|-------|-----------------------------------------|
 *   | `TOOL_CAPABILITIES` (agentToolCapabilities) | 53 | the documented dictionary, Reese/Dara/intelligence |
 *   | `REESE_TOOLS`                            |     2 | OpenAI function schemas Reese is given  |
 *   | `DARA_TOOLS`                             |     1 | the same, for Dara                      |
 *   | `GRANTS` (agentToolRegistry)             |     1 | `read_attachments`, per agent key       |
 *   | handler-backed, in none of the above     |     1 | `send_email`                            |
 *
 * `send_email` is the one that proves the point: it has a real handler and a real grant check in
 * `agentEmailTool.ts`, and it appears in no dictionary. A registered-tool list built from
 * `TOOL_CAPABILITIES` alone would refuse to grant the single most consequential tool in the
 * fleet. `HANDLER_BACKED_TOOLS` below is where such names go, and a test pins each one against
 * the source that defines it so the list cannot quietly drift.
 *
 * ## Deliberately NOT read from the database
 *
 * `loadToolCatalogForMatching` harvests names out of existing `tools_granted` columns, which is
 * right for a duplicate check and wrong here: it would mean a name becomes "registered" merely
 * because somebody already granted it. This module is synchronous and reads only source.
 */

import { TOOL_CAPABILITIES } from '../reese/agentToolCapabilities';
import { REESE_TOOLS } from '../reese/reeseTools';
import { DARA_TOOLS } from '../curriculum/daraTools';
import { allGrantTableToolNames } from '../agents/tools/agentToolRegistry';

/**
 * Tools with a compiled handler that appear in none of the dictionaries.
 *
 * `send_email` is defined as `AGENT_EMAIL_TOOL` at `agentEmailTool.ts:51`. It is restated here
 * rather than imported because that module pulls in the model index and the communication
 * safety service, and a list of names should not drag the send path into the boot graph of
 * everything that asks "is this a real tool". `registeredTools.test.ts` reads that file and
 * asserts the two agree, so the restatement cannot drift.
 */
export const HANDLER_BACKED_TOOLS: ReadonlyArray<string> = ['send_email'];

type FunctionTool = { type: string; function?: { name?: string } };

function functionNames(tools: ReadonlyArray<unknown>): string[] {
  return (tools as ReadonlyArray<FunctionTool>)
    .filter((t) => t && t.type === 'function' && typeof t.function?.name === 'string')
    .map((t) => String(t.function!.name));
}

/**
 * Every tool name this backend implements, sorted and de-duplicated.
 *
 * Synchronous and total: there is no I/O here, so there is no "could not read" case and the
 * grant gate's `tool_catalog_unreadable` refusal is reachable only by a caller that passes null
 * deliberately. That is the intended shape — the list cannot be the flaky part.
 */
export function registeredToolNames(): string[] {
  const names = new Set<string>([
    ...Object.keys(TOOL_CAPABILITIES),
    ...functionNames(REESE_TOOLS as ReadonlyArray<unknown>),
    ...functionNames(DARA_TOOLS as ReadonlyArray<unknown>),
    ...allGrantTableToolNames(),
    ...HANDLER_BACKED_TOOLS,
  ]);
  return [...names].filter((n) => n.trim().length > 0).sort();
}
