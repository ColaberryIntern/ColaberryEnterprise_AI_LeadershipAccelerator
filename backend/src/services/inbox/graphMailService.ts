/**
 * Microsoft Graph Mail API client for Hotmail (ali_muwwakkil@hotmail.com).
 * Uses OAuth2 public client with refresh token — no client secret needed.
 */
import axios from 'axios';
import { getRefreshToken, saveRotatedToken, invalidateStoredToken } from './graphTokenStore';

const LOG_PREFIX = '[InboxCOS][Graph]';

let cachedAccessToken: string | null = null;
let tokenExpiry = 0;

export function isConfigured(): boolean {
  return !!(process.env.MS_GRAPH_CLIENT_ID && process.env.MS_GRAPH_REFRESH_TOKEN);
}

/**
 * Scope used for READ + ARCHIVE. Deliberately excludes Mail.Send.
 *
 * The stored refresh token was consented for Mail.Read/Mail.ReadWrite only.
 * Asking the token endpoint for a scope the user never granted does not degrade
 * gracefully — AAD rejects the WHOLE request with AADSTS70000 and returns no
 * token at all. Adding Mail.Send here would therefore break inbox sync and
 * auto-archive, which work today, in exchange for a send path that still would
 * not work. Send requests its own token separately (see getSendAccessToken).
 */
const READ_SCOPE = 'Mail.Read Mail.ReadWrite offline_access';
const SEND_SCOPE = 'Mail.Read Mail.ReadWrite Mail.Send offline_access';

/**
 * Extracts a safe, human-readable detail from an MS Graph / AAD token-endpoint axios
 * error. Only ever reads specific allowlisted fields (`error`, `error_description`,
 * `error.code`, `error.message`) off `error.response.data` — never blanket
 * `JSON.stringify`s the response body, so a request/response body that happened to
 * echo a `client_secret` or `access_token` field can never end up in a log line or
 * thrown error message (root CLAUDE.md Secrets Management: "no secrets in logs").
 *
 * Handles both shapes this file's two call sites can hit:
 *   - AAD token endpoint (RFC 6749): { error: "invalid_grant", error_description, error_codes }
 *   - MS Graph API:                  { error: { code: "...", message: "..." } }
 */
export function extractGraphErrorDetail(error: any): { message: string; errorClass: string } {
  const data = error?.response?.data;
  const fallback = { message: error?.message || 'Unknown Graph/AAD error', errorClass: 'MsGraphRequestError' };
  if (!data || typeof data !== 'object') return fallback;

  // AAD token-endpoint shape: `error` is a string code.
  if (typeof data.error === 'string') {
    const parts = [data.error, data.error_description].filter(Boolean);
    const isAuth = /invalid_grant|invalid_client|unauthorized_client/i.test(data.error);
    return {
      message: parts.length ? parts.join(': ') : fallback.message,
      errorClass: isAuth ? 'MsGraphAuthError' : 'MsGraphRequestError',
    };
  }

  // MS Graph API shape: `error` is an { code, message } object.
  if (data.error && typeof data.error === 'object') {
    const parts = [data.error.code, data.error.message].filter(Boolean);
    const isAuth = /invalidauthenticationtoken|unauthorized/i.test(String(data.error.code || ''));
    return {
      message: parts.length ? parts.join(': ') : fallback.message,
      errorClass: isAuth ? 'MsGraphAuthError' : 'MsGraphRequestError',
    };
  }

  return fallback;
}

function wrapGraphError(error: any, context: string): Error {
  const { message, errorClass } = extractGraphErrorDetail(error);
  console.error(`${LOG_PREFIX} ${context} failed [${errorClass}]: ${message}`);
  const wrapped = new Error(message);
  (wrapped as any).error_class = errorClass;
  return wrapped;
}

/** True for the AAD responses that mean "this refresh token is no longer usable". */
function isRejectedGrant(error: any): boolean {
  const data = error?.response?.data;
  const code = typeof data?.error === 'string' ? data.error : '';
  const description = typeof data?.error_description === 'string' ? data.error_description : '';
  // AADSTS70000 is scope-not-consented, NOT a dead token — excluded on purpose,
  // since clearing the vault for it would discard a perfectly good credential.
  if (/AADSTS70000/.test(description)) return false;
  return code === 'invalid_grant' || /AADSTS70008|AADSTS50173|expired|revoked/i.test(description);
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) return cachedAccessToken;

  const clientId = process.env.MS_GRAPH_CLIENT_ID!;
  // Vault first, env second — see graphTokenStore. Rotations are persisted, so
  // the env var is only the initial seed, not the running source of truth.
  const refreshToken = (await getRefreshToken())!;

  let res;
  try {
    res = await axios.post(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: READ_SCOPE,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
  } catch (error: any) {
    // If the token we just used came from the vault and AAD has rejected it,
    // clear it so the next attempt falls back to the env var. Without this the
    // vault would keep serving a dead token forever, since it always wins.
    if (isRejectedGrant(error) && refreshToken !== process.env.MS_GRAPH_REFRESH_TOKEN) {
      await invalidateStoredToken();
    }
    throw wrapGraphError(error, 'Token refresh');
  }

  cachedAccessToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;

  // Persist the rotation instead of logging and discarding it.
  if (res.data.refresh_token && res.data.refresh_token !== refreshToken) {
    await saveRotatedToken(res.data.refresh_token);
  }

  return cachedAccessToken!;
}

export interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  from: { emailAddress: { address: string; name: string } };
  toRecipients: Array<{ emailAddress: { address: string; name: string } }>;
  ccRecipients: Array<{ emailAddress: { address: string; name: string } }>;
  body: { content: string; contentType: string };
  receivedDateTime: string;
  hasAttachments: boolean;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  webLink?: string;
}

export async function fetchInboxMessages(top: number = 100): Promise<GraphMessage[]> {
  const token = await getAccessToken();
  const messages: GraphMessage[] = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${Math.min(top, 50)}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,toRecipients,ccRecipients,body,receivedDateTime,hasAttachments,internetMessageHeaders,webLink`;

  while (url && messages.length < top) {
    try {
      const res: any = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      messages.push(...(res.data.value || []));
      url = res.data['@odata.nextLink'] || null;
    } catch (error: any) {
      throw wrapGraphError(error, 'fetchInboxMessages');
    }
  }

  return messages.slice(0, top);
}

// Fetch messages from a well-known mail folder (e.g. 'deleteditems', 'junkemail').
// Used by the Missed Opportunities deleted-email recovery path.
export async function fetchFolderMessages(folder: string, top: number = 100): Promise<GraphMessage[]> {
  const token = await getAccessToken();
  const messages: GraphMessage[] = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?$top=${Math.min(top, 50)}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,toRecipients,ccRecipients,body,receivedDateTime,hasAttachments,internetMessageHeaders,webLink`;

  while (url && messages.length < top) {
    const res: any = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    messages.push(...(res.data.value || []));
    url = res.data['@odata.nextLink'] || null;
  }
  return messages.slice(0, top);
}

// Destination folder for AUTOMATION-classified mail. Ali's preference: "_Automation"
// (leading underscore keeps it at the top of the folder list alphabetically).
// Older deployments used "Archive". The folder name is configurable via env so it
// can be migrated without code change in the future.
const AUTOMATION_FOLDER = process.env.INBOX_COS_ARCHIVE_FOLDER || '_Automation';

/** Raised when the stored refresh token has not been consented for Mail.Send. */
export class MailSendConsentError extends Error {
  readonly error_class = 'MailSendConsentRequired';
  constructor(detail: string) {
    super(
      'Hotmail sending is not authorized: the stored refresh token was never consented for Mail.Send. '
      + 'Re-authorize the app with the Mail.Send scope and replace MS_GRAPH_REFRESH_TOKEN. '
      + `AAD said: ${detail}`,
    );
  }
}

/**
 * Access token for SENDING. Requested separately from the read token because the
 * send scope may not be consented — and an unconsented scope fails the entire
 * token request (AADSTS70000) rather than returning a reduced token. Keeping
 * this isolated means a missing Mail.Send consent cannot break inbox sync or
 * auto-archive, which share the read token.
 *
 * Not cached: it is requested only on an actual send, and caching a token whose
 * consent state we expect to change would just delay picking up the fix.
 */
async function getSendAccessToken(): Promise<string> {
  const refreshToken = (await getRefreshToken())!;
  try {
    const res = await axios.post(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: process.env.MS_GRAPH_CLIENT_ID!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: SEND_SCOPE,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 },
    );
    // The send refresh rotates too — persist it, or a send would silently undo
    // the read path's bookkeeping by leaving a newer token unrecorded.
    if (res.data.refresh_token && res.data.refresh_token !== refreshToken) {
      await saveRotatedToken(res.data.refresh_token);
    }
    return res.data.access_token;
  } catch (error: any) {
    const { message } = extractGraphErrorDetail(error);
    // AADSTS70000 is the specific "scope was never granted" case. Naming it
    // beats a generic auth failure, because the fix is a one-time human
    // re-consent, not a code change or a token refresh.
    if (/AADSTS70000|unauthorized or expired/i.test(message)) {
      throw new MailSendConsentError(message);
    }
    throw wrapGraphError(error, 'Send token refresh');
  }
}

/**
 * Reply to a message in place, preserving the Graph thread.
 * Mirrors msGraphService's `/me/messages/{id}/reply` call so behaviour is
 * identical whichever client is configured.
 */
export async function replyToMessage(messageId: string, comment: string): Promise<void> {
  const token = await getSendAccessToken();
  try {
    await axios.post(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}/reply`,
      { comment },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 30000 },
    );
  } catch (error: any) {
    throw wrapGraphError(error, `Reply to message ${messageId}`);
  }
}

export async function archiveMessage(messageId: string): Promise<void> {
  const token = await getAccessToken();

  // Move to the configured AUTOMATION folder (create it if it doesn't exist).
  try {
    const foldersRes = await axios.get(
      `https://graph.microsoft.com/v1.0/me/mailFolders?$filter=displayName eq '${AUTOMATION_FOLDER}'`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    let archiveFolderId = foldersRes.data.value?.[0]?.id;

    if (!archiveFolderId) {
      const createRes = await axios.post(
        'https://graph.microsoft.com/v1.0/me/mailFolders',
        { displayName: AUTOMATION_FOLDER },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      archiveFolderId = createRes.data.id;
    }

    await axios.post(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}/move`,
      { destinationId: archiveFolderId },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Archive failed for ${messageId}: ${err.response?.data?.error?.message || err.message}`);
    throw err;
  }
}
