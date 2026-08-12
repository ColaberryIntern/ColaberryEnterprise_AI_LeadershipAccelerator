/**
 * Microsoft Graph Mail API client for Hotmail (ali_muwwakkil@hotmail.com).
 * Uses OAuth2 public client with refresh token — no client secret needed.
 */
import axios from 'axios';

const LOG_PREFIX = '[InboxCOS][Graph]';

let cachedAccessToken: string | null = null;
let tokenExpiry = 0;

export function isConfigured(): boolean {
  return !!(process.env.MS_GRAPH_CLIENT_ID && process.env.MS_GRAPH_REFRESH_TOKEN);
}

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

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) return cachedAccessToken;

  const clientId = process.env.MS_GRAPH_CLIENT_ID!;
  const refreshToken = process.env.MS_GRAPH_REFRESH_TOKEN!;

  let res;
  try {
    res = await axios.post(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'Mail.Read Mail.ReadWrite offline_access',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
  } catch (error: any) {
    throw wrapGraphError(error, 'Token refresh');
  }

  cachedAccessToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;

  if (res.data.refresh_token && res.data.refresh_token !== refreshToken) {
    console.log(`${LOG_PREFIX} Refresh token rotated — update MS_GRAPH_REFRESH_TOKEN env var`);
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
