import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ensureCommunityBoardSeenSchema } from '../../db/ensureCommunityBoardSeenSchema';

/**
 * Board "seen" marks on the server (Campus v14 B1 / B3, Basecamp C66). Scopes: "board" (the whole board) and "post:<id>" (one of the
 * viewer's own posts, so opening it clears its new replies). Writes are idempotent upserts; marking "now" twice changes nothing a
 * reader can see. `at` lets the first load after release migrate the browser's old localStorage value (only when the server has none).
 */
export type SeenScope = 'board' | `post:${string}`;

export async function seenMarks(enrollmentId: string): Promise<Map<string, string>> {
  await ensureCommunityBoardSeenSchema();
  const rows = await sequelize.query<{ scope: string; seen_at: Date | string }>(
    'SELECT scope, seen_at FROM community_board_seen WHERE enrollment_id = :enrollmentId',
    { replacements: { enrollmentId }, type: QueryTypes.SELECT },
  );
  return new Map(rows.map((r) => [r.scope, new Date(r.seen_at).toISOString()]));
}

/**
 * Mark a scope seen. With `onlyIfMissing` (the localStorage migration) an existing mark is kept, so a migration can never move a
 * newer server value back. Returns the mark now stored.
 */
export async function markSeen(enrollmentId: string, scope: SeenScope, at?: string, onlyIfMissing = false): Promise<string> {
  await ensureCommunityBoardSeenSchema();
  const when = at ? new Date(at).toISOString() : new Date().toISOString();
  const rows = await sequelize.query<{ seen_at: Date | string }>(
    `INSERT INTO community_board_seen (enrollment_id, scope, seen_at) VALUES (:enrollmentId, :scope, :when)
     ON CONFLICT (enrollment_id, scope) DO UPDATE SET seen_at = ${onlyIfMissing ? 'community_board_seen.seen_at' : 'GREATEST(community_board_seen.seen_at, EXCLUDED.seen_at)'}
     RETURNING seen_at`,
    { replacements: { enrollmentId, scope, when }, type: QueryTypes.SELECT },
  );
  return new Date(rows[0]?.seen_at ?? when).toISOString();
}
