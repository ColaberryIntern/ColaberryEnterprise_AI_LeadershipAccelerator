import { sequelize } from '../config/database';

/**
 * One-click sign-in links carried by notification email — `portal_link_tokens`.
 *
 * ── WHY THIS IS NOT `enrollments.portal_token` ──────────────────────────────
 *
 * Ali, 3 November 2026, on the "<name> sent you a message" email: "when receiving
 * a message is clicked, it makes you put your email in so you have to then check
 * another email which makes no sense at all." Portal sign-in is magic-link only —
 * there is no password — so a signed-out click on a notification email could only
 * ever end by asking for a second email.
 *
 * The obvious fix is to put a sign-in token in the notification. The obvious place
 * to get one is `enrollments.portal_token`, and that is a trap: it is a SINGLE
 * COLUMN. `requestMagicLink` overwrites it on every call, so minting one per
 * message would mean each new message silently invalidated the previous message's
 * button — and any login link the person had in flight. A notification arriving
 * while someone is mid-login would log them out of their own sign-in attempt.
 * A separate table is the only way these two can coexist.
 *
 * ── SINGLE USE, WHICH THE LOGIN TOKEN DELIBERATELY IS NOT ───────────────────
 *
 * `verifyMagicLink` keeps its token reusable on purpose ("this lets users bookmark
 * their portal link"), and for a link the person ASKED for, 24 reusable hours is a
 * reasonable trade. A notification link is different in the way that matters: it is
 * unsolicited, it is sent repeatedly, and it lands in mailboxes that get forwarded,
 * synced and indexed. `dmNotificationService` already refuses to put message
 * CONTENT in email for exactly that reason. So these tokens are single use.
 *
 * `used_at` is the record of consumption, and `token_hash` is what is stored:
 * SHA-256 of the token, never the token. A dump of this table yields no working
 * sign-in, which is not true of `enrollments.portal_token` today.
 *
 * ── THE GRACE WINDOW IS NOT A WEAKENING, IT IS WHAT MAKES SINGLE-USE USABLE ─
 *
 * The verify page claims the token from a React effect, and the app runs in
 * `<React.StrictMode>`, which double-invokes effects in development. A strict
 * single-use check would have the second invocation fail and show "Invalid or
 * expired link" for a sign-in that had just succeeded. A refresh of the verify
 * page does the same thing in production.
 *
 * So a claim is accepted while `used_at` is null OR within `REPLAY_GRACE_SECONDS`
 * of the first claim. That permits a double-fire and a quick refresh, and still
 * refuses the replay this is actually defending against — a token read out of a
 * forwarded mailbox hours or days later. The alternative, a token nobody can
 * reliably redeem, gets reverted the first time somebody hits refresh.
 *
 * ── POST-CONDITION ASSERTION ────────────────────────────────────────────────
 *
 * Every statement below is best-effort and only warns on failure, exactly as its
 * siblings do, so "it did not throw" is NOT evidence the schema landed.
 * `CREATE TABLE IF NOT EXISTS` is a no-op against an existing table, which makes
 * the `ADD COLUMN IF NOT EXISTS` statements the only thing that creates a column
 * added later. `assertPortalLinkTokenSchema` therefore checks the catalog, and
 * checks that the unique index is actually UNIQUE — an index of the right name
 * that is not unique satisfies every name lookup while permitting the duplicate
 * it was named after preventing.
 */

/** How long after its first claim a token may still be redeemed. See the header. */
export const REPLAY_GRACE_SECONDS = 120;

export async function ensurePortalLinkTokenSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS portal_link_tokens (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       token_hash CHAR(64) NOT NULL,
       enrollment_id UUID NOT NULL,
       purpose VARCHAR(40) NOT NULL,
       next_path VARCHAR(256),
       expires_at TIMESTAMPTZ NOT NULL,
       used_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,

    // The lookup every claim makes, and the guard against a hash collision being
    // stored twice. UNIQUE rather than a plain index because the claim's WHERE
    // targets exactly one row and two rows sharing a hash would make which one is
    // consumed depend on scan order.
    `CREATE UNIQUE INDEX IF NOT EXISTS portal_link_tokens_hash_unique
       ON portal_link_tokens (token_hash)`,

    // Operational reads, and the sweep that deletes expired rows.
    `CREATE INDEX IF NOT EXISTS idx_portal_link_tokens_expires
       ON portal_link_tokens (expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_portal_link_tokens_enrollment
       ON portal_link_tokens (enrollment_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] portal link token schema stmt skipped:', err?.message);
    }
  }

  await assertPortalLinkTokenSchema();
}

/** What ensurePortalLinkTokenSchema must have produced. Checked, not assumed. */
export const REQUIRED_TABLES = ['portal_link_tokens'] as const;

/**
 * Must exist AND be unique. Uniqueness is checked separately from existence
 * because a non-unique index of this name would pass a name lookup while
 * allowing two rows to share a hash.
 */
export const REQUIRED_UNIQUE_INDEXES = ['portal_link_tokens_hash_unique'] as const;

/** Columns the mint and the claim read or write. Checked, not assumed. */
export const REQUIRED_COLUMNS = [
  'portal_link_tokens.token_hash',
  'portal_link_tokens.enrollment_id',
  'portal_link_tokens.purpose',
  'portal_link_tokens.next_path',
  'portal_link_tokens.expires_at',
  'portal_link_tokens.used_at',
  'portal_link_tokens.created_at',
] as const;

/**
 * Verify the post-condition against the catalog and report loudly if it is not
 * met. Exported so a test can prove the assertion fires against an un-migrated
 * database — an assertion nobody has watched fail is not an assertion.
 */
export async function assertPortalLinkTokenSchema(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  try {
    const [tableRows]: any = await sequelize.query(
      `SELECT array_agg(table_name) AS tables FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($tables)`,
      { bind: { tables: [...REQUIRED_TABLES] } },
    );
    const foundTables: string[] = tableRows?.[0]?.tables ?? [];
    for (const t of REQUIRED_TABLES) if (!foundTables.includes(t)) missing.push(`table:${t}`);

    // pg_index.indisunique, not pg_indexes.indexname. The name proves somebody
    // once ran a CREATE; indisunique proves the database will refuse the second row.
    const [idxRows]: any = await sequelize.query(
      `SELECT c.relname AS indexname, i.indisunique AS is_unique
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_class t ON t.oid = i.indrelid
        WHERE t.relname = ANY($tables)`,
      { bind: { tables: [...REQUIRED_TABLES] } },
    );
    const uniqueByName = new Map<string, boolean>(
      (idxRows ?? []).map((r: any) => [String(r.indexname), Boolean(r.is_unique)]),
    );
    for (const idx of REQUIRED_UNIQUE_INDEXES) {
      if (!uniqueByName.has(idx)) missing.push(`index:${idx}`);
      else if (!uniqueByName.get(idx)) missing.push(`index-not-unique:${idx}`);
    }

    // Filtered on table_schema. Without it `information_schema.columns` judges an
    // arbitrary one of the same-named tables when more than one schema holds it.
    const [colRows]: any = await sequelize.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($tables)`,
      { bind: { tables: [...REQUIRED_TABLES] } },
    );
    const found = new Set<string>((colRows ?? []).map((r: any) => `${r.table_name}.${r.column_name}`));
    for (const c of REQUIRED_COLUMNS) if (!found.has(c)) missing.push(`column:${c}`);
  } catch (err: any) {
    missing.push(`check-failed:${err?.message ?? 'unknown'}`);
  }

  if (missing.length) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'portal_link_token_schema_incomplete',
      outcome: 'failure',
      error_class: 'SchemaPostConditionUnmet',
      context: { missing },
    }));
  }
  return { ok: missing.length === 0, missing };
}
