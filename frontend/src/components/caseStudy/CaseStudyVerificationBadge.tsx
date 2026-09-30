import React from 'react';
import { EvidenceBadge } from '../publicV2/Claim';
import { VERIFICATION_METHOD_LABELS } from '../../config/caseStudySurfaces';
import type {
  CaseStudyVerificationMethod,
  PublicVerificationClass,
} from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyVerificationBadge - the two-axis proof badge.
 *
 * IT DOES NOT DECLARE A VOCABULARY. The class half is rendered by
 * `EvidenceBadge` from `components/publicV2/Claim.tsx`, which is the same
 * component `/proof` uses. That is the whole point of the file: if this module
 * spelled "Verified" itself, the proof page and the project records could drift
 * into two different words for the same evidence, and the drift would be
 * invisible because both would look deliberate. The class union is likewise
 * derived from `EvidenceClass` rather than retyped
 * (`caseStudyPublicTypes.ts`), so a class this badge cannot draw is a compile
 * error rather than a blank space on a page.
 *
 * WHY BOTH AXES ARE ALWAYS RENDERED. Class answers HOW MUCH may be shown.
 * Method answers WHO did the verifying. Collapsed into one word, "Verified"
 * covers both "the client signed a letter" and "a test suite passed" - very
 * different weights to a buyer reading this page, and flattening them is the
 * failure the fabricated case studies were made of. The gate's fairness depends
 * on the pair being visible too: a self-reported figure is only allowed to
 * publish at a class that does not assert third-party verification, and that
 * bargain is only honest if the reader can see which method produced the class.
 *
 * NEVER COLOUR ALONE. `EvidenceBadge` carries a word and a glyph; the method is
 * a word. Nothing here is legible only in colour.
 */

export interface CaseStudyVerificationBadgeProps {
  /** How much may be shown. */
  verificationClass: PublicVerificationClass;
  /** Who or what verified it. */
  verificationMethod: CaseStudyVerificationMethod;
  className?: string;
}

export function CaseStudyVerificationBadge({
  verificationClass,
  verificationMethod,
  className,
}: CaseStudyVerificationBadgeProps): React.ReactElement {
  return (
    <span
      className={`cbv2-cs-verify${className ? ` ${className}` : ''}`}
      data-verification-class={verificationClass}
      data-verification-method={verificationMethod}
    >
      <EvidenceBadge evidence={verificationClass} />
      <span className="cbv2-cs-verify__sep" aria-hidden="true">
        ·
      </span>
      <span className="cbv2-cs-verify__method">
        {/* Neutral phrasing: the sentence has to stay true for a class that is
            explicitly NOT a third-party verification. */}
        <span className="cbv2-cs-sr-only">verification method: </span>
        {VERIFICATION_METHOD_LABELS[verificationMethod]}
      </span>
    </span>
  );
}

export default CaseStudyVerificationBadge;
