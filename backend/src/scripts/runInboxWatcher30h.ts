/**
 * The 30-hour student-unblock inbox watcher.
 *
 *   DRY RUN (default, sends nothing, writes only the log):
 *     npx ts-node --transpile-only backend/src/scripts/runInboxWatcher30h.ts \
 *       --run-dir <loop-architect run dir> --once
 *
 *   LIVE (sending is opt-in and requires the literal string "false"):
 *     WATCHER_DRY_RUN=false npx ts-node --transpile-only \
 *       backend/src/scripts/runInboxWatcher30h.ts --run-dir <dir> --once
 *
 *   STOP IT, from anywhere, without reading any code:
 *     touch <run-dir>/WATCHER-HALT
 *
 *   STATUS:
 *     ... --run-dir <dir> --status
 *
 * ── WHY --once AND A CRONTAB, RATHER THAN A 30-HOUR PROCESS ─────────────────
 *
 * Both modes exist, and `--once` on a 5-minute crontab is the recommended one.
 * A single process holding a 30-hour timer is one OOM kill, container bounce or
 * dropped SSH session away from stopping silently, and nothing would notice
 * until Monday. A cron tick that reads its deadline off disk each time survives
 * all of those.
 *
 * This header used to finish that thought with "after the deadline every tick
 * is a no-op that logs and exits 0 — so the leftover crontab line is harmless
 * rather than a liability". That was wrong, and it was wrong in production for
 * a day: the 2026-08-17 window closed at 16:57Z and the entry kept firing 288
 * times a day, each tick appending another `window_expired` line to a log that
 * had reached 15MB. Inert is not the same as free.
 *
 * So expiry now cleans up after itself, in two independent steps:
 *
 *   - the cycle writes the `window_expired` line ONCE (watcherRetirement.ts),
 *     which is the cheap half and always works;
 *   - the runner then removes this watcher's own crontab line (cronRetirement.
 *     ts), which is the half that actually stops the wake-ups and the half that
 *     can fail. It is idempotent, capped at three attempts, backs the crontab
 *     up first, and refuses unless exactly one line carries BOTH the script
 *     name and this run directory. That crontab holds ~40 other jobs and has
 *     been wiped once already by a careless edit.
 *
 * ── LOOKBACK, IF YOU ARE REOPENING A WINDOW ─────────────────────────────────
 *
 * A cycle reads inbound mail with `received_at >= <window start>`. For the
 * original run that was right, because the window opened as the campaign went
 * out. A REOPENED window starts its clock at the restart, so with no lookback
 * the watcher only ever sees mail that arrives after the moment it restarted,
 * and every reply already sitting unanswered is invisible to it. Set
 * WATCHER_LOOKBACK_HOURS to widen the floor. It only ever widens: the window
 * start remains the latest the floor can be.
 *
 * ── WHERE IT HAS TO RUN ─────────────────────────────────────────────────────
 *
 * On the same machine and the same --run-dir as the send harness, because the
 * send ledger it reads is a FILE in that directory. Nothing is mounted from the
 * host into the backend container, so an in-container run cannot see the run
 * directory at all and would drop straight to escalate-only.
 *
 * ── IF THE BATCH RAN WITH `--ledger db` ─────────────────────────────────────
 *
 * Then there is no send-ledger.jsonl, the watcher loses the second of its two
 * ways of recognising its own outbound mail, and it degrades to escalate-only
 * for the whole window. Project the file out of the DB once, before starting:
 *
 *     ... --run-dir <dir> --project-ledger
 *
 * It refuses to overwrite an existing ledger, refuses to write an empty one,
 * and refuses to write a row whose provider_message_id is missing — so a
 * projection either produces a complete ledger or fails and tells you why.
 */

import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import { runCycle, InboundMessage, WatcherPorts, EscalationInput } from '../services/inbox/watcher/watcherRun';
import { openWindow, checkWindow, WATCH_WINDOW_HOURS } from '../services/inbox/watcher/watchWindow';
import {
  resolveWatcherDryRun, resolvePollIntervalMs, checkHalt, killCommand,
  resolveLookbackHours, resolveInboundSince,
} from '../services/inbox/watcher/watcherConfig';
import { retireWatcherCron } from '../services/inbox/watcher/watcherRetirement';
import { systemCronIo } from '../services/inbox/watcher/cronRetirement';
import { resolveCaps } from '../services/inbox/watcher/replyCaps';
import { loadOutboundLedger } from '../services/inbox/watcher/outboundIdentity';
import { StudentFacts, FactGroup, WatcherDataAccess } from '../services/inbox/watcher/diagnose';

const RUN_ID = '20260816-student-unblock-and-watch';
/** Must match sendStudentUnblockBatch.ts — it keys the DB ledger projection. */
const BUSINESS_EVENT_ID = 'story000-unblock-2026-08-17';
const PROVIDER = 'gmail_colaberry';
const ESCALATION_TO = process.env.WATCHER_ESCALATION_TO || 'ali@colaberry.com';
/**
 * Half of what identifies this watcher's own crontab line. The other half is
 * the resolved run directory, supplied at the call site. BOTH must appear in a
 * line before it is removed, so a second watcher on this host, or this same
 * script pointed at a different run, is never swept up.
 */
const CRON_SCRIPT_MARKER = 'runInboxWatcher30h.js';

const argOf = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (flag: string) => process.argv.includes(flag);

function headerOf(headers: any, name: string): string | null {
  if (!headers) return null;
  const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name);
  return hit ? String(hit[1]) : null;
}

// ─── Live data access ──────────────────────────────────────────────────────

/**
 * `activeEnrollmentCount` uses the EXACT where-clause requestMagicLink uses, so
 * "how many seats could a link land on" is answered by the deployed query
 * rather than by a similar-looking one. This is the Million Meshesha lesson:
 * the row shape looked fine, the candidate SET was what was wrong.
 */
async function loadStudentFacts(email: string): Promise<StudentFacts | null> {
  const { default: Enrollment } = await import('../models/Enrollment');
  const unverifiable: FactGroup[] = [];

  const addr = email.toLowerCase().trim();
  let candidates: any[];
  try {
    candidates = await Enrollment.findAll({
      where: { email: addr, status: 'active', portal_enabled: true },
    });
  } catch (err: any) {
    console.error(`[watcher] enrollment read failed for ${addr}: ${err?.message}`);
    return null;
  }
  if (candidates.length === 0) return null;

  const primary = candidates[0];
  const facts: StudentFacts = {
    email: addr,
    name: primary.full_name ?? null,
    activeEnrollmentCount: candidates.length,
    enrollmentId: primary.id ?? null,
    portalTokenExpiresAt: primary.portal_token_expires_at
      ? new Date(primary.portal_token_expires_at).toISOString()
      : null,
    projectId: null,
    githubRepo: null,
    webhookRegistered: false,
    webhookLastDeliveryAt: null,
    story000Present: false,
    acceptanceCriteriaCount: null,
    unverifiable,
  };

  try {
    const { default: GitHubConnection } = await import('../models/GitHubConnection');
    const conn: any = await GitHubConnection.findOne({
      where: { enrollment_id: primary.id },
      order: [['created_at', 'DESC']],
    });
    if (conn) {
      facts.githubRepo = `${conn.repo_owner}/${conn.repo_name}`;
      facts.projectId = conn.project_id ?? null;
      facts.webhookRegistered = Boolean(conn.webhook_secret);
      facts.webhookLastDeliveryAt = conn.last_sync_at
        ? new Date(conn.last_sync_at).toISOString()
        : null;
    }
  } catch (err: any) {
    console.error(`[watcher] github_connections read failed for ${addr}: ${err?.message}`);
    unverifiable.push('github', 'webhook');
  }

  try {
    const { default: StudentTask } = await import('../models/StudentTask');
    if (!facts.projectId) {
      unverifiable.push('plan');
    } else {
      const story: any = await StudentTask.findOne({
        where: { project_id: facts.projectId, story_id: { [Op.iLike]: 'STORY-000%' } },
      });
      facts.story000Present = Boolean(story);
      facts.acceptanceCriteriaCount = Array.isArray(story?.acceptance) ? story.acceptance.length : null;
    }
  } catch (err: any) {
    console.error(`[watcher] student_tasks read failed for ${addr}: ${err?.message}`);
    if (!unverifiable.includes('plan')) unverifiable.push('plan');
  }

  return facts;
}

const dataAccess: WatcherDataAccess = {
  loadStudentFacts,
  async requestFreshLoginLink(email: string): Promise<void> {
    const { requestMagicLink } = await import('../services/participantService');
    // The return value is deliberately generic to prevent email enumeration, so
    // it proves nothing. Verification is the re-read in diagnose(), not this.
    await requestMagicLink(email);
  },
};

// ─── Live ports ────────────────────────────────────────────────────────────

function toInbound(row: any): InboundMessage {
  return {
    providerMessageId: row.provider_message_id,
    messageIdHeader: headerOf(row.headers, 'message-id'),
    threadId: row.provider_thread_id ?? null,
    fromAddress: row.from_address,
    fromName: row.from_name ?? null,
    subject: row.subject ?? '',
    bodyText: row.body_text ?? null,
    headers: row.headers ?? null,
    receivedAt: new Date(row.received_at).toISOString(),
  };
}

function buildPorts(stateDir: string, windowStart: Date): WatcherPorts {
  return {
    async fetchRecentInbound(): Promise<InboundMessage[]> {
      const { default: InboxEmail } = await import('../models/InboxEmail');
      const rows = await InboxEmail.findAll({
        where: { provider: PROVIDER, received_at: { [Op.gte]: windowStart } },
        order: [['received_at', 'ASC']],
        limit: 500,
      });
      return rows.map(toInbound);
    },

    async fetchThreadMessages(threadId, fallback): Promise<InboundMessage[]> {
      if (!threadId) return [fallback];
      const { default: InboxEmail } = await import('../models/InboxEmail');
      const rows = await InboxEmail.findAll({
        where: { provider: PROVIDER, provider_thread_id: threadId },
        order: [['received_at', 'ASC']],
      });
      return rows.length > 0 ? rows.map(toInbound) : [fallback];
    },

    async sendReply({ to, subject, body, threadId, inReplyTo }) {
      const { sendGmail } = await import('../services/gmailService');
      const sent = await sendGmail({
        to, subject, body,
        inReplyTo: inReplyTo ?? undefined,
        threadId: threadId ?? undefined,
      });
      // Read the RFC822 Message-ID back, so a re-ingested copy of this very
      // reply is recognised as ours. sendGmail returns Gmail's internal id,
      // which is not what lands in the Message-ID header.
      let messageIdHeader: string | null = null;
      try {
        const { getColaberryGmailClient } = await import('../services/inbox/inboxSyncService');
        const gmail = getColaberryGmailClient();
        if (gmail) {
          const meta = await gmail.users.messages.get({
            userId: 'me', id: sent.messageId, format: 'metadata', metadataHeaders: ['Message-ID'],
          });
          messageIdHeader =
            meta.data.payload?.headers?.find((h) => (h.name || '').toLowerCase() === 'message-id')?.value ?? null;
        }
      } catch (err: any) {
        console.warn(`[watcher] could not read back Message-ID for ${sent.messageId}: ${err?.message}`);
      }
      return { providerMessageId: sent.messageId, messageIdHeader };
    },

    async escalate(input: EscalationInput): Promise<void> {
      const lines = [
        'The student-unblock inbox watcher stopped rather than answering this one.',
        '',
        `Reason:  ${input.reason}`,
        `Detail:  ${input.detail}`,
        '',
        `From:    ${input.fromAddress}`,
        `Subject: ${input.subject}`,
        `Thread:  ${input.threadKey}`,
        '',
        `Full log: ${path.join(stateDir, 'watcher-log.jsonl')}`,
        `Stop the watcher: ${killCommand(stateDir)}`,
      ].join('\n');

      // `sendRawEmail` RETURNS { ok: false } when SMTP is missing, the kill
      // switch is on, or the dev guard fires — it does not throw. This used to
      // be awaited and discarded inside a try/catch, so all three produced a
      // watcher that logged "escalated" and told nobody. deliverEscalation
      // reads the result and throws, and the throw is deliberately NOT caught
      // here: a watcher that cannot reach a human must stop, not keep polling.
      const { sendRawEmail } = await import('../services/emailService');
      const { deliverEscalation } = await import('../services/inbox/watcher/escalationSender');
      await deliverEscalation(sendRawEmail, {
        to: [ESCALATION_TO],
        subject: `[Watcher escalation] ${input.reason} from ${input.fromAddress}`,
        text: lines,
        html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${lines
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
      });
      try {
        const { emitAlert } = await import('../services/alertService');
        await emitAlert({
          type: 'warning', severity: 4,
          title: `Watcher escalation: ${input.reason}`,
          description: input.detail,
          sourceType: 'system', impactArea: 'student_support', urgency: 'immediate',
          metadata: { from: input.fromAddress, thread: input.threadKey },
        });
      } catch { /* alerting is best-effort; the email above is the contract */ }
    },

    data: dataAccess,
  };
}

// ─── Entry point ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const runDir = argOf('--run-dir');
  if (!runDir || !fs.existsSync(runDir)) {
    console.error('--run-dir <loop-architect run directory> is required and must exist.');
    console.error('It must be the SAME directory the send harness used: the send ledger lives there.');
    process.exit(2);
  }
  const stateDir = path.resolve(runDir);
  const dryRun = resolveWatcherDryRun();
  const caps = resolveCaps();
  const pollMs = resolvePollIntervalMs();
  const lookbackHours = resolveLookbackHours();

  if (hasFlag('--status')) {
    const now = new Date();
    const w = checkWindow(stateDir, now);
    const ledger = loadOutboundLedger(stateDir);
    const { readRetirement } = await import('../services/inbox/watcher/watcherRetirement');
    console.log(JSON.stringify({
      run_id: RUN_ID, state_dir: stateDir, dry_run: dryRun, caps,
      poll_interval_seconds: pollMs / 1000,
      lookback_hours: lookbackHours,
      window: w.active ? { active: true, remaining_hours: +(w.remainingMs / 3_600_000).toFixed(2) } : w,
      inbound_since: w.state
        ? resolveInboundSince(new Date(w.state.started_at), now, lookbackHours).toISOString()
        : null,
      send_ledger: {
        available: ledger.available, reason: ledger.unavailableReason,
        sends: ledger.sentCount, roster: ledger.recipients.size,
      },
      retirement: readRetirement(stateDir),
      halt: checkHalt(stateDir),
      kill_command: killCommand(stateDir),
    }, null, 2));
    return;
  }

  // Project the send ledger out of the DB before anything else looks at it.
  // Without this, a run of the batch with `--ledger db` leaves no JSONL, the
  // watcher loses its second self-copy discriminator, and it spends the whole
  // window in escalate-only.
  if (hasFlag('--project-ledger')) {
    const { projectSendLedger } = await import('../services/inbox/watcher/projectSendLedger');
    const { sequelize } = await import('../config/database');
    const eventId = argOf('--business-event') || BUSINESS_EVENT_ID;
    try {
      const result = await projectSendLedger(stateDir, eventId, async (id) => {
        const [rows]: any = await sequelize.query(
          `SELECT idempotency_key, recipient, subject, business_event_id,
                  provider_message_id, sent_at
             FROM email_send_ledger
            WHERE business_event_id = $id AND status = 'sent'
            ORDER BY sent_at ASC`,
          { bind: { id } },
        );
        return rows ?? [];
      });
      console.log(`[watcher] projected ${result.written} sends from the DB ledger to ${result.path}`);
    } catch (err: any) {
      console.error(`[watcher] LEDGER PROJECTION FAILED: ${err?.message ?? err}`);
      process.exit(4);
    }
  }

  // Bring an EXISTING ledger up to date with the DB.
  //
  // --project-ledger refuses on an existing file, correctly — it can be the
  // only record of who has been emailed. But the campaign kept going: more mail
  // went out to the same students under new business event ids, recorded in
  // Postgres and absent from the JSONL. That drift disables the watcher twice.
  // Our own BCC copies of those sends carry the outbound header but no matching
  // ledger id, which trips `outbound_identification_seam` and pins the cycle to
  // escalate-only; and the roster is read off the ledger, so a student it does
  // not list is skipped as `not_campaign_recipient` — ignored, not escalated.
  // This appends only what is missing and never rewrites a byte.
  if (hasFlag('--reconcile-ledger')) {
    const { reconcileSendLedger } = await import('../services/inbox/watcher/projectSendLedger');
    const { sequelize } = await import('../config/database');
    const since = argOf('--reconcile-since');
    try {
      const result = await reconcileSendLedger(stateDir, async () => {
        const [rows]: any = await sequelize.query(
          `SELECT idempotency_key, recipient, subject, business_event_id,
                  provider_message_id, sent_at
             FROM email_send_ledger
            WHERE status = 'sent'
              AND ($since::timestamptz IS NULL OR sent_at >= $since::timestamptz)
            ORDER BY sent_at ASC`,
          { bind: { since: since ?? null } },
        );
        return rows ?? [];
      });
      console.log(
        `[watcher] ledger reconcile: appended ${result.appended}, already present ` +
        `${result.alreadyPresent} -> ${result.path}`,
      );
      for (const key of result.appendedKeys) console.log(`[watcher]   + ${key}`);
    } catch (err: any) {
      console.error(`[watcher] LEDGER RECONCILE FAILED: ${err?.message ?? err}`);
      process.exit(5);
    }
  }

  // Preflight. Every one of these fails LOUDLY rather than letting the watcher
  // poll an empty result set forever and report "all clear".
  const problems: string[] = [];
  if (!process.env.DATABASE_URL && !process.env.PGHOST && !process.env.POSTGRES_URL) {
    problems.push('No DATABASE_URL/PGHOST: the watcher reads inbound mail out of inbox_emails.');
  }
  if (!dryRun) {
    for (const v of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']) {
      if (!process.env[v]) problems.push(`${v} is not set: live mode cannot send a reply.`);
    }
    // Escalation is the watcher's fallback for everything it will not handle
    // itself, so a live run with no way to send one has no safe mode to fall
    // back to. Checked here, before the window opens, rather than discovered on
    // the first message that needs a human.
    // Mirrors emailService's own transporter condition exactly: Mandrill key,
    // or SMTP user AND pass. A similar-looking check would pass here and still
    // leave `transporter` null at the point it matters.
    const canSendRaw = Boolean(
      process.env.MANDRILL_API_KEY || (process.env.SMTP_USER && process.env.SMTP_PASS),
    );
    if (!canSendRaw) {
      problems.push(
        'No MANDRILL_API_KEY and no SMTP_USER/SMTP_PASS pair: emailService builds no transport, ' +
        'so sendRawEmail returns ok:false and every escalation would reach nobody.',
      );
    }
  }
  if (problems.length > 0) {
    console.error('[watcher] PREFLIGHT FAILED. Refusing to start:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Starting anyway would poll, classify nothing, and look healthy while doing nothing.');
    process.exit(3);
  }

  const window = openWindow(stateDir, { now: new Date(), runId: RUN_ID });
  console.log(
    `[watcher] run=${RUN_ID} dry_run=${dryRun} started=${window.started_at} expires=${window.expires_at} ` +
    `(${window.duration_hours}h, default ${WATCH_WINDOW_HOURS}h) poll=${pollMs / 1000}s ` +
    `lookback=${lookbackHours}h caps=${JSON.stringify(caps)}`,
  );
  console.log(`[watcher] STOP IT WITH:  ${killCommand(stateDir)}`);
  if (!dryRun) console.warn('[watcher] LIVE SEND ENABLED (WATCHER_DRY_RUN="false") — real replies will go out.');

  const once = hasFlag('--once');
  for (;;) {
    const cycleNow = new Date();
    // The floor for "recent" inbound. With no lookback this is the window
    // start, exactly as before. A reopened window needs one: its clock starts
    // at the restart, so without a lookback the watcher would only ever see
    // mail that arrives after the moment it was restarted.
    const since = resolveInboundSince(new Date(window.started_at), cycleNow, lookbackHours);
    const outcome = await runCycle(buildPorts(stateDir, since), {
      stateDir, runId: RUN_ID, dryRun, caps,
    });
    console.log(`[watcher] ${JSON.stringify(outcome)}`);
    if (outcome.status !== 'ran') {
      console.log(`[watcher] stopping: ${outcome.status} (${outcome.reason ?? 'no reason given'})`);
      // ── CLEAN UP AFTER ITSELF ────────────────────────────────────────────
      // An elapsed window used to leave the crontab entry in place, on the
      // reasoning that a post-deadline tick is a harmless no-op. It is inert,
      // but it is not free: 288 wake-ups a day, each appending to a 15MB log.
      // The cycle above has already stopped writing that line; this stops the
      // wake-ups. Idempotent, capped at three attempts, and it refuses outright
      // unless exactly one crontab line carries BOTH markers — the crontab is
      // shared with ~40 other jobs and has been wiped by a careless edit before.
      if (outcome.status === 'expired' && outcome.reason === 'window_elapsed') {
        const record = retireWatcherCron(stateDir, {
          io: systemCronIo(),
          markers: [CRON_SCRIPT_MARKER, stateDir],
          now: cycleNow,
          runId: RUN_ID,
          windowExpiresAt: window.expires_at,
        });
        console.log(`[watcher] cron retirement: ${record.cron_status} — ${record.cron_detail}`);
      }
      return;
    }
    if (once) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[watcher] fatal: ${err?.stack || err}`);
    process.exit(1);
  });
