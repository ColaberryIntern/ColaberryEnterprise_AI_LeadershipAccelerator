import React from 'react';
import { Link } from 'react-router-dom';
import { isInternalHref } from '../../components/caseStudy/CaseStudyCTA';
import type {
  PublicCaseStudyCta,
  PublicCaseStudyRepository,
} from '../../services/caseStudyPublicTypes';

/**
 * StoryHeroActions - the two things a reader can do from the top of the page.
 *
 * EVERY CONTROL HERE POINTS AT SOMETHING THAT ALREADY EXISTS. The call to action
 * is the surface's own `cta`, the same object the closing block renders, so the
 * offer is configuration and never a string typed into a component. The
 * repository button is the FIRST repository the projection was willing to
 * publish - which means it was public, carried public-link consent and had a
 * parseable http(s) address, all three checked on the server. When the record
 * has no publishable repository the button is absent, not disabled: a disabled
 * control still advertises that a repository exists.
 *
 * IT IS PAGE-LOCAL for the reason everything else in this directory is:
 * `caseStudyStyleContract.test.ts` asserts the exact ten filenames in
 * `components/caseStudy/`, and `StoryDetailV2.tsx` has a line budget its own
 * contract test enforces.
 *
 * THE REPOSITORY BUTTON SITS IN THE `repositories` TRACKING ZONE and carries
 * `data-repo-role`, so the page's existing delegated handler records it exactly
 * as it records a click in the provenance list - role and visibility class only,
 * never identity. Repeating the emitter here would be a second call site for one
 * event, and the two would drift.
 */

export interface StoryHeroActionsProps {
  cta: PublicCaseStudyCta;
  repositories: readonly PublicCaseStudyRepository[];
}

export const HERO_REPOSITORY_LABEL = 'View the repository';

export function StoryHeroActions({
  cta,
  repositories,
}: StoryHeroActionsProps): React.ReactElement {
  const repository = repositories.length > 0 ? repositories[0] : null;

  return (
    <>
      {isInternalHref(cta.href) ? (
        <Link className="cbv2-btn cbv2-btn--primary" to={cta.href} data-testid="story-hero-cta">
          {cta.buttonLabel}
        </Link>
      ) : (
        <a
          className="cbv2-btn cbv2-btn--primary"
          href={cta.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="story-hero-cta"
        >
          {cta.buttonLabel}
          <span className="cbv2-cs-sr-only"> (opens in a new tab)</span>
        </a>
      )}

      {repository ? (
        <span data-story-zone="repositories" data-repo-role={repository.role}>
          <a
            className="cbv2-btn cbv2-btn--secondary"
            href={repository.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="story-hero-repo"
          >
            {HERO_REPOSITORY_LABEL}
            <span className="cbv2-cs-sr-only">
              {`: ${repository.label} (opens in a new tab)`}
            </span>
          </a>
        </span>
      ) : null}
    </>
  );
}

export default StoryHeroActions;
