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

const LIVE_SQL = `SELECT COUNT(*)::int AS n FROM scheduled_emails
  WHERE lead_id = :leadId AND (metadata->>'event_countdown') = 'true'
    AND (status IN ('pending', 'processing')
         OR (status = 'sent' AND sent_at > NOW() - INTERVAL '48 hours'))`;

function defaultDeps(): OpenHouseHoldDeps {
  return {
    countLive: async (leadId) => {
      const rows = await sequelize.query<{ n: number }>(LIVE_SQL, { type: QueryTypes.SELECT, replacements: { leadId } });
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
