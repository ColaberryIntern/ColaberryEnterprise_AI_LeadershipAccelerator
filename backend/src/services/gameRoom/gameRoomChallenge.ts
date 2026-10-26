import { Op } from 'sequelize';
import RoomMessage from '../../models/RoomMessage';
import { openDm, sendDmMessage } from '../communityRooms/dmService';
import { getReeseEnrollmentId } from '../reese/reeseIdentitySeed';
import { getDaraEnrollmentId } from '../curriculum/daraIdentitySeed';
import { centralDateKey, classInstant } from '../centralDate';
import { GAME_NAMES, GameId } from './gameRoomRules';
import { gameRoomStore } from './gameRoomService';

/**
 * Challenge a friend (Campus v8 G4, Basecamp C35): "‹name› challenges you: beat ‹score› in ‹game› →" as an ordinary DM, through the
 * ordinary DM path and rule (openDm refuses exactly whom POST /api/portal/dm/open refuses), with a link that opens that game's cabinet.
 * IDEMPOTENT PER (from, to, game, Central day): before sending, look for the sender's own challenge for that game in that DM today;
 * if there is one, send nothing and say so. AI staff are refused (a message to them starts an AI reply), as for a wave.
 */
export class ChallengeError extends Error {
  constructor(message: string, readonly error_class: string) { super(message); this.name = 'ChallengeError'; }
}

export const challengeText = (name: string, score: number, game: GameId): string =>
  `${name} challenges you: beat ${score.toLocaleString('en-US')} in ${GAME_NAMES[game]} → /portal/game-room?game=${game}`;

export async function challenge(me: string, myCohortId: string | null, to: string, game: GameId, score: number, now: Date = new Date()): Promise<{ sent: boolean; reason: 'sent' | 'already_challenged' }> {
  if (!to || to === me) throw new ChallengeError('Pick a friend to challenge', 'InvalidChallengeTarget');
  const [reeseId, daraId] = await Promise.all([getReeseEnrollmentId(), getDaraEnrollmentId()]);
  if (to === reeseId || to === daraId) throw new ChallengeError('AI staff do not play; challenge a classmate', 'ChallengeToAiStaff');
  const { roomId } = await openDm(me, to, myCohortId); // throws DmError when the DM rule says no
  const marker = `in ${GAME_NAMES[game]} → /portal/game-room?game=${game}`;
  const today = await RoomMessage.findOne({
    where: { room_id: roomId, enrollment_id: me, deleted_at: null, created_at: { [Op.gte]: classInstant(centralDateKey(now.getTime()), '00:00') }, content: { [Op.like]: `%challenges you:%${marker}` } },
    attributes: ['id'],
  });
  if (today) return { sent: false, reason: 'already_challenged' };
  const name = (await gameRoomStore().profilesFor([me])).get(me)?.display_name ?? 'A classmate';
  await sendDmMessage({ enrollmentId: me, cohortId: myCohortId, isAdmin: false }, roomId, challengeText(name, score, game), []);
  return { sent: true, reason: 'sent' };
}
