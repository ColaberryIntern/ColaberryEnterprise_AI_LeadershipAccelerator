/**
 * approverConfiguration — who may settle a tool grant right now.
 *
 * ## The filename deliberately avoids the substring "toolGrant"
 *
 * `toolRequestDecisionGrantsNothing.test.ts` refuses any import whose path matches
 * /(aiAgent|agentToolRegistry|toolGrant|autonomy|abac|effectiveAccess)/i, as a SHAPE check for
 * "the decision module reached something that could grant". This module cannot grant — it reads
 * an env var and returns email addresses — so matching that pattern is a false positive.
 *
 * The fix is the name, not the guard. That test's own header explains why it carries no
 * exception list: an earlier draft banned words, false-failed on the feature's own nouns, and
 * the predictable repair was a weakened regex, "which turns this gate back into the decoration
 * it exists to prevent". An exemption for this file would be exactly that repair. Renaming
 * costs nothing and leaves the gate as strict as it was.
 *
 * ## Why this is its own file
 *
 * AF11.3 put `configuredApprovers` in `toolRequestDecisionService`, which was right while the
 * decision console was its only caller. AF3.5's grant service needs the same answer, and
 * importing it from there would have added a second importer to the set that
 * `toolRequestDecisionGrantsNothing.test.ts` pins — turning "only the controller reaches the
 * decision service" from an invariant into a list that grows whenever something needs a
 * constant.
 *
 * So the function moved instead, exactly as `resolveRecordedHumans` moved into
 * `recordedHumans.ts` for the same reason when AF11.0 needed it. `toolRequestDecisionService`
 * re-exports both names, so every existing caller and test keeps importing what it imported
 * before and the move cannot be a behaviour change.
 *
 * ## This is NOT the same question as "is this a real person"
 *
 * `resolveRecordedHumans` establishes that an identity belongs to somebody real.
 * `configuredApprovers` establishes that this particular real person may decide a tool grant.
 * Ali's 4 Nov ruling narrowed the second and left the first alone, and a gate that collapsed
 * them would quietly re-widen it.
 */

/** The default approver set, used when nothing is configured. Ali's ruling of 4 Nov 2026. */
export const DEFAULT_TOOL_GRANT_APPROVERS = ['ali@colaberry.com'];

/**
 * Read from `TOOL_GRANT_APPROVERS` (comma separated) so widening it is a deployment setting
 * rather than a rewrite — the ruling says "for now", and a hardcoded address is how a temporary
 * decision becomes permanent.
 *
 * An EMPTY setting is deliberately NOT read as "no restriction": a blank value falls back to the
 * documented default rather than opening the gate, because the fail-open reading of an empty
 * list is a mistake this subtree has made more than once.
 */
export function configuredApprovers(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = String(env.TOOL_GRANT_APPROVERS ?? '').trim();
  if (!raw) return [...DEFAULT_TOOL_GRANT_APPROVERS];
  const parsed = raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_TOOL_GRANT_APPROVERS];
}
