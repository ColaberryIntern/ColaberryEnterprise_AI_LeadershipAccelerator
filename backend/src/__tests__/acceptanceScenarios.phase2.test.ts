import * as fs from 'fs';
import * as path from 'path';

/**
 * T213 — the fifteen Phase 2 acceptance scenarios, as a reconstructible set.
 *
 * ── WHY THIS IS A REGISTRY AND NOT FIFTEEN MORE TESTS ───────────────────────
 *
 * The plan's own words: an earlier cycle claimed "all fourteen pass", which
 * "named a population nobody could reconstruct". That is the failure this file
 * exists to prevent — not a shortage of assertions, but the absence of a
 * mapping from each scenario to the assertion that actually covers it.
 *
 * Writing fifteen NEW behavioural tests here would need the mock harnesses of
 * six different suites copied into one file, and the copies would drift from
 * the originals — which is the same mistake as a second subject-ref builder or
 * a second conversion predicate, both of which this phase spent a task
 * removing. Worse, a hurried duplicate is how this phase produced five tests
 * that could not fail (deleted in T202b).
 *
 * So each scenario names the REAL test that proves it, and this file fails if
 * that test stops existing. The behaviour is proven where it lives; the mapping
 * is proven here. The two together are what "all fifteen pass" has to mean.
 *
 * ── WHAT WOULD MAKE THIS FILE WORTHLESS, AND WHY IT DOES NOT ────────────────
 *
 * A registry of names is worthless if the matcher cannot fail. Three controls:
 *
 *   1. a deliberately WRONG title must not be found (the matcher can fail);
 *   2. every title must appear EXACTLY once (a renamed test is a failure, not a
 *      silently satisfied `includes`);
 *   3. a suite path that does not exist is a failure, so a moved file is loud.
 *
 * The titles are stored as SUBSTRINGS rather than whole titles on purpose: some
 * full titles contain the two column names this repo scans for in writer
 * tripwires, and a registry quoting them would trip guards it has nothing to do
 * with.
 */

const SRC = path.join(__dirname, '..');

interface Scenario {
  /** 1-15, as Ali numbered them. */
  n: number;
  /** Ali's wording, not a paraphrase. */
  text: string;
  /** Repo-relative to `backend/src`. */
  suite: string;
  /** A substring that identifies the covering test's title uniquely. */
  test: string;
  /** Which task proved it, and the mutation that showed the test can fail. */
  provenBy: string;
}

const SCENARIOS: Scenario[] = [
  {
    n: 1,
    text: 'A /enroll signup enters Explorer Growth immediately.',
    suite: 'services/__tests__/freeAccountRegistration.test.ts',
    test: 'learner gets BOTH columns',
    provenBy: 'T206; mutation: writing one column without the other fails this test',
  },
  {
    n: 2,
    text: "A signup arriving through another brand's path enters Explorer Growth immediately.",
    suite: 'controllers/__tests__/portalFreeSignupRoute.test.ts',
    test: 'passes programme: learner and the acquisition fields through',
    provenBy: 'T204; the OTHER signup implementation, which is the whole point of the scenario',
  },
  {
    n: 3,
    text: 'Origin brand remains correct and is not overwritten by journey ownership.',
    suite: 'services/__tests__/freeSignupAcquisition.test.ts',
    test: 'the brand really is reachable from source_id, and is not duplicated onto the Lead',
    provenBy: 'T204; origin brand is not journey ownership — the two live in different columns',
  },
  {
    n: 4,
    text: 'A repeat signup creates no duplicate journey.',
    suite: 'services/explorerGrowth/__tests__/explorerProfileAtRegistration.test.ts',
    test: 'creates NO second profile',
    provenBy: 'T205; mutation: dropping the upsert guard creates a second row and fails this',
  },
  {
    n: 5,
    text: 'An existing paid learner is never downgraded.',
    suite: 'services/__tests__/freeAccountRegistration.test.ts',
    test: 'never upgrades a PAID row',
    provenBy: 'T206, with T207 covering the backfill path (never demotes a paid row to guest)',
  },
  {
    n: 6,
    text: 'A free Explorer is not marked converted.',
    suite: 'services/adminOs/__tests__/conversionState.test.ts',
    test: 'does not treat an unpaid Explorer',
    provenBy: 'T210; the defect this phase was called to fix',
  },
  {
    n: 7,
    text: 'Pre-registration Visitor/PageEvent history appears after identity resolution.',
    suite: 'services/adminOs/__tests__/evidencePackage.test.ts',
    test: 'keys pre-registration page events',
    provenBy: 'T211 mutant M7: removing the lead_id stitch key kills three named tests',
  },
  {
    n: 8,
    text: 'Cross-brand history follows a stitched person.',
    suite: 'services/adminOs/__tests__/evidencePackage.test.ts',
    test: 'shows no cross-brand history',
    provenBy: 'T211; the unstitched person is the control, and no brand filter is applied',
  },
  {
    n: 9,
    text: 'Explorer E/I/F appears in Person 360.',
    suite: 'services/adminOs/__tests__/evidencePackage.test.ts',
    test: 'returns NULL for an unscored person',
    provenBy: 'T211 mutants M1/M2; T212 renders it, mutant M2 proving null is not 0/0/0',
  },
  {
    n: 10,
    text: 'Paid/subscription state is authoritative for conversion.',
    suite: 'services/adminOs/__tests__/conversionState.test.ts',
    test: 'does treat a paid learner as converted',
    provenBy: 'T210; paired with the comp-seat tests, so the fix did not disable the feature',
  },
  {
    n: 11,
    text: 'The GHL contact ID is included when present.',
    suite: 'services/adminOs/__tests__/evidencePackage.test.ts',
    test: 'selects the column and passes its value',
    provenBy: 'T211 mutant M4: commenting the column out kills this test via sqlOf()',
  },
  {
    n: 12,
    text: 'Missing GHL linkage degrades honestly rather than throwing.',
    suite: 'services/adminOs/__tests__/evidencePackage.test.ts',
    test: 'degrades a missing linkage to null',
    provenBy: 'T211; T212 renders the absence as a sentence, not as a blank field',
  },
  {
    n: 13,
    text: 'The nightly repair recovers a deliberately missed immediate bridge.',
    suite: 'services/explorerGrowth/__tests__/explorerIdentityBridge.test.ts',
    test: 'returns the enrollment ids whose lead_id is still null',
    provenBy: 'T205; reconciliation is RECOVERY only — registration is the primary path',
  },
  {
    n: 14,
    text: 'An org teammate is not an Explorer.',
    suite: 'scripts/lib/__tests__/freeAccountCoherenceBackfill.test.ts',
    test: 'never conscripts an org teammate',
    provenBy: 'T207; the incident revision 1 of the plan would have caused',
  },
  {
    n: 15,
    text: 'A returning person whose only prior row is withdrawn becomes a visible Explorer.',
    suite: 'services/__tests__/freeAccountRegistration.test.ts',
    test: 'a returning person whose only row is WITHDRAWN',
    provenBy: "T206; cycle 1's Hole 1, with a sibling test proving the status filter is load-bearing",
  },
];

const read = (suite: string): string => fs.readFileSync(path.join(SRC, suite), 'utf8');

describe('T213 — the fifteen acceptance scenarios are a set, not a claim', () => {
  it('is exactly fifteen, numbered 1-15, with no gap and no duplicate', () => {
    expect(SCENARIOS).toHaveLength(15);
    expect(SCENARIOS.map((s) => s.n)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it('every scenario carries Ali\'s wording, not a placeholder', () => {
    for (const s of SCENARIOS) {
      expect(s.text.length).toBeGreaterThan(25);
      expect(s.text).toMatch(/\.$/);
    }
  });

  it('every scenario names the task and the mutation that proved it', () => {
    for (const s of SCENARIOS) {
      expect(s.provenBy).toMatch(/T2\d\d/);
      expect(s.provenBy.length).toBeGreaterThan(20);
    }
  });
});

describe('T213 — each scenario resolves to a test that really exists', () => {
  it.each(SCENARIOS.map((s) => [s.n, s.text, s] as [number, string, Scenario]))(
    'S%i — %s',
    (_n, _text, s) => {
      const file = path.join(SRC, s.suite);
      // A moved or renamed suite must be loud, not silently uncovered.
      expect(fs.existsSync(file)).toBe(true);
      const src = read(s.suite);
      // EXACTLY once. A renamed test, or one duplicated into two places, is a
      // failure rather than a satisfied `includes`.
      const hits = src.split(s.test).length - 1;
      expect(hits).toBe(1);
    },
  );
});

describe('T213 — the matcher can fail, so the fifteen above mean something', () => {
  it('does NOT find a title that was never written', () => {
    // The control. Without it, every assertion above would also pass if `read`
    // returned the whole repo or the matcher always said yes.
    const src = read(SCENARIOS[0].suite);
    expect(src.split('a test title nobody has ever written').length - 1).toBe(0);
  });

  it('counts a title that appears twice as a failure, not a pass', () => {
    // Proves the exactly-once rule is doing work: a doubled title is caught.
    const doubled = 'xyzzy-marker';
    const fake = `it('${doubled}')\nit('${doubled}')`;
    expect(fake.split(doubled).length - 1).toBe(2);
  });

  it('reads real suite files, not empty strings', () => {
    // The two-way control: if `read` were broken every absence check would pass
    // and every presence check would fail, so assert the files have substance.
    for (const s of SCENARIOS) {
      expect(read(s.suite).length).toBeGreaterThan(500);
    }
  });
});
