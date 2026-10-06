import * as fs from 'fs';
import * as path from 'path';
import {
  enumerateLearnerWriters,
  findWriteSites,
  stripComments,
  LEARNER_WRITE_LITERALS,
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
 */
const CANONICAL = 'services/freeAccountRegistration.ts';
const ALLOW_LISTED = [
  'services/enrollmentService.ts',
  'services/openHouseCreditService.ts',
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

  it('KNOWN LIMIT, asserted so the boundary is visible: a multi-line SET is missed', () => {
    // Stated as a test rather than only in a comment, because an undocumented
    // blind spot in a guard is indistinguishable from a guard that works. No
    // raw-SQL writer of either column exists in the tree today; this records what
    // the guard would and would not catch if one arrived.
    const sites = findWriteSites(`UPDATE enrollments\n  SET\n    enrollment_type = 'explorer'`);
    expect(sites).toEqual([]);
  });

  it('does NOT count a type union as a write', () => {
    expect(findWriteSites(`declare tier: 'guest' | 'member';`)).toEqual([]);
    expect(findWriteSites(`  tier: 'guest' | 'member';`)).toEqual([]);
  });

  it('does NOT count a comment that quotes the literal', () => {
    expect(findWriteSites(`// we set enrollment_type: 'explorer' here`)).toEqual([]);
  });

  it('guards both columns, not just one', () => {
    expect(LEARNER_WRITE_LITERALS).toHaveLength(2);
    expect(findWriteSites(`  tier: 'guest',`)).toHaveLength(1);
    expect(findWriteSites(`  enrollment_type: 'explorer',`)).toHaveLength(1);
  });
});

describe('T203 — the writer allow-list', () => {
  const writers = enumerateLearnerWriters();
  const files = [...new Set(writers.map((w) => w.file))].sort();

  it('found write sites at all, and states how many — a scan matching nothing must not pass', () => {
    // 6 sites across 3 files when this was written, from the generator's own
    // output. The exact site count may move with refactoring; the FILE set is the
    // property being guarded, so that is asserted exactly below.
    expect(writers.length).toBeGreaterThanOrEqual(6);
    expect(files).toHaveLength(3);
  });

  it('the canonical service is one of them', () => {
    expect(files).toContain(CANONICAL);
  });

  it('every OTHER writer is on the allow-list, by name', () => {
    const unexpected = files.filter((f) => f !== CANONICAL && !ALLOW_LISTED.includes(f));
    expect(unexpected).toEqual([]);
  });

  it('the allow-list has exactly two members, so growing it is a deliberate edit', () => {
    // The plan said one. Derived from source it is two, and both are justified in
    // this file's docblock. Stated as an exact number so a third cannot be added
    // quietly.
    expect(ALLOW_LISTED).toHaveLength(2);
    expect(ALLOW_LISTED).toEqual([
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
