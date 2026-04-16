/**
 * Microsoft Graph API client for Hotmail inbox (ali_muwwakkil@hotmail.com).
 * Uses MSAL ConfidentialClientApplication for token management.
 */
let Client: any;
let ConfidentialClientApplication: any;
let _moduleAvailable = false;

try {
  Client = require('@microsoft/microsoft-graph-client').Client;
  ConfidentialClientApplication = require('@azure/msal-node').ConfidentialClientApplication;
  _moduleAvailable = true;
} catch {
  // MS Graph packages not installed — Hotmail sync will be skipped gracefully
}

const LOG_PREFIX = '[InboxCOS][MSGraph]';

export interface GraphMessage {
  id: string;
  conversationId: string;
  from: { emailAddress: { address: string; name: string } };
  toRecipients: any[];
  ccRecipients: any[];
  subject: string;
  body: { content: string; contentType: string };
  receivedDateTime: string;
  hasAttachments: boolean;
  internetMessageHeaders: any[];
}

// ─── Configuration Check ────────────────────────────────────────────────────

const CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET;
const TENANT_ID = process.env.MS_GRAPH_TENANT_ID;
const REFRESH_TOKEN = process.env.MS_GRAPH_REFRESH_TOKEN;

/**
 * Returns true if all required MS Graph env vars are present.
 * Services should check this before calling any Graph methods.
 */
export function isConfigured(): boolean {
  return _moduleAvailable && !!(CLIENT_ID && CLIENT_SECRET && TENANT_ID && REFRESH_TOKEN);
}

// ─── MSAL Token Management ─────────────────────────────────────────────────

let msalApp: ConfidentialClientApplication | null = null;

function getMsalApp(): ConfidentialClientApplication {
  if (msalApp) return msalApp;

  if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID) {
    throw new Error('MS Graph OAuth not configured: MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, MS_GRAPH_TENANT_ID required');
  }

  msalApp = new ConfidentialClientApplication({
    auth: {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    },
  });

  return msalApp;
}

/**
 * Acquires an access token using the refresh token flow.
 * Falls back to silent acquisition from cache when possible.
 */
async function getAccessToken(): Promise<string> {
  if (!REFRESH_TOKEN) {
    throw new Error('MS_GRAPH_REFRESH_TOKEN not configured');
  }

  const app = getMsalApp();

  try {
    // Try silent acquisition from cache first
    const accounts = await app.getTokenCache().getAllAccounts();
    if (accounts.length > 0) {
      const silentResult = await app.acquireTokenSilent({
        scopes: ['https://graph.microsoft.com/.default'],
        account: accounts[0],
      });
      if (silentResult?.accessToken) {
        return silentResult.accessToken;
      }
    }
  } catch {
    // Silent acquisition failed, proceed with refresh token
  }

  // Acquire using refresh token
  const result = await app.acquireTokenByRefreshToken({
    refreshToken: REFRESH_TOKEN,
    scopes: ['https://graph.microsoft.com/.default'],
  });

  if (!result?.accessToken) {
    throw new Error('Failed to acquire access token from MS Graph');
  }

  return result.accessToken;
}

// ─── Graph Client ───────────────────────────────────────────────────────────

/**
 * Creates an authenticated Microsoft Graph client.
 */
export function getGraphClient(): Client {
  return Client.init({
    authProvider: async (done: any) => {
      try {
        const token = await getAccessToken();
        done(null, token);
      } catch (error: any) {
        console.error(`${LOG_PREFIX} Auth provider error: ${error.message}`);
        done(error, null);
      }
    },
  });
}

// ─── API Methods ────────────────────────────────────────────────────────────

/**
 * Fetches new messages using delta query for incremental sync.
 * Pass the previous deltaLink for incremental updates, or omit for initial sync.
 */
export async function fetchNewMessages(deltaLink?: string): Promise<{
  messages: GraphMessage[];
  nextDeltaLink: string;
}> {
  const client = getGraphClient();
  const messages: GraphMessage[] = [];

  try {
    let url = deltaLink || '/me/mailFolders/inbox/messages/delta?$select=id,conversationId,from,toRecipients,ccRecipients,subject,body,receivedDateTime,hasAttachments,internetMessageHeaders&$top=50';
    let nextDelta = '';

    // Page through all results
    while (url) {
      const response: any = deltaLink && url === deltaLink
        ? await client.api(url).get()
        : await client.api(url).get();

      if (response.value && Array.isArray(response.value)) {
        for (const msg of response.value) {
          // Skip deleted/removed items in delta responses
          if (msg['@removed']) continue;

          messages.push({
            id: msg.id || '',
            conversationId: msg.conversationId || '',
            from: msg.from || { emailAddress: { address: '', name: '' } },
            toRecipients: msg.toRecipients || [],
            ccRecipients: msg.ccRecipients || [],
            subject: msg.subject || '',
            body: msg.body || { content: '', contentType: 'text' },
            receivedDateTime: msg.receivedDateTime || '',
            hasAttachments: msg.hasAttachments || false,
            internetMessageHeaders: msg.internetMessageHeaders || [],
          });
        }
      }

      // Follow @odata.nextLink for pagination, save @odata.deltaLink for next sync
      if (response['@odata.nextLink']) {
        url = response['@odata.nextLink'];
      } else {
        nextDelta = response['@odata.deltaLink'] || '';
        url = '';
      }
    }

    console.log(`${LOG_PREFIX} Fetched ${messages.length} messages via delta query`);
    return { messages, nextDeltaLink: nextDelta };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} fetchNewMessages failed: ${error.message}`);
    throw error;
  }
}

/**
 * Moves a message to the Archive folder.
 */
export async function archiveMessage(messageId: string): Promise<void> {
  const client = getGraphClient();

  try {
    // First, find the Archive folder ID
    const folders = await client.api('/me/mailFolders')
      .filter("displayName eq 'Archive'")
      .get();

    let archiveFolderId: string | null = null;

    if (folders.value && folders.value.length > 0) {
      archiveFolderId = folders.value[0].id;
    } else {
      // Try the well-known archive folder name
      try {
        const archiveFolder = await client.api('/me/mailFolders/archive').get();
        archiveFolderId = archiveFolder.id;
      } catch {
        console.warn(`${LOG_PREFIX} Archive folder not found, creating one`);
        const created = await client.api('/me/mailFolders').post({
          displayName: 'Archive',
        });
        archiveFolderId = created.id;
      }
    }

    if (!archiveFolderId) {
      throw new Error('Could not resolve Archive folder ID');
    }

    await client.api(`/me/messages/${messageId}/move`).post({
      destinationId: archiveFolderId,
    });

    console.log(`${LOG_PREFIX} Archived message ${messageId}`);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} archiveMessage failed for ${messageId}: ${error.message}`);
    throw error;
  }
}

/**
 * Fetches all messages in a conversation.
 */
export async function getThread(conversationId: string): Promise<GraphMessage[]> {
  const client = getGraphClient();

  try {
    const response = await client.api('/me/messages')
      .filter(`conversationId eq '${conversationId}'`)
      .select('id,conversationId,from,toRecipients,ccRecipients,subject,body,receivedDateTime,hasAttachments,internetMessageHeaders')
      .orderby('receivedDateTime asc')
      .top(50)
      .get();

    const messages: GraphMessage[] = (response.value || []).map((msg: any) => ({
      id: msg.id || '',
      conversationId: msg.conversationId || '',
      from: msg.from || { emailAddress: { address: '', name: '' } },
      toRecipients: msg.toRecipients || [],
      ccRecipients: msg.ccRecipients || [],
      subject: msg.subject || '',
      body: msg.body || { content: '', contentType: 'text' },
      receivedDateTime: msg.receivedDateTime || '',
      hasAttachments: msg.hasAttachments || false,
      internetMessageHeaders: msg.internetMessageHeaders || [],
    }));

    console.log(`${LOG_PREFIX} Fetched ${messages.length} messages for conversation ${conversationId}`);
    return messages;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} getThread failed for ${conversationId}: ${error.message}`);
    throw error;
  }
}
