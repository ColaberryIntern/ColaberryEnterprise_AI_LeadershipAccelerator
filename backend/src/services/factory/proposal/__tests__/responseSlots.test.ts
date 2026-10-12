/**
 * deriveResponseSlots must be DETERMINISTIC + HONEST: one cited slot per established requirement (in order,
 * de-duplicated by id), each CITING the requirement's own source reference (never invented, null when absent),
 * every slot `unanswered` (never fabricated into a done state). Pure + total — garbage yields [].
 */
import { deriveResponseSlots, applyResponsesToSlots } from '../responseSlots';

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

describe('applyResponsesToSlots (P4 overlay)', () => {
  const slots = deriveResponseSlots([req('R1', 'Offeror shall register in SAM.', 'D1'), req('R2', 'Submit references.', 'D2')]);

  it('overlays an authored response onto its slot (status + content + figures) and keeps the rest `unanswered`', () => {
    const out = applyResponsesToSlots(slots, [{
      requirementId: 'R1', status: 'approved', content: 'We are SAM-registered (CAGE 1AB23).',
      figures: [{ commit: 'abc1234', ref: 'docs/sam.png', caption: 'SAM record' }], authoredByIdentityId: 'a1', reviewedByIdentityId: 'r1', updatedAt: '2026-10-08T00:00:00Z',
    }]);
    const r1 = out.find((s) => s.requirementId === 'R1')!;
    const r2 = out.find((s) => s.requirementId === 'R2')!;
    expect(r1.status).toBe('approved');
    expect(r1.content).toContain('SAM-registered');
    expect(r1.figures).toHaveLength(1);
    expect(r2.status).toBe('unanswered');   // the honesty rail: no response ⇒ unanswered
    expect(r2.content).toBe('');
  });

  it('NEVER fabricates a status — a slot with no matching response is unanswered with empty content/figures', () => {
    const out = applyResponsesToSlots(slots, []);
    expect(out.every((s) => s.status === 'unanswered' && s.content === '' && (s.figures ?? []).length === 0)).toBe(true);
  });

  it('drops a response whose requirement is no longer a slot (requirement left the established set)', () => {
    const out = applyResponsesToSlots(slots, [{ requirementId: 'GONE', status: 'draft', content: 'x', figures: [], authoredByIdentityId: null, reviewedByIdentityId: null, updatedAt: null }]);
    expect(out.map((s) => s.requirementId)).toEqual(['R1', 'R2']); // only the derived slots, in order
    expect(out.every((s) => s.status === 'unanswered')).toBe(true);
  });

  it('is total on garbage', () => {
    expect(applyResponsesToSlots(undefined as any, undefined as any)).toEqual([]);
  });
});
