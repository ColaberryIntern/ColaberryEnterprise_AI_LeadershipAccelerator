/**
 * planSupersededReconcile — the PURE decision core for the C.1 "no longer required" rail. Given the stored documents
 * and the keys the newly re-analyzed blueprint derives, it decides which blueprint FORM docs to delete (no authored
 * work), flag superseded (has work), or un-flag (applies again). Requirement-derived / generated / build docs are
 * never touched. No DB — this is the testable core the re-analyze wrapper applies.
 */
import { planSupersededReconcile, type StoredDocReconcile } from '../govProposalDocumentStore';

const doc = (over: Partial<StoredDocReconcile> & { docKey: string }): StoredDocReconcile => ({
  docType: 'form', status: 'not_started', version: 0, hasContent: false, hasVersion: false, superseded: false, ...over,
});

describe('planSupersededReconcile — C.1 prune/flag of no-longer-applicable form docs', () => {
  it('deletes a stale FORM doc with no authored work (the Utah CIQ case)', () => {
    const stored = [doc({ docKey: 'form_ciq' })];
    const plan = planSupersededReconcile(stored, new Set(['technical', 'cover_letter']));
    expect(plan.toDelete).toEqual(['form_ciq']);
    expect(plan.toFlag).toEqual([]);
    expect(plan.toUnflag).toEqual([]);
  });

  it('flags (not deletes) a stale FORM doc that has authored work', () => {
    const drafted = doc({ docKey: 'form_ciq', status: 'drafted', version: 2, hasContent: true });
    const withVersion = doc({ docKey: 'form_1295', hasVersion: true });
    const plan = planSupersededReconcile([drafted, withVersion], new Set(['technical']));
    expect(plan.toFlag.sort()).toEqual(['form_1295', 'form_ciq']);
    expect(plan.toDelete).toEqual([]);
  });

  it('un-flags a previously-superseded doc that applies again', () => {
    const stored = [doc({ docKey: 'form_ciq', superseded: true, status: 'drafted', version: 1, hasContent: true })];
    const plan = planSupersededReconcile(stored, new Set(['form_ciq', 'technical']));
    expect(plan.toUnflag).toEqual(['form_ciq']);
    expect(plan.toFlag).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it('never touches requirement-derived / generated / build docs, even when absent from the derived set', () => {
    const stored = [
      doc({ docKey: 'technical', docType: 'derived', status: 'drafted', version: 3, hasContent: true }),
      doc({ docKey: 'compliance_matrix', docType: 'generated' }),
      doc({ docKey: 'pilot_demo_exhibit', docType: 'build' }),
    ];
    const plan = planSupersededReconcile(stored, new Set([])); // none in the derived set
    expect(plan).toEqual({ toDelete: [], toFlag: [], toUnflag: [] });
  });

  it('is idempotent: an already-superseded still-absent doc is not re-flagged, and a running plan is stable', () => {
    const stored = [doc({ docKey: 'form_ciq', superseded: true, status: 'drafted', version: 1, hasContent: true })];
    const derived = new Set(['technical']);
    const first = planSupersededReconcile(stored, derived);
    expect(first).toEqual({ toDelete: [], toFlag: [], toUnflag: [] }); // already flagged, stays
    // Re-running on the same (post-reconcile) state yields the same empty plan.
    expect(planSupersededReconcile(stored, derived)).toEqual(first);
  });

  it('a form doc still in the derived set and not superseded needs no action', () => {
    const stored = [doc({ docKey: 'form_ciq', docType: 'form' })];
    const plan = planSupersededReconcile(stored, new Set(['form_ciq']));
    expect(plan).toEqual({ toDelete: [], toFlag: [], toUnflag: [] });
  });

  it('handles garbage input without throwing', () => {
    expect(planSupersededReconcile(undefined as unknown as StoredDocReconcile[], new Set())).toEqual({ toDelete: [], toFlag: [], toUnflag: [] });
  });
});
