import RoomMessage from '../../models/RoomMessage';
import { openDm, sendDmMessage } from '../communityRooms/dmService';
import { getReeseEnrollmentId } from '../reese/reeseIdentitySeed';
import { getDaraEnrollmentId } from '../curriculum/daraIdentitySeed';
import type { RoomAccessContext } from '../communityRooms/roomEntitlementService';

/**
 * Wave at someone on the campus (Colaberry Campus C5). A wave is an ordinary DM, so it goes through the ordinary DM
 * path and the ordinary rule: openDm refuses exactly the people POST /api/portal/dm/open refuses.
 *
 * IDEMPOTENT BY PERSISTED STATE. Before sending, look at the sender's own most recent message in that DM room (the
 * room is keyed on the pair, so it is the same room from any tab or device). If it is a wave sent less than
 * WAVE_WINDOW_MS ago, send nothing and say so. A reload, a second tab or a double click therefore cannot send twice.
 * Residual, disclosed: two requests arriving within the same few milliseconds could both pass the check; for a
 * greeting that is accepted rather than adding a table.
 *
 * NOT FOR AI STAFF. A message to Reese or Dara starts an AI reply and a ProofDesk ticket, so waving at them is refused;
 * their desks offer real questions instead. FAIL CLOSED: the agent ids are looked up strictly here (unlike the DM rule,
 * where a failed lookup only removes a bypass). If a lookup throws, no wave is sent and the route answers 500, because
 * an unknown id cannot prove the target is not an AI agent (a staff sender would otherwise get through).
 */
export const WAVE_TEXT = '\u{1F44B} waved at you from the campus';
export const WAVE_WINDOW_MS = 10 * 60_000;

export class WaveError extends Error {
  constructor(message: string, readonly error_class: string) { super(message); this.name = 'WaveError'; }
}

export interface WaveResult { sent: boolean; reason: 'sent' | 'already_waved'; roomId: string }

export async function waveAt(me: string, myCohortId: string | null, to: string, now: Date = new Date()): Promise<WaveResult> {
  if (!to || to === me) throw new WaveError('Pick someone to wave at', 'InvalidWaveTarget');
  const [reeseId, daraId] = await Promise.all([getReeseEnrollmentId(), getDaraEnrollmentId()]);
  if (to === reeseId || to === daraId) throw new WaveError('AI staff answer questions; open their desk to ask one', 'WaveToAiStaff');

  const { roomId } = await openDm(me, to, myCohortId); // throws DmError with the usual text when the rule says no

  const last = await RoomMessage.findOne({
    where: { room_id: roomId, enrollment_id: me, deleted_at: null },
    order: [['created_at', 'DESC']],
    attributes: ['content', 'created_at'],
  });
  if (last && last.content === WAVE_TEXT && now.getTime() - new Date(last.created_at).getTime() < WAVE_WINDOW_MS) {
    return { sent: false, reason: 'already_waved', roomId };
  }
  const ctx: RoomAccessContext = { enrollmentId: me, cohortId: myCohortId, isAdmin: false };
  await sendDmMessage(ctx, roomId, WAVE_TEXT, []);
  return { sent: true, reason: 'sent', roomId };
}
