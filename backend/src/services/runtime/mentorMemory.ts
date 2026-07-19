/**
 * mentorMemory — reads the runtime mentor's stored conversation (MentorTurn) back
 * so context survives page reloads and return visits, instead of relying only on
 * the browser-supplied history. Pairs with the pure mentorMemoryFormat window
 * builder. Read-only + fail-safe: any error yields an empty window so a memory
 * failure never breaks a mentor turn.
 */
import MentorTurn from '../../models/MentorTurn';
import { buildConversationWindow, Msg } from './mentorMemoryFormat';

const MAX_TURNS = 30; // cap how far back we load per (student, card)

/**
 * The conversation window for (student, card): the most recent exchanges verbatim
 * plus a rolling summary of older ones. Returns an empty window on any error.
 */
export async function loadConversation(
  enrollmentId: string,
  cardId: string,
  recentTurns = 6,
): Promise<{ summary: string; recent: Msg[] }> {
  try {
    const rows = await MentorTurn.findAll({
      where: { enrollment_id: enrollmentId, card_id: cardId },
      order: [['created_at', 'DESC']],
      limit: MAX_TURNS,
      attributes: ['question', 'reply', 'mode', 'created_at'],
    });
    // findAll returned newest-first for the limit; flip to chronological for the window.
    const chronological = rows.reverse().map((r: any) => ({ question: r.question, reply: r.reply, mode: r.mode }));
    return buildConversationWindow(chronological, recentTurns);
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'runtime_mentor', event: 'memory_load_failed',
      card_id: cardId, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    return { summary: '', recent: [] };
  }
}
