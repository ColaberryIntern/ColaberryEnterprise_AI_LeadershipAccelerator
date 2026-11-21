import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/**
 * OH1f: the Open House takes precedence over Explorer Growth (Ali, 2026-11-18): "you could
 * just make it easy and block everyone that's an explorer and in an Open House campaign from
 * getting sent Explorer Growth OS messages."
 *
 * A learner is held while their Open House countdown is live: a countdown step still due
 * (pending or processing), or one sent in the last 48 hours (Explorer Growth's own minimum
 * gap between touches, so its first message after the Open House never lands on the heels
 * of the last countdown email). Before this, the governor counted only its OWN decisions as
 * contact history and could not see the countdown at all.
 *
 * Same shape as humanOwnership.ts: injectable for tests, and an unreadable answer is treated
 * as HELD. An unknown is not permission to send.
 */
export interface OpenHouseHoldDeps {
  countLive: (leadId: number) => Promise<number>;
}

/**
 * OH1w (Ali, 2026-11-21): "Explorer Growth only reaches out to people that aren't in campaigns."
 * The hold now also covers membership of ANY running campaign: an enrolled/active
 * campaign_leads row in a campaign that is active and not archived (the same definition as
 * campaignMembership.RUNNING_MEMBERSHIP_SQL). Explorer Growth itself writes no campaign_leads
 * rows, so it never holds itself. Members leave when they finish (the hourly exit sweep).
 */
/** Same key as campaignMembership.MEMBERSHIP_RULES_SETTING (pinned equal by a test). */
export const MEMBERSHIP_RULES_SETTING = 'campaign_membership_rules_enabled';

export const COUNTDOWN_SQL =`SELECT COUNT(*)::int AS n FROM scheduled_emails
  WHERE lead_id = :leadId AND (metadata->>'event_countdown') = 'true'
    AND (status IN ('pending', 'processing')
         OR (status = 'sent' AND sent_at > NOW() - INTERVAL '48 hours'))`;

export const LIVE_SQL = `SELECT
  (SELECT COUNT(*) FROM scheduled_emails
    WHERE lead_id = :leadId AND (metadata->>'event_countdown') = 'true'
      AND (status IN ('pending', 'processing')
           OR (status = 'sent' AND sent_at > NOW() - INTERVAL '48 hours')))
  + (SELECT COUNT(*) FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id
      WHERE cl.lead_id = :leadId AND cl.status IN ('enrolled', 'active')
        AND c.status = 'active' AND c.archived_at IS NULL)
  AS n`;

function defaultDeps(): OpenHouseHoldDeps {
  return {
    countLive: async (leadId) => {
      // Campaign membership counts only once the OH1w rules are switched on (after the cleanup).
      // Read straight from system_settings: the Governor may not import the campaign engine
      // (noSendPaths.test.ts), and campaignMembership reaches it.
      const [flag] = await sequelize.query<{ v: string | null }>(
        `SELECT value::text AS v FROM system_settings WHERE key = :k LIMIT 1`,
        { type: QueryTypes.SELECT, replacements: { k: MEMBERSHIP_RULES_SETTING } },
      );
      const rulesOn = flag?.v === 'true' || flag?.v === '"true"';
      const sql = rulesOn ? LIVE_SQL : COUNTDOWN_SQL;
      const rows = await sequelize.query<{ n: number }>(sql, { type: QueryTypes.SELECT, replacements: { leadId } });
      return Number(rows[0]?.n ?? 0);
    },
  };
}

export async function isInOpenHouseCountdown(
  leadId: number | string | null | undefined,
  deps: OpenHouseHoldDeps = defaultDeps(),
): Promise<boolean> {
  // No lead row means no campaign enrollment, so there is no countdown to defer to.
  const id = Number(leadId);
  if (leadId == null || !Number.isFinite(id) || id <= 0) return false;
  try {
    return (await deps.countLive(id)) > 0;
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'explorer-governor', event: 'open_house_hold_read_failed',
      outcome: 'failure', error_class: err instanceof Error ? err.name : 'UnknownError',
      context: { lead_id: id, treated_as: 'held' },
    }));
    return true;
  }
}
