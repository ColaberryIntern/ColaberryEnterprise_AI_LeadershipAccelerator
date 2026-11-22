/**
 * The L9.7 and L11.7 decision records, asserted as records rather than as files.
 *
 * T14's acceptance: each record names the DECISION, the REASONING, and WHAT WOULD REOPEN IT, and
 * the L9.7 record exists on disk at a known path because `acceptance-matrix-l04.md` is going to
 * cite that path by name. A matrix citing a file that does not exist is worse than a matrix with
 * a gap in it: the gap is visible and the dead citation reads as evidence.
 *
 * The third element is the one worth enforcing. A decision record that says what was decided and
 * why, and never says what would change the answer, is a position paper. "What would reopen this"
 * is what makes it a decision somebody can revisit instead of a wall somebody has to argue with.
 */
import fs from 'fs';
import path from 'path';

const DIR = path.resolve(__dirname, '../../../../../docs/project-lifecycle');

/** Every file under a directory, recursively. Used to assert an ABSENCE across the tree. */
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const RECORDS: ReadonlyArray<[string, string, readonly string[]]> = [
  [
    'L9.7',
    'decision-l97-lc10-lc11-rescoped.md',
    // The distinction the whole record exists to preserve: withdrawn is not satisfied.
    ['LC-10', 'LC-11', 'withdrawn', 'not satisfied', 'selected_design_ref'],
  ],
  [
    'L11.7',
    'decision-l117-no-artifact-contract-sweep.md',
    ['no retrofit sweep', 'artifact contract', 'four live boards'],
  ],
];

describe('the decision records exist where the matrix will cite them', () => {
  it.each(RECORDS.map(([code, file]) => [code, file]))('%s is at %s', (_code, file) => {
    expect(fs.existsSync(path.join(DIR, file))).toBe(true);
  });

  it.each(RECORDS.map(([code, file]) => [code, file]))('%s is a record, not a stub', (_code, file) => {
    // A path that resolves to three lines would satisfy the existence check above.
    expect(fs.readFileSync(path.join(DIR, file), 'utf8').length).toBeGreaterThan(1500);
  });
});

describe('each record names the decision, the reasoning, and what would reopen it', () => {
  it.each(RECORDS.map(([code, file]) => [code, file]))('%s states a decision', (_code, file) => {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    expect(text).toContain('## The decision');
  });

  it.each(RECORDS.map(([code, file]) => [code, file]))('%s states what would reopen it', (_code, file) => {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    expect(text).toMatch(/## What would reopen this/);
    // Not an empty heading: the section has to carry at least two conditions, because a single
    // condition is usually "if we change our minds".
    const section = text.slice(text.indexOf('## What would reopen this'));
    expect((section.match(/^- /gm) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it.each(RECORDS.map(([code, file, needles]) => [code, file, needles]))(
    '%s carries the specifics that make it checkable',
    (_code, file, needles) => {
      const text = fs.readFileSync(path.join(DIR, file as string), 'utf8');
      for (const needle of needles as readonly string[]) {
        expect(text).toContain(needle);
      }
    },
  );
});

describe('the L9.7 record keeps the distinction its whole purpose rests on', () => {
  const text = () => fs.readFileSync(path.join(DIR, 'decision-l97-lc10-lc11-rescoped.md'), 'utf8');

  it('says the rows are WITHDRAWN and explicitly NOT satisfied', () => {
    /*
     * A withdrawn row and a satisfied row look identical in a summary count and mean opposite
     * things. If this sentence ever goes, the matrix can be read as claiming LC-10 passed.
     */
    const t = text();
    expect(t).toContain('not marked satisfied');
    expect(t).toMatch(/withdrawn/i);
  });

  it('rejects the three easier alternatives in writing, so the ruling is a choice not a default', () => {
    const t = text();
    expect(t).toContain('Mark them satisfied');
    expect(t).toContain('Hold the phase open');
    expect(t).toContain('Leave them silently open');
  });
});
/**
 * THE RECORD'S CLAIMS ABOUT CODE, BOUND TO THE CODE.
 *
 * ## Why this block exists
 *
 * The first version of the L9.7 record asserted *"no role is compared at approval time"* and
 * offered a `git grep` as proof. The claim was FALSE at the commit that wrote it: the role limb
 * was closed on `main` in `d70d72ee3` on 2026-11-03, and `lifecycleStatus.ts` calls
 * `assertApproverRole` with no flag. A verifier ran the grep the record invited and it disproved
 * the record.
 *
 * The claim was true when Phase 7 recorded it. The record quoted Phase 7 rather than the code,
 * and the test that was supposed to protect the claim was `expect(t).toContain('no role is
 * compared at approval time')` -- a document-wide check on a SENTENCE, which pins the wording in
 * place and says nothing at all about whether the wording is true. A mutation deleting the
 * sentence was caught; the sentence being false was invisible. That is the run's recurring defect
 * in its worst form: a test enforcing a false statement about the codebase.
 *
 * ## So every code claim here is checked in BOTH directions
 *
 * For each limb: what the CODE does, and what the RECORD says about it. If somebody changes the
 * code, these fail and name the document to update, which is the only arrangement under which a
 * document quoting code is safe to keep.
 */
describe('the L9.7 record agrees with the code it describes', () => {
  const record = () => fs.readFileSync(path.join(DIR, 'decision-l97-lc10-lc11-rescoped.md'), 'utf8');
  /** A sibling module of this suite's directory: `__tests__/..` is `services/lifecycle`. */
  const src = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');

  it('does NOT carry the retracted claim, in any of its wordings', () => {
    const t = record();
    for (const retracted of [
      'no role is compared at approval time',
      'RECORDING, not by ENFORCEMENT',
      'One of two blockers cleared is not a row',
    ]) {
      expect(t).not.toContain(retracted);
    }
  });

  it('and says plainly that it was corrected, rather than editing the error away', () => {
    // A record that quietly drops a false claim teaches nobody. The retraction is the artifact.
    const t = record();
    expect(t).toContain('Corrected 2026-11-22');
    expect(t).toContain('That claim was false when this record was written');
    expect(t).toContain('d70d72ee3');
  });

  it('THE ROLE LIMB IS ENFORCED IN CODE, and the record says so', () => {
    /*
     * The enforcement call site, read from the file. If somebody removes it, this fails and the
     * record's statement that the limb is closed becomes the thing to revisit -- which is the
     * inverse of what happened last time, when the code moved and the document did not.
     */
    const status = src('lifecycleStatus.ts');
    expect(status).toContain('assertApproverRole(input.admin.role)');

    const policy = src('approverRolePolicy.ts');
    expect(policy).toContain('export function assertApproverRole');
    expect(policy).toContain("BLUEPRINT_APPROVER_ROLES: readonly string[] = ['super_admin']");
    // No flag. A gate behind a flag that defaults off is not enforcement, and the record would
    // have to say so.
    expect(policy).not.toContain('FLAGS.');

    expect(record()).toContain('assertApproverRole');
    expect(record()).toContain('closed on `main` in commit `d70d72ee3`');
  });

  it('THE DESIGN LIMB IS NOT BOUND IN CODE, which is what now withholds the row', () => {
    /*
     * Three facts, each one line, each the reason the record gives. If any of them stops being
     * true the limb is arguably closed and this record needs re-ruling, so each is asserted
     * rather than described.
     */
    // 1. Caller-supplied and nullable.
    expect(src('blueprintApproval.ts'))
      .toContain('selected_design_ref: input.selectedDesignRef ?? null');

    /*
     * 2. Nothing to compare it against: the design-decision model has no non-test reader. Read
     *    as an absence, which is the only way to assert "nothing reads this".
     *
     *    SCANNED OVER THE TREE, not over three named files. The first version named
     *    `blueprintApproval.ts`, `lifecycleStatus.ts` and `lifecyclePrerequisites.ts`, so a
     *    reader added anywhere else would have left this record false with the suite green. A
     *    verifier pointed that out. The DDL, the schema-contract name list, the model itself and
     *    the model registry are not readers: they are where the table is DECLARED.
     */
    const DECLARATIONS = [
      'db/ensureProjectLifecycleSchema.ts',
      'db/projectLifecycleSchemaContract.ts',
      'models/BlueprintDesignDecision.ts',
      'models/index.ts',
    ];
    /*
     * COMMENTS ARE STRIPPED FIRST. The tree scan's first run reported
     * `models/BlueprintVisualContract.ts`, which mentions `BlueprintDesignDecision` only in a
     * doc comment explaining why neither model declares an `indexes` block. Prose about a module
     * is not a read of it, and a check that cannot tell them apart would make this record
     * unmaintainable: every comment naming the model would read as a closure of the limb. The
     * same strip was needed in T10's sweep for the same reason.
     */
    const stripComments = (s: string): string =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const readers = walk(path.resolve(__dirname, '../../..'))
      .filter((p) => !p.includes('__tests__') && /\.ts$/.test(p))
      .filter((p) => !DECLARATIONS.some((d) => p.replace(/\\/g, '/').endsWith(d)))
      .filter((p) => stripComments(fs.readFileSync(p, 'utf8')).includes('BlueprintDesignDecision'));
    expect(readers).toEqual([]);
    // The control for the STRIP, not just for the scan: the comment-only mention is still on
    // disk, so if the strip stopped working this test would fail rather than pass more easily.
    expect(fs.readFileSync(path.resolve(__dirname, '../../../models/BlueprintVisualContract.ts'), 'utf8'))
      .toContain('BlueprintDesignDecision');
    // The control: the declarations DO mention it, so the scan is looking in the right tree.
    expect(fs.readFileSync(path.resolve(__dirname, '../../../models/BlueprintDesignDecision.ts'), 'utf8'))
      .toContain('BlueprintDesignDecision');

    // 3. The approval boundary does not re-check the design-selection gate. Prerequisites are
    //    not cumulative, and only `planning` spreads another stage's predicate.
    const prereq = src('lifecyclePrerequisites.ts');
    expect(prereq).toContain('design_variant_not_selected');
    const approvedBlock = prereq.slice(
      prereq.indexOf('  blueprint_approved: (e) => {'),
      prereq.indexOf('  planning: (e) => ['),
    );
    expect(approvedBlock.length).toBeGreaterThan(200);
    expect(approvedBlock).not.toContain('design_ready');
    expect(approvedBlock).not.toContain('selectedDesignRef');

    // And the record states all three rather than asserting the conclusion alone.
    const t = record();
    expect(t).toContain('selected_design_ref: input.selectedDesignRef ?? null');
    expect(t).toContain('no non-test reader');
    expect(t).toContain('not re-checked at the approval boundary');
  });

  it('the `planning` predicate DOES spread another stage, so fact 3 is discriminating', () => {
    // The control. Without it, `not.toContain('design_ready')` could be passing because no
    // predicate in this file ever spreads another, making the observation vacuous.
    expect(src('lifecyclePrerequisites.ts'))
      .toContain('...PREREQUISITES.blueprint_approved(e)');
  });
});
