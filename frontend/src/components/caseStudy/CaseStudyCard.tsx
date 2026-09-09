import React from 'react';
import { Link } from 'react-router-dom';
import CaseStudyVerificationBadge from './CaseStudyVerificationBadge';
import { BUILT_BY_LABELS } from '../../config/caseStudySurfaces';
import type { PublicCaseStudySummary } from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyCard - one published record on an index.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a card with no verified metric renders a
 * valid card anyway (spec section 22). It does not fabricate a figure, it does
 * not borrow one from a neighbouring record, and it does not fall back to a
 * rounded-looking placeholder. `headlineMetric` is `null` on the wire precisely
 * so the absence is representable, and `proofPointFor()` below answers it with a
 * fact already on the payload - a capability, a deliverable, a stack entry -
 * rather than with a number. Every string the card prints comes off the record
 * it was handed; `CaseStudyCard.test.tsx` proves it by extracting every digit
 * group from the rendered card and asserting each one appears in the payload.
 *
 * WHY THE HREF IS A PROP. The card does not know which surface it is on and
 * cannot build its own link. `null` renders the title as plain text, which is
 * what an unrouted surface gets - a dead anchor is worse than no anchor.
 *
 * ALT TEXT. `PublicCaseStudySummary` carries an image url and no alt text,
 * because no one has written one. Inventing a description of an image this code
 * has never seen would be a fabrication of exactly the kind the module exists to
 * stop, and repeating the title would make a screen reader say it twice. So the
 * image is marked decorative unless a caller passes real approved alt text, and
 * the adjacent heading carries the meaning. That is the correct WCAG answer for
 * an image whose caption sits beside it.
 */

export interface CaseStudyCardProps {
  caseStudy: PublicCaseStudySummary;
  /** Where the title points. `null` when the surface has no detail route. */
  href: string | null;
  /** Real, human-written alt text for the approved image, when one exists. */
  imageAlt?: string;
  /** Fits the card into whatever heading outline the page already has. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

interface ProofPoint {
  readonly value: string;
  readonly label: string;
}

/**
 * The no-metric answer, drawn only from fields already on the record. Order is
 * most-specific-first. Returns `null` when the record carries none of them, in
 * which case the card renders without the block rather than with an empty one.
 */
export function proofPointFor(caseStudy: PublicCaseStudySummary): ProofPoint | null {
  if (caseStudy.primaryCapability) {
    return { value: caseStudy.primaryCapability, label: 'Primary capability' };
  }
  if (caseStudy.capabilities.length > 0) {
    return { value: caseStudy.capabilities[0], label: 'Capability' };
  }
  if (caseStudy.deliverables.length > 0) {
    return { value: caseStudy.deliverables[0], label: 'Deliverable' };
  }
  if (caseStudy.stack.length > 0) {
    return { value: caseStudy.stack[0], label: 'Stack' };
  }
  return null;
}

/** Consent-resolved context, in the order a reader scans it. */
function contextLine(caseStudy: PublicCaseStudySummary): string {
  return [caseStudy.organizationLabel, caseStudy.industry, caseStudy.programLabel]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' · ');
}

export function CaseStudyCard({
  caseStudy,
  href,
  imageAlt,
  headingLevel = 3,
  className,
}: CaseStudyCardProps): React.ReactElement {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const metric = caseStudy.headlineMetric;
  const proof = metric ? null : proofPointFor(caseStudy);
  const context = contextLine(caseStudy);
  const headline = metric ? 'metric' : proof ? 'proof-point' : 'none';

  return (
    <article
      className={`cbv2-cs-card${className ? ` ${className}` : ''}`}
      data-case-study={caseStudy.slug}
      data-headline={headline}
    >
      {caseStudy.heroImageUrl ? (
        <img
          className="cbv2-cs-card__media"
          src={caseStudy.heroImageUrl}
          alt={imageAlt ?? ''}
          loading="lazy"
        />
      ) : null}

      {context ? <p className="cbv2-cs-eyebrow">{context}</p> : null}

      <Heading className="cbv2-cs-card__title">
        {href ? (
          <Link className="cbv2-cs-card__link" to={href}>
            {caseStudy.title}
          </Link>
        ) : (
          caseStudy.title
        )}
      </Heading>

      {caseStudy.standfirst ? (
        <p className="cbv2-cs-card__standfirst">{caseStudy.standfirst}</p>
      ) : null}

      {/*
        ONE CARD SHAPE ACROSS THREE SITES. Ali, 2026-09-09, looking at /proof
        beside aiflotation.com/results: "The cards ... are too big. They should
        be the same size as the ones on colaberry training and ai flotation ...
        All the cards should be the same size."

        Measured at 1440px before cutting anything: this card was 905px tall
        against 541 on AI Flotation - and the gap was not styling. It rendered
        FOUR blocks the others do not: the headline metric, the proof point, and
        two tag lists whose chips wrapped to four rows. Ten leaf text nodes
        against six. No amount of CSS makes a card with four extra blocks the
        same height as one without them.

        SO THEY WERE REMOVED FROM THE CARD, and it is worth being exact about
        where each one still lives, because none of this information is lost:
          - the headline metric and its verification badge are on the RECORD
            page, in the measurement band, with the baseline and methodology
            that make the number checkable - which a card never had room for;
          - stack and deliverables are the FILTER SIDEBAR immediately beside
            this grid on /proof, where they are also actionable rather than
            decorative.
        The card keeps what identifies a record: cover, capability, title,
        standfirst, who built it, and its verification class.
      */}
      <div className="cbv2-cs-card__foot">
        <CaseStudyVerificationBadge
          verificationClass={caseStudy.verificationClass}
          verificationMethod={caseStudy.verificationMethod}
        />
        {caseStudy.builtBy ? (
          <span className="cbv2-cs-note">
            <span className="cbv2-cs-sr-only">Built by: </span>
            {BUILT_BY_LABELS[caseStudy.builtBy]}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export default CaseStudyCard;
