/**
 * C6.4 - map the economic buyer and influencers onto the tier-1 accounts.
 *
 * ## The source data is PERSONAL DATA and this repository is PUBLIC
 *
 * Named people and their verified email addresses never enter this repo. They live in
 * three run files under `tmp/`, which `.gitignore` covers by pattern, and they reach Ali
 * only through the PDFs, which go to Basecamp. `assertSourcesAreNotCommitted()` refuses to
 * build if any source file has become tracked by git, because the cost of getting that
 * wrong is publishing third-party contact data.
 *
 * ## Every figure is MEASURED, and the spend is reconciled
 *
 * The C6.5 audit established that a refused Apollo call returns an empty result that is
 * indistinguishable from a genuine miss. So both runs record the spend counter before and
 * after, and the build fails unless the delta equals the calls made. Without that, a
 * truncated run reads as a list of unreachable accounts.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AS_OF = '18 October 2026';
const ROOT = path.join(__dirname, '..', '..', '..');
const TMP = path.join(ROOT, 'tmp');

const SOURCES = {
  owned: 'c64_owned.json',
  search: 'c64_search.json',
  contacts: 'c64_contacts.json',
};

/**
 * Refuse to read a run file that git is tracking.
 *
 * Checked HERE, before the parse, rather than only in the build entrypoint: this module
 * reads all three files at require time, so a check that ran later would never be reached.
 */
function assertNotTracked(rel) {
  let tracked = '';
  try {
    tracked = execFileSync('git', ['ls-files', '--error-unmatch', rel],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch { tracked = ''; }
  if (tracked) {
    throw new Error(`${rel} is TRACKED BY GIT and holds named contacts and email addresses. `
      + 'This repository is public. Remove it from the index before building.');
  }
}

function load(name) {
  assertNotTracked(`tmp/${SOURCES[name]}`);
  const p = path.join(TMP, SOURCES[name]);
  if (!fs.existsSync(p)) {
    throw new Error(`missing run file ${SOURCES[name]}. These hold personal data and are `
      + 'never committed, so a fresh checkout must re-run the discovery scripts.');
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const OWNED = load('owned');
const SEARCH = load('search');
const CONTACTS = load('contacts');

/* ------------------------------------------------------------------ *
 * WHAT WE ALREADY OWNED, AND WHY IT DID NOT HELP
 * ------------------------------------------------------------------ */

const CE_RE = /continu|professional (education|studies|development)|extended (education|studies|learning)|workforce|lifelong|extension|non.?credit|corporate training/i;
const IT_RE = /chief information|cio\b|chief technology|cto\b|chief information security|ciso|information technolog|\bit\b|digital transformation|technology services/i;

function ownedBreakdown() {
  let ce = 0, itOnly = 0, other = 0, total = 0;
  for (const a of OWNED) {
    total += a.found;
    if (a.people.some((p) => CE_RE.test(p.title || ''))) ce += 1;
    else if (a.found && a.people.every((p) => IT_RE.test(p.title || ''))) itOnly += 1;
    else if (a.found) other += 1;
  }
  return { accounts: OWNED.length, total, ce, itOnly, other };
}

const OWNED_STATS = ownedBreakdown();

/* ------------------------------------------------------------------ *
 * THE MAP
 * ------------------------------------------------------------------ */

/**
 * One row per tier-1 account. PUBLISHED when an exact-match person has an email Apollo
 * returned; FLAGGED otherwise, with the reason. A PROBABLE org match is never published:
 * two of them turned out to be different institutions entirely.
 */
function rows() {
  const byAccount = new Map(CONTACTS.results.map((r) => [r.account, r]));
  return SEARCH.out.map((s) => {
    const enr = byAccount.get(s.account);
    const exact = (s.candidates || []).find((c) => c.cls === 'EXACT');
    const probable = (s.candidates || []).find((c) => c.cls === 'PROBABLE');
    const person = enr && enr.enriched ? enr.enriched : null;

    if (person && person.email) {
      return {
        account: s.account, state: 'PUBLISHED',
        name: person.name, title: person.title, email: person.email,
        emailStatus: person.email_status || '', org: person.org,
        apolloId: person.apollo_id, expectTitle: s.expectTitle,
      };
    }
    /*
     * THREE states, not two. Eleven accounts returned a named person at the right
     * institution in the right role, and no address. That is materially different from
     * finding nobody: the buyer is identified and only the channel is missing. Collapsing
     * the two would understate the result and, worse, would hide eleven usable names.
     */
    if (person && person.name) {
      return {
        account: s.account, state: 'NAMED',
        name: person.name, title: person.title, org: person.org,
        apolloId: person.apollo_id, expectTitle: s.expectTitle,
        reason: 'Apollo holds this person but returned no email address for them.',
      };
    }
    let reason;
    if (!exact && probable) {
      reason = 'no person found at this institution. The closest match was at '
        + `"${probable.org}", a different institution, so it was not used.`;
    } else if (!exact) {
      reason = 'Apollo returned no continuing-education person at this institution.';
    } else if (enr && enr.refused) {
      reason = `the enrichment call was refused by a spend ceiling (${enr.refused}), so this `
        + 'account is unresolved rather than empty.';
    } else {
      reason = 'a person was found in search but the enrichment returned nothing.';
    }
    return {
      account: s.account, state: 'FLAGGED', reason,
      nearMiss: probable ? probable.org : '', expectTitle: s.expectTitle,
      name: exact ? exact.name : '', title: exact ? exact.title : '',
    };
  });
}

const ROWS = rows();
const PUBLISHED = ROWS.filter((r) => r.state === 'PUBLISHED');
const NAMED = ROWS.filter((r) => r.state === 'NAMED');
const FLAGGED = ROWS.filter((r) => r.state === 'FLAGGED');

/* ------------------------------------------------------------------ *
 * SPEND
 * ------------------------------------------------------------------ */

const SPEND = {
  searchBefore: SEARCH.before.count,
  searchAfter: SEARCH.after.count,
  searchCalls: SEARCH.calls,
  enrichBefore: CONTACTS.before.count,
  enrichAfter: CONTACTS.after.count,
  enrichCalls: CONTACTS.calls,
  refused: CONTACTS.refused || 0,
  limit: SEARCH.after.limit,
};

/* ------------------------------------------------------------------ *
 * THE TAKEAWAY
 * ------------------------------------------------------------------ */

function headline() {
  return `Every one of the ${OWNED_STATS.accounts} tier-1 accounts already had a contact in `
    + `the CRM and not one of them was the buyer: ${OWNED_STATS.itOnly} accounts held only `
    + `IT contacts and ${OWNED_STATS.ce} held anyone in continuing education. The buyer is `
    + `now named at ${PUBLISHED.length + NAMED.length} of ${ROWS.length} accounts, `
    + `${PUBLISHED.length} of them with a verified email address, and ${FLAGGED.length} `
    + 'accounts are flagged rather than filled.';
}

const SO_WHAT = [
  'THE CRM LOOKED COVERED AND WAS COVERED IN THE WRONG BUYING CENTER. All '
    + `${OWNED_STATS.accounts} accounts had at least one contact, ${OWNED_STATS.total} in `
    + `total, but ${OWNED_STATS.itOnly} accounts held nothing but CIOs, CISOs and IT `
    + `directors and ${OWNED_STATS.ce} held a single person in continuing education. C2.5 `
    + 'puts the beachhead in the continuing education unit, and C6.3 flagged this account by '
    + 'account in its own notes. A coverage count answered the wrong question.',
  'NOTHING WAS SPENT UNTIL WHAT WE ALREADY OWN HAD BEEN CHECKED. The 2,102 Apollo-sourced '
    + 'leads in the database were searched first, then our saved Apollo contacts through the '
    + 'free account-scoped endpoint. Both came back with no continuing-education contact at '
    + 'any of these institutions, which is what justified spending anything at all.',
  'TWO APPARENT MATCHES WERE DIFFERENT INSTITUTIONS. A first pass matched on shared words '
    + 'after stripping "university", "college" and "state", which reduces "Morgan State '
    + 'University" to "morgan" and would have accepted Morgan Stanley. Tightening it caught '
    + 'Florida College matching Florida Keys Community College, and Piedmont Community '
    + 'College matching Central Piedmont Community College. Both are now flagged, not filled.',
];

const METHOD = [
  ['Free, first', 'Matched all 38 accounts against the 2,102 Apollo-sourced leads already in '
    + 'the database, then queried our saved Apollo contacts through the allowlisted '
    + 'account-scoped endpoint. No credits.'],
  ['Pre-flight', 'Read the spend counter with getApolloUsageToday(), which is free. Per the '
    + 'C6.5 audit the getApolloQuota() function these tickets name would have spent a credit '
    + 'to report only whether Apollo was reachable.'],
  ['Proof before spend', 'Ran one account first to prove the search targets a named '
    + 'institution. It cost one credit and returned exactly the title C6.3 recorded.'],
  ['Search', `One call per account, ${SPEND.searchCalls} in total, inside the 50 per-run `
    + 'ceiling.'],
  ['Enrich', `One call for each exact-match person, ${SPEND.enrichCalls} in total, with phone `
    + 'reveal deliberately off so a lookup costs one credit rather than two.'],
  ['Reconciled', 'The counter was read before and after each run and the delta compared to '
    + 'the calls made, because a refused call returns the same empty result as a genuine miss.'],
];

const LIMITS = [
  'A verified email means Apollo returned it and we recorded it unchanged. It does not mean '
    + 'the person has been contacted, that they still hold the role, or that the address was '
    + 'tested by sending to it. Nothing was sent.',
  'The title set searched for was continuing and professional education, workforce '
    + 'development and extended learning. A buyer who sits outside those titles at a given '
    + 'institution would not have been found.',
  'The first search run was lost when another session deployed and recreated the backend '
    + 'container, so the 38 search calls were paid for twice. The figures here are from the '
    + 'second run; the wasted spend is counted in the total below and not hidden.',
  'Influencers are recorded as the IT contacts we already held. They are a real route into '
    + 'the institution and the wrong first message, which is what C6.3 said about them.',
];

const DECISION = 'Two things need you rather than another query. The accounts where Apollo '
  + 'names the buyer but holds no address: say the word and I will look for them through the '
  + 'free account-scoped endpoint or a different title set. And the three where nothing was '
  + 'found at all: accept them as unreachable for now, or widen the search. Guessing an '
  + 'address at any of them is the one thing this ticket forbids.';

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** The personal-data run files must never be tracked by git. */
function assertSourcesAreNotCommitted() {
  for (const f of Object.values(SOURCES)) assertNotTracked(`tmp/${f}`);
  return Object.keys(SOURCES).length;
}

/** No email was constructed. Every published address came back from Apollo unchanged. */
function assertNoGuessedEmails() {
  const byAccount = new Map(CONTACTS.results.map((r) => [r.account, r]));
  for (const r of PUBLISHED) {
    const raw = byAccount.get(r.account);
    if (!raw || !raw.enriched) throw new Error(`${r.account}: published with no enrich result`);
    if (raw.enriched.email !== r.email) {
      throw new Error(`${r.account}: the published email is not the one Apollo returned`);
    }
    if (!r.apolloId) throw new Error(`${r.account}: published without an Apollo person id`);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) {
      throw new Error(`${r.account}: malformed email`);
    }
  }
  return PUBLISHED.length;
}

/** Every account is either published or flagged with a reason. Nothing is silently empty. */
function assertFlaggedNotFilled() {
  if (PUBLISHED.length + NAMED.length + FLAGGED.length !== ROWS.length) {
    throw new Error('rows are in none of the three states');
  }
  if (ROWS.length !== OWNED_STATS.accounts) {
    throw new Error(`mapped ${ROWS.length} accounts but the tier-1 list has ${OWNED_STATS.accounts}`);
  }
  for (const f of [...FLAGGED, ...NAMED]) {
    if (!f.reason || f.reason.length < 20) throw new Error(`${f.account}: no reason given`);
    if (f.email) throw new Error(`${f.account}: not published but carries an email`);
  }
  for (const n of NAMED) {
    if (!n.name) throw new Error(`${n.account}: marked NAMED with no name`);
  }
  return FLAGGED.length + NAMED.length;
}

/** A near-miss institution is never published as the account's buyer. */
function assertProbableNeverPublished() {
  const probableAccounts = SEARCH.out
    .filter((s) => !(s.candidates || []).some((c) => c.cls === 'EXACT')
      && (s.candidates || []).some((c) => c.cls === 'PROBABLE'))
    .map((s) => s.account);
  for (const a of probableAccounts) {
    if ([...PUBLISHED, ...NAMED].some((p) => p.account === a)) {
      throw new Error(`${a}: only a different institution matched, but a person was recorded`);
    }
  }
  return probableAccounts.length;
}

/** The spend reconciles: counter delta equals calls made, in both runs. */
function assertSpendReconciles() {
  const sDelta = SPEND.searchAfter - SPEND.searchBefore;
  if (sDelta !== SPEND.searchCalls) {
    throw new Error(`search spend does not reconcile: delta ${sDelta}, calls ${SPEND.searchCalls}. `
      + 'Some calls were refused and their empty results look like genuine misses.');
  }
  const eDelta = SPEND.enrichAfter - SPEND.enrichBefore;
  if (eDelta !== SPEND.enrichCalls + SPEND.refused) {
    throw new Error(`enrich spend does not reconcile: delta ${eDelta}, calls ${SPEND.enrichCalls}, `
      + `refused ${SPEND.refused}`);
  }
  if (SPEND.enrichAfter > SPEND.limit) throw new Error('the daily ceiling was exceeded');
  return `${SPEND.searchCalls} search + ${SPEND.enrichCalls} enrich`;
}

/** The IT contacts we already held are never described as the economic buyer. */
function assertOwnedNotSoldAsBuyer() {
  const blob = [headline(), ...SO_WHAT, ...LIMITS, DECISION].join(' ').toLowerCase();
  if (/it contacts? (is|are) the (economic )?buyer/.test(blob)) {
    throw new Error('the artifact describes the IT contacts as the buyer');
  }
  if (!/wrong buying cent/.test(blob)) {
    throw new Error('the artifact does not state that the owned contacts are the wrong '
      + 'buying center, which is the finding');
  }
  return true;
}

module.exports = {
  AS_OF, ROWS, PUBLISHED, NAMED, FLAGGED, OWNED_STATS, SPEND, METHOD, SO_WHAT, LIMITS, DECISION,
  headline,
  assertSourcesAreNotCommitted, assertNoGuessedEmails, assertFlaggedNotFilled,
  assertProbableNeverPublished, assertSpendReconciles, assertOwnedNotSoldAsBuyer,
};
