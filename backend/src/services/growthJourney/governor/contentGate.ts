import { JOURNEY_CONTENT_PURPOSES, type JourneyContentPurpose } from './types';

/**
 * The content gate for journey purposes (§8 Layer 1, §10; Phase 3 T310).
 *
 * ─── WHAT THIS IS, AND IS NOT ────────────────────────────────────────────────
 *
 * A B2B candidate asks for content Explorer's registry has no word for: a
 * capability-education piece, a case study, a safe clarification question.
 * Explorer's `PURPOSE_SPECS` is exhaustive over its own eight purposes and its
 * resolver indexes that record directly, so a journey purpose handed to it
 * would not gap — it would throw. This module answers journey purposes BEFORE
 * `resolveJourneyContent` delegates to Explorer, and Explorer only ever sees
 * its own vocabulary.
 *
 * It is not a second resolver and not a second CMS. It holds no content and
 * selects nothing. It is the §10 declaration for three purposes — each with
 * the reason nothing can be cited for it today — the same shape as Explorer's
 * declared gaps (`community_digest`, `friction_recovery`, ...), kept on this
 * side of the boundary because these purposes belong to this side.
 *
 * ─── WHY EVERY ENTRY IS UNSUPPORTED TODAY, STATED PER PURPOSE ───────────────
 *
 * The plan's discovery: `explorer_content_assets` holds 0 rows with a
 * `brand_id`, every existing row is Explorer-era learner curriculum, and T305
 * withholds unscoped rows from a business brand ON PURPOSE (`allow_unscoped`
 * is true for Colaberry Training alone). So a business brand has no citable
 * content until somebody declares some through T305's approval columns. Each
 * entry says what would have to exist. When it does, the entry flips to
 * `supported` with the kinds it maps to — a one-line change per purpose, and a
 * test pins that the flip cannot happen silently.
 *
 * A content gap is a named refusal, never a substituted asset (§10). The
 * mutation that proves it: substitute `weekly_digest` on a gap, and the test
 * that a B2B decision never carries learner curriculum fails.
 */

export type JourneyPurposeSpec =
  | { supported: false; reason: string; needs: string }
  | { supported: true; kinds: readonly string[] };

export const JOURNEY_PURPOSE_SPECS: Readonly<Record<JourneyContentPurpose, JourneyPurposeSpec>> = Object.freeze({
  capability_education: Object.freeze({
    supported: false,
    reason:
      'no capability-education content is declared for any business brand: explorer_content_assets has no brand-scoped rows, and Explorer-era LESSON rows are learner curriculum a business brand may not cite',
    needs: 'assets approved for a business brand with offer_family set, through the T305 approval columns',
  }),
  case_study: Object.freeze({
    supported: false,
    reason:
      'no case-study substrate: student_projects case studies are learner artefacts, not B2B references, and no CASE_STUDY kind exists in the registry',
    needs: 'a case-study kind in the registry and rows approved for the brand',
  }),
  clarification_question: Object.freeze({
    supported: false,
    reason:
      'no approved question template exists; a clarification question is still an outbound message and section 10 requires approved content behind it',
    needs: 'an approved clarification template per offer family, declared as an asset',
  }),
});

export function isJourneyPurpose(purpose: string): purpose is JourneyContentPurpose {
  return (JOURNEY_CONTENT_PURPOSES as readonly string[]).includes(purpose);
}

export type JourneyPurposeVerdict =
  | { supported: true; kinds: readonly string[] }
  | { supported: false; gap: string; reason: string; needs: string };

/**
 * Answer for one journey purpose. The gap string is what travels to the
 * decision's `content_gaps`; the reason and what-it-needs are for the reader.
 */
export function gateJourneyPurpose(purpose: JourneyContentPurpose): JourneyPurposeVerdict {
  const spec = JOURNEY_PURPOSE_SPECS[purpose];
  if (spec.supported) return { supported: true, kinds: spec.kinds };
  return { supported: false, gap: `content_purpose_unsupported:${purpose}`, reason: spec.reason, needs: spec.needs };
}

/** The purposes that can cite nothing today, with why — for the shadow review and T313's fixtures. */
export function unsupportedJourneyPurposes(): Array<{ purpose: JourneyContentPurpose; reason: string; needs: string }> {
  return JOURNEY_CONTENT_PURPOSES.flatMap((purpose) => {
    const spec = JOURNEY_PURPOSE_SPECS[purpose];
    return spec.supported ? [] : [{ purpose, reason: spec.reason, needs: spec.needs }];
  });
}
