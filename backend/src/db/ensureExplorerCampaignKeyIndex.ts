import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Explorer Growth OS — EPIC 6 T003a. A partial unique index on the Explorer
 * campaign key.
 *
 * WHY STRUCTURAL RATHER THAN APPLICATION-LEVEL. `seedExplorerGrowthCampaigns`
 * runs fire-and-forget on every boot with no advisory lock, and nothing at any
 * layer prevents two rows sharing a `campaign_key`. Two overlapping boots — a
 * deploy racing the old container, or a restart loop — can both find nothing and
 * both create. CLAUDE.md's idempotency table asks for a unique constraint rather
 * than a find-then-create, and this is that.
 *
 * It is PARTIAL: it constrains only rows that carry a `campaign_key`, and nothing
 * outside `services/explorerGrowth/` writes that field, so the other 36 campaigns
 * cannot be caught by it.
 *
 * ─── WHY THIS MODULE IS SO DEFENSIVE ────────────────────────────────────────
 *
 * `CREATE UNIQUE INDEX ... IF NOT EXISTS` does NOT skip past duplicate data — it
 * raises `could not create unique index ... Key is duplicated`. And `start()` is
 * invoked bare at `server.ts:3023` with `app.listen()` as its final statement and
 * no `unhandledRejection` handler. **A throwing index creation therefore means the
 * backend never binds its port.**
 *
 * Duplicate rows degrade one feature. A bricked boot takes the platform down. A
 * safety measure that can cause a worse outage than the problem it prevents is
 * not a safety measure — so this module never rejects, and it refuses to attempt
 * the DDL at all when it would fail.
 */

const INDEX_NAME = 'idx_campaigns_explorer_key';

const CREATE_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME}
    ON campaigns ((settings->>'campaign_key'))
    WHERE settings->>'campaign_key' IS NOT NULL
`;

const DUPLICATE_CHECK_SQL = `
  SELECT settings->>'campaign_key' AS k, count(*)::int AS n
    FROM campaigns
   WHERE settings->>'campaign_key' IS NOT NULL
   GROUP BY 1
  HAVING count(*) > 1
`;

export interface IndexResult {
  created: boolean;
  /** Why it was not created, when it was not. Never silent. */
  skipped?: 'duplicates_exist' | 'error';
  duplicateKeys?: string[];
}

/**
 * Create the index, unless doing so would fail.
 *
 * Pre-flighting the duplicate check does not close the race — two boots can both
 * pass it — but it makes the common case quiet and legible. The property that
 * actually guarantees the boot survives is that every statement is contained and
 * nothing here rethrows. Worst case after losing the race is "index absent,
 * warning logged, backend running", which is the status quo, degraded but not
 * worse than today.
 */
export async function ensureExplorerCampaignKeyIndex(): Promise<IndexResult> {
  try {
    const dupes = await sequelize.query<{ k: string; n: number }>(DUPLICATE_CHECK_SQL, {
      type: QueryTypes.SELECT,
    });

    if (dupes.length > 0) {
      const keys = dupes.map((d) => d.k);
      // Loud, named, and NOT an attempt. The DDL would raise here, and this module
      // is on the boot path.
      console.warn(
        `[DB] ${INDEX_NAME} NOT created — duplicate campaign_key rows exist: ${keys.join(', ')}. ` +
          'Resolve the duplicates, then restart to create the index.',
      );
      return { created: false, skipped: 'duplicates_exist', duplicateKeys: keys };
    }

    await sequelize.query(CREATE_INDEX_SQL);
    return { created: true };
  } catch (err: any) {
    // Everything, including the pre-flight itself. A backend that will not start
    // is a worse outcome than an index that does not exist.
    console.warn(`[DB] ${INDEX_NAME} skipped:`, err?.message);
    return { created: false, skipped: 'error' };
  }
}

export const EXPLORER_CAMPAIGN_KEY_INDEX = INDEX_NAME;
