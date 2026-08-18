/**
 * Reply ceilings for the 30-hour watcher.
 *
 * Three independent ceilings, because they fail in three different ways:
 *
 *   perThread    — one student, one conversation, answered over and over. This
 *                  is the self-reply-storm shape. Default 1: the watcher gets
 *                  exactly one attempt at any given thread, and a second
 *                  question on the same thread goes to Ali. That mirrors the
 *                  reserve-then-send guard Cora already uses (CoraReplyLog,
 *                  one row per thread_key) rather than inventing a new policy.
 *
 *   perRecipient — one student writing on several threads. A student who
 *                  cannot get in often starts a new thread each time instead of
 *                  replying, so a per-thread cap alone does not bound them.
 *
 *   total        — everything else. Whatever loop nobody has thought of yet, it
 *                  cannot exceed this number before a human is involved. This
 *                  is the same role the Cora circuit breaker plays, expressed
 *                  as an absolute count for a fixed 30-hour window rather than
 *                  a rolling rate.
 *
 * Hitting a ceiling is never silent and never a drop: the message escalates to
 * Ali. The cap decides who answers, not whether anyone does.
 *
 * Counts come from the watcher's durable action log, not from process memory,
 * so a restart cannot reset a ceiling. If that log cannot be read the caller
 * must treat every cap as exceeded — see watcherRun.ts.
 */

export interface CapLimits {
  perThread: number;
  perRecipient: number;
  total: number;
}

export const DEFAULT_CAPS: CapLimits = {
  perThread: 1,
  perRecipient: 2,
  total: 15,
};

/** One previously-sent auto-reply, as replayed from the watcher log. */
export interface SentReply {
  threadKey: string;
  recipient: string;
}

export interface CapCandidate {
  threadKey: string;
  recipient: string;
}

export type CapName = 'per_thread' | 'per_recipient' | 'total';

export interface CapVerdict {
  blocked: boolean;
  cap?: CapName;
  /** Replies already sent against the ceiling that blocked, for the log. */
  observed?: number;
  limit?: number;
}

function normalizeRecipient(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Would sending one more reply breach a ceiling?
 *
 * Checked in ascending blast radius — thread, then recipient, then the whole
 * window — so the reported cap is the tightest one actually breached, which is
 * the one an operator needs to see first.
 */
export function checkCaps(
  sent: SentReply[],
  candidate: CapCandidate,
  limits: CapLimits = DEFAULT_CAPS,
): CapVerdict {
  const recipient = normalizeRecipient(candidate.recipient);

  const inThread = sent.filter((s) => s.threadKey === candidate.threadKey).length;
  if (inThread >= limits.perThread) {
    return { blocked: true, cap: 'per_thread', observed: inThread, limit: limits.perThread };
  }

  const toRecipient = sent.filter((s) => normalizeRecipient(s.recipient) === recipient).length;
  if (toRecipient >= limits.perRecipient) {
    return { blocked: true, cap: 'per_recipient', observed: toRecipient, limit: limits.perRecipient };
  }

  if (sent.length >= limits.total) {
    return { blocked: true, cap: 'total', observed: sent.length, limit: limits.total };
  }

  return { blocked: false };
}

/**
 * Read ceilings from the environment, falling back to the defaults. A value
 * that is not a positive integer is REJECTED rather than coerced: `parseInt`
 * turns "" and "abc" into NaN and `NaN >= n` is false, which would silently
 * disable the ceiling it was meant to set.
 */
export function resolveCaps(env: NodeJS.ProcessEnv = process.env): CapLimits {
  const read = (name: string, fallback: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(
        `${name}="${raw}" is not a non-negative integer. Refusing to start with an ` +
        'uninterpretable reply ceiling: a bad value here silently removes the cap.',
      );
    }
    return n;
  };
  return {
    perThread: read('WATCHER_MAX_REPLIES_PER_THREAD', DEFAULT_CAPS.perThread),
    perRecipient: read('WATCHER_MAX_REPLIES_PER_RECIPIENT', DEFAULT_CAPS.perRecipient),
    total: read('WATCHER_MAX_REPLIES_TOTAL', DEFAULT_CAPS.total),
  };
}
