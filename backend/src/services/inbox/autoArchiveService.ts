/**
 * Auto-Archive Service — Removes AUTOMATION emails from provider inboxes.
 * Archive is non-critical: failures are logged but never thrown.
 */
import { google } from 'googleapis';
import { logAuditEvent } from './inboxAuditService';

const LOG_PREFIX = '[InboxCOS][Archive]';

/**
 * Hotmail archiving has TWO possible Graph clients, and this service was hard-wired
 * to the one production does not have credentials for:
 *
 *   msGraphService    confidential client — needs CLIENT_ID + CLIENT_SECRET +
 *                     TENANT_ID + REFRESH_TOKEN (MSAL)
 *   graphMailService  public client — needs CLIENT_ID + REFRESH_TOKEN only
 *
 * Production provisions the public-client pair only (no secret, no tenant), so
 * `msGraphService.isConfigured()` returned false on every call and every Hotmail
 * archive was skipped with "MS Graph not configured" — while Hotmail *sync*,
 * which reads through graphMailService, worked the whole time. That mismatch is
 * why ~281 alert emails accumulated in the inbox instead of being filed.
 *
 * Resolved at call time rather than at import: whichever client is actually
 * configured wins, so this works under either credential setup instead of
 * assuming one.
 */
interface GraphArchiveClient {
  name: string;
  archiveMessage: (messageId: string) => Promise<void>;
}

function resolveGraphArchiveClient(): GraphArchiveClient | null {
  // Prefer the confidential client when fully provisioned; fall back to the
  // public client, which needs no secret.
  for (const name of ['msGraphService', 'graphMailService']) {
    try {
      const mod = require(`./${name}`);
      if (typeof mod.isConfigured === 'function' && mod.isConfigured() && typeof mod.archiveMessage === 'function') {
        return { name, archiveMessage: mod.archiveMessage };
      }
    } catch (err: any) {
      // A module that genuinely cannot load is worth a line — the previous bare
      // `catch {}` here meant a broken import was indistinguishable from
      // "not configured", which is what made this take so long to spot.
      console.warn(`${LOG_PREFIX} Graph client ${name} failed to load: ${err.message}`);
    }
  }
  return null;
}

interface ArchiveTarget {
  id: string;
  provider: string;
  provider_message_id: string;
}

/**
 * Archives an email in its source provider (removes from inbox).
 * - Gmail: removes INBOX label
 * - Hotmail: moves to Archive folder via Graph API
 *
 * On failure, logs the error and audit event but does not throw.
 */
export async function archiveEmail(email: ArchiveTarget): Promise<void> {
  try {
    switch (email.provider) {
      case 'gmail_colaberry':
        await archiveGmail(email.provider_message_id, 'colaberry');
        break;

      case 'gmail_personal':
        await archiveGmail(email.provider_message_id, 'personal');
        break;

      case 'hotmail':
        await archiveHotmail(email.provider_message_id);
        break;

      default:
        console.warn(`${LOG_PREFIX} Unknown provider: ${email.provider} for email ${email.id}`);
        return;
    }

    // Log successful archive
    await logAuditEvent({
      email_id: email.id,
      action: 'archived',
      actor: 'system',
      metadata: {
        provider: email.provider,
        provider_message_id: email.provider_message_id,
      },
    }).catch((auditErr: any) => {
      console.error(`${LOG_PREFIX} Audit log failed for archive of ${email.id}: ${auditErr.message}`);
    });

    console.log(`${LOG_PREFIX} Archived email ${email.id} (${email.provider})`);
  } catch (error: any) {
    console.error(
      `${LOG_PREFIX} Failed to archive email ${email.id} (${email.provider}): ${error.message}`
    );

    // Log the failure as an audit event
    await logAuditEvent({
      email_id: email.id,
      action: 'archive_failed',
      actor: 'system',
      reasoning: error.message,
      metadata: {
        provider: email.provider,
        provider_message_id: email.provider_message_id,
      },
    }).catch((auditErr: any) => {
      console.error(`${LOG_PREFIX} Audit log also failed: ${auditErr.message}`);
    });

    // Surface auth-class failures via SMS so a stuck token doesn't go silent.
    // Throttled to once/day per provider+kind in alertSyncFailure().
    try {
      const { alertSyncFailure } = await import('./smsAlertService');
      await alertSyncFailure(email.provider, 'archive', error.message);
    } catch { /* alert is non-critical */ }

    // Do NOT rethrow — archive is non-critical
  }
}

// ─── Gmail Archive ──────────────────────────────────────────────────────────

const GMAIL_MAX_ATTEMPTS = 3;
const GMAIL_MAX_WAIT_MS = 30_000;

/**
 * Parses how long to wait before retrying a Gmail API error.
 * Returns 0 if the error is not rate-limit-related.
 *
 * Gmail signals rate-limits as either HTTP 403 with reason
 * `userRateLimitExceeded`/`rateLimitExceeded` or HTTP 429. The retry hint
 * arrives in two formats: a `Retry-After` header (seconds), or embedded in
 * the message string as `Retry after <ISO timestamp>`. We accept both.
 */
function parseGmailRetryAfterMs(error: any): number {
  if (!error) return 0;
  const code = error.code ?? error.response?.status;
  const reason = error.errors?.[0]?.reason || '';
  const isRateLimit =
    code === 429 || code === '429' ||
    ((code === 403 || code === '403') && /rateLimit/i.test(reason)) ||
    /rate[- ]?limit/i.test(String(error.message || ''));
  if (!isRateLimit) return 0;

  const headerVal = error.response?.headers?.['retry-after'];
  if (headerVal) {
    const secs = parseInt(String(headerVal), 10);
    if (!isNaN(secs) && secs > 0) return secs * 1000;
  }

  const isoMatch = String(error.message || '').match(/Retry after (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
  if (isoMatch) {
    const delta = new Date(isoMatch[1]).getTime() - Date.now();
    if (delta > 0) return delta;
  }

  return 2_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function archiveGmail(
  providerMessageId: string,
  account: 'colaberry' | 'personal'
): Promise<void> {
  // Use COS-specific tokens (gmail.modify scope) when available, fall back to standard
  const clientId = account === 'colaberry'
    ? (process.env.GMAIL_COS_CLIENT_ID || process.env.GMAIL_CLIENT_ID)
    : process.env.GMAIL_PERSONAL_CLIENT_ID;
  const clientSecret = account === 'colaberry'
    ? (process.env.GMAIL_COS_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET)
    : process.env.GMAIL_PERSONAL_CLIENT_SECRET;
  const refreshToken = account === 'colaberry'
    ? (process.env.GMAIL_COS_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN)
    : process.env.GMAIL_PERSONAL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn(`${LOG_PREFIX} Gmail (${account}) not configured — cannot archive`);
    return;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  let lastError: any;
  for (let attempt = 1; attempt <= GMAIL_MAX_ATTEMPTS; attempt++) {
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: providerMessageId,
        requestBody: { removeLabelIds: ['INBOX'] },
      });
      const suffix = attempt > 1 ? ` (attempt ${attempt}/${GMAIL_MAX_ATTEMPTS})` : '';
      console.log(`${LOG_PREFIX} Gmail (${account}) removed INBOX label from ${providerMessageId}${suffix}`);
      return;
    } catch (error: any) {
      lastError = error;
      const waitMs = parseGmailRetryAfterMs(error);
      if (waitMs <= 0 || attempt === GMAIL_MAX_ATTEMPTS) break;
      const cappedWait = Math.min(waitMs, GMAIL_MAX_WAIT_MS);
      console.warn(`${LOG_PREFIX} Gmail (${account}) rate-limited on ${providerMessageId}; waiting ${cappedWait}ms before retry ${attempt + 1}/${GMAIL_MAX_ATTEMPTS}`);
      await sleep(cappedWait);
    }
  }
  throw lastError;
}

// ─── Hotmail Archive ────────────────────────────────────────────────────────

async function archiveHotmail(providerMessageId: string): Promise<void> {
  const client = resolveGraphArchiveClient();
  if (!client) {
    // THROW, do not return. Returning quietly here is what made this failure
    // invisible for months: archiveEmail() carries on and writes an `archived`
    // audit event, so the database recorded ~1,638 Hotmail archives while 171 of
    // those messages were still sitting in the inbox. Nothing ever retried them,
    // because the system believed the work was done. Throwing routes this into
    // archiveEmail's catch, which records `archive_failed` — visibly wrong
    // instead of silently wrong.
    const present = ['MS_GRAPH_CLIENT_ID', 'MS_GRAPH_CLIENT_SECRET', 'MS_GRAPH_TENANT_ID', 'MS_GRAPH_REFRESH_TOKEN']
      .map((v) => `${v}=${process.env[v] ? 'set' : 'MISSING'}`)
      .join(' ');
    throw new Error(`No configured MS Graph client — cannot archive Hotmail message. ${present}`);
  }

  await client.archiveMessage(providerMessageId);
  console.log(`${LOG_PREFIX} Hotmail archived message ${providerMessageId} via ${client.name}`);
}
