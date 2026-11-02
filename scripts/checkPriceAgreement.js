#!/usr/bin/env node
/**
 * checkPriceAgreement — fails the build when two surfaces stop agreeing about what the
 * membership costs. C10.2.
 *
 * WHY A GUARD AND NOT JUST A SHARED CONSTANT
 * ------------------------------------------
 * Three of the four surfaces C10.2 names are code and can import the price of record. One
 * is not: the public knowledge hub is ~180 static files of HTML, JS and Markdown, and a
 * static file cannot import anything. For that surface the enforceable equivalent of "reads
 * from one source" is "cannot disagree with the source without failing the build". So this
 * checks references where a reference is possible, and content where it is not.
 *
 * It also guards the thing a number comparison misses. Two surfaces that each type `149`
 * pass any equality check and drift apart on the next edit. What cannot drift is a surface
 * with no price in it to edit, so where a surface should import the constant this asserts
 * that it REFERENCES it and that no literal rate survives.
 *
 * CONTEXT, NOT DIGITS
 * -------------------
 * The hub legitimately contains other products' prices: $1,999 Data Analytics, $4,500 Data
 * Science, $6,000 enterprise proposals, $20 and $10 of Anthropic tooling. A bare search for
 * "4500" would fail the build on a correct page. So the content rule only judges figures that
 * appear in a MEMBERSHIP context, and the self-test proves it still catches one that does.
 *
 *   node scripts/checkPriceAgreement.js --self-test   # prove each rule can reject
 *   node scripts/checkPriceAgreement.js               # the real run
 *
 * Exit 0 clean, 1 on any disagreement. Follows the guards-job convention in ci.yml: the
 * self-test runs first and as its own step, because the matcher is the thing being trusted
 * and a matcher that has silently stopped matching reports a clean pass over copy it never
 * read.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SELF_TEST = process.argv.includes('--self-test');

const PRICE_MODULE = 'backend/src/services/membershipPrice.ts';
const KB_DIR = 'frontend/public/knowledge';

/** A run that scanned almost nothing is not a pass. */
const MIN_KB_FILES = 60;

/**
 * Files that declare their own price constant and compute money from it. FROZEN at the two
 * that existed when this guard landed; a THIRD fails the build.
 *
 * These two are deliberately not fixed here. They are findings 1 and 5 of
 * docs/marketing/ESCALATION-002-fabricated-metrics.md, which is OPEN and awaiting Ali's
 * decision on what a projection should assume. Rewriting them inside C10.2 would take that
 * decision by implication. Recorded as known debt so it cannot spread, and so the list
 * shrinking is the signal that the escalation was resolved.
 */
const KNOWN_PRIVATE_PRICE_CONSTANTS = [
  'backend/src/services/opportunityScoringService.ts',
  'backend/src/services/strategic-intelligence/scenarioSimulationEngine.ts',
];

/** Words that make a line a statement about the MEMBERSHIP price rather than some other product. */
const MEMBERSHIP_CONTEXT =
  /membership|founding rate|founding annual|annual plan|month-to-month|month to month|billed annually|per month billed|\/mo annual|price_annual|price_monthly/i;

/** Figures below this are tooling costs and tips, not a plan price. */
const PRICE_FLOOR = 100;

/**
 * Markers that make a figure a QUANTITY TOTAL rather than a price claim: "Qty 10", "x 12",
 * "10 seats". A total that is an exact multiple of the price of record cannot contradict the
 * price of record, and the hub really does contain one - the partner proposal bills ten annual
 * seats as $17,880, which is 1788 x 10. Without this the guard fails the build on correct
 * arithmetic, and a guard that cries wolf on a correct page gets switched off.
 */
const QTY_MARKER = /\bqty\b|\bseats?\b|[×✕]|\bx\s*\d|\bper seat\b/i;

/** The largest seat count treated as a plausible quantity, so a coincidence cannot hide here. */
const MAX_PLAUSIBLE_SEATS = 1000;

/**
 * Judge ONE line of content. Returns 'ignored' (not about the membership price), 'accepted',
 * or a rejection reason.
 *
 * The self-test drives this exact function rather than a copy of its logic. An earlier draft
 * had the rules written twice, which is the same defect this whole ticket is about: two copies
 * that agree today and drift tomorrow, with the test half reporting on rules the real run no
 * longer uses.
 */
function judgeLine(line, P) {
  if (!MEMBERSHIP_CONTEXT.test(line)) return 'ignored';
  const rates = [P.annualCharge, P.annualPerMonth, P.monthly];
  const hasQty = QTY_MARKER.test(line);

  for (const raw of line.match(/\$\s?\d[\d,]*(?:\.\d{2})?/g) || []) {
    const n = Number(raw.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n < PRICE_FLOOR) continue;  // tooling costs, not plan prices
    if (rates.includes(n)) continue;

    // A quantity total: an exact whole multiple of a rate we charge.
    if (hasQty && rates.some((r) => n % r === 0 && n / r >= 2 && n / r <= MAX_PLAUSIBLE_SEATS)) continue;

    const why = P.blocked.includes(n) ? ' (a price this business does not charge)' : '';
    return `states ${raw}${why} as a membership price`;
  }
  return 'accepted';
}

const problems = [];
const notes = [];
let kbFilesScanned = 0;

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function fail(surface, msg) { problems.push({ surface, msg }); }

// ---------------------------------------------------------------------------
// The price of record, parsed out of the module itself
// ---------------------------------------------------------------------------

/**
 * Read the canonical rates from source rather than importing: this is a plain node script in
 * a CI job with no TypeScript runtime. Parsing is deliberately strict, and a module shape
 * this cannot read is itself a failure rather than a silent skip.
 */
function readPriceOfRecord() {
  const src = read(PRICE_MODULE);
  const num = (field) => {
    const m = new RegExp(`${field}:\\s*(\\d+)`).exec(src);
    return m ? Number(m[1]) : null;
  };
  const annualPerMonth = num('annualPerMonth');
  const monthly = num('monthly');
  const termM = /ANNUAL_TERM_MONTHS\s*=\s*(\d+)/.exec(src);
  const term = termM ? Number(termM[1]) : null;

  if (annualPerMonth === null || monthly === null || term === null) {
    throw new Error(
      `cannot read the price of record out of ${PRICE_MODULE}. This guard is the thing that `
      + 'keeps four surfaces in agreement, so an unreadable source module is a failure, not a skip.',
    );
  }

  // The annual charge must be DERIVED there, never typed. If someone types it, the two can
  // disagree inside the source of truth itself, which defeats the whole arrangement.
  if (/ANNUAL_CHARGE\s*=\s*\d/.test(src)) {
    fail('price of record', 'ANNUAL_CHARGE is typed as a literal in '
      + `${PRICE_MODULE}; it must be derived from annualPerMonth x ANNUAL_TERM_MONTHS.`);
  }

  const blocked = [];
  const re = /\{\s*value:\s*(\d+)\s*,\s*why:/g;
  let m;
  while ((m = re.exec(src)) !== null) blocked.push(Number(m[1]));

  return { annualPerMonth, monthly, term, annualCharge: annualPerMonth * term, blocked };
}

// ---------------------------------------------------------------------------
// Surface 1 - the checkout
// ---------------------------------------------------------------------------

function checkCheckout(P) {
  const f = 'backend/src/services/subscriptionService.ts';
  const src = read(f);
  if (!/from '\.\/membershipPrice'/.test(src)) {
    fail('checkout', `${f} does not import the price of record.`);
  }
  for (const [plan, field] of [['annual', 'annualPerMonth'], ['monthly', 'monthly']]) {
    const re = new RegExp(`${plan}: makePlan\\('${plan}', '[^']+', MEMBERSHIP_PRICE\\.${field}\\b`);
    if (!re.test(src)) {
      fail('checkout', `${f}: the ${plan} plan does not read MEMBERSHIP_PRICE.${field}.`);
    }
  }
  // A literal rate anywhere in the plan table is a price that can drift.
  const lit = /makePlan\('(?:annual|monthly)', '[^']+', (\d+)/.exec(src);
  if (lit) {
    fail('checkout', `${f}: the plan table still types a rate (${lit[1]}). `
      + 'It must reference membershipPrice so there is nothing here to edit out of agreement.');
  }
  notes.push(`checkout: reads the price of record (annual $${P.annualPerMonth}/mo -> $${P.annualCharge}/yr)`);
}

// ---------------------------------------------------------------------------
// Surface 2 - what Maya quotes
// ---------------------------------------------------------------------------

function checkMaya(P) {
  const f = 'backend/src/services/admissionsPricing.ts';
  const src = read(f);
  if (!/from '\.\/membershipPrice'/.test(src)) {
    fail('maya', `${f} does not import the price of record.`);
  }
  const decl = /export const MEMBERSHIP\s*=\s*\{[\s\S]*?\}/.exec(src);
  if (!decl) {
    fail('maya', `${f}: cannot find the MEMBERSHIP declaration.`);
  } else if (/:\s*\d/.test(decl[0])) {
    fail('maya', `${f}: MEMBERSHIP still types a number. Every field must come from `
      + 'membershipPrice, or Maya can quote a price the card is not charged.');
  }
  // The module must not reach for the billing service: that is the cycle this arrangement exists to avoid.
  if (/from '\.\/subscriptionService'/.test(src)) {
    fail('maya', `${f} imports subscriptionService. That closes the cycle described in its own `
      + 'header (billing -> enrollment -> email -> this file). Read membershipPrice instead.');
  }
  notes.push('maya: quotes the price of record, and still does not import billing');
}

// ---------------------------------------------------------------------------
// Surface 3 - the knowledge base (static content, plus its DB seed)
// ---------------------------------------------------------------------------

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, out); continue; }
    if (/\.(html?|js|jsx|ts|tsx|json|md|css)$/i.test(e.name)) out.push(p);
  }
  return out;
}

function checkKnowledgeBase(P) {
  // (a) the DB seed behind the {{cohort.price_*}} merge tags must reference the module
  const seedFile = 'backend/src/seeds/seedKbData.ts';
  const seed = read(seedFile);
  for (const [col, field] of [['price_annual', 'annualPerMonth'], ['price_monthly', 'monthly']]) {
    const m = new RegExp(`${col}:\\s*([^,\\n]+)`).exec(seed);
    if (!m) { fail('knowledge base', `${seedFile}: no ${col} in the cohort seed.`); continue; }
    const value = m[1].trim();
    if (/^\d/.test(value)) {
      fail('knowledge base', `${seedFile}: ${col} is the literal ${value}. The KB answers are `
        + `written against {{cohort.${col}}}, so a typed value here lets the KB quote a price `
        + 'checkout does not charge. Use MEMBERSHIP_PRICE.' + field + '.');
    }
  }

  // (b) the static hub: any figure asserted in a MEMBERSHIP context must be a canonical rate
  const files = walk(path.join(ROOT, KB_DIR), []);
  kbFilesScanned = files.length;
  let canonicalSeen = 0;

  for (const abs of files) {
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.includes(String(P.annualPerMonth))) canonicalSeen += 1;
      const verdict = judgeLine(line, P);
      if (verdict === 'ignored' || verdict === 'accepted') return;
      fail('knowledge base', `${rel(abs)}:${i + 1} ${verdict}. `
        + `The price of record is $${P.annualPerMonth}/mo billed annually `
        + `($${P.annualCharge}/yr) or $${P.monthly} month-to-month.\n      ${line.trim().slice(0, 150)}`);
    });
  }

  if (kbFilesScanned < MIN_KB_FILES) {
    fail('knowledge base', `only ${kbFilesScanned} files scanned under ${KB_DIR} (expected at `
      + `least ${MIN_KB_FILES}). A near-empty scan reads exactly like a clean pass, so it is a failure.`);
  }
  if (canonicalSeen === 0) {
    fail('knowledge base', `the hub never states $${P.annualPerMonth}. The price did not just `
      + 'drift, it vanished, which no contradiction check would have caught.');
  }
  notes.push(`knowledge base: ${kbFilesScanned} files scanned, ${canonicalSeen} lines state the canonical rate`);
}

// ---------------------------------------------------------------------------
// Surface 4 - the revenue forecast
// ---------------------------------------------------------------------------

/**
 * The forecast is the one surface this ticket cannot wire shut, and saying so plainly is
 * better than a guard that quietly tolerates it.
 *
 * `revenueDashboardService` is already well governed: its own test bans a hardcoded price,
 * bans a private price constant, requires reading getSetting('price_per_enrollment') and
 * forbids `|| 4500`. The accepted decision there is that a projection reads its price from a
 * SETTING, and an unset setting makes the projection null rather than inventing a number.
 * Hardwiring the membership price into it would break that decision.
 *
 * What is wrong is the value behind the setting, not the plumbing: production holds
 * price_per_enrollment = 4500, the retired per-participant price, with 0 enrollments ever at
 * that amount. Changing it is ESC-002's open question, so this reports the disagreement with
 * the number attached and fails only if a NEW private price constant appears.
 */
function checkForecast(P) {
  const f = 'backend/src/services/settingsService.ts';
  const src = read(f);
  const m = /price_per_enrollment:\s*([^,\n]+)/.exec(src);
  if (!m) {
    fail('forecast', `${f}: no price_per_enrollment default found.`);
  } else {
    const value = m[1].trim();
    if (/^\d+$/.test(value) && Number(value) !== P.annualCharge) {
      notes.push(`forecast: DISAGREES - price_per_enrollment defaults to ${value}, the price of `
        + `record is ${P.annualCharge}. Open in ESC-002; not changed here.`);
    } else {
      notes.push(`forecast: default is ${value}`);
    }
  }

  const found = [];
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') scan(p); continue; }
      if (!/\.ts$/.test(e.name)) continue;
      const s = fs.readFileSync(p, 'utf8');
      if (/const\s+[A-Z_]*PRICE[A-Z_]*\s*=\s*\d/.test(s)) found.push(rel(p));
    }
  };
  scan(path.join(ROOT, 'backend/src/services'));

  const unexpected = found.filter((f2) => !KNOWN_PRIVATE_PRICE_CONSTANTS.includes(f2));
  for (const f2 of unexpected) {
    fail('forecast', `${f2} declares its own price constant and computes money from it. That is `
      + 'the defect C10.2 exists to stop spreading: read the price of record, or the setting.');
  }
  const goneStale = KNOWN_PRIVATE_PRICE_CONSTANTS.filter((f2) => !found.includes(f2));
  for (const f2 of goneStale) {
    fail('forecast', `${f2} is on the frozen known-debt list but no longer declares a price `
      + 'constant. Good news that needs recording: remove it from KNOWN_PRIVATE_PRICE_CONSTANTS '
      + 'so the list keeps meaning what it says.');
  }
  notes.push(`forecast: ${found.length} service(s) still declare a private price constant `
    + `(${KNOWN_PRIVATE_PRICE_CONSTANTS.length} known, frozen, open in ESC-002)`);
}

// ---------------------------------------------------------------------------
// Self-test: every rule proves it can still reject
// ---------------------------------------------------------------------------

function selfTest() {
  const cases = [];
  const check = (name, got, want) => cases.push({ name, pass: got === want, got, want });

  const P = { annualPerMonth: 149, monthly: 199, annualCharge: 1788, blocked: [4500, 1700] };

  // Drives the REAL judgeLine, not a copy of its rules.
  const judge = (line) => {
    const v = judgeLine(line, P);
    return (v === 'ignored' || v === 'accepted') ? v : 'rejected';
  };

  check('rejects the planning figure C10.2 retires',
    judge('Membership is $1,700 a year.'), 'rejected');
  check('rejects the retired per-participant price as a membership price',
    judge('The membership is $4,500 per participant.'), 'rejected');
  check('rejects a plausible near-miss',
    judge('Annual plan: $1,788.50 billed annually'), 'rejected');
  check('accepts the price of record, per month',
    judge('Membership is $149/mo, billed annually.'), 'accepted');
  check('accepts the price of record, per year',
    judge('Membership is $149 per month billed annually ($1,788 a year).'), 'accepted');
  check('accepts the month-to-month plan',
    judge('or $199/month month-to-month'), 'accepted');
  // The false-positive cases that made a bare digit search unusable. These are real lines
  // from the hub: other products, correctly priced.
  check('ignores another product entirely (Data Science, $4,500)',
    judge("{ name: 'Data Science', price: '$4,500', tone: 'green', len: '24 weeks' }"), 'ignored');
  check('ignores another product entirely (Data Analytics, $1,999)',
    judge('<b>Data Analytics</b><span class="p">$1,999</span>'), 'ignored');
  check('ignores an enterprise proposal total',
    judge('<span>Founding partner discount (15%)</span><span>$6,000</span>'), 'ignored');
  check('does not judge tooling costs as a plan price',
    judge('Your membership also needs ~$20/mo of Claude Code and ~$10/mo of API usage.'), 'accepted');

  // Quantity totals. The real proposal line in the hub bills ten annual seats; 1788 x 10 is
  // not a competing price claim. But a quantity marker must not become a way to smuggle one.
  check('accepts a seat-count total that is an exact multiple of the annual charge',
    judge('Team seats - Annual membership $149/mo x 12, founding rate locked   10   $17,880'), 'accepted');
  check('still rejects the retired figure even on a quantity line',
    judge('Membership seats   Qty 3   $4,500'), 'rejected');
  check('still rejects the planning figure even on a quantity line',
    judge('Annual membership seats   Qty 2   $1,700'), 'rejected');
  check('rejects a quantity total that is NOT a whole multiple of a real rate',
    judge('Annual membership   Qty 10   $17,500'), 'rejected');
  check('rejects a multiple on a line with no quantity marker at all',
    judge('Membership is $3,576 billed annually.'), 'rejected');

  // The reference rules: a literal must be caught where a reference is required.
  const litRe = /makePlan\('(?:annual|monthly)', '[^']+', (\d+)/;
  check('catches a literal rate returning to the plan table',
    litRe.test("annual: makePlan('annual', 'Annual', 149, 'year', 365, 'x')"), true);
  check('passes a plan table that references the constant',
    litRe.test("annual: makePlan('annual', 'Annual', MEMBERSHIP_PRICE.annualPerMonth, 'year', 365, 'x')"), false);

  const seedRe = /price_annual:\s*([^,\n]+)/;
  check('catches a typed price returning to the cohort seed',
    /^\d/.test((seedRe.exec('      price_annual: 149,') || [])[1].trim()), true);
  check('passes a seed that references the constant',
    /^\d/.test((seedRe.exec('      price_annual: MEMBERSHIP_PRICE.annualPerMonth,') || [])[1].trim()), false);

  const membershipDecl = /export const MEMBERSHIP\s*=\s*\{[\s\S]*?\}/;
  check('catches typed figures returning to what Maya quotes',
    /:\s*\d/.test(membershipDecl.exec('export const MEMBERSHIP = { annualPerMonth: 149, monthly: 199 }')[0]), true);
  check('passes figures that come from the module',
    /:\s*\d/.test(membershipDecl.exec('export const MEMBERSHIP = { annualPerMonth: MEMBERSHIP_PRICE.annualPerMonth }')[0]), false);

  const privRe = /const\s+[A-Z_]*PRICE[A-Z_]*\s*=\s*\d/;
  check('catches a new private price constant',
    privRe.test('const PRICE_PER_ENROLLMENT = 4500;'), true);
  check('does not flag a price read from a setting',
    privRe.test("const price = await getSetting('price_per_enrollment');"), false);

  const typedCharge = /ANNUAL_CHARGE\s*=\s*\d/;
  check('catches the annual charge being typed instead of derived',
    typedCharge.test('export const ANNUAL_CHARGE = 1788;'), true);
  check('passes a derived annual charge',
    typedCharge.test('export const ANNUAL_CHARGE = MEMBERSHIP_PRICE.annualPerMonth * ANNUAL_TERM_MONTHS;'), false);

  const failed = cases.filter((c) => !c.pass);
  for (const c of cases) {
    console.log(`  ${c.pass ? 'ok  ' : 'FAIL'}  ${c.name}`
      + (c.pass ? '' : `   (got ${JSON.stringify(c.got)}, want ${JSON.stringify(c.want)})`));
  }
  console.log(`\n${cases.length - failed.length}/${cases.length} self-test cases pass.`);
  if (failed.length) {
    console.error('\nThe price-agreement matcher is broken. It would report a clean pass over '
      + 'copy it never judged, so this is a failure.');
    process.exit(1);
  }
  console.log('The matcher can still reject. Safe to trust its clean runs.');
}

// ---------------------------------------------------------------------------

function main() {
  if (SELF_TEST) { selfTest(); return; }

  const P = readPriceOfRecord();
  console.log(`price of record: $${P.annualPerMonth}/month billed annually `
    + `= $${P.annualCharge}/year, or $${P.monthly} month-to-month`);
  console.log(`not the price:   ${P.blocked.map((b) => '$' + b).join(', ')}\n`);

  checkCheckout(P);
  checkMaya(P);
  checkKnowledgeBase(P);
  checkForecast(P);

  for (const n of notes) console.log('  ' + n);

  if (problems.length) {
    console.error(`\n${problems.length} surface(s) disagree about the membership price:\n`);
    for (const p of problems) console.error(`  [${p.surface}] ${p.msg}`);
    console.error('\nThe price of record is ' + PRICE_MODULE + '. Every surface reads it from there.');
    process.exit(1);
  }
  console.log('\nEvery checked surface agrees with the price of record.');
}

main();
