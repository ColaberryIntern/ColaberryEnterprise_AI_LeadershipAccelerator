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
import { findCoraReplyViolations } from '../coraPromptRules';
import { logAuditEvent } from './inboxAuditService';
import { emitAlert } from '../alertService';
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

const DRY_RUN = resolveDryRun(process.env.CORA_DRY_RUN);

if (!DRY_RUN) {
  console.warn(
    `${LOG_PREFIX} LIVE SEND ENABLED (CORA_DRY_RUN="false") — Cora will send real email as the support mailbox.`
  );
}

// Circuit breaker (2026-07-14 mail-loop incident, BC #10095332194): defense-in-depth
// alongside coraAutoReplySkipReason() below — the skip-reason guards stop the KNOWN
// loop shapes (self-address, bounces, auto-responders); this stops runaway volume
// from any OTHER cause (a traffic spike, a guard gap not yet discovered) by capping
// real sends per window and routing the rest to a human instead. Configurable so a
// real traffic spike doesn't need a code change to raise the ceiling.
const CIRCUIT_BREAKER_MAX_SENDS = parseInt(process.env.CORA_CIRCUIT_BREAKER_MAX_SENDS || '20', 10);
const CIRCUIT_BREAKER_WINDOW_MS = parseInt(process.env.CORA_CIRCUIT_BREAKER_WINDOW_MINUTES || '10', 10) * 60_000;

async function isCircuitBreakerTripped(): Promise<boolean> {
  const since = new Date(Date.now() - CIRCUIT_BREAKER_WINDOW_MS);
  const recentSends = await InboxAuditLog.count({
    where: { action: 'cora_reply_sent', created_at: { [Op.gte]: since } },
  });
  return recentSends >= CIRCUIT_BREAKER_MAX_SENDS;
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

/**
 * True when the mail reached us through one of OUR OWN distribution groups
 * (support@colaberry.com is a Google Group fanning out to the support agents),
 * rather than from a third-party mailing list we happen to be subscribed to.
 *
 * Why this exists (measured in production 2026-11-15): Google Groups stamp
 * `Precedence: list` on every message they fan out, and the RFC 3834 guard below
 * treated that as "bulk mail, never auto-reply". So the group that DELIVERS Cora
 * her mail was the exact thing that made her refuse to answer it: 132 of her last
 * 152 skips over 60 days (87%), and 42 of 44 over 30 days, nearly all of them a
 * real person writing in ("Tuition fee", "Deployment", "Getting all the software
 * downloaded", "Unable to Access Power BI Desktop Class Video").
 *
 * This guard is one of TWO locks. The other is `CORA_DRY_RUN`, which production
 * has set to "true" since the 2026-07-14 mail loop — so lifting this guard alone
 * makes Cora draft replies into the audit log and still send nothing. Arming live
 * sending is a separate, deliberate flag change.
 *
 * Replying is safe here precisely because Cora replies to `from_address` (the
 * individual who wrote in), never to the list address, so no fan-out and no
 * loop. The real loop shapes stay guarded: `self_address` catches the group's
 * own address, the thread dedup log catches a re-ingested reply, and the
 * circuit breaker caps volume from any cause not yet named.
 *
 * Identification: Google renders the List-Id as the address with the `@`
 * replaced by a dot (`support@colaberry.com` -> `<Support.colaberry.com>`) and
 * repeats the address in `Mailing-list`. A foreign list carries neither, so it
 * still reads as bulk and is still refused.
 *
 * The identity is matched as a WHOLE TOKEN, never as a substring: a substring
 * test would accept a spoofed `<support.colaberry.com.evil.example>` and hand an
 * attacker a way past the guard by naming their own list after ours.
 */
export function isOwnDistributionList(
  headerLookup: (name: string) => string,
  ownAddresses: string[] = SELF_ADDRESSES
): boolean {
  // List-Id: an optional phrase then the id in angle brackets. Take the brackets.
  const listIdRaw = headerLookup('list-id');
  const listId = (/<([^>]+)>/.exec(listIdRaw)?.[1] ?? listIdRaw).trim();
  // Mailing-list: `list <addr>; contact <addr>` — take only the `list` value.
  const mailingListRaw = headerLookup('mailing-list');
  const mailingList = (/(?:^|[;,]\s*)list\s+([^;,\s]+)/.exec(mailingListRaw)?.[1] ?? '').trim();
  if (!listId && !mailingList) return false;
  return ownAddresses.some((addr) => listId === addr.replace('@', '.') || mailingList === addr);
}

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
  const precedence = header('precedence');
  // `bulk` / `junk` / `auto_reply` are bulk mail by any reading — always refused.
  if (/(^|[ ;,])(bulk|auto_reply|junk)([ ;,]|$)/.test(precedence)) return 'bulk_precedence';
  // `list` is refused only for a FOREIGN list. Our own support group stamps it on
  // genuine person-to-support mail; see isOwnDistributionList() for why that is safe.
  if (/(^|[ ;,])list([ ;,]|$)/.test(precedence) && !isOwnDistributionList(header)) {
    return 'foreign_list_precedence';
  }
  if (header('x-autoreply') || header('x-autorespond') || header('x-auto-response-suppress')) {
    return 'x_autoreply';
  }

  return null;
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
  /**
   * Ids of the prompt rules this reply text trips (see coraPromptRules.ts).
   * Empty on a clean reply. A non-empty list forces needsHuman to true, because
   * a rule a model broke once is a rule it will break again: measured on the
   * 2026-11-15 replay set, the rules block took violations from 15 of 20 replies
   * down to 2, and the last 2 moved between runs at the same temperature. The
   * prompt is what makes a violation rare; this is what makes it visible.
   */
  ruleViolations: string[];
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
 *
 * It also enforces the compliance rules in coraPromptRules.ts: a reply whose text
 * trips one is forced to needsHuman regardless of what the model said about itself.
 * That is the deterministic half of the rule. The prompt asks; this decides.
 */
export function parseCoraReply(content: string, fallbackSubject: string): CoraReply {
  const parsed = JSON.parse(content) as {
    subject?: string;
    body?: string;
    needs_human?: unknown;
  };
  if (!parsed.body) throw new Error('Missing body in Cora OpenAI response');
  const modelSaysNeedsHuman = parsed.needs_human === true || parsed.needs_human === 'true';
  const ruleViolations = findCoraReplyViolations(parsed.body);
  return {
    subject: parsed.subject?.trim() || `Re: ${fallbackSubject}`,
    body: parsed.body,
    // One-way: a violation can only ever ADD a human, never remove one.
    needsHuman: modelSaysNeedsHuman || ruleViolations.length > 0,
    ruleViolations,
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
 * The prompt used when the knowledge base cannot be loaded at all. It must not
 * route the sender to support@colaberry.com: that is the address they just wrote
 * to, and telling them to write there again is the "echo" reply this inbox was
 * producing before the KB was attached on 2026-11-15. With no knowledge loaded
 * there is nothing Cora can answer, so every reply from here is a handoff.
 */
const DEGRADED_SYSTEM_PROMPT =
  'You are Cora, the AI Admissions and Support Assistant for Colaberry School of Data Analytics. ' +
  'No program knowledge base is currently loaded, so you do not know any program facts. ' +
  'Do not answer the question, do not state any price, date, policy or fact, and do not give ' +
  'the sender an address to write to. Acknowledge their email in one or two sentences, say a ' +
  'person will follow up, and set needs_human to true.';

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
      return DEGRADED_SYSTEM_PROMPT;
    }
    return await buildCoraSystemPromptFromDB(course.id);
  } catch (error: any) {
    console.warn(`${LOG_PREFIX} Could not build DB-backed system prompt: ${error.message}`);
    return DEGRADED_SYSTEM_PROMPT;
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

  const reply = parseCoraReply(content, subject);
  if (reply.ruleViolations.length > 0) {
    // Structured so a rising count is visible without reading drafts: a rule that
    // starts tripping often means the prompt and the knowledge base have drifted.
    console.warn(
      `${LOG_PREFIX} ${JSON.stringify({
        event: 'cora_rule_violation',
        outcome: 'partial',
        error_class: 'ContractViolation',
        rules: reply.ruleViolations,
        forced_needs_human: true,
      })}`
    );
  }
  return reply;
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

  // Read fresh per call, not the module-level DRY_RUN constant: that constant is
  // frozen at import time, so a test (or a runtime env change) that flips
  // CORA_DRY_RUN after the module has loaded would otherwise have no effect.
  const dryRun = resolveDryRun(process.env.CORA_DRY_RUN);

  // Loop-prevention: never auto-reply to our own mail, to bounces, or to
  // auto-generated mail. Without this, a live Cora replies to its own replies
  // (and to mailer-daemon bounces), producing a self-reply storm.
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

  // Circuit breaker (2026-07-14 mail-loop incident, BC #10095332194): defense-in-depth
  // alongside the skip-reason guards above — this catches runaway volume from any
  // cause, not just the known loop shapes. Skipped in dry-run (nothing real would be
  // sent anyway). Checked BEFORE reserving the dedup slot below so a tripped breaker
  // leaves this thread free for a real attempt once volume subsides, rather than
  // permanently marking it "already handled" with no reply ever sent.
  if (!dryRun && (await isCircuitBreakerTripped())) {
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
    // Ops alerting (BC #10099862873 P0): the audit row above is discoverable
    // only if someone opens the inbox dashboard — this is the exact gap that
    // let the 2026-07-14 mail-loop incident run unnoticed. emitAlert()'s own
    // 1h title+type dedup keeps repeat trips from re-paging Ali.
    emitAlert({
      type: 'critical',
      severity: 5,
      title: 'Circuit Breaker Tripped: cora_circuit_breaker',
      description:
        'Cora has stopped auto-replying to support inbox emails; inbound questions are piling up unanswered. ' +
        `Send ceiling (${CIRCUIT_BREAKER_MAX_SENDS} replies / ${CIRCUIT_BREAKER_WINDOW_MS / 60_000}min) was hit. ` +
        'Recommended action: check the inbox dashboard for a reply loop or traffic spike before raising the ceiling.',
      sourceType: 'system',
      impactArea: 'support_inbox',
      urgency: 'immediate',
      metadata: { thread_key: threadKey, max_sends: CIRCUIT_BREAKER_MAX_SENDS, window_ms: CIRCUIT_BREAKER_WINDOW_MS },
    }).catch((err: any) => {
      console.error(`${LOG_PREFIX} emitAlert failed for circuit breaker trip: ${err.message}`);
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
    return decideCoraDisposition({ generated: false, dryRun, needsHuman: false, sent: false });
  }

  if (dryRun) {
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
        // The whole point of shadow mode is that a human reads what WOULD have been
        // sent and decides whether to arm live sending. A 300-character preview cuts
        // off before the part that carries the risk, so the full body is logged here
        // (and only here — the live-send path keeps the short preview).
        body_full: reply.body.substring(0, 8000),
        needs_human: reply.needsHuman,
        // Which compliance rules the draft tripped, so a reviewer can filter the
        // shadow log for the drafts that need reading first rather than reading all.
        rule_violations: reply.ruleViolations,
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
        rule_violations: reply.ruleViolations,
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
