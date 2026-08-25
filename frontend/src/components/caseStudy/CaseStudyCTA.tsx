import React from 'react';
import { Link } from 'react-router-dom';
import type { PublicCaseStudyCta } from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyCTA - the closing call to action.
 *
 * IT IS SURFACE DATA, NOT RECORD DATA. Every string comes from the `cta` object
 * the API returned with the surface profile; nothing about the offer is written
 * here. That is what makes the CTA a configuration change rather than a code
 * change when marketing moves - and it is why this component contains no path,
 * no product name and no wording of its own.
 *
 * INTERNAL LINKS STAY INTERNAL. An href that begins with a single `/` is a route
 * and renders as a `<Link>`, so it navigates without a full page load and keeps
 * router state. Anything else is treated as external and gets
 * `rel="noopener noreferrer"` plus an accessible note that it opens a new tab.
 * `//host` is deliberately NOT internal: a protocol-relative url is an external
 * address wearing a leading slash.
 */

export interface CaseStudyCTAProps {
  cta: PublicCaseStudyCta;
  headingLevel?: 2 | 3;
  className?: string;
}

export function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

export function CaseStudyCTA({
  cta,
  headingLevel = 2,
  className,
}: CaseStudyCTAProps): React.ReactElement {
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  const internal = isInternalHref(cta.href);

  return (
    <div className={`cbv2-cs-cta${className ? ` ${className}` : ''}`}>
      <p className="cbv2-cs-cta__eyebrow">{cta.eyebrow}</p>
      <Heading className="cbv2-cs-cta__heading">{cta.heading}</Heading>
      {internal ? (
        <Link className="cbv2-cs-cta__button" to={cta.href}>
          {cta.buttonLabel}
        </Link>
      ) : (
        <a
          className="cbv2-cs-cta__button"
          href={cta.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {cta.buttonLabel}
          <span className="cbv2-cs-sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

export default CaseStudyCTA;
