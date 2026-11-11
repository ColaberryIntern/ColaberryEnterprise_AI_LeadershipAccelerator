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
 *
 * WHAT ACTUALLY HAPPENED ON DEPLOY, measured in production.
 * The sweep first ran at 11:50 UTC on 2026-11-11, ten minutes after the merge, and closed 17
 * conversations in that one tick - every conversation in eight months that a visitor had
 * actually spoken in. `behavioral_signals` of type `chat_engagement` went from 0 to 5, which
 * is exactly the number of conversations carrying three or more visitor messages, and
 * `admissions_memory.conversation_count` went from 0 across all 116 rows to non-zero on 9.
 * The remaining 128 rows are greeting-only and are left alone on purpose; see
 * `findIdleConversations` for why closing them would make Maya's memory worse, not better.
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
 * Finds conversations the visitor took part in, which are still 'active' but have had no
 * activity for `idleMinutes`.
 *
 * THE ACTIVITY MARKER IS NOT JUST `updated_at`.
 * `ChatConversation` declares `timestamps: false`, so Sequelize maintains neither timestamp
 * column. `updated_at` is written only by the code paths that explicitly set it -
 * `sendMessage()` and `closeConversation()` do, and the greeting write in
 * `startConversation()` does not. So a bare `updated_at < cutoff` is BLIND to every row where
 * the column is null, because `null < cutoff` evaluates to null and never to true. Measured in
 * production on 2026-11-11: 128 of 145 conversations had a null `updated_at` and were
 * invisible to exactly that predicate. The marker is therefore `updated_at` when set and
 * `started_at` when it is not, expressed as two OR'd clauses rather than a COALESCE so both
 * sides stay plain indexed column comparisons.
 *
 * WHY `visitor_message_count > 0` IS PART OF BEING SWEEPABLE.
 * All 128 of those rows were greeting-only: `message_count = 1`,
 * `visitor_message_count = 0`, a widget opened and abandoned without the visitor ever typing.
 * Closing one is not harmless. `closeConversation()` fires `saveConversationToMemory()`, which
 * has no substance guard: it would increment `admissions_memory.conversation_count` and append
 * a summary entry reading "0 messages exchanged", and `buildMemoryContext()` injects those
 * summaries into Maya's system prompt. Sweeping them would therefore inflate the very metric
 * R4 exists to make meaningful, and feed Maya a memory of a conversation that never happened.
 * A visitor who never spoke is not someone to remember, so these rows are deliberately left
 * `active`. They are inert: `sendMessage()` would accept a late message on one, which is the
 * correct outcome if the visitor ever returns in that session.
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
      visitor_message_count: { [Op.gt]: 0 },
      [Op.or]: [
        { updated_at: { [Op.lt]: cutoff } },
        // `Op.is` states the IS NULL rather than leaning on Sequelize's coercion of a bare
        // null. Expressing this at all required correcting `ChatConversation.updated_at` to
        // `Date | null`: typed as a plain `Date`, the comparison would not compile, which is
        // part of how the blindness survived review in the first place.
        { updated_at: { [Op.is]: null }, started_at: { [Op.lt]: cutoff } },
      ],
    },
    // `started_at` is NOT NULL and indexed, so it orders deterministically where `updated_at`
    // cannot: ordering by a column that is null on most rows leaves the batch arbitrary.
    order: [['started_at', 'ASC']],
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
