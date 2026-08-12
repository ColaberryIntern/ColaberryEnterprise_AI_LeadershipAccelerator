// anthropicReplyWatch.js
//
// Decides whether Anthropic has replied. This is the brake on the whole
// campaign, so it is written to be wrong in the safe direction: when in doubt,
// report a reply and stop sending. A false positive costs one missed follow-up
// that a human can restart. A false negative emails a partner who already
// answered us, which is the single worst outcome this system can produce.
//
// Reads ali@colaberry.com over the Gmail API with the same OAuth credentials
// backend/src/services/gmailService.ts uses (GMAIL_CLIENT_ID / _SECRET /
// _REFRESH_TOKEN). Read only; nothing here sends.
//
// WHAT COUNTS AS A REPLY
// Anthropic mail arrives from two very different places:
//   - Transactional and marketing robots on SUBDOMAINS: invoice+statements@
//     mail.anthropic.com, failed-payments@mail.anthropic.com, no-reply-*@
//     mail.anthropic.com, team@email.anthropic.com. Billing receipts are not a
//     reply to a partnership application.
//   - Humans on the BARE domain: partner-support@anthropic.com, and whoever
//     picks the thread up from there.
// So the rule is: bare anthropic.com counts, subdomains do not, and an explicit
// no-reply local part never counts. Anything unrecognised counts, because the
// safe direction is to stop.
//
// KNOWN GAP (documented, not silently accepted)
// We can only read Ali's mailbox. Ram is copied on every note, so a reply-all
// reaches us. A reply sent ONLY to Ram would not be detected here, which is why
// the sender also supports an explicit --stop and why the daily log line names
// this gap. Ram forwarding one line to Ali is the manual backstop.

const AUTOMATED_SUBDOMAIN = /@(mail|email|e|mailer|notifications)\.anthropic\.com$/i;
const NEVER_A_REPLY_LOCALPART = /^(no-?reply|donotreply|do-not-reply|bounces?|mailer-daemon|postmaster|invoice|failed-payments|statements)\b/i;

function parseSender(fromHeader) {
  const raw = String(fromHeader || '');
  const angled = raw.match(/<([^>]+)>/);
  const address = (angled ? angled[1] : raw).trim().toLowerCase();
  const [localPart = '', domain = ''] = address.split('@');
  return { address, localPart, domain, display: raw };
}

// Substring matching on the domain is how lookalike domains get through:
// "someone@anthropic.com.phishing.io" contains "@anthropic.com". Anchor it.
function isAnthropicDomain(domain) {
  return domain === 'anthropic.com' || domain.endsWith('.anthropic.com');
}

/**
 * Pure classifier, exported so the interesting logic is unit tested without a
 * network call.
 * @returns {{ isReply: boolean, why: string }}
 */
function classifySender(fromHeader) {
  const { address, localPart, domain } = parseSender(fromHeader);

  if (!isAnthropicDomain(domain)) {
    return { isReply: false, why: `not an anthropic.com address (domain "${domain}")` };
  }
  if (NEVER_A_REPLY_LOCALPART.test(localPart)) {
    return { isReply: false, why: `no-reply style local part "${localPart}"` };
  }
  // Only the subdomains we have actually seen robots on are discounted. An
  // unrecognised subdomain still counts as a reply: a human writing from
  // partners.anthropic.com must stop the campaign, and the cost of being wrong
  // that way is one skipped note rather than mail to someone who answered us.
  if (AUTOMATED_SUBDOMAIN.test(address)) {
    return { isReply: false, why: 'known automated subdomain (billing / marketing)' };
  }
  return { isReply: true, why: `human address at anthropic.com (${address})` };
}

function headerValue(message, name) {
  const headers = (message.payload && message.payload.headers) || [];
  const hit = headers.find((h) => String(h.name || '').toLowerCase() === name.toLowerCase());
  return hit ? hit.value : '';
}

function getGmailClient() {
  const { google } = require('googleapis');
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    const e = new Error('Gmail OAuth not configured: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN required');
    e.error_class = 'AuthError';
    throw e;
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth });
}

/**
 * Look for a human reply from Anthropic since the campaign began.
 *
 * @param {object} opts
 * @param {string} opts.since        'YYYY/MM/DD', the Gmail after: bound
 * @param {number} [opts.maxResults] cap on messages inspected
 * @param {function} [opts.log]
 * @param {object} [opts.gmail]      injectable client for tests
 * @returns {Promise<{found:boolean, from?:string, subject?:string, date?:string, snippet?:string, why:string, checked:number}>}
 */
async function detectReply({ since, maxResults = 25, log = () => {}, gmail: injected = null } = {}) {
  const gmail = injected || getGmailClient();
  const query = `from:anthropic.com after:${since} in:anywhere`;
  log(`reply check: ${query}`);

  const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
  const ids = (listRes.data.messages || []).map((m) => m.id).filter(Boolean);
  log(`reply check: ${ids.length} candidate message(s) from anthropic.com`);

  for (const id of ids) {
    const full = await gmail.users.messages.get({
      userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'],
    });
    const from = headerValue(full.data, 'From');
    const verdict = classifySender(from);
    log(`  ${from} -> ${verdict.isReply ? 'REPLY' : 'ignored'} (${verdict.why})`);
    if (verdict.isReply) {
      return {
        found: true,
        from,
        subject: headerValue(full.data, 'Subject'),
        date: headerValue(full.data, 'Date'),
        snippet: full.data.snippet || '',
        why: verdict.why,
        checked: ids.length,
      };
    }
  }

  return { found: false, why: 'no human anthropic.com sender since campaign start', checked: ids.length };
}

/**
 * Wrapper used by the cron path. A reply check that ERRORS must not be read as
 * "no reply" and must not authorise a send: an expired refresh token would
 * otherwise silently uncap the campaign. Errors surface as blocking.
 */
async function detectReplyOrBlock(opts) {
  try {
    return await detectReply(opts);
  } catch (e) {
    return {
      found: true,               // treated as a halt for this run
      blocking: true,            // but NOT terminal; a human clears it
      why: `reply check failed (${e.error_class || 'Error'}: ${e.message}). Refusing to send on an unverified inbox.`,
      error: e,
      checked: 0,
    };
  }
}

module.exports = { classifySender, parseSender, detectReply, detectReplyOrBlock, headerValue };
