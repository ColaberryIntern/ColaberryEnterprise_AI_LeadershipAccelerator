/**
 * Is this address one that can never reach a real person?
 *
 * ── WHY THIS IS A DOMAIN RULE AND NOT A NAME MATCH ──────────────────────────
 *
 * Maya's in-app welcome greeted a synthetic account by name once a day. Measured in
 * production on 2026-11-12: `maya_welcome_ledger` held 13 rows and three of them were for
 * "Points Smoke", a fixture an end-to-end job creates every day at 13:30 UTC. The composed
 * body read "Welcome to Colaberry, Points."
 *
 * The tempting fix is to skip enrollments called "Points Smoke". That fixes one fixture and
 * nothing else: the next probe gets a different name and is greeted again. So the rule is
 * positive and structural instead. These addresses sit in namespaces the IETF reserves
 * precisely so they can never resolve, which means no deliverable mail and no real person:
 *
 *   .local                      RFC 6762 §3, reserved for link-local mDNS
 *   .test, .invalid, .example   RFC 2606 §2, reserved for testing and documentation
 *   example.com/.net/.org       RFC 2606 §3, reserved second-level names
 *
 * ── WHAT IT MATCHES IN PRODUCTION, MEASURED RATHER THAN ASSUMED ─────────────
 *
 * 135 enrollment rows across 4 domains: `colaberry-test.local` (118),
 * `northwind-demo.example` (8), `colaberry.test` (6) and `example.com`. Every one is a
 * fixture: "Points Smoke" (93), "C107 Probe" through "C115 Probe", "E2E Prospect (Claude)",
 * "Close Check", and a demo persona. **Zero real people.**
 *
 * ── WHAT IT DELIBERATELY DOES NOT MATCH ─────────────────────────────────────
 *
 * The substring "test" anywhere in the address. 84 explorer enrollments contain it and most
 * are real people whose names or mailboxes happen to include those four letters. Matching it
 * would silence Maya for real prospects, which is a worse failure than greeting a fixture.
 * Only the reserved TLD and the reserved second-level names count.
 *
 * It also says nothing about consent, suppression or whether a person *should* be contacted.
 * This answers one narrow question: could this address reach anybody at all.
 */

/** TLDs that cannot resolve on the public internet. Compared case-insensitively. */
const RESERVED_TLDS = ['local', 'test', 'invalid', 'example'] as const;

/** Second-level names RFC 2606 reserves for documentation. */
const RESERVED_SECOND_LEVEL = ['example.com', 'example.net', 'example.org'] as const;

/**
 * True when the address is in a reserved, non-routable namespace.
 *
 * Returns **false** for a blank or malformed address rather than true. "Not routable" is a
 * claim about a real namespace; a missing address is a different problem, and reporting it as
 * non-routable here would let a caller treat "we have no address" as "this is a test
 * account" and silently skip a real person.
 */
export function isNonRoutableAddress(email: string | null | undefined): boolean {
  const addr = String(email ?? '').trim().toLowerCase();
  const at = addr.lastIndexOf('@');
  // No '@', nothing before it, or nothing after it: malformed, not reserved.
  if (at <= 0 || at === addr.length - 1) return false;

  const domain = addr.slice(at + 1);
  if (domain.includes('@') || domain.startsWith('.') || domain.endsWith('.')) return false;

  if ((RESERVED_SECOND_LEVEL as readonly string[]).includes(domain)) return true;

  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  // A bare hostname with no dot has no TLD to reserve, so it is malformed, not reserved.
  if (!domain.includes('.')) return false;

  return (RESERVED_TLDS as readonly string[]).includes(tld);
}
