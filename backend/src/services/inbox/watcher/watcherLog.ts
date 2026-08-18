import fs from 'fs';
import path from 'path';
import { normalizeMessageId } from './outboundIdentity';
import type { SentReply } from './replyCaps';

/**
 * The watcher's append-only action log, and the state replayed from it.
 *
 * ── WHY IT IS THE STATE, NOT A REPORT OF THE STATE ──────────────────────────
 *
 * The reply ceilings and the "did we already answer this thread" guard are only
 * as good as their memory. If that memory lives in the process, a restart —
 * a redeploy, an OOM kill, a container bounce, a cron that fires a second copy —
 * resets every ceiling to zero and the guarantee "at most 15 replies in 30
 * hours" quietly becomes "at most 15 per restart". So the log on disk is the
 * authoritative count, it is fsync'd before the reply goes out, and every cycle
 * replays it rather than trusting anything held in memory.
 *
 * Order matters and is deliberate: `reply_attempt` is written and flushed
 * BEFORE the provider call, `reply_sent` after. A crash between the two leaves
 * an attempt with no outcome, which is counted against the ceilings and shows
 * up in the log as unresolved. That biases toward under-sending. The opposite
 * order biases toward sending a student a second copy, which is the failure we
 * are actually trying to prevent.
 *
 * ── WHAT A REPLY RECORD HAS TO CONTAIN ──────────────────────────────────────
 *
 * `claims` is what the email TELLS the student. `evidence` is what the watcher
 * actually read or wrote, each item timestamped and naming the source. They are
 * stored side by side so that a false claim is discoverable afterwards by
 * reading one file, without re-deriving anything and without trusting the
 * watcher's own summary of itself.
 */

export const WATCHER_LOG_FILENAME = 'watcher-log.jsonl';

export type WatcherEventType =
  | 'cycle_start'
  | 'preflight_failed'
  | 'inbound_classified'
  | 'skipped'
  /**
   * Written BEFORE the escalation is delivered, so a crash between the two
   * under-escalates rather than repeating. Mirrors `reply_attempt` exactly —
   * the ceilings already count attempts for the same reason, and one mechanism
   * that is understood beats two that disagree.
   */
  | 'escalation_attempt'
  | 'escalated'
  /** An escalation that could NOT be delivered. The watcher stops on this. */
  | 'escalation_failed'
  /** A dry run recording the escalation it deliberately did not send. */
  | 'escalation_suppressed'
  | 'reply_attempt'
  | 'reply_sent'
  | 'reply_failed'
  | 'reply_suppressed'
  | 'window_expired'
  | 'halted';

export interface EvidenceItem {
  /** What was read or written, naming the source: a table, a row id, an API. */
  what: string;
  /** The value observed, or the result of the write. */
  result: string;
  at: string;
  /** True when this evidence was gathered AFTER a change, to confirm it landed. */
  postChange?: boolean;
}

export interface WatcherEvent {
  ts: string;
  type: WatcherEventType;
  run_id: string;
  /** Gmail internal message id of the inbound message, when there is one. */
  provider_message_id?: string;
  /** RFC822 Message-ID of the inbound message. */
  message_id?: string;
  thread_key?: string;
  from_address?: string;
  subject?: string;
  issue_class?: string;
  reason?: string;
  detail?: string;
  dry_run?: boolean;
  /** What the reply told the student. */
  claims?: string[];
  /** What the watcher actually did, with sources and timestamps. */
  evidence?: EvidenceItem[];
  /** RFC822 Message-ID of a reply we sent, so it is recognised if re-ingested. */
  reply_message_id?: string;
  /** Gmail internal id of a reply we sent. */
  reply_provider_message_id?: string;
  cap?: string;
  observed?: number;
  limit?: number;
  seam_disagreement?: boolean;
  [k: string]: unknown;
}

export function watcherLogPath(stateDir: string): string {
  return path.join(stateDir, WATCHER_LOG_FILENAME);
}

export class WatcherLog {
  private fd: number;

  private constructor(private readonly file: string) {
    this.fd = fs.openSync(file, 'a');
  }

  static open(stateDir: string): WatcherLog {
    fs.mkdirSync(stateDir, { recursive: true });
    return new WatcherLog(watcherLogPath(stateDir));
  }

  /**
   * Append and fsync. The fsync is not optional: an unflushed reply record in
   * the OS page cache is a reply that a crash erases from the ceilings while
   * the student has already received it.
   */
  append(event: WatcherEvent): void {
    fs.writeSync(this.fd, `${JSON.stringify(event)}\n`);
    fs.fsyncSync(this.fd);
  }

  close(): void {
    try {
      fs.closeSync(this.fd);
    } catch {
      /* already closed */
    }
  }
}

export interface ReplayedState {
  /** Replies counted against the ceilings. Attempts count too — see above. */
  sentReplies: SentReply[];
  /** Normalised Message-IDs of replies we sent, for the self-reply guard. */
  ownReplyIds: Set<string>;
  /** Threads already answered or attempted, whatever the outcome. */
  answeredThreads: Set<string>;
  /**
   * Threads already escalated, or attempted, whatever the outcome.
   *
   * Without this the watcher re-escalated the same message on every tick: one
   * thread went out 7 times, and a second cycle escalated 17 having already
   * escalated 7. At 12 ticks an hour over a 30-hour window that is thousands of
   * emails to one person. Attempts count, not just successes, for the same
   * reason they do for replies — a crash after the send but before the outcome
   * must not free the slot for a second copy.
   */
  escalatedThreads: Set<string>;
  eventCount: number;
}

export class WatcherLogUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatcherLogUnreadableError';
  }
}

/**
 * Rebuild the ceilings and the loop-guard sets from disk.
 *
 * A missing log is a legitimate first run and replays as empty. A log that
 * exists but cannot be parsed THROWS: the caller must treat that as every cap
 * exceeded, because an unreadable count is not a count of zero. Silently
 * treating a corrupt log as empty would re-arm all fifteen replies.
 */
export function replayWatcherLog(stateDir: string): ReplayedState {
  const file = watcherLogPath(stateDir);
  const empty: ReplayedState = {
    sentReplies: [],
    ownReplyIds: new Set(),
    answeredThreads: new Set(),
    escalatedThreads: new Set(),
    eventCount: 0,
  };

  let raw: string;
  try {
    if (!fs.existsSync(file)) return empty;
    raw = fs.readFileSync(file, 'utf8');
  } catch (err: any) {
    throw new WatcherLogUnreadableError(
      `Cannot read ${file}: ${err?.message ?? err}. Without it the reply ceilings cannot be ` +
      'counted, so every ceiling must be treated as already reached.',
    );
  }

  const state: ReplayedState = {
    sentReplies: [],
    ownReplyIds: new Set(),
    answeredThreads: new Set(),
    escalatedThreads: new Set(),
    eventCount: 0,
  };

  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let ev: WatcherEvent;
    try {
      ev = JSON.parse(line);
    } catch {
      throw new WatcherLogUnreadableError(
        `${file} line ${i + 1} is not valid JSON. The reply ceilings cannot be counted from a ` +
        'partly-unreadable log, and an uncountable ceiling must be treated as reached.',
      );
    }
    state.eventCount++;

    // Attempts count against the ceilings, not just confirmed sends: a crash
    // after the provider call but before the outcome was written must not free
    // the slot up for a second copy.
    if (ev.type === 'reply_attempt' || ev.type === 'reply_sent') {
      if (ev.type === 'reply_attempt' && ev.thread_key && ev.from_address) {
        state.sentReplies.push({ threadKey: ev.thread_key, recipient: ev.from_address });
      }
      if (ev.thread_key) state.answeredThreads.add(ev.thread_key);
    }
    if (ev.type === 'reply_sent' && ev.reply_message_id) {
      const id = normalizeMessageId(ev.reply_message_id);
      if (id) state.ownReplyIds.add(id);
    }

    // Escalations, same rule as replies: the attempt is what closes the thread,
    // and `escalated` is replayed too so a log written before this event type
    // existed still suppresses a repeat.
    if (ev.type === 'escalation_attempt' || ev.type === 'escalated' || ev.type === 'escalation_failed') {
      if (ev.thread_key) state.escalatedThreads.add(ev.thread_key);
    }
  }

  return state;
}
