/**
 * Cora Agent Service — auto-reply handler for support@colaberry.com inquiries.
 *
 * Called from inboxStateManager when hardRuleEngine matches rule_id 'cora_0c'.
 * Uses OpenAI (same key as replyDraftService) with the Cora system prompt.
 *
 * Sending is OPT-IN: Cora sends real email only when CORA_DRY_RUN is explicitly
 * set to the string "false". Unset — or set to anything else — keeps it in shadow
 * mode (logs the generated reply, sends nothing). This default-safe behavior is
 * deliberate: an unset or misconfigured flag must never cause live sends. A
 * prior default (send-unless-CORA_DRY_RUN==="true") let a stray deploy re-arm
 * live sending and produced a self-reply storm. See coraAutoReplySkipReason()
 * for the loop guards that stop such a storm even when live.
 */
import OpenAI from 'openai';
import { Op } from 'sequelize';
import { buildCoraSystemPromptFromDB, getCourseBySlug } from '../kbService';
import { logAuditEvent } from './inboxAuditService';
import CoraReplyLog from '../../models/CoraReplyLog';
import InboxAuditLog from '../../models/InboxAuditLog';

const LOG_PREFIX = '[InboxCOS][Cora]';

/**
 * Resolve the dry-run (shadow) flag. Sending is opt-in: only an explicit
 * CORA_DRY_RUN="false" enables live sends; unset or any other value ⇒ dry run.
 * Pure so the safety default (an unset flag must be shadow) is unit-tested.
 */
export function resolveDryRun(flag: string | undefined): boolean {
  return flag !== 'false';
}

// Read per-call rather than cached at module load — makes CORA_DRY_RUN
// flips take effect without a process restart, and lets tests toggle it
// per-scenario without needing jest.resetModules(). Polarity comes from
// resolveDryRun() so this stays the safe default (unset/anything-but-"false"
// ⇒ dry run) rather than the pre-2026-07-17 version, which defaulted to LIVE
// unless explicitly "true" — the exact default that let a stray deploy re-arm
// live sending and produce the original self-reply storm.
function isDryRun(): boolean {
  return resolveDryRun(process.env.CORA_DRY_RUN);
}

if (!isDryRun()) {
  console.warn(
    `${LOG_PREFIX} LIVE SEND ENABLED (CORA_DRY_RUN="false") — Cora will send real email as the support mailbox.`
  );
}

/**
 * Addresses Cora sends AS, or that belong to the mailbox it reads. Replying to
 * mail from any of these creates a self-reply loop, so they are always skipped.
 * support@ is the From: identity; the mailbox actually authenticates as
 * ali@colaberry.com (support@ is not a verified send-as alias), so both must be
 * guarded. Overridable via env for other deployments.
 */
const SELF_ADDRESSES = [
  process.env.CORA_SUPPORT_ADDRESS || 'support@colaberry.com',
  process.env.CORA_MAILBOX_ADDRESS || process.env.GMAIL_SENDER_EMAIL || 'ali@colaberry.com',
].map((a) => a.trim().toLowerCase());

/** Normalize `Name <local+tag@domain>` to `local@domain`, lowercased. */
export function normalizeEmailAddress(raw: string): string {
  const angle = /<([^>]+)>/.exec(raw);
  const email = (angle ? angle[1] : raw).trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 0) return email;
  const local = email.slice(0, at).split('+')[0];
  return `${local}@${email.slice(at + 1)}`;
}

/**
 * Loop-prevention guard. Returns a short skip reason when Cora must NOT
 * auto-reply to an email, or null when it is safe to proceed. Pure + deterministic
 * so every branch is unit-tested. This is the fix for the self-reply-storm class
 * of incident, where Cora replies to its own replies and to bounce notices.
 */
export function coraAutoReplySkipReason(email: {
  from_address: string | null | undefined;
  headers?: Record<string, unknown> | null;
}): string | null {
  const from = normalizeEmailAddress(email.from_address || '');
  if (from.indexOf('@') < 0) return 'no_sender';

  // 1. Our own send identity / mailbox — replying would loop.
  if (SELF_ADDRESSES.includes(from)) return 'self_address';

  // 2. Automated / bounce / no-reply senders.
  const localPart = from.slice(0, from.indexOf('@'));
  if (
    /^(mailer-daemon|postmaster|bounce|bounces)$/.test(localPart) ||
    /(^|[.\-_])(no-?reply|do-?not-?reply|donotreply)([.\-_]|$)/.test(localPart) ||
    from.includes('mailer-daemon@')
  ) {
    return 'automated_sender';
  }

  // 3. Auto-generated mail per RFC 3834 and common auto-responder headers.
  const headers = email.headers || {};
  const header = (name: string): string => {
    const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name);
    return (hit?.[1] ?? '').toString().toLowerCase();
  };
  const autoSubmitted = header('auto-submitted');
  if (autoSubmitted && autoSubmitted !== 'no') return 'auto_submitted';
  if (/(^|[ ;,])(bulk|auto_reply|junk|list)([ ;,]|$)/.test(header('precedence'))) return 'bulk_precedence';
  if (header('x-autoreply') || header('x-autorespond') || header('x-auto-response-suppress')) {
    return 'x_autoreply';
  }

  return null;
}

// Circuit breaker (2026-07-14 mail-loop incident, BC #10095332194): if this
// many real sends have happened in the trailing window, stop sending and
// route everything to a human instead — a handful of duplicate replies is an
// acceptable failure mode, 1,800 is not. Configurable so a real traffic spike
// doesn't need a code change to raise the ceiling.
const CIRCUIT_BREAKER_MAX_SENDS = parseInt(process.env.CORA_CIRCUIT_BREAKER_MAX_SENDS || '20', 10);
const CIRCUIT_BREAKER_WINDOW_MS = parseInt(process.env.CORA_CIRCUIT_BREAKER_WINDOW_MINUTES || '10', 10) * 60_000;

async function isCircuitBreakerTripped(): Promise<boolean> {
  const since = new Date(Date.now() - CIRCUIT_BREAKER_WINDOW_MS);
  const recentSends = await InboxAuditLog.count({
    where: { action: 'cora_reply_sent', created_at: { [Op.gte]: since } },
  });
  return recentSends >= CIRCUIT_BREAKER_MAX_SENDS;
}

// KB Ops Phase 1 (BC #10036783688): Cora's system prompt is now DB-backed via
// cora_kb_entries/cora_cohorts, not the static coraKnowledgeBase.ts. This slug
// must match the seeded course in backend/src/seeds/seedKbData.ts.
const CORA_COURSE_SLUG = process.env.CORA_ACTIVE_COURSE_SLUG || 'ai-architect';

export interface CoraReply {
  subject: string;
  body: string;
  /**
   * True when Cora's reply is a handoff/acknowledgement that still needs a human
   * to follow up — out-of-scope bootcamp/billing/course-support mail, refunds,
   * complaints, partnerships, or anything Cora cannot confidently resolve. Drives
   * whether the email is archived or routed back to the human INBOX.
   */
  needsHuman: boolean;
}

/** Disposition of an email Cora handled — tells the dispatcher whether to archive. */
export interface CoraDispatchResult {
  /** True => fully resolved, safe to archive. False => leave in INBOX for a human. */
  archive: boolean;
  /** Why it was kept for a human (audit + reclassify reasoning); set when archive=false. */
  handoffReason?: string;
}

/**
 * Parse Cora's raw OpenAI JSON into a typed reply. Pure + deterministic so the
 * parsing rules — including the needs_human handoff flag — are unit-testable
 * without an OpenAI round-trip. Throws when the body is missing (the caller
 * treats that as a generation failure). A missing/invalid needs_human defaults
 * to false (treat as a normal, fully-answered reply).
 */
export function parseCoraReply(content: string, fallbackSubject: string): CoraReply {
  const parsed = JSON.parse(content) as {
    subject?: string;
    body?: string;
    needs_human?: unknown;
  };
  if (!parsed.body) throw new Error('Missing body in Cora OpenAI response');
  return {
    subject: parsed.subject?.trim() || `Re: ${fallbackSubject}`,
    body: parsed.body,
    needsHuman: parsed.needs_human === true || parsed.needs_human === 'true',
  };
}

/**
 * Decide whether an email Cora touched is fully handled (archive) or must be left
 * in the human INBOX. Pure decision table — the core of the out-of-scope routing
 * fix, kept separate from I/O so every branch is unit-tested.
 *
 *   generation failed   -> keep for human (never bury an unanswered email)
 *   dry run              -> archive (no real send; preserves shadow-test behavior)
 *   needs_human handoff  -> keep for human (Cora only acknowledged; a person must act)
 *   send failed          -> keep for human (the sender received no reply)
 *   in-scope reply sent  -> archive (fully resolved)
 */
export function decideCoraDisposition(opts: {
  generated: boolean;
  dryRun: boolean;
  needsHuman: boolean;
  sent: boolean;
}): CoraDispatchResult {
  if (!opts.generated) return { archive: false, handoffReason: 'cora_generation_failed' };
  if (opts.dryRun) return { archive: true };
  if (opts.needsHuman) return { archive: false, handoffReason: 'cora_handoff_human_review' };
  if (!opts.sent) return { archive: false, handoffReason: 'cora_send_failed' };
  return { archive: true };
}

/**
 * Build Cora's system prompt from the KB Ops DB (cora_kb_entries/cora_cohorts),
 * scoped to the currently active program. Degrades to a generic handoff prompt
 * if the configured course isn't found, rather than failing the whole reply.
 */
async function getCoraSystemPrompt(): Promise<string> {
  try {
    const course = await getCourseBySlug(CORA_COURSE_SLUG);
    if (!course) {
      console.warn(`${LOG_PREFIX} No KB course found for slug "${CORA_COURSE_SLUG}"`);
      return (
        'You are Cora, the AI Admissions and Support Assistant for Colaberry School of Data Analytics. ' +
        'No program knowledge base is currently configured — acknowledge receipt and route to support@colaberry.com.'
      );
    }
    return await buildCoraSystemPromptFromDB(course.id);
  } catch (error: any) {
    console.warn(`${LOG_PREFIX} Could not build DB-backed system prompt: ${error.message}`);
    return (
      'You are Cora, the AI Admissions and Support Assistant for Colaberry School of Data Analytics. ' +
      'Acknowledge receipt and route to support@colaberry.com.'
    );
  }
}

// ─── Reply Generation ─────────────────────────────────────────────────────

export async function generateCoraReply(
  emailBody: string,
  subject: string,
  fromName: string | null
): Promise<CoraReply> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // response_format: json_object requires the literal word "json" to appear
  // somewhere in the messages (an OpenAI API constraint) — this also doubles
  // as the explicit schema instruction parseCoraReply() expects.
  const systemPrompt = `${await getCoraSystemPrompt()}\n\nRespond ONLY with a JSON object with exactly these fields: "subject" (string), "body" (string), "needs_human" (boolean).`;

  const senderLine = fromName ? `From: ${fromName}` : '';
  const userMessage = `${senderLine}\nSubject: ${subject}\n\n${emailBody.substring(0, 3000)}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1000,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  return parseCoraReply(content, subject);
}

// ─── Main Dispatch Handler ────────────────────────────────────────────────

export async function handleCoraInquiry(email: {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string;
  body_text: string | null;
  provider: string;
  provider_message_id: string;
  provider_thread_id: string | null;
  headers: any;
}): Promise<CoraDispatchResult> {
  console.log(`${LOG_PREFIX} Handling inquiry: email=${email.id} from=${email.from_address}`);

  // Loop-prevention: never auto-reply to our own mail, to bounces, or to
  // auto-generated mail. Without this, a live Cora replies to its own replies
  // (and to mailer-daemon bounces), producing a self-reply storm. Checked
  // first — cheapest guard, and abstaining here should never consume a
  // dedup-table reservation or count against the circuit breaker.
  const skipReason = coraAutoReplySkipReason(email);
  if (skipReason) {
    console.log(
      `${LOG_PREFIX} Skipping auto-reply: email=${email.id} from=${email.from_address} reason=${skipReason}`
    );
    await logAuditEvent({
      email_id: email.id,
      action: 'cora_reply_skipped',
      new_state: 'AUTOMATION',
      actor: 'cora',
      metadata: { reason: skipReason, from_address: email.from_address },
    });
    // Cora abstains: don't reply, and don't archive — leave it untouched for a human.
    return { archive: false, handoffReason: `cora_skipped_${skipReason}` };
  }

  const threadKey = email.provider_thread_id || email.provider_message_id;

  // Circuit breaker (skipped in dry-run — nothing real would be sent anyway).
  // Checked BEFORE reserving the dedup slot below so a tripped breaker leaves
  // this thread free for a real attempt once volume subsides, rather than
  // permanently marking it "already handled" with no reply ever sent.
  if (!isDryRun() && (await isCircuitBreakerTripped())) {
    const reason = `Circuit breaker tripped (>= ${CIRCUIT_BREAKER_MAX_SENDS} Cora sends in the last ${CIRCUIT_BREAKER_WINDOW_MS / 60_000}min)`;
    console.error(`${LOG_PREFIX} ${reason} — routing ${email.id} to human instead of sending`);
    await logAuditEvent({
      email_id: email.id,
      action: 'cora_circuit_breaker_tripped',
      new_state: 'INBOX',
      actor: 'cora',
      reasoning: reason,
      metadata: { thread_key: threadKey, max_sends: CIRCUIT_BREAKER_MAX_SENDS, window_ms: CIRCUIT_BREAKER_WINDOW_MS },
    });
    return { archive: false, handoffReason: 'cora_circuit_breaker_tripped' };
  }

  // Reserve-then-send dedup (loop guard, BC #10095332194): a second inquiry
  // for a thread Cora has already replied to — however it got here, including
  // her own reply being re-ingested — is skipped rather than answered again.
  const [, reserved] = await CoraReplyLog.findOrCreate({
    where: { thread_key: threadKey },
    defaults: { thread_key: threadKey, email_id: email.id },
  });
  if (!reserved) {
    console.warn(`${LOG_PREFIX} Duplicate thread ${threadKey} for email ${email.id} — already replied, skipping (loop guard)`);
    await logAuditEvent({
      email_id: email.id,
      action: 'cora_reply_skipped_duplicate_thread',
      new_state: 'AUTOMATION',
      actor: 'cora',
      metadata: { thread_key: threadKey },
    });
    return { archive: true };
  }

  let reply: CoraReply;
  try {
    reply = await generateCoraReply(
      email.body_text || '',
      email.subject || '',
      email.from_name
    );
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Generation failed for ${email.id}: ${error.message}`);
    await logAuditEvent({
      email_id: email.id,
      action: 'cora_reply_failed',
      new_state: 'AUTOMATION',
      actor: 'cora',
      metadata: { error_class: 'GenerationError', error: error.message },
    });
    // Generation failed — don't bury the email; leave it for a human.
    return decideCoraDisposition({ generated: false, dryRun: isDryRun(), needsHuman: false, sent: false });
  }

  if (isDryRun()) {
    console.log(
      `${LOG_PREFIX} DRY RUN — would ${reply.needsHuman ? 'send handoff ack + flag for human' : 'send'} ` +
      `to ${email.from_address}:\nSubject: ${reply.subject}\n\n${reply.body}`
    );
    await logAuditEvent({
      email_id: email.id,
      action: 'cora_reply_dry_run',
      new_state: 'AUTOMATION',
      actor: 'cora',
      metadata: {
        reply_to: email.from_address,
        subject: reply.subject,
        body_preview: reply.body.substring(0, 300),
        needs_human: reply.needsHuman,
      },
    });
    return decideCoraDisposition({ generated: true, dryRun: true, needsHuman: reply.needsHuman, sent: false });
  }

  let sent = false;
  try {
    await sendCoraReplyViaGmail(email, reply);
    sent = true;
    console.log(`${LOG_PREFIX} Sent to ${email.from_address} | subject: ${reply.subject}`);
    await logAuditEvent({
      email_id: email.id,
      action: 'cora_reply_sent',
      new_state: 'AUTOMATION',
      actor: 'cora',
      metadata: {
        reply_to: email.from_address,
        subject: reply.subject,
        body_preview: reply.body.substring(0, 300),
        needs_human: reply.needsHuman,
      },
    });
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Send failed for ${email.id}: ${error.message}`);
    await logAuditEvent({
      email_id: email.id,
      action: 'cora_send_failed',
      new_state: 'AUTOMATION',
      actor: 'cora',
      metadata: { error_class: 'SendError', error: error.message },
    });
  }

  return decideCoraDisposition({ generated: true, dryRun: false, needsHuman: reply.needsHuman, sent });
}

// ─── Gmail Send ───────────────────────────────────────────────────────────

export async function sendCoraReplyViaGmail(
  email: {
    from_address: string;
    subject: string;
    provider_message_id: string;
    provider_thread_id: string | null;
    headers: any;
  },
  reply: CoraReply
): Promise<void> {
  const { google } = await import('googleapis');

  // Prefer the Cora-specific creds if provisioned, but fall back to the shared
  // GMAIL_* token that inboxSyncService already uses to read this same mailbox
  // (ali@colaberry.com, gmail.modify scope — send-capable). The GMAIL_COLABERRY_*
  // vars were never set in prod, so the fallback is what actually lets Cora send.
  // Note: support@ is NOT a verified send-as alias on that mailbox (confirmed
  // 2026-06-17), so replies currently go out as ali@colaberry.com until support@
  // is added as a send-as alias.
  const refreshToken = process.env.GMAIL_COLABERRY_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN;
  const accessToken = process.env.GMAIL_COLABERRY_ACCESS_TOKEN || process.env.GMAIL_ACCESS_TOKEN;
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const fromAddress = process.env.CORA_SUPPORT_ADDRESS || 'support@colaberry.com';

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'Gmail credentials not configured for Cora — need GMAIL_COLABERRY_REFRESH_TOKEN (or GMAIL_REFRESH_TOKEN), GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET'
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const headers = email.headers || {};
  const originalMessageId =
    Object.entries(headers).find(([k]) => k.toLowerCase() === 'message-id')?.[1] ||
    email.provider_message_id;

  const rawLines = [
    `From: Cora (Colaberry Enterprise AI) <${fromAddress}>`,
    `To: ${email.from_address}`,
    `Subject: ${reply.subject}`,
    `In-Reply-To: ${originalMessageId}`,
    `References: ${originalMessageId}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    reply.body,
  ];

  const rawMessage = Buffer.from(rawLines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: rawMessage,
      threadId: email.provider_thread_id || undefined,
    },
  });
}
