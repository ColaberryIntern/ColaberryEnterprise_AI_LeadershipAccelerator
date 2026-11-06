/**
 * seedToolPreservation — the boot seed adds tools and never silently takes one away.
 *
 * AF3.5. This is the fix for the defect that would otherwise have made the whole ticket
 * theatre: `seedAgentRegistry` rewrote `tools_granted` WHOLESALE from source literals on every
 * boot, and the ten domain agents declare `tools_granted: []`. So a grant written on Monday was
 * gone on Tuesday's deploy — and because `maybeReclassifyAutonomyLevel` fires on a change to
 * that column, the revert also rewrote `autonomy_level` and stamped it `auto`.
 *
 * ## Why this does not read the grant ledger
 *
 * The obvious fix is for the seed to read `agent_domain_tool_grants` and union the recorded
 * grants back in. That was the first implementation and it was wrong, for a reason worth
 * recording: it put a database query in the boot path of the agent registry. The seed had never
 * touched the database directly before — it goes through the `AiAgent` model — so nine existing
 * suites that mock only `AiAgent` suddenly waited out a real connection attempt, roughly 100
 * seconds each. That is a unit-test symptom of a production fact: a slow or unreachable
 * database would have become something the registry seed blocks on.
 *
 * The row already knows. `tools_granted` is read from the agent before the update, so the
 * grant is right there, and the union of the registry list with what the agent already holds
 * preserves it without asking anything else. No query, no new boot-time dependency, no new
 * failure mode.
 *
 * ## The consequence, stated rather than hidden
 *
 * The seed can no longer REMOVE a tool by deleting it from a registry entry. That is a real
 * behaviour change and it is the intended one: removing a tool an agent holds is a revocation,
 * which the AF3.5 ticket puts out of scope precisely because it is a different decision with a
 * different authority. A tool that must come off an agent now needs that decision, not a quiet
 * edit to an array literal that takes effect on the next deploy.
 *
 * The ledger table still earns its place — it records WHO granted the tool, for WHICH
 * capability, and WHEN, which is the half of the acceptance criteria a column cannot carry.
 */

/**
 * The tool list to write: everything the registry declares, plus everything the agent already
 * holds.
 *
 * ORDER IS LOAD-BEARING, not tidiness. `maybeReclassifyAutonomyLevel` decides whether anything
 * changed by comparing `JSON.stringify` of the before and after arrays, and reclassification
 * rewrites `autonomy_level` and stamps it `auto`. If this returned a different order on two
 * boots with the same membership, every boot would look like a change and the fleet's autonomy
 * levels would be rewritten on each deploy. Registry entries keep their declared order; tools
 * the agent already holds and the registry does not mention follow, in the order the row had
 * them.
 */
export function mergePreservedTools(
  registryTools: readonly string[] | undefined,
  currentTools: readonly unknown[] | undefined,
): string[] {
  const merged = [...(registryTools ?? [])];
  for (const raw of currentTools ?? []) {
    const tool = String(raw ?? '').trim();
    if (tool && !merged.includes(tool)) merged.push(tool);
  }
  return merged;
}

/**
 * `tools_granted` as an array of names.
 *
 * The column is jsonb, and `agentEmailTool` documents that it "may be an array, a JSON string,
 * or null depending on who wrote it last". Reading a string as empty would drop every tool the
 * agent held, which is the exact revert this module exists to prevent — so the string case is
 * parsed rather than ignored.
 */
export function readToolsGranted(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t));
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
    } catch { return []; }
  }
  return [];
}
