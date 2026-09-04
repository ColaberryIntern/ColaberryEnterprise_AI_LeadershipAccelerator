import { EVIDENCE_CLASSES } from '../../../config/v2Proof';
import { blockedClaims } from '../../../config/claimsRegistry';
import { staticHtml, textOf } from '../__fixtures__/storiesIndexHarness';

/**
 * The invariants that belong to the ROUTE, not to the component that served it.
 *
 * `/proof` used to render `ProofV2`, which carried these assertions in
 * `ProofV2.test.tsx`. Ali, 2026-09-04, moved the published records onto that
 * route, and the old page went with the change. Two of its four guarantees were
 * about the page's own sections and left with it. THESE TWO ARE NOT - they are
 * about what a visitor who clicks "Proof" is allowed to be shown, and they would
 * have died silently in the file deletion if they were not re-homed here.
 *
 * The first is the one that would actually damage us. `/proof` is the page that
 * says the site does not print claims it cannot evidence; a suppressed claim
 * surfacing on THAT page is worse than the same string anywhere else, because it
 * discredits the mechanism in the act of describing it.
 *
 * The second keeps the takeover honest. The records print a verification class
 * as a bare word - `verified`, `anonymized` - and those words only mean
 * something if the page still defines them. If a later change drops the standard
 * band to shorten the page, this fails rather than quietly leaving the badges
 * undefined.
 */

describe('/proof — a suppressed claim must not surface on the page that promises suppression', () => {
  it('reprints no blocked claim wording', () => {
    const text = textOf(staticHtml('/proof'));
    const blocked = blockedClaims();
    // Non-vacuity: the registry really does carry blocked claims to check for.
    expect(blocked.length).toBeGreaterThan(0);
    blocked.forEach((claim) => {
      expect(text).not.toContain(claim.publicWording);
    });
  });

  it('names no unearned designation or untraceable figure', () => {
    const text = textOf(staticHtml('/proof'));
    [
      'Anthropic',
      'Certified Anthropic AI Systems Architect',
      'Select Partner',
      'Preferred Partner',
      '5,000+',
      '10,000+',
      '$100M',
      '477%',
      'Since 2012',
      'Vistage',
      'EOS',
      'ActionCOACH',
      'C12',
      'Scaling Up',
      'Pinnacle',
    ].forEach((banned) => expect(text).not.toContain(banned));
  });
});

describe('/proof — the records may not be shown without the vocabulary they use', () => {
  it('defines all four evidence classes on the page that lists the records', () => {
    const text = textOf(staticHtml('/proof'));
    // Non-vacuity: four classes exist to be found.
    expect(EVIDENCE_CLASSES).toHaveLength(4);
    EVIDENCE_CLASSES.forEach((evidenceClass) => {
      expect(text).toContain(evidenceClass.key);
      expect(text).toContain(evidenceClass.meaning);
    });
  });

  it('states the standard as fact, not as something coming later', () => {
    const text = textOf(staticHtml('/proof'));
    /* The section this replaced read "each record WILL carry its evidence class"
       while the records already did. Future tense on this page is the specific
       regression worth catching, because it understates a shipped capability on
       the one page a reader visits to test whether we overstate things. */
    expect(text).not.toContain('will carry');
    expect(text).not.toContain('Each record will');
  });
});
