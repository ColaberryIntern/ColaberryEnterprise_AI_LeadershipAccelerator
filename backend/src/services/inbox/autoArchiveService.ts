/**
 * Auto-Archive Service — Removes AUTOMATION emails from provider inboxes.
 * Archive is non-critical: failures are logged but never thrown.
 */
import { google } from 'googleapis';
import { archiveMessage as graphArchiveMessage, isConfigured as isMsGraphConfigured } from './msGraphService';
import { logAuditEvent } from './inboxAuditService';

const LOG_PREFIX = '[InboxCOS][Archive]';

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

    // Do NOT rethrow — archive is non-critical
  }
}

// ─── Gmail Archive ──────────────────────────────────────────────────────────

async function archiveGmail(
  providerMessageId: string,
  account: 'colaberry' | 'personal'
): Promise<void> {
  const clientId = account === 'colaberry'
    ? process.env.GMAIL_CLIENT_ID
    : process.env.GMAIL_PERSONAL_CLIENT_ID;
  const clientSecret = account === 'colaberry'
    ? process.env.GMAIL_CLIENT_SECRET
    : process.env.GMAIL_PERSONAL_CLIENT_SECRET;
  const refreshToken = account === 'colaberry'
    ? process.env.GMAIL_REFRESH_TOKEN
    : process.env.GMAIL_PERSONAL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn(`${LOG_PREFIX} Gmail (${account}) not configured — cannot archive`);
    return;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  await gmail.users.messages.modify({
    userId: 'me',
    id: providerMessageId,
    requestBody: {
      removeLabelIds: ['INBOX'],
    },
  });

  console.log(`${LOG_PREFIX} Gmail (${account}) removed INBOX label from ${providerMessageId}`);
}

// ─── Hotmail Archive ────────────────────────────────────────────────────────

async function archiveHotmail(providerMessageId: string): Promise<void> {
  if (!isMsGraphConfigured()) {
    console.warn(`${LOG_PREFIX} MS Graph not configured — cannot archive Hotmail message`);
    return;
  }

  await graphArchiveMessage(providerMessageId);
  console.log(`${LOG_PREFIX} Hotmail archived message ${providerMessageId}`);
}
