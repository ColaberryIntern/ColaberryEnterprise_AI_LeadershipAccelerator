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
 *
 * ── WHAT THIS FILE STILL CANNOT DETECT, STATED NOT IMPLIED ──────────────────
 *
 * Found by verifiers across two attempts, and listed here because a guard's
 * documentation is its test list:
 *
 *   - AN EMPTIED BODY. A covering test whose assertions are all deleted still
 *     declares itself, still runs, and still passes. A registry cannot see that;
 *     only mutation testing of the production code can, which is why `provenBy`
 *     names a mutation rather than asserting one.
 *   - A NESTED, INDENTED disabled block. `enclosingBlock` walks back to the
 *     nearest COLUMN-0 `describe`/`xdescribe`/`fdescribe`, which is the
 *     convention in all nine covering suites. An indented block would be missed.
 *     The `x`/`f` ALIASES are now caught at column 0 — they were not in attempt
 *     3, and a verifier used `xdescribe(` on the same block to take S6's and
 *     S10's only proofs dark with the registry reporting 38/38 green. Closing
 *     one spelling of a hole is not closing the hole, which is the third time
 *     this phase a guard has been beaten by a variant of the shape it was
 *     written for.
 *   - A BLOCK DISABLED BY EXPRESSION, e.g.
 *     `(cond ? describe.skip : describe)('…')`. Not matched, and not worth
 *     matching with a regex; it would need a parser.
 *   - A WRONG `provenBy` LABEL. Two attempts shipped six of these — three
 *     transposed T211 mutant IDs, and three scenarios citing T206 for tests in a
 *     file T206 never touched (the real prover is T201, whose own mutations do
 *     kill them). The structural guard below checks only that `provenBy` matches
 *     /T2\d\d/ and is longer than 20 characters. It cannot tell a right task
 *     from a wrong one, and nothing mechanical here can; that is a human read.
 *   - NINE OF FIFTEEN name a task and a rationale but NO specific mutation
 *     (S2, S3, S5 partially, S6, S10, S12, S13, S14). The acceptance asks for
 *     each to be mutation-proved, so this is an unmet part of the criterion
 *     rather than a design choice.
 *   - S13 IS THIN. It pins the lead_id write the nightly repair performs, which
 *     `repairAllExplorerBridges` does call — but the same resolver is called by
 *     the registration path, and no test exercises a DELIBERATELY missed bridge
 *     end to end. S14 pins the backfill's decision; its live-write half is
 *     uncited.
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
    provenBy: 'T201 mutation: writing one column without the other in freeEnrollmentDefaults',
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
    provenBy: 'T201 mutation: removing the paid guard from needsProgrammeUpgrade; T207 covers the backfill path',
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
    // Corrected: this was labelled M7. The session log records M7 as the
    // ORDER BY mutant and M8 as the stitch key. A pointer that lands on the
    // wrong mutant defeats the purpose of citing one.
    provenBy: 'T211 mutant M8 (stitch key removed) kills this test by name',
  },
  {
    n: 8,
    text: 'Cross-brand history follows a stitched person.',
    suite: 'services/adminOs/__tests__/evidencePackage.test.ts',
    // Corrected: this was pinned to the CONTROL ("shows no cross-brand history
    // for an unstitched person"), which is the negative case. The scenario is
    // that history DOES follow a stitched person, so it must pin the positive.
    // A verifier proved the difference: renaming and skipping the positives
    // left the registry green with S8 reported as covered.
    test: 'scopes every acquisition row to the stitched lead ids',
    provenBy: 'T211 mutant M8 (stitch key removed); the unstitched person is the sibling control',
  },
  {
    n: 9,
    text: 'Explorer E/I/F appears in Person 360.',
    // Corrected, and this was the worst of the three. It pinned
    // evidencePackage's loader null-boundary — coverage a previous verifier had
    // ALREADY rejected as insufficient for this exact claim, because the suite
    // exercises only the LOADER. The test below asserts the ASSEMBLER calls it,
    // which is what "appears in Person 360" means; its own comment records the
    // earlier mutant that commented the load out while every test stayed green.
    suite: 'services/adminOs/__tests__/personProfileService.test.ts',
    test: 'issues the explorer snapshot query for a caller who may see acquisition',
    provenBy: 'T211 mutant M4 (explorer load removed); T212 mutant M2 proves null is not 0/0/0',
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
    // Corrected: this was labelled M4, which the session log records as the
    // explorer-load mutant. M5 is the GHL column.
    provenBy: 'T211 mutant M5 (ghl column removed) kills this test via sqlOf()',
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
    // Corrected: this pinned DETECTION ("returns the enrollment ids whose
    // lead_id is still null"), not recovery — and that test's body feeds the
    // finder a mocked result, so it never asserts the filter in its own title.
    // The scenario is that the repair RECOVERS a missed bridge, which is the
    // write below.
    test: 'persists the lead_id when an email match exists',
    // Corrected AGAIN, and this is the second wrong-task label on this entry.
    // It said T205. A verifier showed `git log --no-merges` lists T203 and
    // T202b ×2 on the covering suite and NO T205 commit; the production module
    // `explorerIdentityBridge.ts` was touched by NO Phase 2 task at all; and
    // the pinned test itself pre-dates the phase (merge b7f59e42, PR #1895).
    // T205's recorded mutation — "remove the immediate call" — cannot reach it.
    // So the honest label is that NO phase mutation proves this one.
    provenBy: 'PRE-DATES this phase (b7f59e42); NO Phase 2 task mutated '
      + 'explorerIdentityBridge.ts, so no phase mutation proves it. T202b and '
      + 'T203 edited the suite only. See the stated-limits list: S13 is thin.',
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
    provenBy: "T201 mutation: dropping status:'active' from the lookup; cycle 1's Hole 1",
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

describe('T213 — every covering test is LIVE, not skipped or commented out', () => {
  /**
   * The hole a verifier found, which I had not claimed and should have.
   *
   * Turning a covering test into `it.skip` left this registry 21/21 GREEN while
   * the covering suite reported `1 skipped`. So the registry certified a test
   * that no longer runs — which is precisely the failure mode the file's own
   * docblock cites as its motivation (T202b's five tests that could not fail).
   * Matching a title proves the words exist; it does not prove the test runs.
   */
  const DECLARES = /\b(?:it|test)\s*(?:\.each\s*\([^)]*\))?\s*\(/;
  const DISABLED = /\b(?:it|test)\s*\.\s*(?:skip|only|todo|failing)\b/;
  /**
   * `describe.skip` AND the `x`/`f` aliases.
   *
   * Attempt 3 closed one SPELLING of this hole, not the hole. A verifier then
   * changed the same block on the same line to `xdescribe(` and the same six
   * covering tests went dark — S6's and S10's only proofs — with the registry
   * reporting 38/38 green. `enclosingBlock` matched `/^describe/`, so it walked
   * straight PAST the `x`-prefixed line and asserted against an EARLIER block.
   * `xit`/`fit` were already caught incidentally (they fail `DECLARES`), so the
   * gap was specifically at block level.
   */
  const BLOCK_DISABLED = /^(?:x|f)describe\b|^describe\s*\.\s*(?:skip|only)\b/;

  /**
   * The ENCLOSING block, found by walking back to the nearest column-0
   * `describe(`.
   *
   * A verifier confirmed the hole this closes: the first version inspected only
   * the matched `it(` line, so `describe.skip` on the surrounding block silently
   * disabled SIX covering tests — including both S6's and S10's proofs — while
   * the registry stayed green. Its `DISABLED` pattern even listed `describe`,
   * which made that branch unreachable: a token in a pattern the code can never
   * apply is a promise, not a check.
   *
   * Column-0 is the convention in every covering suite here (verified: each one
   * declares its `describe(` blocks unindented), so the nearest preceding
   * column-0 `describe` IS the enclosing block. A nested indented `describe`
   * would not be found, and that limit is stated rather than papered over.
   */
  function enclosingBlock(lines: string[], at: number): string | null {
    for (let i = at; i >= 0; i -= 1) {
      // `[xf]?` is load-bearing: matching only /^describe/ walked past
      // `xdescribe(` and returned an earlier block, which is how the alias
      // bypass passed.
      if (/^[xf]?describe/.test(lines[i])) return lines[i];
    }
    return null;
  }

  it.each(SCENARIOS.map((s) => [s.n, s] as [number, Scenario]))(
    'S%i is pinned to a test that actually runs',
    (_n, s) => {
      const lines = read(s.suite).split('\n');
      const at = lines.findIndex((l) => l.includes(s.test));
      expect(at).toBeGreaterThan(-1);
      const line = lines[at];

      // It must be a test DECLARATION, not prose that happens to quote the title.
      expect(line).toMatch(DECLARES);
      // It must not be disabled itself.
      expect(line).not.toMatch(DISABLED);
      // It must not be commented out.
      expect(line.trimStart().startsWith('//')).toBe(false);
      expect(line.trimStart().startsWith('*')).toBe(false);
      // And its enclosing block must not be disabled either.
      const block = enclosingBlock(lines, at);
      if (block !== null) expect(block).not.toMatch(BLOCK_DISABLED);
    },
  );

  it('the CONTROLS: the live/disabled patterns both fire on real shapes', () => {
    // Without these the loop above passes whatever the suites contain.
    expect("  it('a thing', () => {").toMatch(DECLARES);
    expect("  it.skip('a thing', () => {").toMatch(DISABLED);
    expect("  it.only('a thing', () => {").toMatch(DISABLED);
    expect("  test.todo('a thing');").toMatch(DISABLED);
    // And the live pattern must NOT call an ordinary live test disabled.
    expect("  it('a thing', () => {").not.toMatch(DISABLED);
    // The block pattern, which is the half that was unreachable before.
    expect("describe.skip('a block', () => {").toMatch(BLOCK_DISABLED);
    expect("describe.only('a block', () => {").toMatch(BLOCK_DISABLED);
    expect("describe('a block', () => {").not.toMatch(BLOCK_DISABLED);
    // The ALIASES, which bypassed attempt 3 entirely.
    expect("xdescribe('a block', () => {").toMatch(BLOCK_DISABLED);
    expect("fdescribe('a block', () => {").toMatch(BLOCK_DISABLED);
    // And `enclosingBlock` must FIND an aliased block rather than walk past it,
    // which is the actual bug — the pattern alone was never the problem.
    const lines = ["describe('outer', () => {", "xdescribe('inner', () => {", "  it('x', () => {"];
    expect(enclosingBlock(lines, 2)).toBe("xdescribe('inner', () => {");
  });

  it('finds the ENCLOSING block for a real pinned test, not just any line', () => {
    // The two-way control for `enclosingBlock`. If it returned null for real
    // files, the block assertion above would be skipped for every scenario and
    // the hole would be open again with the tests still green.
    const s = SCENARIOS.find((x) => x.n === 6)!;
    const lines = read(s.suite).split('\n');
    const at = lines.findIndex((l) => l.includes(s.test));
    const block = enclosingBlock(lines, at);
    expect(block).not.toBeNull();
    expect(block!).toMatch(/^describe\(/);
  });
});

describe('T213 — the matcher can fail, so the fifteen above mean something', () => {
  it('does NOT find a title that was never written', () => {
    // The control. Without it, every assertion above would also pass if `read`
    // returned the whole repo or the matcher always said yes.
    const src = read(SCENARIOS[0].suite);
    expect(src.split('a test title nobody has ever written').length - 1).toBe(0);
  });

  it('counts a DOUBLED title in real file content as 2, not as 1', () => {
    // Replaces a tautological version of this control that built its own string
    // and asserted `String.split` against it — it never touched a suite, so it
    // proved nothing about the rule it was named for. This doubles REAL file
    // content and requires the count to move, which is what makes the
    // exactly-once rule above load-bearing rather than decorative.
    const s = SCENARIOS[0];
    const once = read(s.suite);
    expect(once.split(s.test).length - 1).toBe(1);
    expect((once + once).split(s.test).length - 1).toBe(2);
  });

  it('reads real suite files, not empty strings', () => {
    // The two-way control: if `read` were broken every absence check would pass
    // and every presence check would fail, so assert the files have substance.
    for (const s of SCENARIOS) {
      expect(read(s.suite).length).toBeGreaterThan(500);
    }
  });
});
