/**
 * C0.12's checkable claims, checked. The build fails rather than shipping a document that
 * breaks one of them.
 *
 * Two of these earn their keep.
 *
 * `assertDeclaredValuesMatchSource` reads the TypeScript the seed actually writes from and
 * demands every number in this artifact appear in it. The failure it prevents is the
 * ordinary one: somebody tunes a threshold in the code and the PDF keeps describing the
 * old one, so the document becomes a confident account of a config that is not there.
 *
 * `assertNoCriterionIsMetWithoutMeasurement` refuses to mark criteria 1 and 3 as MET until
 * the post-seed gate output is pasted into D.VERIFIED. Those two criteria are claims about
 * production, and a document that asserts them from intent rather than from a reading is
 * the thing this whole ticket is about.
 */
const fs = require('fs');
const path = require('path');
const D = require('./c012Data');
const R = require('./c012Render');
const { findAllBritishSpellings } = require('../britishSpellings');

const DECLARATIONS = path.join(
  __dirname, '..', '..', '..', 'backend', 'src', 'seeds', 'campaignGovernanceDeclarations.ts',
);

/** The column defaults, read from the model rather than remembered. */
const PLATFORM_DEFAULTS = {
  max_unsubscribe_rate: 1.5,
  max_bounce_rate: 5.0,
  max_sms_failure_rate: 10.0,
  min_open_rate: 0.1,
  min_reply_rate: 0.01,
};

function declarationSource() {
  if (!fs.existsSync(DECLARATIONS)) {
    throw new Error(`guard: declarations module not found at ${DECLARATIONS}`);
  }
  return fs.readFileSync(DECLARATIONS, 'utf8');
}

/** The slice of the declarations file belonging to one config key. */
function blockFor(src, key) {
  const start = src.indexOf(`key: '${key}'`);
  if (start === -1) throw new Error(`guard: config key "${key}" is not declared in the seed source`);
  const next = src.indexOf("key: '", start + 10);
  return src.slice(start, next === -1 ? src.length : next);
}

/**
 * Every number this document quotes must be in the code that writes it.
 *
 * Compares on the numeric value rather than the literal text, so `10.0` in the artifact
 * matches `10.0` in the source and `0.1` matches `0.10`.
 */
function assertDeclaredValuesMatchSource() {
  const src = declarationSource();
  for (const c of D.CONFIGS) {
    const block = blockFor(src, c.key);
    const numbers = (block.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    for (const f of c.fields) {
      const wanted = typeof f.value === 'number'
        ? [f.value]
        : String(f.value).match(/-?\d+(?:\.\d+)?/g).map(Number);
      for (const w of wanted) {
        if (!numbers.includes(w)) {
          throw new Error(
            `guard: ${c.key}.${f.field} says ${w} but that number is not in the seed source. `
            + 'The artifact has drifted from the code it describes.',
          );
        }
      }
    }
  }
  return D.CONFIGS.length;
}

/** Criterion 2, mechanically: a config of platform defaults is not a decision. */
function assertNoConfigIsAllDefaults() {
  for (const c of D.CONFIGS) {
    const moved = c.fields.filter((f) => {
      const d = PLATFORM_DEFAULTS[f.field];
      return d !== undefined && Number(f.value) !== d;
    });
    if (moved.length === 0) {
      throw new Error(`guard: ${c.key} leaves every rate at its platform default, which is a hollow config`);
    }
  }
}

/** Criterion 4, mechanically: reusable means the same mechanism, not the same numbers. */
function assertConfigsDifferFromEachOther() {
  if (D.CONFIGS.length < 2) {
    throw new Error('guard: criterion 4 needs a second config to check reusability against');
  }
  const shapes = D.CONFIGS.map((c) => JSON.stringify(c.fields.map((f) => f.value)));
  if (new Set(shapes).size !== shapes.length) {
    throw new Error('guard: two configs carry identical numbers, which makes them a template rather than a decision');
  }
}

/** A number without a reason is a placeholder wearing a value. */
function assertEveryFieldHasABasis() {
  for (const c of D.CONFIGS) {
    for (const f of c.fields) {
      if (typeof f.basis !== 'string' || f.basis.length < 40) {
        throw new Error(`guard: ${c.key}.${f.field} carries no stated basis`);
      }
      if (f.platformDefault === undefined) {
        throw new Error(`guard: ${c.key}.${f.field} does not say what the platform default was`);
      }
    }
  }
}

/** Only Ali sets the two attestations. The document may describe them, never claim them. */
function assertNoAttestationClaimed() {
  const text = `${R.buildVisual()} ${R.buildDocument()}`.replace(/<[^>]+>/g, ' ');
  const claims = [
    /claims_approved\s*(?:is|=|:)\s*true/i,
    /dry_run_reviewed\s*(?:is|=|:)\s*true/i,
    /attested by Claude/i,
    /both attestations (?:are|now) (?:set|recorded|complete)/i,
  ];
  for (const re of claims) {
    if (re.test(text)) {
      throw new Error(`guard: the document claims an attestation that only Ali can set (${re})`);
    }
  }
}

/** The gate table must be the nine checks that were measured, with the three that failed. */
function assertGateBeforeMatchesMeasurement() {
  if (D.GATE_BEFORE.length !== 9) {
    throw new Error(`guard: the gate has nine checks; the table lists ${D.GATE_BEFORE.length}`);
  }
  const failed = D.GATE_BEFORE.filter((g) => !g.passed).map((g) => g.id).sort();
  const expected = ['claims_approved', 'dry_run_reviewed', 'publishable'];
  if (JSON.stringify(failed) !== JSON.stringify(expected)) {
    throw new Error(`guard: measured blockers were ${expected.join(', ')}; the table says ${failed.join(', ')}`);
  }
}

/**
 * The two fields this change does NOT enforce must say so everywhere they appear.
 *
 * Describing them as governed would be precisely the failure the ticket names, and it is
 * the easiest one to commit by accident while writing a document about closing the gap.
 */
function assertUnenforcedFieldsAreLabeled() {
  for (const key of ['min_open_rate', 'min_reply_rate']) {
    const row = D.COLUMN_REACH.find((r) => r.column === key);
    if (!row) throw new Error(`guard: ${key} is missing from the column reach table`);
    if (!/STILL NOTHING/.test(row.after)) {
      throw new Error(`guard: ${key} is not labeled as unenforced in the column reach table`);
    }
  }
  const doc = R.buildDocument().replace(/<[^>]+>/g, ' ');
  if (!/F6/.test(doc)) throw new Error('guard: flag F6 (the unenforced columns) is not in the document');
}

/** A flag that is not rendered has been quietly dropped. */
function assertEveryFlagIsRendered() {
  const doc = R.buildDocument().replace(/<[^>]+>/g, ' ');
  for (const f of D.FLAGS) {
    if (!doc.includes(f.id)) throw new Error(`guard: flag ${f.id} is declared but not rendered`);
  }
}

/**
 * Criteria 1 and 3 are claims about production. They may only read MET once the gate has
 * actually been re-read and the output recorded in D.VERIFIED.
 */
function assertNoCriterionIsMetWithoutMeasurement() {
  const needsProof = [1, 3];
  const claimed = D.CRITERIA.filter((c) => needsProof.includes(c.id) && c.verdict === 'MET');
  if (claimed.length === 0) return;
  const v = D.VERIFIED;
  if (!v || !Array.isArray(v.gateAfter) || v.gateAfter.length !== 9) {
    throw new Error(
      'guard: criteria 1 and 3 read MET, but D.VERIFIED carries no post-seed gate reading. '
      + 'Run the seed, re-read the gate, and paste the nine checks in before shipping.',
    );
  }
  const blockers = v.gateAfter.filter((g) => !g.passed).map((g) => g.id).sort();
  const expected = ['claims_approved', 'dry_run_reviewed'];
  if (JSON.stringify(blockers) !== JSON.stringify(expected)) {
    throw new Error(
      `guard: criterion 3 claims only the human attestations remain, but the recorded reading `
      + `shows blockers: ${blockers.join(', ') || '(none)'}`,
    );
  }
  if (typeof v.configRows !== 'number' || v.configRows < 1) {
    throw new Error('guard: criterion 1 claims a config exists, but D.VERIFIED records no row count');
  }
}

/**
 * American spelling in the rendered document AND in the modules that produce it.
 *
 * The source half is not belt-and-braces. This guard originally read only the rendered
 * HTML, and CI failed on a FUNCTION NAME in this very file - the British spelling of
 * "labeled" in `assertUnenforcedFieldsAreLabeled`, which never reaches the page.
 * `americanSpelling.test.js` scans the whole artifact source tree, so the repo caught it
 * and the build did not, which is a round trip through CI for something a local guard can
 * see in a second.
 */
function assertAmericanSpelling() {
  const rendered = `${R.buildVisual()} ${R.buildDocument()}`.replace(/<[^>]+>/g, ' ');
  const sources = ['c012Data.js', 'c012Guards.js', 'c012Render.js']
    .map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'))
    .concat(fs.readFileSync(path.join(__dirname, '..', 'buildC012Artifacts.js'), 'utf8'))
    .concat(declarationSource());
  for (const [what, text] of [['document', rendered], ['source', sources.join('\n')]]) {
    const hits = findAllBritishSpellings(text);
    if (hits.length > 0) {
      // findAllBritishSpellings returns {word, american} objects, so name both - a bare
      // join prints [object Object] and tells you nothing about what to change.
      const named = hits.slice(0, 6).map((h) => `${h.word} -> ${h.american}`).join(', ');
      throw new Error(`guard: British spelling in the ${what}: ${named}`);
    }
  }
}

function assertAllGuards() {
  const checked = assertDeclaredValuesMatchSource();
  assertNoConfigIsAllDefaults();
  assertConfigsDifferFromEachOther();
  assertEveryFieldHasABasis();
  assertNoAttestationClaimed();
  assertGateBeforeMatchesMeasurement();
  assertUnenforcedFieldsAreLabeled();
  assertEveryFlagIsRendered();
  assertNoCriterionIsMetWithoutMeasurement();
  assertAmericanSpelling();
  return checked;
}

module.exports = {
  PLATFORM_DEFAULTS,
  assertAllGuards,
  assertAmericanSpelling,
  assertConfigsDifferFromEachOther,
  assertDeclaredValuesMatchSource,
  assertEveryFieldHasABasis,
  assertEveryFlagIsRendered,
  assertGateBeforeMatchesMeasurement,
  assertNoAttestationClaimed,
  assertNoConfigIsAllDefaults,
  assertNoCriterionIsMetWithoutMeasurement,
  assertUnenforcedFieldsAreLabeled,
};
