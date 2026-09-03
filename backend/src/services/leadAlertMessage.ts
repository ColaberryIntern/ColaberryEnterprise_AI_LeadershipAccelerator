/**
 * leadAlertMessage — what a "new lead arrived" alert says, decided without sending it.
 *
 * WHY THIS IS SEPARATE
 *
 * The send itself needs SMTP, settings and a database. The judgements do not: which
 * fields are worth showing, what an empty company should read as, whether a lead with no
 * message is worth mentioning at all. Keeping them here means they are tested the way
 * every other decision in this codebase is tested — as a function call, with no I/O.
 *
 * It also keeps the honest-failure rule enforceable. `decideNotify` returns a reason
 * whenever an alert must not be sent, so the caller can report `ok: false` with that
 * reason instead of logging an intent and claiming success — which is exactly the defect
 * this work exists to fix.
 */

/** Only the lead fields an alert actually uses. */
export interface AlertLead {
  id: number;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  phone?: string | null;
  title?: string | null;
  message?: string | null;
  source?: string | null;
}

export interface AlertMessage {
  subject: string;
  html: string;
  text: string;
}

export interface NotifyDecision {
  send: boolean;
  /** Present whenever `send` is false. Reported to the caller verbatim. */
  reason?: string;
  recipients: string;
}

/** Escape before interpolating anything a stranger typed into an HTML email. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const blank = (v: string | null | undefined): boolean => !v || !String(v).trim();

/** A displayable value, or a stated absence — never an empty cell. */
export function shown(value: string | null | undefined, absent = 'not given'): string {
  return blank(value) ? absent : String(value).trim();
}

/**
 * Decide whether this alert may be sent.
 *
 * Every false carries a reason, because the caller's contract is to report why it did
 * not send rather than to report success.
 */
export function decideNotify(input: {
  transporterConfigured: boolean;
  recipients: string | null | undefined;
  alreadyNotified: boolean;
}): NotifyDecision {
  const recipients = (input.recipients || '').trim();

  // Checked first: with nobody to tell, the other conditions do not matter, and an
  // operator reading "no recipient configured" knows exactly what to fix.
  if (!recipients) {
    return { send: false, reason: 'no_recipient_configured', recipients: '' };
  }
  if (!input.transporterConfigured) {
    return { send: false, reason: 'smtp_not_configured', recipients };
  }
  // One lead, one alert, forever. Not a time window: a lead is ingested once, so a
  // second alert for the same lead is always a duplicate, however long the gap.
  if (input.alreadyNotified) {
    return { send: false, reason: 'already_notified', recipients };
  }
  return { send: true, recipients };
}

/**
 * Build the alert.
 *
 * The lead's own words come first and unedited. The point of this email is to let a
 * human decide whether to pick the phone up, and a summary of someone's problem is worse
 * for that than the sentence they actually wrote.
 */
export function buildLeadAlert(lead: AlertLead, opts: { convertUrl?: string } = {}): AlertMessage {
  const company = shown(lead.company, 'no company given');
  const who = shown(lead.name, 'Someone');
  const subject = `New ${shown(lead.source, 'website')} lead: ${who} — ${company}`;

  const rows: Array<[string, string]> = [
    ['Name', shown(lead.name)],
    ['Company', shown(lead.company)],
    ['Email', shown(lead.email)],
    ['Phone', shown(lead.phone)],
    ['Role', shown(lead.title)],
    ['Source', shown(lead.source)],
    ['Lead ID', String(lead.id)],
  ];

  const rowHtml = rows
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#56524B;">${esc(label)}</td><td style="padding:4px 0;color:#1A1917;">${esc(value)}</td></tr>`)
    .join('');

  const messageHtml = blank(lead.message)
    ? '<p style="color:#56524B;margin:16px 0 0;">They did not write a message.</p>'
    : `<p style="margin:16px 0 4px;color:#56524B;">What they wrote:</p><blockquote style="margin:0;padding:12px 16px;border-left:3px solid #BA430E;background:#F7F6F4;color:#1A1917;">${esc(String(lead.message).trim())}</blockquote>`;

  const convertHtml = opts.convertUrl
    ? `<p style="margin:20px 0 0;"><a href="${esc(opts.convertUrl)}" style="color:#BA430E;">Convert this lead into a client</a></p>`
    : '';

  const html = [
    `<h2 style="font-family:sans-serif;color:#1A1917;margin:0 0 12px;">${esc(subject)}</h2>`,
    `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;">${rowHtml}</table>`,
    messageHtml,
    convertHtml,
  ].join('\n');

  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join('\n');
  const text = [
    subject,
    '',
    textRows,
    '',
    blank(lead.message) ? 'They did not write a message.' : `What they wrote:\n${String(lead.message).trim()}`,
    opts.convertUrl ? `\nConvert: ${opts.convertUrl}` : '',
  ].join('\n').trim();

  return { subject, html, text };
}
