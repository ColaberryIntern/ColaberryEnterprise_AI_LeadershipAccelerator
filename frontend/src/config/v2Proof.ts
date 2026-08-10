/**
 * v2Proof.ts -- content for the Proof Room.
 *
 * THE PROBLEM THIS PAGE HAS TO SOLVE
 * `surface.proof.room` is VERIFIED but its capability is `unbuilt` -- there is no
 * evidence_class taxonomy in backend/src, so there are no proof records to show.
 * A page that depicted per-record proof would be depicting a feature that does
 * not exist, which is the exact failure this whole workstream was built to stop.
 *
 * So the page is not a demo of an unbuilt product. It publishes the STANDARD,
 * which does exist and is enforced in code today:
 *   - the four evidence classes are the real `EvidenceClass` union in
 *     components/publicV2/Claim.tsx, rendered here with the real badge component;
 *   - the dual gate is the real one in config/claimsRegistry.ts;
 *   - the count of withheld claims is computed from `blockedClaims()` at render
 *     time, so it cannot drift from the mechanism it describes.
 *
 * WITHDRAWN CATEGORIES -- WHY THEY ARE WORDED GENERICALLY
 * Listing what we removed is the most persuasive thing on this page, but naming
 * the specific items would reprint the claims the registry exists to suppress.
 * "We are not an official partner of X" still puts the designation on the page
 * and reads as a hint rather than a disclosure. Each entry below therefore names
 * the CATEGORY and the REASON, never the claim itself. A test asserts that no
 * blocked claim string appears in the rendered output.
 */

export interface EvidenceClassDoc {
  readonly key: 'verified' | 'anonymized' | 'illustrative' | 'pending';
  readonly meaning: string;
  readonly rule: string;
}

/** The four classes every figure on this site must declare. Mirrors `EvidenceClass`. */
export const EVIDENCE_CLASSES: readonly EvidenceClassDoc[] = [
  {
    key: 'verified',
    meaning: 'Traceable to a named source that a third party could check.',
    rule: 'The source is recorded alongside the claim, not carried in memory.',
  },
  {
    key: 'anonymized',
    meaning: 'Real, from a real engagement, with identifying details removed.',
    rule: 'Published only where the client has agreed to the anonymized form.',
  },
  {
    key: 'illustrative',
    meaning: 'Sample data, shaped like the real thing so the surface reads correctly.',
    rule: 'Always carries a visible sample label. Never presented as an outcome.',
  },
  {
    key: 'pending',
    meaning: 'Believed true, not yet evidenced.',
    rule: 'Does not appear on a customer-facing page until it is verified.',
  },
];

export interface WithdrawnItem {
  readonly category: string;
  readonly reason: string;
}

/**
 * Categories of claim withdrawn from the customer-facing site during this rebuild.
 * Deliberately generic -- see the header note.
 */
export const WITHDRAWN: readonly WithdrawnItem[] = [
  {
    category: 'An affiliation we could not evidence',
    reason:
      'Applying to a programme is not the same as being admitted to it, and the difference ' +
      'is invisible to a reader. Removed until there is documentation to point at.',
  },
  {
    category: 'Outcome statistics with no traceable methodology',
    reason:
      'Percentages that no one could reproduce from a stated method. A number nobody can ' +
      'check is not evidence, however often it has been repeated.',
  },
  {
    category: 'Case studies containing invented client quotations',
    reason:
      'The source file conceded they were illustrative; the rendered page did not. Withdrawn, ' +
      'and removed from the knowledge base that had been ingesting them as fact.',
  },
  {
    category: 'Testimonials carrying dollar figures without documented consent',
    reason:
      'An attributed financial outcome needs documented agreement from the named customer ' +
      'before it is published.',
  },
  {
    category: 'Third-party organization names implying endorsement',
    reason:
      'Real trademarks displayed with no stated relationship. Removed rather than qualified.',
  },
  {
    category: 'A price for an offer that had been retired',
    reason: 'The published figure no longer matched what anyone could actually buy.',
  },
];

/** The two independent gates every claim passes before it may render. */
export const GATES: readonly { readonly title: string; readonly detail: string }[] = [
  {
    title: 'Is the claim true, and who checked?',
    detail:
      'Every claim records where its evidence lives, who owns it and when it was last ' +
      'verified. Unevidenced claims do not render, they are not merely flagged for later.',
  },
  {
    title: 'Does the thing it describes actually exist?',
    detail:
      'Kept deliberately separate from truth. A statement can be perfectly accurate about a ' +
      'feature that has not been built, and describing that as though a customer could use ' +
      'it today would still mislead them.',
  },
];

/**
 * What the per-record Proof Room will do once the evidence taxonomy exists.
 * Future tense throughout -- this is a roadmap statement, not a description of
 * something a reader could go and use.
 */
export const PLANNED_PROOF_ROOM =
  'Each record will carry its evidence class, the artifact behind it and the reviewer who ' +
  'accepted it, so a claim about team capability can be opened and inspected rather ' +
  'than taken on trust.';
