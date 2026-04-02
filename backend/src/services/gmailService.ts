/**
 * Gmail API Service — Send and read emails as ali@colaberry.com
 * Uses OAuth2 with refresh token (same credentials as LandJet Growth Engine)
 */
import { google, gmail_v1 } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];

function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth not configured: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN required');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

function getGmailClient(): gmail_v1.Gmail {
  const auth = getOAuth2Client();
  return google.gmail({ version: 'v1', auth });
}

/**
 * Send an email from the authenticated Gmail account.
 */
export async function sendGmail(params: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  body: string;
  inReplyTo?: string; // Message-ID for threading
  threadId?: string;  // Gmail thread ID for threading
}): Promise<{ messageId: string; threadId: string }> {
  const gmail = getGmailClient();

  const toList = Array.isArray(params.to) ? params.to.join(', ') : params.to;
  const ccList = params.cc ? (Array.isArray(params.cc) ? params.cc.join(', ') : params.cc) : '';

  // Build RFC 2822 email
  const headers = [
    `To: ${toList}`,
    ...(ccList ? [`Cc: ${ccList}`] : []),
    `Subject: ${params.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    ...(params.inReplyTo ? [`In-Reply-To: ${params.inReplyTo}`, `References: ${params.inReplyTo}`] : []),
  ];

  const rawEmail = headers.join('\r\n') + '\r\n\r\n' + params.body;
  const encodedMessage = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
      ...(params.threadId ? { threadId: params.threadId } : {}),
    },
  });

  console.log(`[Gmail] Sent email to ${toList} | Subject: ${params.subject} | MessageId: ${res.data.id}`);

  return {
    messageId: res.data.id || '',
    threadId: res.data.threadId || '',
  };
}

/**
 * Search for emails matching a query.
 */
export async function searchGmail(query: string, maxResults = 10): Promise<gmail_v1.Schema$Message[]> {
  const gmail = getGmailClient();

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  const messages: gmail_v1.Schema$Message[] = [];
  for (const msg of listRes.data.messages || []) {
    if (!msg.id) continue;
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });
    messages.push(full.data);
  }

  return messages;
}

/**
 * Get a specific thread by ID.
 */
export async function getThread(threadId: string): Promise<gmail_v1.Schema$Thread> {
  const gmail = getGmailClient();
  const res = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
  });
  return res.data;
}

/**
 * Reply to an existing thread.
 */
export async function replyToThread(params: {
  threadId: string;
  to: string | string[];
  cc?: string | string[];
  subject: string;
  body: string;
}): Promise<{ messageId: string; threadId: string }> {
  // Get the last message in the thread for In-Reply-To header
  const thread = await getThread(params.threadId);
  const lastMessage = thread.messages?.[thread.messages.length - 1];
  const headers = lastMessage?.payload?.headers || [];
  const messageId = headers.find(h => h.name?.toLowerCase() === 'message-id')?.value;

  return sendGmail({
    ...params,
    inReplyTo: messageId || undefined,
    threadId: params.threadId,
  });
}

/**
 * Check if Gmail OAuth is configured and working.
 */
export async function checkGmailHealth(): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const gmail = getGmailClient();
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return { ok: true, email: profile.data.emailAddress || undefined };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
