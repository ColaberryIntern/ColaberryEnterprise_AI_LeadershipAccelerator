/**
 * Learning Engine — passive learning XP only. Deliberately low; watching
 * content never promotes. Idempotent: one XpEvent per (enrollment, card),
 * keyed so replays never double-award.
 */
import XpEvent from '../../models/XpEvent';
import { getTypeXp } from './pointsConfigService';

export async function awardLearningXp(
  enrollmentId: string,
  card: { id: string; type: string }
): Promise<number> {
  const xp = (await getTypeXp(card.type)).learning;
  if (xp <= 0) return 0;
  const key = `learning:${enrollmentId}:${card.id}`;
  await XpEvent.findOrCreate({
    where: { idempotency_key: key },
    defaults: {
      enrollment_id: enrollmentId,
      stream: 'learning',
      card_id: card.id,
      amount: xp,
      reason: `learning:${card.type}`,
      idempotency_key: key,
    },
  });
  return xp;
}
