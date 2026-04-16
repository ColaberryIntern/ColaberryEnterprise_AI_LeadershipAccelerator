/**
 * Reply Draft Service — Generates AI reply drafts via Claude, manages approval workflow.
 * Drafts are stored in the inbox_reply_drafts table for human review before sending.
 */
import OpenAI from 'openai';
import InboxEmail from '../../models/InboxEmail';
import InboxClassification from '../../models/InboxClassification';
import InboxStyleProfile from '../../models/InboxStyleProfile';
import InboxReplyDraft from '../../models/InboxReplyDraft';
import InboxAuditLog from '../../models/InboxAuditLog';
import { logAuditEvent } from './inboxAuditService';

const LOG_PREFIX = '[InboxCOS][ReplyDraft]';

// ─── Draft Generation ──────────────────────────────────────────────────────

/**
 * Generates an AI reply draft for a given email, stores it in the approval queue.
 * Uses the email's classification category to select a matching style profile.
 */
export async function generateDraft(emailId: string): Promise<any> {
  // 1. Load the email
  const email = await InboxEmail.findByPk(emailId);
  if (!email) {
    throw new Error(`Email not found: ${emailId}`);
  }

  // 2. Load the classification to get the category
  const classification = await InboxClassification.findOne({
    where: { email_id: emailId },
    order: [['classified_at', 'DESC']],
  });

  const category = extractCategory(classification);

  // 3. Load the style profile for this category (or 'unknown' fallback)
  let profile = await InboxStyleProfile.findOne({ where: { category } });
  if (!profile) {
    profile = await InboxStyleProfile.findOne({ where: { category: 'unknown' } });
  }

  // Build default profile values if none exists
  const profileData = {
    formality_level: profile?.formality_level ?? 5,
    greeting_patterns: Array.isArray(profile?.greeting_patterns)
      ? profile.greeting_patterns.join(', ')
      : 'Hi, Hello',
    signoff_patterns: Array.isArray(profile?.signoff_patterns)
      ? profile.signoff_patterns.join(', ')
      : 'Best, Thanks',
    tone_descriptors: Array.isArray(profile?.tone_descriptors)
      ? profile.tone_descriptors.join(', ')
      : 'professional, direct',
    avg_sentence_length: profile?.avg_sentence_length ?? 15,
  };

  // 4. Build the prompt
  const systemPrompt = `Draft a reply on behalf of Ali Muwwakkil.

Style profile for ${category} emails:
- Formality: ${profileData.formality_level}/10
- Greeting: ${profileData.greeting_patterns}
- Sign-off: ${profileData.signoff_patterns}
- Tone: ${profileData.tone_descriptors}
- Sentence length: ${profileData.avg_sentence_length} words avg

Rules:
1. Match Ali's writing style for this type of correspondence
2. Be substantively helpful, not just an acknowledgment
3. Maintain appropriate warmth and professionalism
4. Be concise — Ali prefers directness
5. If a meeting/call is appropriate, suggest specific times`;

  const bodyText = email.body_text
    ? email.body_text.substring(0, 3000)
    : '(empty)';

  const userMessage = `Reply to this email:\n\nFrom: ${email.from_name || ''} <${email.from_address}>\nSubject: ${email.subject}\n\n${bodyText}`;

  // 5. Call Claude API
  let draftBody: string;
  let generationFailed = false;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log(`${LOG_PREFIX} Generating draft for email ${emailId} (category=${category})`);

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    draftBody = content;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} OpenAI API failed for email ${emailId}: ${error.message}`);
    draftBody = '[Draft generation failed — please compose manually]';
    generationFailed = true;
  }

  // 6. Create the draft row
  const draft = await InboxReplyDraft.create({
    email_id: emailId,
    thread_id: email.provider_thread_id || null,
    draft_body: draftBody,
    draft_subject: `Re: ${email.subject}`,
    reply_to_address: email.from_address,
    status: 'pending_approval',
    reply_mode: 1,
    style_profile_used: profile?.id || null,
  });

  // 7. Log audit event
  await logAuditEvent({
    email_id: emailId,
    action: 'draft_created',
    new_state: 'pending_approval',
    actor: 'system',
    metadata: {
      draft_id: draft.id,
      category,
      generation_failed: generationFailed,
      style_profile_id: profile?.id || null,
    },
  });

  console.log(
    `${LOG_PREFIX} Draft created: ${draft.id} for email ${emailId} | failed=${generationFailed}`
  );

  return draft;
}

// ─── Draft Approval ────────────────────────────────────────────────────────

/**
 * Approves a draft (optionally with edits) and sends the reply via the email provider.
 */
export async function approveDraft(draftId: string, editedBody?: string): Promise<any> {
  const draft = await InboxReplyDraft.findByPk(draftId);
  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }

  // Update status based on whether the body was edited
  if (editedBody) {
    draft.edited_body = editedBody;
    draft.status = 'edited';
  } else {
    draft.status = 'approved';
  }
  draft.approved_by = 'ali';
  await draft.save();

  // Send the reply via the appropriate provider
  const email = await InboxEmail.findByPk(draft.email_id);
  if (!email) {
    throw new Error(`Original email not found for draft: ${draftId}`);
  }

  const replyBody = editedBody || draft.draft_body;

  try {
    await sendReplyViaProvider(email, draft, replyBody);
    draft.sent_at = new Date();
    draft.status = 'sent';
    await draft.save();

    console.log(`${LOG_PREFIX} Draft ${draftId} sent successfully to ${draft.reply_to_address}`);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Failed to send draft ${draftId}: ${error.message}`);
    throw error;
  }

  // Log audit event
  await logAuditEvent({
    email_id: draft.email_id,
    action: 'draft_sent',
    old_state: editedBody ? 'edited' : 'approved',
    new_state: 'sent',
    actor: 'ali',
    metadata: {
      draft_id: draftId,
      was_edited: !!editedBody,
      reply_to: draft.reply_to_address,
    },
  });

  return draft;
}

// ─── Draft Rejection ───────────────────────────────────────────────────────

/**
 * Rejects a draft. Optionally records a reason.
 */
export async function rejectDraft(draftId: string, reason?: string): Promise<void> {
  const draft = await InboxReplyDraft.findByPk(draftId);
  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }

  draft.status = 'rejected';
  await draft.save();

  await logAuditEvent({
    email_id: draft.email_id,
    action: 'draft_rejected',
    old_state: 'pending_approval',
    new_state: 'rejected',
    actor: 'ali',
    metadata: {
      draft_id: draftId,
      reason: reason || null,
    },
  });

  console.log(`${LOG_PREFIX} Draft ${draftId} rejected${reason ? `: ${reason}` : ''}`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extracts the category from an InboxClassification.
 * The category is stored in the audit log metadata when the LLM classifies.
 * Falls back to parsing from reasoning text, then to 'unknown'.
 */
function extractCategory(classification: InboxClassification | null): string {
  if (!classification) return 'unknown';

  // Try to find the category in the audit log metadata
  // The LLM classification service stores category in the audit event metadata
  // For now, parse it from reasoning if it contains a known category keyword
  const reasoning = (classification.reasoning || '').toLowerCase();
  const knownCategories = ['business', 'personal', 'notification', 'marketing', 'transactional'];

  for (const cat of knownCategories) {
    if (reasoning.includes(cat)) {
      return cat;
    }
  }

  return 'unknown';
}

/**
 * Sends a reply via the appropriate email provider (Gmail API or MS Graph).
 * Routes based on the original email's provider field.
 */
async function sendReplyViaProvider(
  email: InboxEmail,
  draft: InboxReplyDraft,
  replyBody: string
): Promise<void> {
  const provider = email.provider;

  if (provider === 'hotmail') {
    await sendReplyViaMsGraph(email, draft, replyBody);
  } else if (provider === 'gmail_colaberry' || provider === 'gmail_personal') {
    await sendReplyViaGmail(email, draft, replyBody);
  } else {
    throw new Error(`Unsupported provider for reply: ${provider}`);
  }
}

/**
 * Sends a reply via Microsoft Graph API.
 * Uses the provider_message_id to reply to the correct message in the thread.
 */
async function sendReplyViaMsGraph(
  email: InboxEmail,
  draft: InboxReplyDraft,
  replyBody: string
): Promise<void> {
  // Lazy import to avoid circular dependency issues
  const { isConfigured, getGraphClient } = await import('./msGraphService');

  if (!isConfigured()) {
    throw new Error('MS Graph not configured — cannot send Hotmail reply');
  }

  const client = getGraphClient();
  const messageId = email.provider_message_id;

  console.log(`${LOG_PREFIX} Sending reply via MS Graph for message ${messageId}`);

  await client
    .api(`/me/messages/${messageId}/reply`)
    .post({
      comment: replyBody,
    });
}

/**
 * Sends a reply via Gmail API.
 * Constructs a raw RFC 2822 message with proper In-Reply-To and References headers.
 */
async function sendReplyViaGmail(
  email: InboxEmail,
  draft: InboxReplyDraft,
  replyBody: string
): Promise<void> {
  const { google } = await import('googleapis');

  const credentialsKey =
    email.provider === 'gmail_colaberry'
      ? 'GMAIL_COLABERRY'
      : 'GMAIL_PERSONAL';

  const accessToken = process.env[`${credentialsKey}_ACCESS_TOKEN`];
  const refreshToken = process.env[`${credentialsKey}_REFRESH_TOKEN`];
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(`Gmail credentials not configured for ${email.provider}`);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Determine the "from" address based on the provider
  const fromAddress =
    email.provider === 'gmail_colaberry'
      ? process.env.GMAIL_COLABERRY_ADDRESS || 'ali@colaberry.com'
      : process.env.GMAIL_PERSONAL_ADDRESS || 'ali@gmail.com';

  // Build the raw RFC 2822 message
  const messageId = email.provider_message_id;
  const headers = email.headers || {};
  const originalMessageId =
    Object.entries(headers).find(([k]) => k.toLowerCase() === 'message-id')?.[1] || messageId;

  const rawLines = [
    `From: ${fromAddress}`,
    `To: ${draft.reply_to_address}`,
    `Subject: ${draft.draft_subject || `Re: ${email.subject}`}`,
    `In-Reply-To: ${originalMessageId}`,
    `References: ${originalMessageId}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    replyBody,
  ];

  const rawMessage = Buffer.from(rawLines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  console.log(`${LOG_PREFIX} Sending reply via Gmail (${email.provider}) for message ${messageId}`);

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: rawMessage,
      threadId: email.provider_thread_id || undefined,
    },
  });
}
