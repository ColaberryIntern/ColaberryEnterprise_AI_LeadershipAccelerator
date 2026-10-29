/**
 * ownerGrant — the idempotency rule for granting the management `owner` role.
 *
 * Used by the one-off `scripts/grantKesOwner.js`, which makes management (Ali + Kes) see every admin
 * section, including the new Interns-hub Agents and Gov Contracts tabs — the Kes access fix. Pure, so
 * the "running it twice changes nothing" property is tested from literals rather than against a
 * database: a row already `owner` is left alone; any other value (including a null/unknown/blank
 * current role) is upgraded to `owner`.
 *
 * It deliberately does NOT decide WHICH row to grant. Kes has two person records, and that targeting
 * stays in the script, which prints the candidate `community_members` rows and writes only under an
 * explicit `--apply` — so a prod write is always a deliberate, reviewed act, never a side effect.
 */
export interface OwnerGrantDecision {
  /** False when the row is already `owner`, which is what makes a re-run a no-op. */
  shouldWrite: boolean;
  from: string | null;
  to: 'owner';
}

export function resolveOwnerGrant(currentRole: string | null | undefined): OwnerGrantDecision {
  const from = currentRole ?? null;
  return { shouldWrite: from !== 'owner', from, to: 'owner' };
}
