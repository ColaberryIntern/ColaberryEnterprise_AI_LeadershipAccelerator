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

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) return cachedAccessToken;

  const clientId = process.env.MS_GRAPH_CLIENT_ID!;
  const refreshToken = process.env.MS_GRAPH_REFRESH_TOKEN!;

  const res = await axios.post(
    'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'Mail.Read Mail.ReadWrite offline_access',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

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
}

export async function fetchInboxMessages(top: number = 100): Promise<GraphMessage[]> {
  const token = await getAccessToken();
  const messages: GraphMessage[] = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${Math.min(top, 50)}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,toRecipients,ccRecipients,body,receivedDateTime,hasAttachments,internetMessageHeaders`;

  while (url && messages.length < top) {
    const res: any = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    messages.push(...(res.data.value || []));
    url = res.data['@odata.nextLink'] || null;
  }

  return messages.slice(0, top);
}

export async function archiveMessage(messageId: string): Promise<void> {
  const token = await getAccessToken();

  // Move to Archive folder (or create it if needed)
  try {
    // Try to find Archive folder
    const foldersRes = await axios.get(
      'https://graph.microsoft.com/v1.0/me/mailFolders?$filter=displayName eq \'Archive\'',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    let archiveFolderId = foldersRes.data.value?.[0]?.id;

    if (!archiveFolderId) {
      // Create Archive folder
      const createRes = await axios.post(
        'https://graph.microsoft.com/v1.0/me/mailFolders',
        { displayName: 'Archive' },
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
