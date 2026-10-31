import { env } from '../../config/env';

/**
 * Is this a test fixture rather than a person?
 *
 * WHY THIS EXISTS. The end-to-end suite creates real `free_signup` leads in PRODUCTION, with
 * addresses like `e2e-points-1792589402578@colaberry-test.local`. On 2026-10-23 the GHL backfill
 * pushed one of them into the live School of Data and AI account before anybody noticed, and it
 * had to be deleted from a customer-facing CRM by hand. It was caught only because that run was
 * deliberately batched five at a time; a single unbatched run would have put three in.
 *
 * The live sync has the same hole. Every e2e run creates a lead, and from the moment the sync
 * fires on arrival that lead becomes a contact somebody on the admissions team may try to call.
 * So this is a guard on the SYNC, not a filter in a script.
 *
 * WHY NOT THE EXISTING TEST MODE. `getTestOverrides()` is a global switch that rewrites every
 * recipient; it answers "is the whole system in test mode", not "is this one row a fixture". The
 * two are different questions and a production system is, correctly, not in test mode while the
 * e2e suite runs against it.
 *
 * THE DOMAIN COMES FROM CONFIG. `CAMPAIGN_TEST_EMAIL_DOMAIN` already exists and already defaults
 * to `@colaberry-test.local`; it was declared and never read. Reading it here keeps one source of
 * truth, so changing the fixture domain does not need this file edited too.
 */

/** Local parts the e2e fixtures use. Prefixes, because each appends a timestamp. */
const FIXTURE_PREFIXES = ['e2e-', 'e2e_', 'test-fixture-'];

/**
 * True when an address belongs to a test fixture rather than a person.
 *
 * Deliberately NARROW. A false positive silently withholds a real person from the CRM, which is
 * the same class of harm as the bug being fixed, so this matches the two conventions actually in
 * use and nothing that merely looks testish. An address containing the word "test" is not
 * matched: real people have addresses like `testaccount@gmail.com` and `protester@example.org`.
 */
export function isSyntheticContactEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const address = email.trim().toLowerCase();
  if (address === '') return false;

  const domain = testDomain();
  if (domain && address.endsWith(domain)) return true;

  const localPart = address.split('@')[0] ?? '';
  return FIXTURE_PREFIXES.some((prefix) => localPart.startsWith(prefix));
}

function testDomain(): string {
  return String(env.campaignTestEmailDomain || '@colaberry-test.local').toLowerCase();
}

/** A LIKE pattern literal: `%` and `_` in the value are escaped, quotes doubled, then `suffix` / `prefix` wildcards added. */
function likeLiteral(value: string, wildcard: 'leading' | 'trailing'): string {
  const escaped = value.replace(/[\\%_]/g, (m) => `\\${m}`).replace(/'/g, "''");
  return wildcard === 'leading' ? `'%${escaped}'` : `'${escaped}%'`;
}

/**
 * The same test as `isSyntheticContactEmail`, as a SQL boolean over `column`. C96 (2026-10-31).
 *
 * WHY. The daily points smoke test signs up a real Explorer in production (`e2e-points-…@colaberry-test.local`),
 * and SQL rosters that count Explorers straight off `enrollments` counted every one of them. Callers write
 * `AND NOT ${syntheticEmailSql('e.email')}`, so the rule lives here once instead of as a hand-copied LIKE per query.
 *
 * NULL-SAFE ON PURPOSE. `NOT (NULL LIKE …)` is NULL, which a WHERE treats as false, so a bare predicate would
 * silently drop every row with no email. `coalesce` makes a missing email "not synthetic", the same answer the
 * TS function gives.
 *
 * `column` is code, never input: it is checked against an identifier shape and refused otherwise.
 */
export function syntheticEmailSql(column: string): string {
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(column)) {
    throw new Error(`syntheticEmailSql: not a column reference: ${column}`);
  }
  const address = `lower(trim(coalesce(${column}, '')))`;
  const localPart = `split_part(${address}, '@', 1)`;
  const clauses = [
    ...(testDomain() ? [`${address} LIKE ${likeLiteral(testDomain(), 'leading')}`] : []),
    ...FIXTURE_PREFIXES.map((p) => `${localPart} LIKE ${likeLiteral(p, 'trailing')}`),
  ];
  return `(${clauses.join(' OR ')})`;
}
