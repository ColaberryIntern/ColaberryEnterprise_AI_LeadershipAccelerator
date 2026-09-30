/**
 * rule_id persistence guard.
 *
 * `inbox_classifications.rule_id` is a Postgres UUID column, but hard rules
 * identify themselves with semantic string ids (e.g. 'cora_0c'). Inserting a
 * non-UUID throws `invalid input syntax for type uuid`, which crashed
 * classification for EVERY support@ email before Cora could run (the insert
 * happens before dispatch). Until the column is widened to VARCHAR (tracked
 * follow-up), only persist a rule_id that is actually a UUID — the in-memory
 * ruleId still drives dispatch, and the classification `reasoning` text records
 * which rule matched, so no information is lost.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only for a canonical UUID string (the form the rule_id column accepts). */
export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Returns the rule_id only when it can be stored in the UUID column; otherwise
 * null. Non-UUID rule names (e.g. 'cora_0c') are dropped to null so the
 * classification insert succeeds.
 */
export function toPersistableRuleId(ruleId: string | null | undefined): string | null {
  return isUuid(ruleId) ? (ruleId as string) : null;
}
