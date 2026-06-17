/**
 * Cora Agent Service — auto-reply handler for support@colaberry.com inquiries.
 *
 * Called from inboxStateManager when hardRuleEngine matches rule_id 'cora_0c'.
 * Uses OpenAI (same key as replyDraftService) with the Cora system prompt.
 *
 * Set CORA_DRY_RUN=true to log generated replies without sending — use this
 * during shadow testing to verify Cora quality before going live.
 */
import OpenAI from 'openai';
import { buildCoraSystemPrompt, CoraCohortContext } from './coraKnowledgeBase';
import { logAuditEvent } from './inboxAuditService';
import { listOpenCohorts } from '../cohortService';

const LOG_PREFIX = '[InboxCOS][Cora]';

const DRY_RUN = process.env.CORA_DRY_RUN === 'true';

export interface CoraReply {
  subject: string;
  body: string;
}

/**
 * Read the next open cohort from the DB (the source of truth, managed at
 * /admin/accelerator). Returns null on any failure so Cora degrades gracefully
 * to "check the enrollment page" rather than failing the whole reply.
 */
async function getNextCohortForCora(): Promise<CoraCohortContext | null> {
  try {
    const cohorts = await listOpenCohorts(); // status='open', ordered by start_date ASC
    // Only surface a cohort that hasn't started yet. 'open' cohorts can linger
    // with past start dates in the DB, and the public enrollment page filters
    // the same way (start_date >= today) — Cora must not quote a past cohort.
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (DATEONLY)
    const next = (cohorts || []).find((c) => c.start_date >= today);
    if (!next) return null;
    return {
      name: next.name,
      start_date: next.start_date,
      seats_remaining: Math.max(0, (next.max_seats ?? 0) - (next.seats_taken ?? 0)),
    };
  } catch (error: any) {
    console.warn(`${LOG_PREFIX} Could not load next cohort: ${error.message}`);
    return null;
  }
}

// ─── Reply Generation ─────────────────────────────────────────────────────

export async function generateCoraReply(
  emailBody: string,
  subject: string,
  fromName: string | null
): Promise<CoraReply> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const nextCohort = await getNextCohortForCora();

  const senderLine = fromName ? `From: ${fromName}` : '';
  const userMessage = `${senderLine}\nSubject: ${subject}\n\n${emailBody.substring(0, 3000)}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1000,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildCoraSystemPrompt(nextCohort) },
      { role: 'user', content: userMessage },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(content) as { subject?: string; body?: string };
  if (!parsed.body) throw new Error('Missing body in Cora OpenAI response');

  return {
    subject: parsed.subject?.trim() || `Re: ${subject}`,
    body: parsed.body,
  };
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
}): Promise<void> {
  console.log(`${LOG_PREFIX} Handling inquiry: email=${email.id} from=${email.from_address}`);

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
    return;
  }

  if (DRY_RUN) {
    console.log(
      `${LOG_PREFIX} DRY RUN — would send to ${email.from_address}:\n` +
      `Subject: ${reply.subject}\n\n${reply.body}`
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
      },
    });
    return;
  }

  try {
    await sendCoraReplyViaGmail(email, reply);
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
}

// ─── Gmail Send ───────────────────────────────────────────────────────────

async function sendCoraReplyViaGmail(
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
