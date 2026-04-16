/**
 * IMAP-based email sync for accounts that don't use Gmail API.
 * Used for Hotmail/Outlook and any future IMAP accounts.
 */
import { simpleParser, ParsedMail } from 'mailparser';
import * as Imap from 'imap';

const LOG_PREFIX = '[InboxCOS][IMAP]';

export interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

interface ImapEmail {
  provider_message_id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  body_text: string | null;
  body_html: string | null;
  headers: Record<string, string>;
  received_at: Date;
  has_attachments: boolean;
}

export function isHotmailConfigured(): boolean {
  return !!(
    process.env.HOTMAIL_IMAP_USER &&
    process.env.HOTMAIL_IMAP_PASS &&
    process.env.HOTMAIL_IMAP_HOST
  );
}

export function getHotmailConfig(): ImapConfig {
  return {
    user: process.env.HOTMAIL_IMAP_USER || '',
    password: process.env.HOTMAIL_IMAP_PASS || '',
    host: process.env.HOTMAIL_IMAP_HOST || 'outlook.office365.com',
    port: parseInt(process.env.HOTMAIL_IMAP_PORT || '993', 10),
    tls: true,
  };
}

export async function fetchRecentEmails(
  config: ImapConfig,
  sinceDays: number = 1
): Promise<ImapEmail[]> {
  return new Promise((resolve, reject) => {
    const emails: ImapEmail[] = [];

    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 30000,
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err: any, box: any) => {
        if (err) { imap.end(); return reject(err); }

        const since = new Date();
        since.setDate(since.getDate() - sinceDays);
        const sinceStr = since.toISOString().split('T')[0];

        imap.search(['ALL', ['SINCE', sinceStr]], (err: any, results: number[]) => {
          if (err) { imap.end(); return reject(err); }
          if (!results || results.length === 0) {
            imap.end();
            return resolve([]);
          }

          const limited = results.slice(-100);
          let pending = limited.length;

          const fetch = imap.fetch(limited, { bodies: '', struct: true });

          fetch.on('message', (msg: any) => {
            let buffer = '';

            msg.on('body', (stream: any) => {
              stream.on('data', (chunk: Buffer) => { buffer += chunk.toString('utf8'); });
            });

            msg.once('end', async () => {
              try {
                const parsed: ParsedMail = await simpleParser(buffer);
                const fromAddr = parsed.from?.value?.[0];
                const headers: Record<string, string> = {};
                if (parsed.headers) {
                  parsed.headers.forEach((value: any, key: string) => {
                    if (typeof value === 'string') headers[key] = value;
                    else if (value?.text) headers[key] = value.text;
                  });
                }

                emails.push({
                  provider_message_id: parsed.messageId || `imap-${Date.now()}-${Math.random()}`,
                  from_address: fromAddr?.address || '',
                  from_name: fromAddr?.name || null,
                  to_addresses: (parsed.to?.value || []).map((a: any) => a.address),
                  cc_addresses: (parsed.cc?.value || []).map((a: any) => a.address),
                  subject: parsed.subject || '(no subject)',
                  body_text: parsed.text || null,
                  body_html: parsed.html || null,
                  headers,
                  received_at: parsed.date || new Date(),
                  has_attachments: (parsed.attachments?.length || 0) > 0,
                });
              } catch (parseErr: any) {
                console.error(`${LOG_PREFIX} Failed to parse message: ${parseErr.message}`);
              }

              pending--;
              if (pending === 0) {
                imap.end();
              }
            });
          });

          fetch.once('error', (err: any) => {
            console.error(`${LOG_PREFIX} Fetch error: ${err.message}`);
            imap.end();
            reject(err);
          });

          fetch.once('end', () => {
            if (pending === 0) imap.end();
          });
        });
      });
    });

    imap.once('error', (err: any) => {
      console.error(`${LOG_PREFIX} Connection error: ${err.message}`);
      reject(err);
    });

    imap.once('end', () => {
      resolve(emails);
    });

    imap.connect();
  });
}
