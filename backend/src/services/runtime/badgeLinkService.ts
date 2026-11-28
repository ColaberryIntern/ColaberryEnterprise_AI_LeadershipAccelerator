/**
 * Claude Academy badge LINKS as completion proof.
 *
 * WHY THIS EXISTS: an uploaded certificate image or PDF can be edited - the
 * recipient name on it is just pixels - and Swati raised that twice. A badge
 * link lives on Anthropic's own domain, so a student cannot forge the page it
 * points at. The link is therefore better evidence than the file, which is the
 * whole point of accepting it.
 *
 * URL SAFETY: this validates an EXACT host rather than blocklisting bad ones.
 * `academy.claude.com` is the only accepted host, so loopback, private ranges,
 * cloud-metadata addresses (169.254.169.254) and every other SSRF target are
 * excluded by construction rather than by a list that has to stay complete.
 * Query strings and fragments are dropped, which also removes the tracking
 * parameters described below.
 *
 * WE DO NOT FETCH THE LINK, and nothing stored or shown claims otherwise:
 * `verification: 'unverified_link'` says so explicitly, following the same
 * convention as claudeStudioService. Whether an Academy badge page can even be
 * read without signing in is not established, so fetching it is a separate
 * change that has to be proven against a real badge first.
 *
 * REAL-WORLD INPUT: badge links reaching us through email are rewritten by the
 * mail client. Links found in this system's own stored mail had been mangled to
 * `academy.claude.com/badges/&source=gmail&ust=...`, with the badge id stripped
 * out entirely. A student who copies the link out of their email will therefore
 * paste something that looks right and identifies no badge. That case gets its
 * own error message telling them where to copy the link from instead, because
 * "invalid link" would send them back to the same email to do the same thing.
 */

/** The only host a badge can live on. Exact match, not a suffix match. */
export const ACADEMY_BADGE_HOST = 'academy.claude.com';

/** Marks stored proof whose destination we have NOT inspected. */
export const UNVERIFIED_LINK = 'unverified_link' as const;

/** Generous enough for a real link, short enough to reject pasted junk. */
const MAX_URL = 2048;

/**
 * Badge id bounds. Anthropic's id format is not documented to us, so these are
 * deliberately loose - they reject empty and obviously-wrong input without
 * pretending to know the exact format.
 */
const MIN_ID = 8;
const MAX_ID = 256;

/** Tracking parameters seen appended to badge links by mail clients. */
const MAIL_TRACKING_KEYS = ['source', 'ust', 'usg', 'utm_source', 'utm_medium', 'utm_campaign'];

const err = (message: string, status = 400) => Object.assign(new Error(message), { status });

/**
 * PURE - validate a pasted Claude Academy badge link and return it normalized
 * (scheme + host + `/badges/<id>`, with any query string and fragment removed).
 * Throws a student-readable 400 otherwise.
 *
 * Never fetches. See the module comment for why.
 */
export function validateAcademyBadgeUrl(raw: string): string {
  const value = String(raw ?? '').trim();
  if (!value) throw err('Paste your badge link to continue.');
  if (value.length > MAX_URL) throw err('That link is too long to be a badge link.');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw err('That is not a valid link. Paste the whole thing, starting with https://');
  }

  if (url.protocol !== 'https:') {
    throw err('A badge link must start with https://');
  }
  if (url.username || url.password) {
    throw err('That link has a username or password in it. Paste the plain badge link instead.');
  }

  if (url.hostname.toLowerCase() !== ACADEMY_BADGE_HOST) {
    throw err(
      `A badge link has to be on ${ACADEMY_BADGE_HOST}. ` +
        'Open your badge on Claude Academy and copy the link from there.'
    );
  }

  // Path must be exactly /badges/<id>, with nothing nested underneath.
  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length !== 2 || segments[0].toLowerCase() !== 'badges') {
    throw err(
      'That is a Claude Academy link but not a badge link. ' +
        'Open the badge itself and copy the link from your browser.'
    );
  }

  const id = decodeURIComponent(segments[1]);

  // The mail-client case: the id is gone and tracking junk took its place.
  if (looksLikeMailTracking(id, url)) {
    throw err(
      'That link came from your email and the badge id was stripped out of it. ' +
        'Open the badge on Claude Academy and copy the link from your browser instead.'
    );
  }

  if (id.length < MIN_ID) throw err('That badge link is missing the badge id.');
  if (id.length > MAX_ID) throw err('That badge link does not look like a real one.');
  if (!/^[A-Za-z0-9._~-]+$/.test(id)) {
    throw err('That badge link has characters in it that a badge id does not use.');
  }

  // Normalized: drops the query string and the fragment, and so drops tracking.
  return `https://${ACADEMY_BADGE_HOST}/badges/${segments[1]}`;
}

/**
 * PURE - true when what sits where the badge id belongs is really a mail
 * client's tracking parameters. Checked before the charset rule so the student
 * gets the message that tells them what to do instead.
 */
function looksLikeMailTracking(id: string, url: URL): boolean {
  if (id.startsWith('&') || id.startsWith('?')) return true;
  const lower = id.toLowerCase();
  if (MAIL_TRACKING_KEYS.some((k) => lower.startsWith(k + '=') || lower.includes('&' + k + '='))) return true;
  // `/badges/?source=gmail` parses as an empty id with a query string.
  if (!id && MAIL_TRACKING_KEYS.some((k) => url.searchParams.has(k))) return true;
  return false;
}
