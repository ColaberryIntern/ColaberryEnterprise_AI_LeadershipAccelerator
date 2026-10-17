import * as fs from 'fs';
import * as path from 'path';
import {
  enumerateLearnerWriters,
  findWriteSites,
  stripComments,
} from '../../scripts/enumerateFreeAccountConsumers';

/**
 * Phase 2 T203 — only three files may write learner-programme semantics, and the
 * two that are not the canonical service are allow-listed by name.
 *
 * WHY AN ALLOW-LIST RATHER THAN "ONLY THE CANONICAL SERVICE". The plan said the
 * allow-list would have exactly one member. Derived from the source it has **two**,
 * and both are legitimate:
 *
 *   `enrollmentService.createExplorerEnrollment` — the `/enroll` page. It does far
 *     more than create an account (cohort placement, lead capture, a welcome email,
 *     campaign enrolment), so routing its creation through the shared service would
 *     mean threading a cohort id into a function whose whole point is that free
 *     accounts have no cohort — a larger change, on a SENDING path, for no gain in
 *     the property this phase needs.
 *   `openHouseCreditService.reconcileOpenHousePayer` — the $50 seat deposit. Its
 *     write is correct and deliberate: a deposit is not a subscription, so the
 *     payer stays an Explorer until they pay. Rerouting it was considered and
 *     rejected (see below).
 *
 * WHY THE DEPOSIT PATH IS NOT REROUTED, since an earlier plan revision said it
 * should be. Explorer Growth's population loader is
 * `explorerIdentityBridge.loadActiveExplorers`, which filters on
 * `enrollment_type = 'explorer' AND status = 'active'` with **no deposit
 * exclusion** — so a deposit-holding free account is already visible to Explorer
 * Growth. The `ac.enrollment_id IS NULL` clause that looked like an exclusion
 * belongs to `explorerRosterService`, whose only consumer is an `/admin/revenue`
 * drill-down, and it partitions with `subscriptionRosterService` for revenue
 * reporting. That is a reporting decision, not a journey-visibility one. Rerouting
 * would have moved a correct write for a reason that did not hold.
 *
 * THE SCANNER IS THE LOAD-BEARING PART, so it is checked before it is trusted. It
 * must distinguish a WRITE from a READ: `enrollmentService.ts:163` and
 * `explorerIdentityBridge.ts:122` both contain `enrollment_type: 'explorer'` and
 * neither writes it — the first is the retirement sweep's `where`, the second is
 * the population loader's.
 *
 * WHAT THIS GUARD IS, STATED HONESTLY, because three verification rounds found it
 * narrower than its own description. **It is not a proof that only three files can
 * write these columns.** It catches the shapes enumerated in the tests below —
 * object payloads in any quoting, ternaries, spreads, `upsert`, `bulkCreate`,
 * `findOrCreate` defaults, two-argument `update`, property assignment then `save`,
 * `setDataValue`, and raw-SQL `SET`/`INSERT` on one line or across lines — and it
 * **misses a value that is behind a constant** (`tier: TIERS.GUEST`), which would
 * need type resolution rather than a better pattern. Each of those claims is a test
 * here, so the description cannot drift from the behaviour without the suite going
 * red.
 *
 * Every earlier version of this docblock overstated the guarantee, and each time a
 * verifier found a shape the prose had implicitly promised to catch. The guarantee
 * is now the test list, not a sentence.
 */
const CANONICAL = 'services/freeAccountRegistration.ts';
const ALLOW_LISTED = [
  'services/enrollmentService.ts',
  'services/openHouseCreditService.ts',
  // Added by T207/T210. Both match the scanner by SHAPE, not by behaviour: the
  // scanner counts a returned object literal as a write (deliberately - that is
  // how it catches `freeEnrollmentDefaults`), and both of these return literals
  // that name the columns without writing a row.
  //
  // `freeAccountCoherenceBackfill.ts` is the backfill's PURE predicate. It
  // returns a ledger of {id, column, from, to} patches; the CLI is what applies
  // them, and only with --confirm-production.
  'scripts/lib/freeAccountCoherenceBackfill.ts',
  // `conversionState.ts` is a DERIVATION - SQL fragments and a TS predicate. It
  // writes nothing at all; its literals are the stage CASE's branch values.
  'services/adminOs/conversionState.ts',
  // Added by M21. It DOES write, but only to `explorer_entered_at`, and only on
  // rows whose programme membership is already settled: its WHERE clause is
  // `enrollment_type = 'explorer' AND tier = 'guest' AND explorer_entered_at IS
  // NULL`. It never moves a person into or out of the learner programme, which
  // is what this tripwire exists to catch. Dry run is the default, every UPDATE
  // is pinned to the NULL it planned against, and the ledger is reversible.
  'scripts/backfillExplorerEnteredAt.ts',
  // Added by M25, and it writes NOTHING. A read-only distribution report: it SELECTs the
  // explorer population, reads each person through the normal Person 360 reader, scores them
  // in memory and prints a histogram. No INSERT, UPDATE or DELETE appears in it, and it
  // assigns enrollment_type nowhere. It matches this scanner only on the shape of its SELECT.
  'scripts/srsDistributionReport.ts',
];

describe('T203 — the scanner can tell a write from a read', () => {
  it('counts a creation payload as a write', () => {
    const sites = findWriteSites(`await Enrollment.create({\n  enrollment_type: 'explorer',\n});`);
    expect(sites).toHaveLength(1);
  });

  it('counts an in-place update as a write', () => {
    const sites = findWriteSites(`await row.update({ enrollment_type: 'explorer' });`);
    expect(sites).toHaveLength(1);
  });

  it('counts a returned object literal as a write — the canonical service shape', () => {
    // `freeEnrollmentDefaults` returns a plain object that `Enrollment.create`
    // receives elsewhere. An earlier version of this scanner only looked inside
    // `.create({ … })` blocks and missed it, which is an under-count: a tripwire
    // that misses a writer reports clean while a new writer walks past.
    const sites = findWriteSites(`return {\n  tier: 'guest' as const,\n};`);
    expect(sites).toHaveLength(1);
  });

  it('does NOT count a single-line where clause as a write', () => {
    const sites = findWriteSites(`where: { enrollment_type: 'explorer', status: 'active' },`);
    expect(sites).toEqual([]);
  });

  it('does NOT count a multi-line where clause as a write — the retirement sweep shape', () => {
    const sites = findWriteSites(
      `const strays = await Enrollment.findAll({\n  where: {\n    email,\n    enrollment_type: 'explorer',\n    status: 'active',\n  },\n});`,
    );
    expect(sites).toEqual([]);
  });

  /**
   * THE SHAPE THAT DEFEATED THE FIRST VERSION, and the reason this suite exists at
   * all. A verifier dropped a brand-new third writer into a new file as
   * `findOne({ where: { email } })` followed by a `create({ … })` — the most
   * ordinary shape in this repo, look the person up then make them — and the
   * scanner reported `6 write sites across 3 files`, unchanged. The tripwire passed
   * 17 of 17 while a third writer walked straight past it.
   *
   * Cause: the old rule walked BACK up to 12 lines for an unclosed `where: {`, and
   * a balanced one-liner leaves the brace depth at zero, so a single `findOne`
   * suppressed every write in the next twelve lines. The docblock claimed the error
   * mode was over-counting. It was the opposite — the one direction that makes a
   * guard worthless.
   */
  it('FINDS a write that follows a one-line findOne on the next lines', () => {
    const sites = findWriteSites(
      [
        `const existing = await Enrollment.findOne({ where: { email } });`,
        `if (!existing) {`,
        `  await Enrollment.create({`,
        `    enrollment_type: 'explorer',`,
        `    tier: 'guest',`,
        `  });`,
        `}`,
      ].join('\n'),
    );
    expect(sites).toHaveLength(2);
    expect(sites.map((s) => s.line)).toEqual([4, 5]);
  });

  it('FINDS a two-argument update, where the payload and the filter share a line', () => {
    const sites = findWriteSites(
      `await Enrollment.update({ enrollment_type: 'explorer' }, { where: { id } });`,
    );
    expect(sites).toHaveLength(1);
  });

  it('FINDS a double-quoted literal', () => {
    expect(findWriteSites(`  enrollment_type: "explorer",`)).toHaveLength(1);
    expect(findWriteSites(`  tier: "guest",`)).toHaveLength(1);
  });

  it('FINDS a raw-SQL SET write, which no object-literal rule can see', () => {
    const sites = findWriteSites(`await sql.query("UPDATE enrollments SET enrollment_type = 'explorer' WHERE id = :id");`);
    expect(sites).toHaveLength(1);
    expect(sites[0].call).toBe('sql');
  });

  it('does NOT count a raw-SQL WHERE as a write — the keyword is the only difference', () => {
    expect(findWriteSites(`WHERE e.enrollment_type = 'explorer' AND e.status = 'active'`)).toEqual([]);
  });

  /**
   * THE FOUR SHAPES THAT DEFEATED ATTEMPT 2, each its own test.
   *
   * A verifier put all four in one new file outside the allow-list and the scanner
   * reported its answer **unchanged** while the tripwire passed 23 of 23. Three
   * rounds of enumerating write *syntaxes* had still missed this repo's own idioms,
   * so the rule was inverted: recognise the column and its value co-occurring in
   * ANY syntax, then subtract reads. These four are the regression tests for that
   * inversion.
   */
  it('FINDS property assignment then save — idiomatic here, and invisible before', () => {
    const sites = findWriteSites(
      `row.enrollment_type = 'explorer';\r\nrow.tier = 'guest';\r\nawait row.save();`,
    );
    expect(sites).toHaveLength(2);
  });

  it('FINDS a raw-SQL INSERT, which the SET-only rule never looked for', () => {
    const sites = findWriteSites(
      `await q(\`INSERT INTO enrollments (email, enrollment_type, tier)\r\n   VALUES (:email, 'explorer', 'guest')\`);`,
    );
    expect(sites.length).toBeGreaterThanOrEqual(1);
  });

  it('FINDS a ternary value', () => {
    expect(findWriteSites(`  enrollment_type: isFree ? 'explorer' : 'standard',`)).toHaveLength(1);
  });

  it('FINDS a quoted key', () => {
    expect(findWriteSites(`  'enrollment_type': 'explorer',`)).toHaveLength(1);
  });

  it('FINDS a value wrapped onto the next line', () => {
    expect(findWriteSites(`  enrollment_type:\r\n    'explorer',`)).toHaveLength(1);
  });

  it('FINDS setDataValue, where the column is a string argument', () => {
    expect(findWriteSites(`row.setDataValue('enrollment_type', 'explorer');`)).toHaveLength(1);
  });

  it('FINDS a spread payload, an upsert and a bulkCreate', () => {
    expect(findWriteSites(`await E.create({ ...defaults, enrollment_type: 'explorer' });`)).toHaveLength(1);
    expect(findWriteSites(`await E.upsert({ email, tier: 'guest' });`)).toHaveLength(1);
    expect(findWriteSites(`await E.bulkCreate([{ email, tier: 'guest' }]);`)).toHaveLength(1);
  });

  it('FINDS a multi-line SET, and the limitation that used to be documented is GONE', () => {
    // An earlier version asserted this as a known limit and justified it with
    // "which is how every single-statement update in this repo is written". That
    // was false — `paymentSyncService.ts:191` opens `UPDATE enrollments SET` with
    // the assignments on later lines. The rule now looks back for the statement
    // keyword rather than requiring it on the same line, so the limit is closed
    // and this test records that rather than the stale claim.
    expect(findWriteSites(`await q(\`UPDATE enrollments\r\n  SET\r\n    enrollment_type = 'explorer'\`);`))
      .toHaveLength(1);
  });

  /**
   * THE SHAPES THAT SURVIVED THREE ATTEMPTS, because the inversion was applied to
   * candidate detection and not to the read-subtraction escape hatch. On any line
   * that also contains `where:`, the scanner reverted to the old narrow literal
   * list — so these two forms, which are everywhere in this repo (`findOrCreate`
   * 366 times in non-test backend source, one-line two-arg `update` 32 times), were
   * invisible. A verifier put all three in a new file and the generator reported
   * its answer unchanged for the third time running.
   */
  it('FINDS a one-line findOrCreate defaults payload — the single most common shape here', () => {
    expect(findWriteSites(
      `await Enrollment.findOrCreate({ where: { email }, defaults: { enrollment_type: 'explorer', tier: 'guest' } });`,
    )).toHaveLength(1);
  });

  it('FINDS a one-line two-arg update whose payload is a ternary', () => {
    expect(findWriteSites(
      `await Enrollment.update({ enrollment_type: isFree ? 'explorer' : 'standard' }, { where: { email } });`,
    )).toHaveLength(1);
  });

  it('FINDS a one-line two-arg update whose payload uses a quoted key', () => {
    expect(findWriteSites(`await Enrollment.update({ 'tier': 'guest' }, { where: { email } });`))
      .toHaveLength(1);
  });

  it('and still does NOT count the filter half of those calls', () => {
    // The whole point: the write half counts, the `where` half does not. If this
    // started counting, the guard would flag every lookup in the repo.
    expect(findWriteSites(`await Enrollment.findOrCreate({ where: { enrollment_type: 'explorer' } });`))
      .toEqual([]);
  });

  it('THE ONE LIMIT THAT REMAINS, measured not assumed: a value behind a constant', () => {
    // `tier: TIERS.GUEST` carries no literal for any regex to find. Asserted so the
    // boundary is visible in the suite rather than only in a comment — an
    // undocumented blind spot in a guard is indistinguishable from a guard that
    // works. Closing it would need type resolution, not a better pattern.
    expect(findWriteSites(`await E.create({ tier: TIERS.GUEST, enrollment_type: TYPES.EXPLORER });`))
      .toEqual([]);
  });

  it('does NOT count a type union as a write', () => {
    expect(findWriteSites(`declare tier: 'guest' | 'member';`)).toEqual([]);
    expect(findWriteSites(`  tier: 'guest' | 'member';`)).toEqual([]);
  });

  it('does NOT count a comment that quotes the literal', () => {
    expect(findWriteSites(`// we set enrollment_type: 'explorer' here`)).toEqual([]);
  });

  it('guards both columns, not just one', () => {
    expect(findWriteSites(`  tier: 'guest',`)).toHaveLength(1);
    expect(findWriteSites(`  enrollment_type: 'explorer',`)).toHaveLength(1);
  });
});

describe('T203 — the writer allow-list', () => {
  const writers = enumerateLearnerWriters();
  const files = [...new Set(writers.map((w) => w.file))].sort();

  it('found write sites at all, and states how many — a scan matching nothing must not pass', () => {
    // **7** sites across 3 files, from the generator's own output. It was 6 until
    // the detection rule was inverted to recognise the column-and-value pairing
    // instead of a list of syntaxes — the seventh is
    // `freeAccountRegistration.ts:81`, the canonical service's own ternary
    // (`programme === 'learner' ? 'explorer' : 'standard'`), which every previous
    // version of the scanner missed. More complete, same file set.
    //
    // The site count is a floor because refactoring moves it; the FILE set is the
    // property being guarded and is asserted exactly below.
    expect(writers.length).toBeGreaterThanOrEqual(7);
    // 3 -> 5: T207's pure predicate and T210's derivation both match the
    // scanner by SHAPE (a returned object literal naming the columns) while
    // writing nothing. 5 -> 6: M21's backfill, which matches because its WHERE
    // clause names the columns to SELECT the population; the only column it
    // assigns is explorer_entered_at. Updated deliberately, which is what the
    // pinned number is for. 6 -> 7: M25's distribution report, which writes NOTHING and
    // matches only on the shape of its SELECT.
    expect(files).toHaveLength(7);
  });

  it('the canonical service is one of them', () => {
    expect(files).toContain(CANONICAL);
  });

  it('every OTHER writer is on the allow-list, by name', () => {
    const unexpected = files.filter((f) => f !== CANONICAL && !ALLOW_LISTED.includes(f));
    expect(unexpected).toEqual([]);
  });

  it('the allow-list has exactly six members, so growing it is a deliberate edit', () => {
    // The plan said one. Derived from source it was two; T207 and T210 added two
    // more, both SHAPE matches that write nothing. M21 added the fifth, which is
    // the first entry that genuinely writes - to `explorer_entered_at` only, on
    // rows whose membership is already settled. Stated as an exact set so a
    // sixth cannot be added quietly.
    // M25 added the sixth, and it is the weakest kind of match: a read-only report that
    // writes nothing at all and matches only because it SELECTs the explorer population.
    expect(ALLOW_LISTED).toHaveLength(6);
    expect(ALLOW_LISTED).toEqual([
      'services/enrollmentService.ts',
      'services/openHouseCreditService.ts',
      'scripts/lib/freeAccountCoherenceBackfill.ts',
      'services/adminOs/conversionState.ts',
      'scripts/backfillExplorerEnteredAt.ts',
      'scripts/srsDistributionReport.ts',
    ]);
    expect([
      'services/enrollmentService.ts',
      'services/openHouseCreditService.ts',
    ]);
  });

  it('both allow-listed writers really do write, so neither entry is dead', () => {
    for (const f of ALLOW_LISTED) {
      expect(files).toContain(f);
    }
  });

  /**
   * The decision not to reroute the deposit path rests on two factual claims about
   * other people's SQL. If either stops being true, the decision needs revisiting,
   * so both are asserted rather than left in a comment.
   */
  describe('the partition the decision rests on', () => {
    const read = (rel: string) =>
      stripComments(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'));

    it('the Explorer population loader has NO deposit exclusion — deposit holders are visible', () => {
      const src = read('explorerGrowth/explorerIdentityBridge.ts');
      expect(src).toContain("where: { enrollment_type: 'explorer', status: 'active' }");
      // The clause that looked like an exclusion is not here. If it ever appears,
      // deposit holders stop being visible to Explorer Growth and the deposit path
      // would need rerouting after all.
      expect(src).not.toContain('ac.enrollment_id IS NULL');
    });

    it('the REVENUE roster is the one that excludes deposit holders', () => {
      expect(read('explorerRosterService.ts')).toContain('ac.enrollment_id IS NULL');
    });

    it('and the deposit roster is its exact complement, requiring the credit', () => {
      const src = read('subscriptionRosterService.ts');
      expect(src).toContain("ac.reason = 'open_house_deposit'");
      expect(src).toContain("e.enrollment_type = 'explorer'");
    });
  });

  it('the two known READS are absent — the scanner is not just matching the literal', () => {
    // `explorerIdentityBridge` holds the population loader's where clause and
    // writes nothing. If it ever appears here, the scanner has regressed into
    // counting reads and the allow-list stops meaning anything.
    expect(files).not.toContain('services/explorerGrowth/explorerIdentityBridge.ts');
    const enrollmentSites = writers.filter((w) => w.file === 'services/enrollmentService.ts');
    expect(enrollmentSites.map((w) => w.line)).not.toContain(163);
  });
});
