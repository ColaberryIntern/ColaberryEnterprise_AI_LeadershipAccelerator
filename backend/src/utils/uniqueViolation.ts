/**
 * Is this error Postgres telling us a unique index already holds the row?
 *
 * The one detector for "the idempotency key already exists" — which callers
 * treat as a correct outcome (raced, replayed) rather than a failure. Sequelize
 * wraps it as `SequelizeUniqueConstraintError`; raw queries surface pg's
 * `23505`. Both are checked because both reach application code.
 *
 * Lifted here in Phase 2 (T226); four private copies of the same five lines
 * exist elsewhere in the tree and should migrate to this one as they are touched.
 */
export function isUniqueViolation(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  const code = (err as { parent?: { code?: string }; original?: { code?: string } })?.parent?.code
    ?? (err as { original?: { code?: string } })?.original?.code
    ?? '';
  return name === 'SequelizeUniqueConstraintError' || code === '23505';
}
