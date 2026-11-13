import {
  CLASSIFICATIONS,
  assertClassificationKeysAreUnique,
  assertEveryClassificationIsLegibleWithoutColour,
  assertValueCarryingIsDeclaredHonestly,
  classificationFor,
  classificationsFor,
} from '../revenueClassifications';

/**
 * R16 acceptance for the colour registry.
 *
 * Ali asked for "every classification has a color so we can see anything that is happening
 * that is tied to the revenue". These tests are about the half of that promise which can be
 * broken silently: a duplicate key, a classification that only means something in colour, or
 * one that claims to carry a number production does not hold.
 */
describe('the registry is internally consistent', () => {
  it('has no duplicate keys', () => {
    expect(assertClassificationKeysAreUnique()).toBe(CLASSIFICATIONS.length);
  });

  it('covers all three streams', () => {
    expect(classificationsFor('membership').length).toBeGreaterThan(0);
    expect(classificationsFor('gov_pipeline').length).toBeGreaterThan(0);
    expect(classificationsFor('hypotheses').length).toBeGreaterThan(0);
  });

  it('assigns every classification exactly one stream', () => {
    const total = (['membership', 'gov_pipeline', 'hypotheses'] as const)
      .reduce((n, s) => n + classificationsFor(s).length, 0);
    expect(total).toBe(CLASSIFICATIONS.length);
  });
});

describe('colour is never the only carrier', () => {
  /**
   * A dashboard whose meaning lives purely in hue fails a colourblind reader, a greyscale
   * print and a screenshot pasted into chat. So every classification ships a glyph and
   * words as well as a tone, and that is asserted rather than left to review.
   */
  it('gives every classification a glyph, a label and a usable meaning', () => {
    expect(() => assertEveryClassificationIsLegibleWithoutColour()).not.toThrow();
  });

  it('uses only the design system\'s reserved status tones', () => {
    const allowed = new Set(['good', 'info', 'warn', 'danger', 'muted']);
    for (const c of CLASSIFICATIONS) expect(allowed.has(c.tone)).toBe(true);
  });

  /**
   * The tones are the RESERVED status palette, not a categorical series. Five is therefore
   * the whole vocabulary, and a sixth would mean someone had started using status colour to
   * mean "series 6" — which is the one thing a reserved palette must never do.
   */
  it('keeps the tone vocabulary at five, so status colour is never repurposed', () => {
    expect(new Set(CLASSIFICATIONS.map((c) => c.tone)).size).toBeLessThanOrEqual(5);
  });
});

describe('a classification never claims a number production does not hold', () => {
  it('declares value-carrying honestly for the known-unpriced kinds', () => {
    expect(() => assertValueCarryingIsDeclaredHonestly()).not.toThrow();
  });

  /**
   * `bid_flagged` is the load-bearing case. Measured 2026-11-12, `gov_qualifications` has no
   * value, budget or ceiling column anywhere, so a flagged bid has no price by construction.
   * If someone later marks this as value-carrying, the dashboard starts printing a number
   * that was invented, and this test is the tripwire.
   */
  it('refuses to let a flagged bid carry a value', () => {
    expect(classificationFor('bid_flagged').carriesValue).toBe(false);
  });

  it('refuses to let a comp carry a value, because zero is a definition not a measurement', () => {
    expect(classificationFor('comped').carriesValue).toBe(false);
  });
});

describe('direction and tone answer different questions', () => {
  /**
   * Collapsing them loses one. A refund is danger AND out: money came back. A cancellation
   * is danger AND none: it stops future money rather than returning past money. A dashboard
   * that treats those the same double-counts the loss, which survives review because it
   * looks conservative.
   */
  it('treats a refund as money out and a cancellation as money stopped', () => {
    expect(classificationFor('refunded').direction).toBe('out');
    expect(classificationFor('member_canceled').direction).toBe('none');
    expect(classificationFor('member_canceled').tone).toBe('danger');
  });

  it('treats a new paying member as money in', () => {
    expect(classificationFor('member_started').direction).toBe('in');
  });

  it('never marks a government stage as money out', () => {
    for (const c of classificationsFor('gov_pipeline')) {
      expect(c.direction).not.toBe('out');
    }
  });
});

describe('the gap between the plan and the bank is its own classification', () => {
  /**
   * 132 of 274 subscription rows carried no payment id on 2026-11-12. Folding that into a
   * status pill is how "most of the stated MRR cannot be billed" stays invisible, so it gets
   * its own classification and its own colour.
   */
  it('has a classification for signed-up-never-paid, toned as a warning', () => {
    const c = classificationFor('never_paid');
    expect(c.stream).toBe('membership');
    expect(c.tone).toBe('warn');
    expect(c.direction).toBe('none');
    expect(c.means).toMatch(/never|no paysimple/i);
  });
});

describe('exported is not submitted', () => {
  /**
   * models/GovSubmission.ts is emphatic: exporting a package is something the system can do,
   * recording a submission is a manual operator act. Two classifications, so the dashboard
   * can never claim a submission nobody made.
   */
  it('keeps export and submission as separate classifications', () => {
    expect(classificationFor('bid_exported').key).not.toBe(classificationFor('bid_submitted').key);
    expect(classificationFor('bid_exported').means).toMatch(/not a submission|NOT a submission/i);
  });
});

describe('an unknown classification fails loudly', () => {
  /**
   * Deliberately not a grey "unknown" chip. A classification that no longer exists is a bug
   * in the producer, and rendering it grey hides the bug while showing the reader an event
   * with no meaning.
   */
  it('throws, naming the known keys, rather than falling back', () => {
    expect(() => classificationFor('not_a_real_classification'))
      .toThrow(/no revenue classification is called/);
    expect(() => classificationFor('')).toThrow();
  });
});
