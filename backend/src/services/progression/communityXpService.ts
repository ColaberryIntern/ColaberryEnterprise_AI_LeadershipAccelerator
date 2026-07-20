import XpEvent from '../../models/XpEvent';

// Community skill-XP for NON-card community contributions — Rooms recognition
// (hosting / helping / showing up) and community-feed activity (posts, comments).
// These feed the "Community" lane of the Skill-XP lens (progression), which is
// otherwise only fed by card completions. Append-only + idempotent on the key,
// so a retry never double-counts; card_id is null (not a card completion).
// Best-effort by contract: callers wrap this so an XP failure never breaks the
// underlying action.
export async function awardCommunityXp(
  enrollmentId: string,
  amount: number,
  key: string,
  reason: string,
): Promise<void> {
  if (!enrollmentId || amount <= 0) return;
  await XpEvent.findOrCreate({
    where: { idempotency_key: key },
    defaults: { enrollment_id: enrollmentId, stream: 'community', card_id: null, amount, reason, idempotency_key: key },
  });
}
