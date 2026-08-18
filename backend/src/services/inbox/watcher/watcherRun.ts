import { checkHalt, killCommand } from './watcherConfig';
import { checkWindow } from './watchWindow';
import { loadOutboundLedger, isCampaignRecipient } from './outboundIdentity';
import { replayWatcherLog, WatcherLog, WatcherLogUnreadableError } from './watcherLog';
import { watcherSkipReason, threadKeyFor, ThreadMessage } from './watcherGuards';
import { checkCaps, CapLimits } from './replyCaps';
import { classifyInbound } from './issueClassifier';
import { verifyClaims } from './claimGate';
import { diagnose, WatcherDataAccess } from './diagnose';

/**
 * One poll cycle.
 *
 * The order of the checks is the safety argument, so it is worth reading as an
 * order rather than as a list. Cheapest and most absolute first: is the kill
 * switch on, is the window over. Then the questions that decide whether the
 * watcher may act at all this cycle: can it identify its own outbound mail, can
 * it count its own past replies. Only then per-message work, and inside that,
 * guards before classification before diagnosis before the claim gate before
 * the wire — each stage able to stop the one after it.
 *
 * Two behaviours worth calling out because they look like over-caution and are
 * not:
 *
 *   ESCALATE-ONLY. If the send ledger is missing or corrupt, or the watcher's
 *   own log cannot be replayed, the cycle still runs and still notifies Ali
 *   about every message. It just does not send anything itself. Degrading to
 *   silence would be worse than degrading to a human, and degrading to sending
 *   anyway is how it answers its own email.
 *
 *   THE HALT IS RE-CHECKED IMMEDIATELY BEFORE EVERY SEND. A cycle can take
 *   minutes across 25 messages. Checking only at the top means a kill lands one
 *   cycle later, and "one cycle later" is however many replies were in flight.
 *
 *   A DRY RUN TOUCHES NOTHING. Not "sends no student reply" — touches nothing.
 *   The dry-run check used to sit AFTER diagnose(), and the login_link
 *   diagnosis applies its repair: it rotates the student's portal token and
 *   mails them a real magic link, then re-reads the row to verify. So a
 *   rehearsal mutated live accounts and sent real mail. The check now sits
 *   immediately after classification, before anything can read a student's row
 *   with intent to change it, and `inertPorts` below is the backstop that makes
 *   a future regression fail loudly instead of quietly mailing somebody.
 */

export interface InboundMessage {
  providerMessageId: string;
  messageIdHeader: string | null;
  threadId: string | null;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  bodyText: string | null;
  headers: Record<string, unknown> | null;
  receivedAt: string;
}

export interface EscalationInput {
  reason: string;
  detail: string;
  fromAddress: string;
  subject: string;
  threadKey: string;
  messageIdHeader: string | null;
}

export interface WatcherPorts {
  fetchRecentInbound(): Promise<InboundMessage[]>;
  fetchThreadMessages(threadId: string | null, fallback: InboundMessage): Promise<InboundMessage[]>;
  sendReply(input: {
    to: string;
    subject: string;
    body: string;
    threadId: string | null;
    inReplyTo: string | null;
  }): Promise<{ providerMessageId: string; messageIdHeader: string | null }>;
  escalate(input: EscalationInput): Promise<void>;
  data: WatcherDataAccess;
}

export interface CycleOptions {
  stateDir: string;
  runId: string;
  dryRun: boolean;
  caps: CapLimits;
  now?: Date;
}

export interface CycleOutcome {
  status: 'ran' | 'halted' | 'expired';
  reason?: string;
  seen: number;
  skipped: number;
  escalated: number;
  sent: number;
  suppressed: number;
  escalateOnly: boolean;
}

function toThreadMessage(m: InboundMessage): ThreadMessage {
  return { messageIdHeader: m.messageIdHeader, headers: m.headers, fromAddress: m.fromAddress };
}

export class DryRunMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DryRunMutationError';
  }
}

/**
 * The backstop for dry-run inertness.
 *
 * The ordering fix below (classify, then stop) is what makes a dry run inert
 * today. This makes it STAY inert: every port that leaves the process is
 * replaced with one that throws, so if a future edit moves work above the
 * dry-run check the rehearsal fails loudly instead of quietly rotating a real
 * student's token and mailing them.
 *
 * Deliberately a hard throw and not a no-op. A silent no-op would let the
 * regression live indefinitely, which is the class of bug this whole file is
 * arguing against.
 */
export function inertPorts(ports: WatcherPorts): WatcherPorts {
  const refuse = (what: string) => (): never => {
    throw new DryRunMutationError(
      `A dry run attempted to ${what}. A dry run must not mutate a student's account or put ` +
      'anything on the wire. This is a defect in the cycle ordering, not in the caller.',
    );
  };
  return {
    fetchRecentInbound: ports.fetchRecentInbound.bind(ports),
    fetchThreadMessages: ports.fetchThreadMessages.bind(ports),
    sendReply: refuse('send a reply to a student'),
    escalate: refuse('send an escalation email'),
    data: {
      loadStudentFacts: ports.data.loadStudentFacts.bind(ports.data),
      requestFreshLoginLink: refuse("rotate a student's login token and mail them a magic link"),
    },
  };
}

export async function runCycle(rawPorts: WatcherPorts, opts: CycleOptions): Promise<CycleOutcome> {
  const now = opts.now ?? new Date();
  // A dry run cannot reach the wire even if the ordering below is later broken.
  const ports = opts.dryRun ? inertPorts(rawPorts) : rawPorts;
  const base: CycleOutcome = {
    status: 'ran', seen: 0, skipped: 0, escalated: 0, sent: 0, suppressed: 0, escalateOnly: false,
  };

  const halt = checkHalt(opts.stateDir);
  if (halt.halted) {
    return { ...base, status: 'halted', reason: halt.reason };
  }

  const window = checkWindow(opts.stateDir, now);
  if (!window.active) {
    const log = WatcherLog.open(opts.stateDir);
    try {
      log.append({
        ts: now.toISOString(), type: 'window_expired', run_id: opts.runId,
        reason: window.reason,
        detail: `Watch window is over. Nothing further will be sent. Kill: ${killCommand(opts.stateDir)}`,
      });
    } finally {
      log.close();
    }
    return { ...base, status: 'expired', reason: window.reason };
  }

  const log = WatcherLog.open(opts.stateDir);
  try {
    // Can we tell our own mail apart from a student's? If not, answer nothing.
    const ledger = loadOutboundLedger(opts.stateDir);
    // Threads escalated during THIS cycle. The replayed log covers previous
    // cycles; this covers two messages on one thread inside a single pass,
    // which the log cannot yet know about.
    const escalatedThisCycle = new Set<string>();
    let escalateOnly = !ledger.available;
    let escalateOnlyReason = ledger.available ? '' : `send_ledger_${ledger.unavailableReason}`;

    // Can we count what we have already sent? An uncountable ceiling is a
    // reached ceiling, never an empty one.
    let replay;
    try {
      replay = replayWatcherLog(opts.stateDir);
    } catch (err) {
      if (!(err instanceof WatcherLogUnreadableError)) throw err;
      // escalatedThreads EMPTY here is safe only because escalateOnly is set
      // below and the roster check already refuses everything when the ledger is
      // unavailable. It must still be present: omitting it made the dedup guard
      // read `undefined.has(...)` on the one path where the log is unreadable.
      replay = {
        sentReplies: [], ownReplyIds: new Set<string>(), answeredThreads: new Set<string>(),
        escalatedThreads: new Set<string>(), eventCount: 0,
      };
      escalateOnly = true;
      escalateOnlyReason = 'watcher_log_unreadable';
      log.append({
        ts: now.toISOString(), type: 'preflight_failed', run_id: opts.runId,
        reason: 'watcher_log_unreadable', detail: err.message,
      });
    }

    const messages = await ports.fetchRecentInbound();
    log.append({
      ts: now.toISOString(), type: 'cycle_start', run_id: opts.runId, dry_run: opts.dryRun,
      detail: `inbound=${messages.length} ledger_sends=${ledger.sentCount} prior_replies=${replay.sentReplies.length}` +
        (escalateOnly ? ` ESCALATE_ONLY(${escalateOnlyReason})` : ''),
    });

    const out = { ...base, escalateOnly };

    for (const msg of messages) {
      out.seen++;
      const threadKey = threadKeyFor(msg.threadId, msg.providerMessageId);
      const common = {
        run_id: opts.runId,
        provider_message_id: msg.providerMessageId,
        message_id: msg.messageIdHeader ?? undefined,
        thread_key: threadKey,
        from_address: msg.fromAddress,
        subject: msg.subject,
      };

      const threadMessages = (await ports.fetchThreadMessages(msg.threadId, msg)).map(toThreadMessage);
      const guard = watcherSkipReason({
        candidate: toThreadMessage(msg),
        threadMessages,
        ledger,
        ownReplyIds: replay.ownReplyIds,
      });

      if (guard.seamDisagreement) {
        // The header and the ledger disagree about the same message. One of the
        // two identifications is not working, so stop trusting either for the
        // rest of this cycle.
        escalateOnly = true;
        log.append({
          ts: new Date().toISOString(), type: 'preflight_failed', ...common,
          reason: 'outbound_identification_seam', detail: guard.detail, seam_disagreement: true,
        });
      }

      if (guard.skip) {
        out.skipped++;
        log.append({
          ts: new Date().toISOString(), type: 'skipped', ...common,
          reason: guard.skip, detail: guard.detail,
        });
        continue;
      }

      // NOT ON THE CAMPAIGN ROSTER — ignore it entirely, do not escalate it.
      //
      // This is the difference between a watcher and a mail forwarder. On its
      // first live run it considered every message in the mailbox, so what it
      // escalated was Basecamp standup notifications: 24 of them before it was
      // halted. Only the 25 people the send harness actually mailed are
      // candidates, and the roster is read off the ledger so it cannot drift
      // from who really received it.
      // `null` means there is no roster to check against, which is NOT the same
      // as "not on it" — see isCampaignRecipient. With no roster the message
      // still reaches a human; the per-thread record is what stops that
      // repeating on every tick.
      if (isCampaignRecipient(ledger, msg.fromAddress) === false) {
        out.skipped++;
        log.append({
          ts: new Date().toISOString(), type: 'skipped', ...common,
          reason: 'not_campaign_recipient',
          detail: `${msg.fromAddress} is not one of the ${ledger.recipients.size} addresses the ` +
            'campaign was sent to. Ignored, not escalated.',
        });
        continue;
      }

      const classification = classifyInbound({
        fromAddress: msg.fromAddress, subject: msg.subject, bodyText: msg.bodyText,
      });
      log.append({
        ts: new Date().toISOString(), type: 'inbound_classified', ...common,
        issue_class: classification.action === 'auto_reply' ? classification.issueClass : 'escalate',
        reason: classification.action === 'escalate' ? classification.reason : undefined,
      });

      const escalateWith = async (reason: string, detail: string) => {
        // ONE ESCALATION PER THREAD, EVER.
        //
        // Replayed from the log, so this holds across cycles AND across a
        // restart. Without it the watcher re-escalated the same message on
        // every tick: one thread went out 7 times, and a second cycle escalated
        // 17 having already escalated 7.
        if (replay.escalatedThreads.has(threadKey) || escalatedThisCycle.has(threadKey)) {
          out.skipped++;
          log.append({
            ts: new Date().toISOString(), type: 'skipped', ...common,
            reason: 'thread_already_escalated',
            detail: `${threadKey} has already been escalated. Escalating it again would repeat ` +
              'on every tick for the rest of the window.',
          });
          return;
        }

        // A dry run tells nobody. It records what it would have told them.
        if (opts.dryRun) {
          out.suppressed++;
          log.append({
            ts: new Date().toISOString(), type: 'escalation_suppressed', ...common,
            reason, detail, dry_run: true,
          });
          return;
        }
        // Recorded BEFORE the send, so a crash between the two under-escalates
        // rather than repeating — the same rule the reply ceilings already use.
        escalatedThisCycle.add(threadKey);
        log.append({
          ts: new Date().toISOString(), type: 'escalation_attempt', ...common, reason, detail,
        });
        out.escalated++;
        try {
          await ports.escalate({
            reason, detail, fromAddress: msg.fromAddress, subject: msg.subject,
            threadKey, messageIdHeader: msg.messageIdHeader,
          });
        } catch (err: any) {
          // An escalation that did not arrive is the one failure that must never
          // be absorbed: absorbing it produces a run that logs "escalated" for
          // 30 hours while nobody is told anything. Recorded, then re-thrown so
          // the process dies non-zero rather than continuing to look healthy.
          log.append({
            ts: new Date().toISOString(), type: 'escalation_failed', ...common,
            reason, detail,
            error_class: err?.name || 'EscalationError',
            error: String(err?.message ?? err),
          });
          throw err;
        }
        log.append({ ts: new Date().toISOString(), type: 'escalated', ...common, reason, detail });
      };

      if (classification.action === 'escalate') {
        await escalateWith(classification.reason, classification.detail);
        continue;
      }

      if (escalateOnly) {
        await escalateWith(
          escalateOnlyReason || 'escalate_only',
          'The watcher cannot currently identify its own outbound mail or count its own replies, ' +
          'so it is not sending anything. This message needs a human.',
        );
        continue;
      }

      // ── THE DRY-RUN STOP ────────────────────────────────────────────────
      // Above this line: reads and classification. Below it: diagnose(), which
      // for login_link ROTATES THE STUDENT'S TOKEN AND MAILS THEM before it
      // verifies. That is why the check lives here and not after the claim
      // gate, where it used to be. Nothing below this line may run in a
      // rehearsal, and inertPorts() enforces that if this ordering is broken.
      if (opts.dryRun) {
        out.suppressed++;
        log.append({
          ts: new Date().toISOString(), type: 'reply_suppressed', ...common,
          reason: 'dry_run', dry_run: true,
          issue_class: classification.issueClass,
          detail:
            'Dry run. This message classified as a handleable issue and would have been ' +
            'diagnosed and answered. Nothing was read with intent to change it, no token was ' +
            'rotated, and no mail was sent.',
        });
        continue;
      }

      const cap = checkCaps(replay.sentReplies, { threadKey, recipient: msg.fromAddress }, opts.caps);
      if (cap.blocked) {
        out.escalated++;
        await ports.escalate({
          reason: `cap_${cap.cap}`,
          detail: `Reply ceiling ${cap.cap} reached (${cap.observed}/${cap.limit}). Escalating instead of replying.`,
          fromAddress: msg.fromAddress, subject: msg.subject, threadKey,
          messageIdHeader: msg.messageIdHeader,
        });
        log.append({
          ts: new Date().toISOString(), type: 'escalated', ...common,
          reason: `cap_${cap.cap}`, cap: cap.cap, observed: cap.observed, limit: cap.limit,
        });
        continue;
      }

      // `now`, not `new Date()`. Line 143 already resolved the cycle's clock from
      // opts.now; passing a fresh wall-clock read here threw it away at the one
      // call that uses it to decide whether a repair landed. See diagnose.ts.
      const result = await diagnose(classification.issueClass, msg.fromAddress, ports.data, now);
      if (result.outcome === 'escalate') {
        await escalateWith(`diagnosis_${classification.issueClass}`, result.detail);
        continue;
      }

      const verdict = verifyClaims(result.bundle, result.body);
      if (!verdict.ok) {
        out.suppressed++;
        log.append({
          ts: new Date().toISOString(), type: 'reply_suppressed', ...common,
          reason: verdict.rejection, detail: verdict.detail,
          claims: result.bundle.claims.map((c) => c.text),
          evidence: result.bundle.evidence,
        });
        await escalateWith(
          `unverified_claim_${verdict.rejection}`,
          `A reply was composed and refused before sending: ${verdict.detail}`,
        );
        continue;
      }

      // Last look at the kill switch, with the message composed and gated.
      const lateHalt = checkHalt(opts.stateDir);
      if (lateHalt.halted) {
        log.append({
          ts: new Date().toISOString(), type: 'halted', ...common,
          reason: lateHalt.reason, detail: 'Halted between composing and sending. Nothing was sent.',
        });
        return { ...out, status: 'halted', reason: lateHalt.reason };
      }

      const replySubject = msg.subject.toLowerCase().startsWith('re:') ? msg.subject : `Re: ${msg.subject}`;

      // Written and fsync'd BEFORE the wire. A crash between here and the
      // outcome counts against the ceilings, which under-sends. The other
      // order over-sends, and a student getting two copies is the failure we
      // are actually guarding.
      log.append({
        ts: new Date().toISOString(), type: 'reply_attempt', ...common,
        issue_class: classification.issueClass,
        claims: result.bundle.claims.map((c) => c.text),
        evidence: result.bundle.evidence,
      });
      replay.sentReplies.push({ threadKey, recipient: msg.fromAddress });

      try {
        const sent = await ports.sendReply({
          to: msg.fromAddress, subject: replySubject, body: result.body,
          threadId: msg.threadId, inReplyTo: msg.messageIdHeader,
        });
        out.sent++;
        if (sent.messageIdHeader) {
          const { normalizeMessageId } = await import('./outboundIdentity');
          const id = normalizeMessageId(sent.messageIdHeader);
          if (id) replay.ownReplyIds.add(id);
        }
        log.append({
          ts: new Date().toISOString(), type: 'reply_sent', ...common,
          issue_class: classification.issueClass,
          claims: result.bundle.claims.map((c) => c.text),
          evidence: result.bundle.evidence,
          reply_message_id: sent.messageIdHeader ?? undefined,
          reply_provider_message_id: sent.providerMessageId,
        });
      } catch (err: any) {
        log.append({
          ts: new Date().toISOString(), type: 'reply_failed', ...common,
          reason: err?.name || 'SendError', detail: String(err?.message ?? err),
        });
        await escalateWith('send_failed', `The reply was gated and approved but the send failed: ${err?.message ?? err}`);
      }
    }

    return out;
  } finally {
    log.close();
  }
}
