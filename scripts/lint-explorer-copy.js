#!/usr/bin/env node
/**
 * Explorer copy lint — the April-14 rule (plan §11.4), EPIC 5.
 *
 * NO EXPLORER CAMPAIGN COPY MAY CONTAIN A LITERAL DATE, PRICE, SEAT COUNT, OR
 * DEADLINE. Those facts change without the copy changing, and a seeded string
 * outlives the fact it asserts: the rule is named after a cohort start date that
 * sat in a template long after the cohort had moved.
 *
 * The correct way to state such a fact is a `{{token}}` resolved from the
 * Explorer context at send time, which is why tokens are stripped before
 * matching rather than flagged. A template that says `{{next_class.start_date}}`
 * is doing exactly the right thing; one that says "April 14" is not.
 *
 * WHERE THIS SITS. It is the FIRST of the three enforcement points in §11.4:
 *   1. this lint, at build time, over seeded definitions
 *   2. the AI system prompt, stating only context facts may be asserted
 *   3. `messageValidatorService`, over GENERATED copy at send time
 * This one cannot catch what the model invents at runtime — only point 3 can.
 * It catches what a human types into a definitions file, which is the failure
 * that ships silently and permanently.
 *
 * DELIBERATELY NOT A WHOLE-FILE SUBSTRING SEARCH. Its sibling
 * `lint-route-auth.js` documents that weakness in its own header: it matches
 * over the entire file including comments, so prose mentioning a guard name
 * passes as readily as real code. Here the equivalent bug would be worse in the
 * other direction — this file's own header contains "April 14" and a `$`
 * example, and a naive scan would fail the build on its own documentation.
 *
 * So the source is normalised before matching, in three steps, each of which
 * exists because the naive version got it wrong on real input:
 *   - comments stripped, so documentation about the rule is not a violation
 *   - concatenated literals joined, so a wrapped sentence is one sentence
 *   - {{tokens}} stripped, so the correct way to state a fact is not flagged
 * ...and a prohibition ("NEVER state a price") is distinguished from an
 * assertion ("the price is …"). See each function for the case that forced it.
 *
 * Run: `node scripts/lint-explorer-copy.js`
 * Self-test: `node scripts/lint-explorer-copy.js --self-test`
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../backend/src/seeds/explorerGrowth');

const RULES = [
  {
    name: 'price',
    // $149, $1,299.00, "149 dollars", "USD 149"
    pattern: /(\$\s?\d|(?:\b\d[\d,]*\s?(?:dollars|usd)\b)|(?:\busd\s?\d))/i,
    fix: 'use {{subscription.price_monthly}}',
  },
  {
    name: 'date',
    // "April 14", "14 April", "2026-04-14", "4/14", "Apr 14th"
    pattern:
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?\s+\d{1,2}\b|\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/i,
    fix: 'use {{next_class.start_date}} or {{next_event.local_date}}',
  },
  {
    name: 'seat count',
    // "3 seats left", "only 5 spots remaining", "2 places available"
    pattern: /\b\d+\s+(?:seats?|spots?|places?)\b|\b(?:seats?|spots?|places?)\s+(?:left|remaining)\b/i,
    fix: 'use {{next_class.seats_remaining}}',
  },
  {
    name: 'deadline',
    // The plan is explicit (§35 D-6): NO application_deadline column exists, so
    // a deadline cannot be resolved from a token either. It must not be stated
    // at all until that column does.
    pattern: /\b(?:deadline|apply by|closes? on|last day to|enrol?l by|register by)\b/i,
    fix: 'no deadline may be stated — §35 D-6, the column does not exist',
  },
];

/** Remove block and line comments so the file's own prose is not scanned. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Join adjacent concatenated literals: `'a ' + 'b'` becomes `'a b'`.
 *
 * WITHOUT THIS, A SENTENCE SPLIT ACROSS LINES IS SCANNED AS FRAGMENTS, and the
 * fragments mean different things than the sentence does. The real case:
 * NEVER_STATE_CLAUSE wraps as
 *
 *   'NEVER state or imply a cohort date, a price, a payment deadline, ' +
 *   'an application deadline, or anything about consent. '
 *
 * The first fragment carries the negation, the second carries the word
 * "deadline" with nothing governing it — so the prohibition check clears
 * fragment one and fragment two trips the rule. The clause reads as a violation
 * purely because of where the line happened to wrap.
 *
 * That is a nasty class of bug: the lint's verdict depends on source formatting
 * rather than meaning, so reflowing a paragraph could turn CI red or green.
 */
function joinConcatenations(src) {
  return src.replace(/(['"`])\s*\+\s*\1/g, '');
}

/**
 * Remove `{{tokens}}` before matching.
 *
 * A resolved token is the CORRECT way to state a date or price, so leaving them
 * in would flag exactly the copy that is doing the right thing — and
 * `{{next_class.start_date}}` contains no date anyway, whereas a token like
 * `{{cohort_2026_04_14}}` would otherwise trip the date rule on its own name.
 */
function stripTokens(text) {
  return text.replace(/\{\{[^}]*\}\}/g, ' ');
}

/**
 * Extract every string literal in the file.
 *
 * KEY-MATCHING WAS TRIED FIRST AND SCANNED ALMOST NOTHING. These definitions
 * build their steps through a helper —
 * `step(delay_days, subject, goal, instructions)` — so the actual copy arrives
 * as CALL ARGUMENTS, and the object literal only ever contains the shorthand
 * `subject,` and a template literal that is pure interpolation. A `key: 'value'`
 * extractor found exactly one value across all three files and reported a clean
 * pass over copy it had never read: a green check guarding nothing, which is
 * worse than no check because it is trusted.
 *
 * So every literal is scanned. These are pure data-definition files — a string
 * in them is either copy, a prompt, or an identifier, and identifiers do not
 * contain dates or prices. Over-inclusion here costs a false positive that a
 * human resolves in seconds; under-inclusion costs a stale fact mailed to
 * learners.
 */
function extractCopyValues(src) {
  const out = [];
  const re = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    // A literal with no spaces is an identifier, an enum value or an import
    // path, never a sentence a learner reads.
    if (value.trim() && /\s/.test(value.trim())) out.push({ key: 'string literal', value });
  }
  return out;
}

/**
 * A PROHIBITION IS NOT AN ASSERTION.
 *
 * `NEVER_STATE_CLAUSE` — appended to every step's `ai_instructions` — reads
 * "NEVER state or imply a cohort date, a price, a payment deadline, a seat
 * count, an application deadline...". It is the guard that stops the model
 * asserting those facts, and a naive scan flags it as a violation of the rule
 * it exists to enforce.
 *
 * That failure is worse than a missed check. A lint that fails on its own
 * safeguard is red on a clean tree, and a lint that is always red gets deleted
 * or `|| true`'d within a week — taking the real coverage with it.
 *
 * The rule is narrow on purpose: a negation must directly govern a speech verb.
 * "Do not mention a price" is an instruction; "the price is $149" is copy.
 *
 * KNOWN LIMIT, stated rather than hidden: this is a bypass. Copy reading
 * "never state that the cohort starts April 14" would be skipped. That is a
 * contrived sentence and the clause it protects is a shared constant, so the
 * trade is worth it — but if that ever becomes a real pattern, this is the
 * function to tighten.
 */
const PROHIBITION = /\b(?:never|do not|don'?t|avoid|must not)\s+(?:\w+\s+){0,2}(?:state|mention|imply|say|assert|reference|include)\b/i;

function violationsIn(src) {
  const found = [];
  for (const { key, value } of extractCopyValues(joinConcatenations(stripComments(src)))) {
    if (PROHIBITION.test(value)) continue;
    const scannable = stripTokens(value);
    for (const rule of RULES) {
      const hit = scannable.match(rule.pattern);
      if (hit) found.push({ key, rule: rule.name, match: hit[0].trim(), fix: rule.fix });
    }
  }
  return found;
}

/* ------------------------------- self-test -------------------------------- */

function selfTest() {
  const cases = [
    // [source, expected rule names]
    [`subject: 'Your cohort starts April 14'`, ['date']],
    [`subject: 'Your cohort starts {{next_class.start_date}}'`, []],
    [`ai_instructions: 'Mention it is $149 per month'`, ['price']],
    [`ai_instructions: 'Mention it is {{subscription.price_monthly}} per month'`, []],
    [`subject: 'Only 3 seats left'`, ['seat count']],
    [`subject: 'The deadline is coming up'`, ['deadline']],
    [`body_template: 'Starts 2026-04-14'`, ['date']],
    [`subject: 'Starts 4/14'`, ['date']],
    // A comment containing a date must NOT fail the build.
    [`// cohort used to start April 14\nsubject: 'Welcome aboard'`, []],
    // Keys we do not police are none of our business.
    // Every literal is scanned now, so a date in ANY string is caught -
    // including one passed as a call argument, which is where the real copy lives.
    [`step(3, 'Your cohort starts April 14', 'goal', 'instructions')`, ['date']],
    [`step(3, 'A quick question', 'goal', 'mention it costs $149')`, ['price']],
    // A prohibition is not an assertion: the NEVER_STATE_CLAUSE itself.
    ["x: 'NEVER state or imply a cohort date, a price, a payment deadline, a seat count'", []],
    ["x: 'Do not mention a price'", []],
    // ...but the negation must actually govern a speech verb, or everything escapes.
    ["x: 'Never miss it - the deadline is Friday'", ['deadline']],
    // A sentence split across concatenated literals is one sentence, not two.
    // This is the real NEVER_STATE_CLAUSE wrap, which read as a violation before.
    ["x: 'NEVER state or imply a cohort date, a price, ' + 'an application deadline, or consent.'", []],
    // Clean copy stays clean.
    [`subject: 'A quick question about your goals'`, []],
  ];

  let failures = 0;
  for (const [src, expected] of cases) {
    const got = violationsIn(src).map((v) => v.rule).sort();
    const want = [...expected].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      failures++;
      console.error(`[explorer-copy-lint] self-test FAIL`);
      console.error(`  source:   ${JSON.stringify(src)}`);
      console.error(`  expected: [${want}]`);
      console.error(`  got:      [${got}]`);
    }
  }

  if (failures) {
    console.error(`[explorer-copy-lint] self-test: ${failures} of ${cases.length} cases failed.`);
    process.exit(1);
  }
  console.log(`[explorer-copy-lint] self-test OK — ${cases.length} cases.`);
  process.exit(0);
}

/* --------------------------------- main ----------------------------------- */

if (process.argv.includes('--self-test')) selfTest();

let files;
try {
  files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.includes('.test.'));
} catch (e) {
  console.error('[explorer-copy-lint] cannot read', DIR, '-', e.message);
  process.exit(1);
}

let total = 0;
const failed = [];

for (const file of files) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const violations = violationsIn(src);
  total += extractCopyValues(joinConcatenations(stripComments(src))).length;
  if (violations.length) failed.push({ file, violations });
}

if (failed.length) {
  console.error('[explorer-copy-lint] FAIL — Explorer copy states a fact that will go stale:');
  for (const { file, violations } of failed) {
    for (const v of violations) {
      console.error(`  backend/src/seeds/explorerGrowth/${file}`);
      console.error(`    ${v.key} contains a literal ${v.rule}: "${v.match}"`);
      console.error(`    → ${v.fix}`);
    }
  }
  console.error('');
  console.error('No Explorer copy may contain a literal date, price, seat count or deadline');
  console.error('(plan §11.4). Resolve the fact through a {{token}} at send time instead.');
  process.exit(1);
}

console.log(
  `[explorer-copy-lint] OK — ${total} copy value(s) across ${files.length} file(s), no stale facts.`,
);
