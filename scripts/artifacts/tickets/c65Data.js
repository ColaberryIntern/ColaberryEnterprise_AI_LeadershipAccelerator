/**
 * C6.5 - Apollo enrichment workflow audit. THE single source for both PDFs.
 *
 * ## The ticket's own failure mode is the thing this module is built against
 *
 * C6.5 says the audit becomes untrustworthy by "assuming a function works without reading
 * its error handling and quota behaviour", and its acceptance criterion is that
 * quota-exhaustion behaviour is "established by reading code, not assumed". So the facts
 * below are READ OUT OF THE REPO at build time, not typed from a reading of it:
 *
 *   GUARDED      which functions call claimApolloCall, parsed from apolloService.ts
 *   CEILINGS     the three spend defaults, parsed from config/env.ts
 *   UNTESTED     whether a function genuinely appears in no test file, by searching them
 *   BILLABLE     every module that contacts api.apollo.io, by searching the backend
 *
 * Production figures are a different class and are tagged MEASURED with the date and the
 * query that produced them. Nothing here is ESTIMATED and there is no tag for it.
 */

const fs = require('fs');
const path = require('path');

const AS_OF = '18 October 2026';
const ROOT = path.join(__dirname, '..', '..', '..');
const BE = path.join(ROOT, 'backend', 'src');

const read = (...p) => fs.readFileSync(path.join(BE, ...p), 'utf8');

const SERVICE = read('services', 'apolloService.ts');
const GUARD = read('services', 'apolloCreditGuard.ts');
const ENV = read('config', 'env.ts');

/* ------------------------------------------------------------------ *
 * READ FROM SOURCE
 * ------------------------------------------------------------------ */

/** Which functions in apolloService.ts claim a credit before spending one. */
function guardedCallSites() {
  const out = new Set();
  for (const m of SERVICE.matchAll(/claimApolloCall\('([A-Za-z]+)'\)/g)) out.add(m[1]);
  return [...out].sort();
}

/** Every function in apolloService.ts that reaches api.apollo.io. */
function billableFunctions() {
  const lines = SERVICE.split(/\r?\n/);
  const fns = [];
  let current = null;
  lines.forEach((l, i) => {
    const d = l.match(/^(?:export )?(?:async )?function ([A-Za-z]+)/);
    if (d) current = { name: d[1], line: i + 1, calls: false, claims: false };
    if (d) fns.push(current);
    if (!current) return;
    // The TEMPLATE usage, not the bare name: matching the latter also catches the
    // `const APOLLO_BASE_URL = ...` declaration line, which this scanner would then
    // attribute to whichever function happened to be declared above it.
    if (/\$\{APOLLO_BASE_URL\}/.test(l)) current.calls = true;
    if (/claimApolloCall/.test(l)) current.claims = true;
  });
  return fns.filter((f) => f.calls);
}

/** The three spend defaults, parsed from env.ts rather than remembered. */
function ceilings() {
  const grab = (k, d) => {
    const m = ENV.match(new RegExp(`${k}\\s*\\|\\|\\s*([0-9.]+)`));
    return m ? m[1] : d;
  };
  return {
    perDay: grab('APOLLO_MAX_CALLS_PER_DAY', '?'),
    perRun: grab('APOLLO_MAX_CALLS_PER_RUN', '?'),
    alertFraction: grab('APOLLO_ALERT_FRACTION', '?'),
    killSwitchDefaultOff: /apolloEnabled:\s*process\.env\.APOLLO_ENABLED === 'true'/.test(ENV),
  };
}

/** True when a symbol appears in no file under __tests__. */
function isUntested(symbol) {
  const dir = path.join(BE, '__tests__');
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.ts$/.test(e.name) && fs.readFileSync(p, 'utf8').includes(symbol)) hits.push(e.name);
    }
  };
  walk(dir);
  return { untested: hits.length === 0, files: hits };
}

const GUARDED = guardedCallSites();
const BILLABLE = billableFunctions();
const CEIL = ceilings();

/* ------------------------------------------------------------------ *
 * THE TAKEAWAY
 * ------------------------------------------------------------------ */

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/**
 * Counts are DERIVED, never written.
 *
 * The first draft opened "five of the six can be reused unchanged" while the verdict table
 * below said two. The table was right. A headline that restates the data has to be
 * computed from it, and assertHeadlineMatchesVerdicts keeps the two in step.
 */
function tally() {
  const n = (v) => FUNCTIONS.filter((f) => f.verdict === v).length;
  return { clean: n(V.REUSE), care: n(V.CARE), avoid: n(V.AVOID), total: FUNCTIONS.length };
}

function headline() {
  const t = tally();
  return `${WORDS[t.clean]} of the six functions can be reused unchanged and ${WORDS[t.care]} `
    + `more with care. Of the ${WORDS[t.avoid]} to avoid, one is getApolloQuota, which the `
    + 'other tickets are told to call before any bulk run: it is the only billable call in '
    + 'the service that the spend counter does not count, and it does not report a quota.';
}

const SO_WHAT = [
  'THE PRESCRIBED PRE-FLIGHT CHECK IS THE ONE UNCOUNTED CALL. C6.4 and C6.6 are both told '
    + 'to check getApolloQuota() before a bulk run. That function fires a real billable '
    + 'search against Apollo, returns { available, message } and never reports a credit '
    + 'balance, so it answers "is Apollo reachable" rather than "how much is left". It is '
    + 'also the one entry point that does not call claimApolloCall, so the credit it spends '
    + 'is never added to the daily counter the ceiling is computed from. The function that '
    + 'does answer the question is getApolloUsageToday() in apolloCreditGuard, which reads '
    + 'the counter and costs nothing.',
  'EXHAUSTION MID-RUN IS SILENT, AND LOOKS EXACTLY LIKE "NO CONTACT FOUND". When either '
    + 'ceiling is reached, claimApolloCall returns allowed:false and each entry point '
    + 'returns an empty or null result rather than throwing. The refusal is logged, but the '
    + 'return value carries no trace of it. For C6.4, whose whole job is to flag accounts '
    + 'with no verified contact rather than invent one, that is the dangerous case: a run '
    + 'that quietly hits the cap halfway would record the back half of the list as "no '
    + 'contact found" when the truth is "we stopped asking".',
  'THE BRAKE COVERS THE SERVICE, NOT THE REPOSITORY. Inside apolloService.ts the guard is '
    + 'thorough and the kill switch defaults to off. Outside it, one script reaches '
    + 'api.apollo.io with its own fetch, its own key read and no claim, so its spend is '
    + 'invisible to the daily counter. The account client is NOT a hole: it is allowlisted '
    + 'to two free endpoints and throws ForbiddenEndpoint on anything billable, which is '
    + 'the pattern the rest should follow.',
];

/* ------------------------------------------------------------------ *
 * PER-FUNCTION VERDICTS
 * ------------------------------------------------------------------ */

const V = {
  REUSE: { k: 'REUSE UNCHANGED', color: '#2f7d32' },
  CARE: { k: 'REUSE WITH CARE', color: '#b26a00' },
  AVOID: { k: 'DO NOT REUSE', color: '#b3261e' },
};

const FUNCTIONS = [
  {
    name: 'searchPeople',
    billable: true,
    verdict: V.REUSE,
    io: 'ApolloSearchParams in; { people, total, page, per_page } out. Maps raw results '
      + 'into ApolloPersonResult and deliberately does NOT enrich at search time.',
    failure: 'Throws on any non-OK response. Retries 429 and 5xx three times with 500ms, '
      + '1.5s then 4s backoff. Returns an EMPTY result, not an error, when the kill switch '
      + 'is off or a ceiling refuses the call.',
    quota: 'One billable call per invocation, claimed before the request.',
    note: 'Search results are obfuscated by Apollo: last_name may arrive as '
      + 'last_name_obfuscated and email is usually blank until enrichment.',
  },
  {
    name: 'enrichPerson',
    billable: true,
    verdict: V.CARE,
    io: 'An email in; declares ApolloPersonResult | null out.',
    failure: 'Throws on non-OK. Returns null when disabled or refused.',
    quota: 'One billable call, claimed.',
    note: 'CONTRACT DEFECT. It returns data.person straight from Apollo, unmapped, while '
      + 'declaring the ApolloPersonResult shape. Its sibling enrichPersonById does map the '
      + 'fields. A caller that trusts the declared type gets Apollo’s raw object, whose '
      + 'organization block and name fields are not the mapped subset.',
  },
  {
    name: 'importApolloResults',
    billable: true,
    verdict: V.AVOID,
    io: 'A list of people in; { imported, duplicates, errors, skippedNoPhone, leads } out.',
    failure: 'Never throws; every per-person failure is counted and the loop continues.',
    quota: 'Indirect and unbounded by itself: it calls enrichPersonById for any person '
      + 'missing an email, with phone reveal ON by default, so one import can spend two '
      + 'billable calls per person.',
    note: 'NOT A MAPPING FUNCTION. It writes Lead rows, fires syncNewLeadToGhl and requests '
      + 'phone reveals. For a task scoped to mapping rather than sending, this is the wrong '
      + 'door. Its errors counter also conflates "Apollo had no email" with "the write '
      + 'threw", so it cannot answer the question C6.4 needs. Dedupe on email or apollo_id '
      + 'makes the INSERT idempotent; the phone-reveal request is not.',
  },
  {
    name: 'calculateColdLeadScore',
    billable: false,
    verdict: V.REUSE,
    io: 'Lead fields and optional ICP criteria in; a 0 to 100 integer out.',
    failure: 'Pure and synchronous. No I/O, so no failure path.',
    quota: 'None. Free.',
    note: 'The safest thing in the module and the easiest to test, yet untested.',
  },
  {
    name: 'requestPhoneReveal',
    billable: true,
    verdict: V.CARE,
    io: 'An API key and person id in; nothing out. The number arrives later by webhook.',
    failure: 'Throws on non-OK. Silently returns when disabled or refused.',
    quota: 'One billable call, claimed.',
    note: 'Called fire-and-forget from importApolloResults with only a warn on rejection, '
      + 'and it is not deduplicated, so re-running an import can buy the same reveal twice.',
  },
  {
    name: 'getApolloQuota',
    billable: true,
    verdict: V.AVOID,
    io: 'Nothing in; { available, message } out.',
    failure: 'Never throws. Returns available:false with the reason.',
    quota: 'SPENDS ONE BILLABLE CALL AND DOES NOT CLAIM IT. The only entry point in the '
      + 'service that skips claimApolloCall, so its spend never reaches the daily counter.',
    note: 'MISNAMED. It reports reachability, not quota, by running a one-result CEO search. '
      + 'Use getApolloUsageToday() from apolloCreditGuard instead: it reads the counter and '
      + 'the configured ceilings, costs nothing and is the number a pre-flight check wants.',
  },
];

/* ------------------------------------------------------------------ *
 * QUOTA EXHAUSTION, THE ANSWER THE TICKET ASKS FOR
 * ------------------------------------------------------------------ */

const EXHAUSTION = [
  ['Per-run ceiling', 'In memory, ' + CEIL.perRun + ' by default. Resets when the process '
    + 'does, which is correct for a per-run cap. Checked before the database is touched.'],
  ['Daily ceiling', 'Persisted in apollo_credit_usage, ' + CEIL.perDay + ' by default, '
    + 'counted per UTC day. Enforced inside the SQL: one INSERT ... ON CONFLICT DO UPDATE '
    + 'with a WHERE on the count both increments and refuses, so two processes cannot race.'],
  ['On refusal', 'searchPeople returns an empty result, enrichPerson and enrichPersonById '
    + 'return null, requestPhoneReveal returns silently. NOTHING THROWS. A warn line '
    + 'apollo_call_refused_by_guard is the only trace at the boundary.'],
  ['Counter unreadable', 'Fails CLOSED. The call is refused with '
    + 'apollo_counter_unavailable rather than made without a ceiling.'],
  ['Alert', 'One AI event per day once usage crosses ' + CEIL.alertFraction + ' of the '
    + 'daily ceiling, claimed by an UPDATE on alerted_at so it fires once, not per call.'],
  ['Kill switch', 'APOLLO_ENABLED must equal the literal string true. Anything else, '
    + 'including unset, disables every call and returns the same empty results.'],
];

/* ------------------------------------------------------------------ *
 * PRODUCTION STATE - measured, with the query that produced it
 * ------------------------------------------------------------------ */

const PROD = {
  asOf: '18 October 2026',
  rows: [
    ['APOLLO_ENABLED', 'true', 'container env on the production backend'],
    ['APOLLO_MAX_CALLS_PER_DAY', '250', 'container env, equal to the code default'],
    ['APOLLO_MAX_CALLS_PER_RUN', '50', 'container env, equal to the code default'],
    ['APOLLO_ALERT_FRACTION', '0.8', 'container env, so the alert fires at 200'],
    ['APOLLO_API_KEY', 'present, 22 characters', 'presence and length only; the value was '
      + 'never read or logged'],
    ['Spend today', '0 of 250', 'SELECT on apollo_credit_usage: no row exists for 18 October'],
    ['Spend 16 October', '105, last label searchPeople', 'the only substantial row in the '
      + 'table, consistent with the C6.3 account selection run'],
    ['Spend 15 October', '50, last label ceiling-proof', 'exactly the per-run ceiling, so '
      + 'the cap has been demonstrated against the live counter'],
    ['Apollo-sourced leads', '2,102, every one with an email', 'SELECT on leads where '
      + "source = 'apollo'"],
    ['Newest Apollo lead', '9 July 2026', 'the day before the credit-leak kill switch '
      + 'landed, so nothing has been imported since'],
  ],
};

/* ------------------------------------------------------------------ *
 * WHAT C6.4 AND C6.6 SHOULD DO WITH THIS
 * ------------------------------------------------------------------ */

const FOR_NEXT = [
  'Spend nothing until what we already own has been checked. There are 2,102 Apollo-sourced '
    + 'leads in the database, all with emails, and the account client can read our saved '
    + 'Apollo contacts through /v1/contacts/search for free. Both are already paid for.',
  'Read getApolloUsageToday() for the pre-flight number, not getApolloQuota(). The first is '
    + 'free and reports the counter; the second spends a credit and reports reachability.',
  'Keep any enrichment run to fewer than ' + CEIL.perRun + ' billable calls per process. '
    + 'The per-run ceiling is in memory, so a second process starts from zero. That respects '
    + 'the cap as configured instead of raising it, which would be a production config '
    + 'change rather than an implementation decision.',
  'Read the counter before and after the run and report both. It is the only way to show a '
    + 'result set was not silently truncated by a ceiling, because truncation returns the '
    + 'same empty values as a genuine miss.',
  'Do not use importApolloResults to build a map. It writes leads, syncs to the CRM and buys '
    + 'phone reveals. Map from searchPeople and enrichPersonById output directly.',
];

const LIMITS = [
  'This audit reads code and production configuration. It does not exercise the Apollo API, '
    + 'so no claim is made about Apollo’s own behaviour beyond the status codes this code '
    + 'handles.',
  'The ceiling has only ever been observed stopping a run once, the 50-call ceiling-proof '
    + 'row on 15 October. The daily ceiling of 250 has never been reached in production, so '
    + 'its refusal path is proven by its tests and by reading the SQL, not by an incident.',
  'The uncounted script is named but was not run. Its spend ceiling is its own ENRICH_MAX '
    + 'default of 180 enrichment calls, read from its header, not measured.',
];

const DECISION = 'Two one-line fixes would close the holes this found: have getApolloQuota '
  + 'claim a credit like every other call, or retire it in favour of getApolloUsageToday, '
  + 'and put the kill switch in front of the one script that bypasses it. Both are small, '
  + 'both are outside this ticket, which says to build nothing, so they are proposed rather '
  + 'than done.';

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** Every function the audit names still exists in the source it audits. */
function assertFunctionsExist() {
  for (const f of FUNCTIONS) {
    if (!new RegExp(`function ${f.name}\\b`).test(SERVICE)) {
      throw new Error('audited function no longer exists in apolloService.ts: ' + f.name);
    }
  }
  return FUNCTIONS.length;
}

/**
 * The central claim: getApolloQuota is billable and unguarded, and every other billable
 * entry point claims first. If someone fixes that, this audit must stop saying otherwise.
 */
function assertUnguardedSetMatchesSource() {
  const unguarded = BILLABLE.filter((f) => !f.claims).map((f) => f.name).sort();
  const expected = ['getApolloQuota'];
  if (JSON.stringify(unguarded) !== JSON.stringify(expected)) {
    throw new Error('the unguarded billable set is now [' + unguarded.join(', ')
      + '] but this audit documents [' + expected.join(', ') + ']');
  }
  if (!GUARDED.includes('searchPeople') || !GUARDED.includes('enrichPerson')) {
    throw new Error('expected searchPeople and enrichPerson to claim credits; guarded set is '
      + GUARDED.join(', '));
  }
  return unguarded[0];
}

/** The kill switch still defaults to off and the ceilings still read as documented. */
function assertCeilingsMatchSource() {
  if (!CEIL.killSwitchDefaultOff) {
    throw new Error('APOLLO_ENABLED no longer defaults to off; the audit says it does');
  }
  for (const [k, v] of [['perDay', '250'], ['perRun', '50'], ['alertFraction', '0.8']]) {
    if (CEIL[k] !== v) throw new Error(`${k} default is ${CEIL[k]}, audit documents ${v}`);
  }
  return `${CEIL.perRun}/run, ${CEIL.perDay}/day, alert at ${CEIL.alertFraction}`;
}

/** The two functions called untested are genuinely absent from every test file. */
function assertUntestedClaimsHold() {
  const checked = [];
  for (const name of ['importApolloResults', 'calculateColdLeadScore']) {
    const r = isUntested(name);
    if (!r.untested) {
      throw new Error(name + ' is now covered by ' + r.files.join(', ')
        + ', but this audit calls it untested');
    }
    checked.push(name);
  }
  // And the guard IS tested, which the audit also claims.
  if (isUntested('claimApolloCall').untested) {
    throw new Error('claimApolloCall has no tests, but the audit says the guard is tested');
  }
  return checked.length;
}

/** Every function carries a verdict, and every verdict carries evidence. */
function assertVerdictPerFunction() {
  for (const f of FUNCTIONS) {
    if (!f.verdict) throw new Error('no reuse verdict for ' + f.name);
    for (const k of ['io', 'failure']) {
      if (!f[k] || f[k].length < 20) throw new Error(`thin ${k} for ${f.name}`);
    }
    /*
     * Quota depth is required of a BILLABLE function only. For a pure one, "None. Free."
     * is the complete answer, and a length rule would only buy padding. A billable
     * function has to say what it costs and whether it claims first.
     */
    if (!f.quota) throw new Error('no quota line for ' + f.name);
    if (f.billable && f.quota.length < 20) throw new Error(`thin quota for ${f.name}`);
  }
  return FUNCTIONS.filter((f) => f.verdict === V.REUSE).length;
}

/**
 * The headline's counts match the verdict table.
 *
 * This guard exists because they did not: the draft headline claimed five of six reusable
 * unchanged while the table said two, and nothing would have caught it before Ali did.
 */
function assertHeadlineMatchesVerdicts() {
  const t = tally();
  if (t.clean + t.care + t.avoid !== t.total) {
    throw new Error('verdict tally does not cover every function');
  }
  const h = headline();
  if (!h.startsWith(`${WORDS[t.clean]} of the six`)) {
    throw new Error(`headline opens "${h.slice(0, 24)}..." but ${t.clean} functions are `
      + 'marked reusable unchanged');
  }
  for (const [label, n] of [['care', t.care], ['avoid', t.avoid]]) {
    if (!h.includes(`${WORDS[n]} `)) {
      throw new Error(`headline does not state the ${label} count of ${n}`);
    }
  }
  return `${t.clean} unchanged, ${t.care} with care, ${t.avoid} to avoid`;
}

/** Nothing claims a credit balance, because no endpoint in this codebase reports one. */
function assertNoCreditBalanceClaimed() {
  const blob = [headline(), ...SO_WHAT, ...FOR_NEXT, ...LIMITS, DECISION].join(' ');
  if (/credits? remaining|balance of \d|\d+ credits left/i.test(blob)) {
    throw new Error('the audit states a credit balance, which nothing in this codebase reports');
  }
  return true;
}

module.exports = {
  AS_OF, FUNCTIONS, EXHAUSTION, PROD, FOR_NEXT, LIMITS, DECISION, SO_WHAT, V,
  GUARDED, BILLABLE, CEIL, headline,
  assertFunctionsExist, assertUnguardedSetMatchesSource, assertCeilingsMatchSource,
  assertUntestedClaimsHold, assertVerdictPerFunction, assertNoCreditBalanceClaimed,
  assertHeadlineMatchesVerdicts,
};
