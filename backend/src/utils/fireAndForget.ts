import { classifyError } from './errorClassifier';

/**
 * A write we deliberately do not await must still say so when it fails.
 *
 * ## Why this exists
 *
 * `promise.catch(() => {})` is the promise form of the pattern root CLAUDE.md
 * lists as a production defect under Failure-First Design: "`try { ... } catch
 * (e) {}` (silent swallow) is a production defect". Not awaiting the write is a
 * latency decision and a legitimate one. Discarding its failure is not: the two
 * are separate choices that the one-liner fuses together.
 *
 * R3/R5 found what that costs. `chatService` closed a conversation with
 * `saveConversationToMemory(conversationId).catch(() => {})`, and in production
 * `conversation_count` sums to ZERO across all 111 `admissions_memory` rows. The
 * count being zero is consistent with "nobody ever chatted", with "the writer is
 * never reached", and with "every write has been throwing for months", and the
 * swallow is precisely what makes those three indistinguishable. A number that
 * cannot be told apart from a broken pipe is not evidence.
 *
 * ## Scope, deliberately narrow
 *
 * The literal `catch(() => {})` appears in 132 files under `backend/src`. This
 * helper is introduced for the conversation-close path R5 names and is applied
 * there only. Sweeping the other call sites is a far larger change than the
 * ticket asks for, and a mechanical sweep is the wrong instrument anyway: some of
 * those sites may have a considered reason to ignore a specific rejection, and
 * each one needs reading. The helper is written to be reusable so that the sweep,
 * when somebody decides to do it, has somewhere to land.
 *
 * ## What it does not do
 *
 * It does not retry, and it does not convert the failure into a thrown error.
 * Both would change the behaviour of the caller that chose fire-and-forget. It
 * only makes the failure observable, which is the whole of the defect.
 */

export interface FireAndForgetMeta {
  /** The emitting service, matching CLAUDE.md's Observability Framework field. */
  service: string;
  /** Short snake_case event name, e.g. `admissions_memory_write_failed`. */
  event: string;
  /**
   * Domain identifiers that make the failure triageable. Keep this to ids and
   * enums: it is logged verbatim, so message bodies and addresses do not belong
   * here.
   */
  context?: Record<string, unknown>;
}

/**
 * Emit one structured line for a failed fire-and-forget write.
 *
 * Exported separately from {@link fireAndForget} because some call sites already
 * have a `.catch(err => ...)` handler doing other work and need the log without
 * the wrapper.
 */
export function logFireAndForgetFailure(meta: FireAndForgetMeta, err: unknown): void {
  const line = {
    timestamp: new Date().toISOString(),
    level: 'warn' as const,
    service: meta.service,
    event: meta.event,
    outcome: 'failure' as const,
    error_class: classifyError(err),
    error_message: err instanceof Error ? err.message : String(err),
    context: meta.context ?? {},
  };

  try {
    console.warn(JSON.stringify(line));
  } catch {
    // A context holding a circular reference must not turn an observability
    // helper into the thing that breaks the request. Falling back to a
    // non-JSON line still reports the failure, which is the point; dropping it
    // here would reintroduce exactly the silence this module exists to remove.
    console.warn(
      `[fireAndForget] ${meta.service} ${meta.event} outcome=failure `
      + `error_class=${classifyError(err)} context=<unserializable>`,
    );
  }
}

/**
 * Run a promise without awaiting it, logging a classified error if it rejects.
 *
 * Returns `void` synchronously, so it is a drop-in replacement for
 * `work.catch(() => {})` at a call site that is intentionally not awaiting.
 */
export function fireAndForget(work: Promise<unknown>, meta: FireAndForgetMeta): void {
  void work.catch((err: unknown) => {
    logFireAndForgetFailure(meta, err);
  });
}
