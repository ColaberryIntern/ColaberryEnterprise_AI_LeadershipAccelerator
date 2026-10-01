/**
 * Source identity: minted once, never derived from text, and provenance never invented.
 *
 * These are the checks behind LC-02 ("interview facts, proposals, assumptions, questions and
 * confirmations remain distinguishable") and LC-03 ("all must-have requirements survive
 * decomposition"). Both are asserted on ids and states — a set comparison — rather than on
 * generated wording, because a test that asserts exact prose fails the first time a prompt is
 * tuned and teaches everyone to ignore it.
 */
import {
  SOURCE_STATES,
  mintSourceItem,
  reviseSourceItem,
  confirmSourceItem,
  isSameItem,
  isSourceState,
  compareSourceSets,
  itemsMissingProvenance,
  type SourceItem,
} from '../sourceIdentity';

function heard(text: string, over: Partial<SourceItem> = {}): SourceItem {
  return { ...mintSourceItem({ text, state: 'heard', provenance: { kind: 'interview', locator: '00:12:03' } }), ...over };
}

describe('the six states stay distinct', () => {
  it('declares exactly the six the request names, in a stable order', () => {
    expect(SOURCE_STATES).toEqual([
      'heard', 'proposed', 'confirmed', 'open', 'tested', 'production_verified',
    ]);
  });

  it('recognises them and rejects anything else', () => {
    for (const s of SOURCE_STATES) expect(isSourceState(s)).toBe(true);
    // Positive control: the guard must reject, not merely accept.
    expect(isSourceState('deployed')).toBe(false);   // deployed is not production_verified
    expect(isSourceState('agreed')).toBe(false);
    expect(isSourceState('')).toBe(false);
    expect(isSourceState(undefined)).toBe(false);
  });
});

describe('identity is minted, not derived from text', () => {
  it('gives two items with IDENTICAL text different ids', () => {
    // Two stakeholders independently saying the same sentence are two statements. Collapsing
    // them by text would silently lose one, along with its provenance.
    const a = mintSourceItem({ text: 'The system must notify the applicant.', state: 'heard' });
    const b = mintSourceItem({ text: 'The system must notify the applicant.', state: 'heard' });
    expect(a.id).not.toBe(b.id);
    expect(isSameItem(a, b)).toBe(false);
  });

  it('preserves the id across a wording correction, and bumps the revision', () => {
    const original = heard('The sytem must notify the aplicant.');
    const fixed = reviseSourceItem(original, 'The system must notify the applicant.');
    expect(fixed.id).toBe(original.id);            // the whole point
    expect(fixed.revision).toBe(original.revision + 1);
    expect(fixed.text).not.toBe(original.text);
    expect(isSameItem(original, fixed)).toBe(true);
  });

  it('treats identity as the id even when the text diverges completely', () => {
    const a = heard('one thing');
    const b = reviseSourceItem(a, 'something entirely different');
    expect(isSameItem(a, b)).toBe(true);
  });

  it('starts every captured item at revision 1', () => {
    expect(mintSourceItem({ text: 'x', state: 'heard' }).revision).toBe(1);
  });
});

describe('confirmation cannot be manufactured', () => {
  it('refuses to capture an item directly as confirmed', () => {
    // Confirmation is an act performed ON something already captured. Claiming it at capture
    // time is invented confirmation, which the acceptance criteria forbid.
    expect(() => mintSourceItem({ text: 'x', state: 'confirmed' })).toThrow(/InvalidSourceState/);
  });

  it('allows capture in every other state', () => {
    for (const s of SOURCE_STATES.filter((x) => x !== 'confirmed')) {
      expect(() => mintSourceItem({ text: 'x', state: s })).not.toThrow();
    }
  });

  it('requires a named human actor to confirm', () => {
    const item = heard('x');
    expect(() => confirmSourceItem(item, '')).toThrow(/InvalidConfirmation/);
    expect(() => confirmSourceItem(item, '   ')).toThrow(/InvalidConfirmation/);
    expect(confirmSourceItem(item, 'owner@example.test').state).toBe('confirmed');
  });

  it('drops a confirmation back to heard when the wording is materially corrected', () => {
    // Re-wording something a human confirmed does not re-confirm it. Carrying `confirmed`
    // through an edit is how a changed requirement keeps a stale approval.
    const confirmed = confirmSourceItem(heard('original'), 'owner@example.test');
    expect(confirmed.state).toBe('confirmed');
    const revised = reviseSourceItem(confirmed, 'materially different');
    expect(revised.state).toBe('heard');
    expect(revised.id).toBe(confirmed.id);
  });

  it('leaves a non-confirmed state alone across a revision', () => {
    const proposed = mintSourceItem({ text: 'x', state: 'proposed' });
    expect(reviseSourceItem(proposed, 'y').state).toBe('proposed');
  });
});

describe('provenance is never invented', () => {
  it('records null when none was supplied, rather than guessing a source', () => {
    const legacy = mintSourceItem({ text: 'imported without provenance', state: 'heard' });
    expect(legacy.provenance).toBeNull();
  });

  it('keeps null across a revision instead of filling it in', () => {
    const legacy = mintSourceItem({ text: 'a', state: 'heard' });
    expect(reviseSourceItem(legacy, 'b').provenance).toBeNull();
  });

  it('surfaces the items missing provenance so the gap is visible', () => {
    const items = [heard('with'), mintSourceItem({ text: 'without', state: 'heard' })];
    const missing = itemsMissingProvenance(items);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toBe(items[1].id);
  });

  it('POSITIVE CONTROL: reports nothing when every item has provenance', () => {
    expect(itemsMissingProvenance([heard('a'), heard('b')])).toEqual([]);
  });
});

describe('compareSourceSets — the LC-02 / LC-03 round-trip check', () => {
  it('passes a faithful round trip', () => {
    const before = [heard('a'), heard('b'), heard('c')];
    const after = before.map((i) => ({ ...i }));
    expect(compareSourceSets(before, after)).toEqual({
      ok: true, lost: [], duplicated: [], inventedConfirmations: [],
    });
  });

  it('passes when wording changed but every id survived — the point of minted identity', () => {
    const before = [heard('typo one'), heard('typo two')];
    const after = before.map((i) => reviseSourceItem(i, `${i.text} corrected`));
    const report = compareSourceSets(before, after);
    expect(report.ok).toBe(true);
    expect(report.lost).toEqual([]);
  });

  it('DETECTS source loss — 30 in, 13 out is the measured failure this guards', () => {
    const before = Array.from({ length: 30 }, (_, n) => heard(`requirement ${n + 1}`));
    const after = before.slice(0, 13);
    const report = compareSourceSets(before, after);
    expect(report.ok).toBe(false);
    expect(report.lost).toHaveLength(17);
    // And it names them, so the gap is actionable rather than a bare count.
    expect(report.lost).toContain(before[29].id);
  });

  it('DETECTS a duplicated item', () => {
    const a = heard('a');
    const report = compareSourceSets([a], [a, { ...a }]);
    expect(report.ok).toBe(false);
    expect(report.duplicated).toEqual([a.id]);
  });

  it('DETECTS invented confirmation — an item that came back confirmed without a human act', () => {
    const before = [heard('a')];
    const after = [{ ...before[0], state: 'confirmed' as const }];
    const report = compareSourceSets(before, after);
    expect(report.ok).toBe(false);
    expect(report.inventedConfirmations).toEqual([before[0].id]);
  });

  it('does NOT flag an item that was already confirmed going in', () => {
    const confirmed = confirmSourceItem(heard('a'), 'owner@example.test');
    const report = compareSourceSets([confirmed], [{ ...confirmed }]);
    expect(report.inventedConfirmations).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('does not flag a NEW item appearing — additions are not losses', () => {
    const before = [heard('a')];
    const after = [...before, heard('b')];
    expect(compareSourceSets(before, after).ok).toBe(true);
  });

  it('reports every failure mode at once rather than stopping at the first', () => {
    const a = heard('a');
    const b = heard('b');
    const c = heard('c');
    const after = [a, { ...a }, { ...b, state: 'confirmed' as const }]; // c lost, a duped, b invented
    const report = compareSourceSets([a, b, c], after);
    expect(report.lost).toEqual([c.id]);
    expect(report.duplicated).toEqual([a.id]);
    expect(report.inventedConfirmations).toEqual([b.id]);
    expect(report.ok).toBe(false);
  });

  it('POSITIVE CONTROL: the comparison can fail, so a green result means something', () => {
    // Guards against a future edit that makes compareSourceSets return ok unconditionally.
    const a = heard('a');
    expect(compareSourceSets([a], []).ok).toBe(false);
  });
});
