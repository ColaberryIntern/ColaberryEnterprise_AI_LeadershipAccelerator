import { isExplorerFeatureEnabled } from '../../../config/explorerGrowthFlags';
import { env } from '../../../config/env';
import { syncTimelineCards, retireMissingCards, type SyncResult } from './syncTimelineCards';
import { sequelize } from '../../../config/database';
import { QueryTypes } from 'sequelize';

/**
 * Explorer Growth OS — EPIC 5 T006. The scheduled entry point for the content
 * registry sync.
 *
 * PROJECTS ONLY. It reads published curriculum and writes registry rows. It does
 * not decide, does not enqueue, and cannot send — the no-send guard's sweep now
 * covers this directory, so an import of a mailer fails the build.
 *
 * DARK BY DEFAULT. Gated on `journeyIntelligence`, the same sub-flag as the
 * nightly profile recompute, checked HERE rather than at the cron registration
 * so that any caller — cron, operator script, future admin action — inherits the
 * gate rather than having to remember it.
 *
 * WHY THAT FLAG AND NOT A NEW ONE. The registry's only consumer is the Governor,
 * and `journeyIntelligence` gates the 03:20 recompute while `journeyGovernor`
 * gates the 03:50 decide. Sharing the earlier flag means the registry is
 * populated at or before the moment anything reads it, never after. A dedicated
 * `contentRegistry` flag would add four structures to the flags module and one
 * more prod env var for no additional safety.
 *
 * Prod population before the flags are on happens through the operator script,
 * which carries its own `--confirm-production` guard. A person running that
 * deliberately is its own authorisation; a cron is not.
 */

export interface ContentSyncResult extends SyncResult {
  retired: number;
  skippedReason?: string;
}

/**
 * Run the projection.
 *
 * Returns a result rather than throwing when the flag is off, so a caller can
 * tell "did nothing on purpose" from "failed" — a cron that silently returns on
 * a disabled feature and a cron that silently returns on an error look identical
 * in a log otherwise.
 */
export async function runContentSync(): Promise<ContentSyncResult> {
  if (!isExplorerFeatureEnabled('journeyIntelligence', env.explorerGrowth)) {
    return { scanned: 0, written: 0, skipped: [], retired: 0, skippedReason: 'flag_off' };
  }

  const result = await syncTimelineCards();

  // Retire only from a sync that actually saw content. `retireMissingCards`
  // refuses an empty list itself, but stating the condition here too means the
  // intent survives someone changing that function: a scan that reached nothing
  // is a failure to read the source, not evidence that 585 cards were withdrawn.
  const seen = result.written > 0 ? await seenSourceIds() : [];
  const retired = seen.length ? await retireMissingCards(seen) : 0;

  return { ...result, retired };
}

/**
 * The source ids the projection currently covers.
 *
 * Re-queried rather than accumulated during the sync so that retirement is
 * decided against what the SOURCE says now, not against a list built row by row
 * while the sync was running.
 */
async function seenSourceIds(): Promise<string[]> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT tc.id
       FROM timeline_cards tc
       JOIN curriculum_type_definitions ctd ON ctd.slug = tc.type
      WHERE tc.visibility = 'published'
        AND tc.status = 'active'
        AND ctd.is_active = true
        AND ctd.today_eligible = true`,
    { type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.id);
}
