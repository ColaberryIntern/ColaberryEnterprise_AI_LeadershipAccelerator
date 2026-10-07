/**
 * deriveResponseSlots must be DETERMINISTIC + HONEST: one cited slot per established requirement (in order,
 * de-duplicated by id), each CITING the requirement's own source reference (never invented, null when absent),
 * every slot `unanswered` (never fabricated into a done state). Pure + total — garbage yields [].
 */
import { deriveResponseSlots } from '../responseSlots';

const req = (id: string, text: string, docId?: string) => ({
  id, text, applicability: 'always', bindingStatus: 'binding_solicitation_requirement',
  ...(docId ? { evidenceRef: { docId } } : {}),
});

describe('deriveResponseSlots', () => {
  it('produces exactly one slot per established requirement, in order, keyed by requirement id', () => {
    const slots = deriveResponseSlots([req('R1', 'Offeror shall register in SAM.', 'D1'), req('R2', 'Submit three references.', 'D2')]);
    expect(slots.map((s) => s.requirementId)).toEqual(['R1', 'R2']);
    expect(slots[0].statement).toBe('Offeror shall register in SAM.');
  });

  it('CITES the requirement\'s own source reference (evidenceRef.docId), verbatim', () => {
    const slots = deriveResponseSlots([req('R1', 'x', 'SOLICITATION-BASE')]);
    expect(slots[0].sourceRef).toBe('SOLICITATION-BASE');
  });

  it('leaves sourceRef NULL when the requirement records no source reference (never invents a citation)', () => {
    const slots = deriveResponseSlots([req('R1', 'x')]); // no evidenceRef
    expect(slots[0].sourceRef).toBeNull();
  });

  it('marks every slot `unanswered` — authoring is not built, so a slot is never a fabricated done', () => {
    const slots = deriveResponseSlots([req('R1', 'x', 'D1'), req('R2', 'y', 'D2')]);
    expect(slots.every((s) => s.status === 'unanswered')).toBe(true);
  });

  it('de-duplicates by requirement id (a requirement listed twice yields one slot)', () => {
    const slots = deriveResponseSlots([req('R1', 'x', 'D1'), req('R1', 'x again', 'D1')]);
    expect(slots).toHaveLength(1);
    expect(slots[0].requirementId).toBe('R1');
  });

  it('skips a requirement with no id (a slot must anchor to a real requirement)', () => {
    const slots = deriveResponseSlots([{ text: 'orphan with no id', evidenceRef: { docId: 'D1' } }, req('R2', 'y', 'D2')]);
    expect(slots.map((s) => s.requirementId)).toEqual(['R2']);
  });

  it('is total — a non-array / garbage input yields an empty list, never a throw', () => {
    expect(deriveResponseSlots(undefined as any)).toEqual([]);
    expect(deriveResponseSlots([null, undefined] as any)).toEqual([]);
  });
});
