import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/**
 * M35 / M5 - "taking ownership pauses the journey", for Explorers.
 *
 * When a person on the admissions team ACCEPTS a handoff (dispositionService.acceptHandoff), that learner belongs to a
 * human until the handoff is closed or released. The Explorer governor must not propose AI contact for them meanwhile.
 *
 * WHY THIS AND NOT conversationOwnershipService: that table is opened only when the handoff carries a numeric lead_id,
 * and an Explorer often has none (resolveExplorerLead can return null), so for those learners nothing paused. The
 * handoff row itself always carries the enrollment, so it is the evidence read here.
 *
 * IMPORTS: only sequelize + config/database, both on the governor's no-send import allowlist
 * (__tests__/noSendPaths.test.ts). A read-only parameterized SELECT; nothing here can reach a send path.
 *
 * FAILS CLOSED: if the read fails, the learner is treated as human-owned and the governor stops for them this run. A
 * missed AI nudge is cheaper than an AI message landing on someone a person is already working with. Logged, never thrown.
 */

export interface HumanOwnershipDeps {
  countAccepted: (enrollmentId: string) => Promise<number>;
}

const ACCEPTED_SQL = `SELECT COUNT(*)::int AS n FROM growth_journey_handoffs
  WHERE enrollment_id = :enrollmentId AND status = 'accepted'`;

function defaultDeps(): HumanOwnershipDeps {
  return {
    countAccepted: async (enrollmentId) => {
      const rows = await sequelize.query<{ n: number }>(ACCEPTED_SQL, { type: QueryTypes.SELECT, replacements: { enrollmentId } });
      return Number(rows[0]?.n ?? 0);
    },
  };
}

export async function isHumanOwned(enrollmentId: string, deps: HumanOwnershipDeps = defaultDeps()): Promise<boolean> {
  try {
    return (await deps.countAccepted(enrollmentId)) > 0;
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'explorer-governor', event: 'human_ownership_read_failed',
      outcome: 'failure', error_class: err instanceof Error ? err.name : 'UnknownError',
      context: { enrollment_id: enrollmentId, treated_as: 'human_owned' },
    }));
    return true;
  }
}
