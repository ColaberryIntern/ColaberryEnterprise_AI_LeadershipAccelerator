/**
 * R23 Phase 4 — which enterprise intake rows cannot be trusted as real inquiries.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────
 *
 * Phase 3 shipped the write path, and within hours of the deploy `enterprise_intakes` held
 * its first row: "Acme Test Logistics", blank service field, status `interviewed`, created
 * 2026-11-21 15:40Z. The stream correctly flipped from `measured_zero` to `live`, which means
 * a row somebody typed to check the form now counts as a real enterprise inquiry in a funnel
 * on a board Ram reads.
 *
 * The government stream solved this a week earlier. `govBidFlow.suspectReasons()` derives
 * flags from the row itself, emits a `bid_suspect` event for each, and the pricing panel shows
 * them so a person deciding what to price can see which rows NOT to price. This is that, for
 * the enterprise stream, with the signals this table actually has.
 *
 * ── FLAG, NEVER FILTER ───────────────────────────────────────────────────────────────────
 *
 * Nothing here removes a row from a count. That is deliberate and it is the whole design.
 *
 * A heuristic that deleted rows would eventually delete a real one: there are real companies
 * with "Test" in the name, and a prospect emailing from a personal address we happen to
 * recognize is still a prospect. A flag is reversible by reading it; a row silently missing
 * from a funnel is not even noticeable. So the funnel still counts every intake, and the
 * flagged total is reported BESIDE it, exactly as `plan_unattributed` reports the plan gap
 * beside the plans in the same module.
 *
 * The money is protected by a different mechanism and always was: the headline sums only
 * deals a named person has priced, and the pricing form now shows the flags before the save.
 * A test row reaches a dollar total only if somebody reads "looks like a test row" and prices
 * it anyway.
 *
 * ── EVERY FLAG IS A FACT ABOUT THE ROW, NEVER A JUDGMENT ABOUT THE PROSPECT ──────────────
 *
 * "Their process description is vague" is a judgment and has no place here. "The contact email
 * is at colaberry.com" is a fact, and it means we filled in our own form. The distinction is
 * what makes these flags safe to show next to somebody else's deal.
 */

/**
 * The fields a flag can be derived from.
 *
 * Structural rather than the full `IntakeRow`, so the function is callable with three strings
 * and testable without constructing a row of twelve date columns. `IntakeRow` satisfies it.
 */
export interface SuspectRow {
  company: string | null;
  full_name: string | null;
  email: string | null;
}

/**
 * Words that appear in a row somebody typed to check the form, and essentially never in a
 * real company or person's name.
 *
 * Anchored on word boundaries both sides, which is doing real work: without the trailing
 * boundary "demo" would flag "Demolition Services" and without the leading one "test" would
 * flag "Latest Logistics". Both are plausible real names.
 *
 * Kept deliberately short. "Acme" was considered and rejected: Acme Brick and Acme Markets
 * are real companies with real revenue, and a false flag beside a real deal costs more trust
 * than it saves. Our own test rows are caught by the internal-domain check regardless of what
 * name gets typed into them, which is the more reliable signal anyway.
 */
const PLACEHOLDER = /\b(tests?|testing|demo|sample|example|dummy|placeholder|asdf|qwerty)\b/i;

/**
 * Domains that are us. An enterprise inquiry from inside the company is a test or a demo.
 *
 * Subdomains included, because a staff address on a subdomain is still a staff address.
 */
const INTERNAL_DOMAINS = [
  'colaberry.com',
  'colaberry.ai',
  'refactored.ai',
];

/**
 * Throwaway mailbox providers, plus the TLDs that are reserved and can never resolve.
 *
 * `.test`, `.example` and `.invalid` are reserved by RFC 2606, `.localhost` by RFC 6761, and
 * `.local` by RFC 6762, specifically so none of them can be registered. An address there is
 * not merely suspicious, it is structurally incapable of belonging to a real company, which
 * makes it the one check here with no false-positive case at all.
 */
const THROWAWAY_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'mailinator.com',
  'yopmail.com',
  'guerrillamail.com',
  'sharklasers.com',
  'trashmail.com',
  '10minutemail.com',
];
const RESERVED_TLDS = ['.test', '.example', '.invalid', '.localhost', '.local'];

/** The domain of an address, lowercased, or '' when there isn't one. */
function domainOf(email: string | null): string {
  const e = (email ?? '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  return at < 0 ? '' : e.slice(at + 1);
}

/** The part before the '@', which is where a person types "test" when checking a form. */
function localPartOf(email: string | null): string {
  const e = (email ?? '').trim();
  const at = e.lastIndexOf('@');
  return at < 0 ? e : e.slice(0, at);
}

function matchesDomain(domain: string, list: string[]): boolean {
  return list.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * How many intakes carry each company name, so a duplicate is flagged on BOTH rows.
 *
 * Blank names are excluded rather than counted. Three rows with no company are not three
 * duplicates of each other; they are three rows with a different problem, which gets its own
 * flag. Counting them here would put two flags on every unnamed row and make the duplicate
 * flag meaningless.
 */
export function countCompanies(rows: SuspectRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const name = (r.company ?? '').trim().toLowerCase();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * Every reason this row should not be treated as a real enterprise inquiry.
 *
 * Empty array means nothing is wrong with the row, which is the common case and must stay
 * cheap: a clean row produces no flag, no event and no caveat.
 *
 * Ordered strongest signal first, because the panel shows them joined on one line and the
 * first few words are what a person scanning actually reads.
 */
export function suspectReasons(row: SuspectRow, companyCounts: Map<string, number>): string[] {
  const out: string[] = [];

  const company = (row.company ?? '').trim();
  const fullName = (row.full_name ?? '').trim();
  const email = (row.email ?? '').trim();
  const domain = domainOf(email);

  // One flag naming the fields that tripped, rather than one flag per field. Three separate
  // "looks like a test row" lines on the same row is more words for the same fact.
  const hits: string[] = [];
  if (PLACEHOLDER.test(company)) hits.push('company name');
  if (PLACEHOLDER.test(fullName)) hits.push('contact name');
  if (PLACEHOLDER.test(localPartOf(email))) hits.push('contact email');
  if (hits.length > 0) out.push(`looks like a test row (${hits.join(', ')})`);

  if (domain && matchesDomain(domain, INTERNAL_DOMAINS)) {
    out.push('the contact email is one of our own domains, so this is us and not a prospect');
  }

  if (domain
    && (matchesDomain(domain, THROWAWAY_DOMAINS)
      || RESERVED_TLDS.some((t) => domain === t.slice(1) || domain.endsWith(t)))) {
    out.push('the contact email is at a throwaway or reserved domain');
  }

  // The enterprise equivalent of the government stream's "no delivery project": a row a
  // reader cannot tell apart from another row is a row they cannot safely price.
  if (!company) out.push('no company name recorded, so the deal cannot be named or priced');

  // The intake column is NOT NULL but defaults are not validation, and an inquiry with no
  // address cannot be answered, so it cannot become a deal.
  if (!email) out.push('no contact email recorded, so the inquiry cannot be answered');

  if (company && (companyCounts.get(company.toLowerCase()) ?? 0) > 1) {
    out.push('duplicate company name');
  }

  return out;
}
