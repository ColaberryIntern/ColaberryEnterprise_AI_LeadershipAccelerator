import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Does this table exist in the database?
 *
 * A leaf module on purpose: it imports the connection and nothing else from this subtree, so
 * anything may depend on it without creating a cycle. R12 needed it in a second place
 * (`govPreProjectTier`) and the alternative was a second copy of the same six lines, which is
 * how two callers end up disagreeing about what "missing" means.
 *
 * ── WHY THIS CHECK EXISTS AT ALL ─────────────────────────────────────────────────────────
 *
 * A MISSING TABLE IS NOT AN EMPTY ONE, and the whole Revenue Room rests on that distinction.
 * `SELECT COUNT(*)` against a table that does not exist throws; caught and treated as zero it
 * would render as "we measured this and the answer is none", which is a claim nobody made.
 * Callers use this to choose between reporting a measured zero and reporting that the
 * instrument is absent.
 */
export async function tableExists(name: string): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :name`,
    { type: QueryTypes.SELECT, replacements: { name } },
  );
  return (rows[0]?.n ?? 0) > 0;
}
