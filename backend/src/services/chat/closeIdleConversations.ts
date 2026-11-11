import { Op } from 'sequelize';
import ChatConversation from '../../models/ChatConversation';
import { closeConversation } from '../chatService';

/**
 * Closes chat conversations that have gone idle, so that closing actually happens.
 *
 * WHY THIS EXISTS, measured rather than assumed.
 * `closeConversation()` is the only caller of `saveConversationToMemory()`, which is the only
 * writer of `admissions_memory.conversation_count`. `closeConversation()` is reachable only
 * through `POST /api/chat/close`, and nothing calls that route: a search of `frontend/` for
 * "chat/close" returns zero files while four frontend files reference "/api/chat", so the
 * search was aimed correctly and the zero is a real absence.
 *
 * Production on 2026-11-11: 145 conversations, EVERY one `status='active'`, zero `ended_at`,
 * zero summaries, spanning 2026-03-16 to 2026-11-10. 13 carried a visitor message and 5 had
 * three or more, which should each have emitted a `chat_engagement` behavioral signal. There
 * are zero such signals. So every downstream effect of closing - the summary, the memory
 * write, the behavioral signal, the CRM tag, the conversation outcome - has never run once in
 * eight months, and `conversation_count` is 0 across all 116 memory rows as a direct result.
 *
 * WHY A SWEEPER AND NOT AN UNLOAD BEACON.
 * The widget restores its conversation id from `sessionStorage` across page loads, and
 * `sendMessage()` throws 'Conversation is closed' for any conversation whose status is not
 * 'active'. Closing on `pagehide` would therefore close the conversation during an ordinary
 * navigation and make the visitor's next message fail on the very next page. That trades an
 * invisible defect for a visible one. A sweeper closes only what is genuinely finished.
 *
 * FAILURE POSTURE.
 * One conversation's failure must not stop the sweep, so each close is caught individually and
 * counted. The function itself never throws: the caller is a cron, and a throwing cron job is
 * how a sweep silently stops running. Errors are returned in the result and logged with the
 * conversation id, never swallowed.
 *
 * IDEMPOTENCY.
 * `closeConversation()` returns early when the status is already 'closed', and this only
 * selects `status='active'`. Running the sweep twice in the same minute closes nothing twice
 * and sends nothing twice.
 */

/** Minutes of inactivity after which a conversation is considered finished. */
export const DEFAULT_IDLE_MINUTES = 30;

/**
 * Most conversations closed in one run. The backlog is 145, so the first run in production
 * drains it in one pass, but the bound means a future backlog cannot turn one cron tick into
 * an unbounded run of OpenAI summary calls.
 */
export const DEFAULT_BATCH_LIMIT = 200;

export interface CloseIdleResult {
  scanned: number;
  closed: number;
  failed: number;
  /** Conversation ids that could not be closed, with the error class. Bounded for logging. */
  errors: Array<{ conversation_id: string; error_class: string; message: string }>;
}

export interface CloseIdleOptions {
  idleMinutes?: number;
  limit?: number;
  /** Injected for tests. Defaults to the real closer. */
  closer?: (conversationId: string) => Promise<void>;
  /** Injected for tests. Defaults to now. */
  now?: Date;
}

/**
 * Finds conversations that are still 'active' but have had no activity for `idleMinutes`.
 *
 * `updated_at` is the activity marker because `sendMessage()` calls `conversation.update()`
 * on every exchange, so it moves whenever the visitor or the assistant says anything. A
 * conversation that was opened and never used still has its `created_at`-time `updated_at`,
 * so abandoned widget opens are swept too, which is correct: they are finished.
 */
export async function findIdleConversations(
  idleMinutes: number,
  limit: number,
  now: Date = new Date()
): Promise<Array<InstanceType<typeof ChatConversation>>> {
  const cutoff = new Date(now.getTime() - idleMinutes * 60_000);
  return ChatConversation.findAll({
    where: {
      status: 'active',
      updated_at: { [Op.lt]: cutoff },
    },
    order: [['updated_at', 'ASC']],
    limit,
  });
}

/**
 * Closes every conversation idle longer than the threshold.
 *
 * Returns counts rather than throwing, so a cron wrapper can log a partial sweep instead of
 * recording the whole tick as a failure.
 */
export async function closeIdleConversations(
  options: CloseIdleOptions = {}
): Promise<CloseIdleResult> {
  const idleMinutes = options.idleMinutes ?? DEFAULT_IDLE_MINUTES;
  const limit = options.limit ?? DEFAULT_BATCH_LIMIT;
  const close = options.closer ?? closeConversation;

  const result: CloseIdleResult = { scanned: 0, closed: 0, failed: 0, errors: [] };

  let stale: Array<InstanceType<typeof ChatConversation>>;
  try {
    stale = await findIdleConversations(idleMinutes, limit, options.now ?? new Date());
  } catch (err) {
    // A lookup failure is the whole sweep failing, and it must be visible rather than silent.
    const e = err as Error;
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'chat-close-idle',
        event: 'idle_lookup_failed',
        outcome: 'failure',
        error_class: e.constructor?.name || 'Error',
        context: { message: e.message },
      })
    );
    return result;
  }

  result.scanned = stale.length;

  for (const conversation of stale) {
    try {
      await close(conversation.id);
      result.closed += 1;
    } catch (err) {
      const e = err as Error;
      result.failed += 1;
      if (result.errors.length < 20) {
        result.errors.push({
          conversation_id: conversation.id,
          error_class: e.constructor?.name || 'Error',
          message: e.message,
        });
      }
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'chat-close-idle',
          event: 'close_failed',
          outcome: 'failure',
          error_class: e.constructor?.name || 'Error',
          context: { conversation_id: conversation.id, message: e.message },
        })
      );
    }
  }

  if (result.scanned > 0) {
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'chat-close-idle',
        event: 'sweep_complete',
        outcome: result.failed === 0 ? 'success' : 'partial',
        context: {
          scanned: result.scanned,
          closed: result.closed,
          failed: result.failed,
          idle_minutes: idleMinutes,
        },
      })
    );
  }

  return result;
}
