/**
 * ghlConversationLogService — logs outbound campaign emails into a GHL
 * contact's Conversations activity feed (not Notes), so admissions/sales
 * reps see the send without leaving GHL.
 *
 * GHL's public API has no documented endpoint for injecting an externally
 * sent Email message into a contact's native Conversations feed as a real
 * customer-visible "Email" type — that requires registering a Marketplace
 * Conversation Provider app (new OAuth credential set), which is out of
 * scope here (see PROGRESS.md). Per Kes's explicit direction, this uses the
 * confirmed-working `type: "InternalComment"` write on GHL's v2 API instead:
 * a staff-only entry on the Conversations tab (not the separate Notes tab),
 * requiring only a Private Integration token scoped for conversations/*.
 *
 * Uses its own v2 (services.leadconnectorhq.com) transport with its own
 * retry loop rather than sharing ghlService.ts's v1 client — same shape,
 * deliberately not shared, matching the two-different-GHL-API-generations
 * precedent (v1 contacts vs. v2 conversations are genuinely different auth
 * and base URLs; conflating them behind one client would hide that).
 */
import '../config/env'; // side-effect: guarantees dotenv has loaded the root .env before the process.env fallback below reads it
import { getSetting } from './settingsService';
import { syncLeadToGhl } from './ghlService';
import { Lead, CommunicationLog } from '../models';
import { classifyError } from '../utils/errorClassifier';

/**
 * DB-backed system setting takes precedence (matches this repo's existing
 * ghl_api_key convention); falls back to the GHL_CONVERSATIONS_API_KEY env
 * var for local/manual testing before a value is saved via Admin Settings.
 * Never logged — callers must not print the return value.
 */
async function resolveGhlConversationsApiKey(): Promise<string> {
  const fromSettings = await getSetting('ghl_conversations_api_key');
  if (fromSettings) return fromSettings;
  return process.env.GHL_CONVERSATIONS_API_KEY || '';
}

async function emitFailureEvent(params: Parameters<typeof import('./aiEventService').emitAiEvent>[0]): Promise<void> {
  try {
    const { emitAiEvent } = await import('./aiEventService');
    await emitAiEvent(params);
  } catch (err: any) {
    console.error(JSON.stringify({
      level: 'error', service: 'backend', event: 'emit_failure_event_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { event_type: params.event_type, message: err?.message },
    }));
  }
}

const GHL_CONVERSATIONS_BASE = 'https://services.leadconnectorhq.com';
const GHL_CONVERSATIONS_VERSION = '2021-07-28';
const RETRY_MAX = 2;
const RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MESSAGE_BODY_PREVIEW_CHARS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtmlForPreview(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface GhlConversationsResult {
  success: boolean;
  data?: any;
  error?: string;
}

async function ghlConversationsFetch(
  path: string,
  method: string,
  apiKey: string,
  body?: any
): Promise<GhlConversationsResult> {
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      const response = await fetch(`${GHL_CONVERSATIONS_BASE}${path}`, {
        method,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Version': GHL_CONVERSATIONS_VERSION,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (RETRYABLE_STATUS.has(response.status) && attempt < RETRY_MAX) {
          console.warn(`[GHL Conversations] Retryable error ${response.status} on attempt ${attempt + 1}/${RETRY_MAX + 1} for ${method} ${path}, retrying...`);
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        return { success: false, error: data?.message || JSON.stringify(data) };
      }

      return { success: true, data };
    } catch (error: any) {
      if (attempt < RETRY_MAX) {
        console.warn(`[GHL Conversations] Request error on attempt ${attempt + 1}/${RETRY_MAX + 1} for ${method} ${path} (${error.message}), retrying...`);
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      return { success: false, error: error.message };
    }
  }

  return { success: false, error: 'GHL Conversations request failed after retries' };
}

/**
 * Writes a single InternalComment to a known GHL contact. Exported (in
 * addition to the higher-level logEmailConversationToGhl orchestration
 * below) so a manual verification script can exercise the exact production
 * write path against a real contact without needing a fabricated Lead row
 * or CommunicationLog row — see scripts/verifyGhlConversationLog.ts.
 */
export async function writeGhlInternalComment(
  contactId: string,
  message: string,
  apiKeyOverride?: string
): Promise<GhlConversationsResult> {
  const conversationsApiKey = apiKeyOverride ?? (await resolveGhlConversationsApiKey());
  if (!conversationsApiKey) return { success: false, error: 'ghl_conversations_api_key not configured' };

  return ghlConversationsFetch('/conversations/messages', 'POST', conversationsApiKey, {
    contactId,
    type: 'InternalComment',
    message,
  });
}

export interface LogEmailConversationParams {
  leadId: number;
  communicationLogId: string;
  subject: string;
  htmlBody: string;
  campaignName?: string;
  sentAt: Date;
}

export interface LogEmailConversationResult {
  logged: boolean;
  skipped?: 'disabled' | 'not_configured' | 'already_logged';
  error?: 'lead_not_found' | 'contact_unresolved' | string;
}

/**
 * Fire-and-forget from the caller's perspective (never await this inline
 * with an email send — a GHL outage must never delay or block delivery).
 * Retries/failure alerting happen internally; on unrecoverable failure this
 * resolves (not rejects) with `error` set, tagged via `emitFailureEvent` so
 * it surfaces on the alert queue for manual back-fill instead of vanishing.
 */
export async function logEmailConversationToGhl(
  params: LogEmailConversationParams
): Promise<LogEmailConversationResult> {
  const enabled = await getSetting('ghl_conversation_log_enabled');
  if (!enabled) return { logged: false, skipped: 'disabled' };

  const conversationsApiKey = await resolveGhlConversationsApiKey();
  if (!conversationsApiKey) return { logged: false, skipped: 'not_configured' };

  const commLog = await CommunicationLog.findByPk(params.communicationLogId);
  if (commLog?.metadata?.ghl_conversation_logged) {
    return { logged: false, skipped: 'already_logged' };
  }

  const lead = await Lead.findByPk(params.leadId);
  if (!lead) {
    console.error(`[GHL Conversations] Lead ${params.leadId} not found — cannot log conversation`);
    return { logged: false, error: 'lead_not_found' };
  }

  // Self-heal: resolve/create the GHL contact if this lead doesn't have one
  // yet (mirrors processSmsAction's self-heal in schedulerService.ts).
  let contactId = lead.ghl_contact_id;
  if (!contactId) {
    try {
      const syncResult = await syncLeadToGhl(lead, undefined, false, true);
      contactId = syncResult.contactId;
    } catch {
      // Unresolved — handled by the check below, not re-thrown.
    }
  }

  if (!contactId) {
    console.error(`[GHL Conversations] Could not resolve a GHL contact for lead ${params.leadId} — conversation log dropped`);
    await emitFailureEvent({
      event_type: 'ghl_conversation_log_failed',
      outcome: 'failure',
      external_system: 'ghl',
      error_class: 'ContractViolation',
      metadata: { lead_id: params.leadId, communication_log_id: params.communicationLogId, reason: 'contact_unresolved' },
    });
    return { logged: false, error: 'contact_unresolved' };
  }

  const preview = stripHtmlForPreview(params.htmlBody).slice(0, MESSAGE_BODY_PREVIEW_CHARS);
  const message = [
    `Outbound Email${params.campaignName ? ` — ${params.campaignName}` : ''}`,
    `Sent: ${params.sentAt.toISOString()}`,
    `Subject: ${params.subject}`,
    '',
    preview,
  ].join('\n');

  const result = await writeGhlInternalComment(contactId, message, conversationsApiKey);

  if (!result.success) {
    console.error(`[GHL Conversations] Failed to log conversation for lead ${params.leadId}: ${result.error}`);
    await emitFailureEvent({
      event_type: 'ghl_conversation_log_failed',
      outcome: 'failure',
      external_system: 'ghl',
      error_class: classifyError({ message: result.error }),
      metadata: { lead_id: params.leadId, communication_log_id: params.communicationLogId, error: String(result.error).slice(0, 200) },
    });
    return { logged: false, error: result.error };
  }

  if (commLog) {
    await commLog.update({
      metadata: {
        ...(commLog.metadata || {}),
        ghl_conversation_logged: true,
        ghl_message_id: result.data?.id || result.data?.messageId || null,
        ghl_logged_at: new Date().toISOString(),
      },
    });
  }

  console.log(`[GHL Conversations] Logged email conversation for lead ${params.leadId} on contact ${contactId}`);
  return { logged: true };
}
