/**
 * P7-T4's refusal half: **no fabricated approvals.** LC-15.
 *
 * The acceptance names a control -- *"a control attempts to synthesise one for a legacy project
 * and is refused"* -- so the attempt is made here for real rather than described. No database:
 * every function under test is pure, which is itself part of the claim.
 *
 * ## Why this is a refusal and not a validation rule
 *
 * A legacy project's published plan proves a plan was published. It does **not** prove a human
 * approved a blueprint, that a proposer differed from an approver, or that any gate was passed,
 * because none of that was recorded at the time. A migration that invented those values would
 * put a fabricated signature behind a real gate -- strictly worse than leaving the project
 * unmigrated, because the fabrication would then be indistinguishable from a genuine approval
 * for everyone downstream.
 *
 * So the module refuses by name, and the refusal is **fail-closed**: a kind nobody thought of is
 * refused too, rather than permitted for want of a rule.
 */
import {
  assertNoFabrication, FabricatedEvidenceError, FABRICABLE, NEVER_FABRICABLE,
  highestJustifiableStage, previewLegacyMigration,
  type LegacyProjectAssessment,
} from '../legacyGapAssessment';
import { completeEvidence } from './evidenceFixture';

/** One assessed legacy project, as `assessLegacyProjects` would return it. */
function assessment(over: Partial<LegacyProjectAssessment> = {}): LegacyProjectAssessment {
  return {
    projectId: 'proj-legacy-1',
    tenantId: 'tenant-1',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    hasLifecycleRow: false,
    counts: { intake: true, publishedPlans: 1, draftPlans: 0, tasks: 12 },
    highestJustifiableStage: 'discovery',
    stoppedBy: 'requirements_ready:requirement_count_unknown:not_assessed',
    ...over,
  };
}

describe('THE CONTROL: a migration cannot synthesise an approval for a legacy project', () => {
  it('refuses an approval, with the reason stated rather than a bare error', async () => {
    // The attempt the acceptance asks for, made against the real guard.
    expect(() => assertNoFabrication('approval')).toThrow(FabricatedEvidenceError);

    try {
      assertNoFabrication('approval');
      throw new Error('expected a refusal');
    } catch (e) {
      const err = e as FabricatedEvidenceError;
      expect(err.name).toBe('FabricatedEvidenceError');
      expect(err.kind).toBe('approval');
      // A reviewer has to be able to act on it, so the WHY travels with the refusal.
      expect(err.why).toMatch(/human decision that was never made/);
      expect(err.error_class).toBe('ContractViolation');
      expect(err.status).toBe(422);
    }
  });

  it.each(Object.keys(NEVER_FABRICABLE))('refuses to fabricate %s', (kind) => {
    expect(() => assertNoFabrication(kind)).toThrow(FabricatedEvidenceError);
  });

  it('FAIL-CLOSED: a kind nobody listed is refused too, not permitted for want of a rule', () => {
    // The direction that matters. A new evidence type added next year is refused until somebody
    // decides it is safe, rather than silently fabricable because the list was not updated.
    expect(() => assertNoFabrication('some_future_evidence')).toThrow(FabricatedEvidenceError);
    expect(() => assertNoFabrication('')).toThrow(FabricatedEvidenceError);
  });

  it('POSITIVE CONTROL: the one fabricable thing IS permitted, so this is a gate not a wall', () => {
    // Without this the refusals above would be satisfied by a function that throws always, and
    // the migration could never do anything at all.
    expect(() => assertNoFabrication('lifecycle_row')).not.toThrow();
    expect(FABRICABLE.has('lifecycle_row')).toBe(true);
    expect(FABRICABLE.size).toBe(1);
  });

  it('and the two sets do not overlap, so nothing is both permitted and forbidden', () => {
    for (const kind of Object.keys(NEVER_FABRICABLE)) expect(FABRICABLE.has(kind)).toBe(false);
  });
});

describe('the justifiable stage is DERIVED, not a constant', () => {
  /**
   * The risk this closes: `highestJustifiableStage` could `return 'discovery'` and every
   * assertion about legacy projects would still pass, because `discovery` is the right answer
   * for all of them today. These two tests make the derivation observable by feeding it evidence
   * that should move the answer.
   */
  it('with NOTHING assessed it stops at discovery, naming the first blocking rule', () => {
    const nothing = { ...completeEvidence(), assessedFields: new Set<never>() } as never;
    const { stage, stoppedBy } = highestJustifiableStage(nothing);

    expect(stage).toBe('discovery');
    expect(stoppedBy).toContain('requirements_ready');
    expect(stoppedBy).toContain('not_assessed');
  });

  it('with COMPLETE evidence it goes FURTHER, which proves it is reading the predicate', () => {
    // The decisive half. If this still returned `discovery`, the function would be a constant
    // and every legacy assertion in this packet would be meaningless.
    const { stage } = highestJustifiableStage(completeEvidence());
    expect(stage).not.toBe('discovery');
  });
});

describe('the preview is pure, and says what it will NOT do', () => {
  it('proposes exactly one lifecycle row per assessed project, at the derived stage', () => {
    const preview = previewLegacyMigration([
      assessment(),
      assessment({ projectId: 'proj-legacy-2', counts: { intake: false, publishedPlans: 0, draftPlans: 2, tasks: 0 } }),
    ]);

    expect(preview.assessed).toBe(2);
    expect(preview.proposals).toHaveLength(2);
    for (const p of preview.proposals) expect(p.create).toBe('lifecycle_row');
  });

  it('REPORTS ITS REFUSALS, so the reader sees the restraint rather than inferring it', () => {
    const preview = previewLegacyMigration([assessment()]);

    expect(preview.refused.map((r) => r.kind).sort())
      .toEqual(['approval', 'design_selection', 'manifest', 'proposed_by']);
    // Each carries its reason, so the report explains itself without the source beside it.
    for (const r of preview.refused) expect(r.why.length).toBeGreaterThan(20);
  });

  it('counts what is PRESERVED, so nothing looks discarded', () => {
    const preview = previewLegacyMigration([
      assessment({ counts: { intake: true, publishedPlans: 1, draftPlans: 0, tasks: 12 } }),
      assessment({ projectId: 'p2', counts: { intake: true, publishedPlans: 1, draftPlans: 3, tasks: 5 } }),
    ]);

    expect(preview.preserves).toEqual({
      publishedPlans: 2, draftPlans: 3, tasks: 17, intakes: 2,
    });
  });

  it('an empty cohort previews cleanly rather than throwing', () => {
    // The boundary that will actually happen, once every legacy project has been migrated.
    const preview = previewLegacyMigration([]);
    expect(preview.assessed).toBe(0);
    expect(preview.proposals).toEqual([]);
    // The refusals still stand: an empty migration still refuses to invent approvals.
    expect(preview.refused.length).toBeGreaterThan(0);
  });
});
