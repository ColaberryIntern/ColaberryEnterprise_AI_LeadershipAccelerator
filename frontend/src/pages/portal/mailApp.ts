/**
 * Which webmail to offer after a sign-in link is requested.
 *
 * Aleem's design, 5 November 2026: once the link is on its way, the next thing a learner
 * has to do is open their inbox, so the screen offers that as a button rather than
 * leaving them to find it. Taken from his own markup, including the provider list and
 * the Gmail search that pre-filters to our mail.
 *
 * Split out of the page because it is the one piece of real logic on that screen, and a
 * regex list is exactly the thing that is worth testing without rendering anything.
 *
 * KNOWN vs FALLBACK is a deliberate distinction rather than a default. For a provider we
 * recognise, one primary button goes straight to that inbox. For anything else, including
 * a company address on its own domain, there is no inbox URL to guess, so the page offers
 * Gmail and Outlook as two secondary choices instead of inventing a link that would open
 * the wrong place.
 */
export interface MailApp {
  /** What the button says: "Open Gmail", "Open your mail app". */
  readonly name: string;
  /** Where it goes. Absent for the fallback, which has no single destination. */
  readonly href?: string;
  /** True when we could not place the domain and the two-button fallback should show. */
  readonly fallback?: boolean;
}

/** Pre-filtered to our mail, so a crowded inbox does not hide the link. */
const GMAIL_SEARCH = 'https://mail.google.com/mail/u/0/#search/from%3Acolaberry';

export const GMAIL_HREF = GMAIL_SEARCH;
export const OUTLOOK_HREF = 'https://outlook.live.com/mail/0/';

const PROVIDERS: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/^(gmail|googlemail)\.com$/, 'Gmail', GMAIL_SEARCH],
  [/^(outlook|hotmail|live|msn)\./, 'Outlook', OUTLOOK_HREF],
  [/^(yahoo|ymail|rocketmail)\./, 'Yahoo Mail', 'https://mail.yahoo.com/'],
  [/^(icloud|me|mac)\.com$/, 'iCloud Mail', 'https://www.icloud.com/mail'],
  [/^(proton|protonmail|pm)\./, 'Proton Mail', 'https://mail.proton.me/'],
];

/**
 * Resolve the webmail for an address. Never throws: this runs on a screen the learner
 * has already reached, and a malformed address there is a reason to show the two
 * fallback buttons, not to break the page.
 */
export function mailApp(email: string): MailApp {
  const parts = String(email || '').trim().split('@');
  // BOTH HALVES, not just the domain. "@gmail.com" has a domain this list recognises and
  // no mailbox at all, so matching on the domain alone would offer to open an inbox for
  // an address that cannot exist. Caught by its own test rather than in review.
  if (parts.length !== 2 || !parts[0].trim()) return { name: 'your mail app', fallback: true };
  const domain = parts[1].trim().toLowerCase();
  if (!domain) return { name: 'your mail app', fallback: true };
  for (const [pattern, name, href] of PROVIDERS) {
    if (pattern.test(domain)) return { name, href };
  }
  return { name: 'your mail app', fallback: true };
}
