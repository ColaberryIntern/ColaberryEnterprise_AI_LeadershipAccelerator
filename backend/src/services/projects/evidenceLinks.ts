/**
 * evidenceLinks — is a link one that somebody OTHER than its author can open?
 *
 * Pure string rules, and deliberately a module of their own with no imports at
 * all. They used to live in `demoEvidenceService`, which also pulls in the Project
 * and StudentTask models; the moment a second caller needed them
 * (`presentationRecoveryService`, for the recovery link) importing that service
 * dragged the whole ORM graph into a module that only wanted two string checks,
 * and the test suite could not even load. Extracted rather than duplicated:
 * a second copy of this rule is a second place for it to be wrong.
 *
 * `demoEvidenceService` re-exports both functions, so its public surface is
 * unchanged and existing importers keep working.
 */

/** A real http(s) URL, as the WHATWG parser sees it — not a regex guess. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * A link that can only open on the author's own machine or network: localhost,
 * loopback, private and link-local addresses, `.local` names, and single-label
 * hosts (`http://my-laptop:8420`).
 *
 * Evidence is handed in so someone else can open it. One learner's demo narrative
 * was accepted on 2026-09-17 as `http://localhost:8420/command-center/...`, which
 * nobody but him will ever see.
 */
export function isPrivateLink(value: string): boolean {
  let host: string;
  try {
    host = new URL(value.trim()).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host === '0.0.0.0' || /^(fc|fd|fe80)[0-9a-f]*:/.test(host)) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) {
    const a = Number(v4[1]); const b = Number(v4[2]);
    return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  }
  // A public name always has a dot; `http://my-laptop:8420` does not.
  return !host.includes('.') && !host.includes(':');
}

/** What to tell someone whose link only works for them. */
export const PRIVATE_LINK_REASON =
  'That link only opens on your own computer. Upload the file to Google Drive or OneDrive and set sharing to "Anyone with the link can view" (or upload it to YouTube as Unlisted), then paste that link.';
