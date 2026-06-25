import React from 'react';
import { Link } from 'react-router-dom';
import {
  FOOTER_LINKS,
  FOOTER_TAGLINE,
  PRIMARY_CTA,
  SECONDARY_CTA,
  CONTACT_EMAIL,
} from '../../constants';
import { Button } from '../../colaberry/components/core/Button';

/**
 * Router-aware CTA styled with the Colaberry design-system button.
 * The DS Button drops react-router's `to` prop, so internal SPA links render
 * <Link> with the DS `.cb-btn` classes. A real DS <Button> in this tree
 * guarantees the stylesheet is injected before these links paint.
 */
function CtaLink({
  to,
  variant,
  children,
}: {
  to: string;
  variant: 'primary' | 'outline';
  children: React.ReactNode;
}) {
  return (
    <Link to={to} className={`cb-btn cb-btn--${variant}`}>
      <span>{children}</span>
    </Link>
  );
}

function PublicFooter() {
  return (
    <footer className="bg-dark text-light py-5" role="contentinfo">
      <div className="container">
        <div className="row">
          <div className="col-lg-4 mb-4">
            <div className="d-flex align-items-center mb-2">
              <img
                src="/colaberry-icon.png"
                alt="Colaberry"
                width="32"
                height="32"
                className="me-2 logo-light"
              />
              <h5 className="text-light mb-0">Colaberry</h5>
            </div>
            <p className="text-secondary mb-3">{FOOTER_TAGLINE}</p>
            <p className="text-secondary small mb-0">
              Learn With Claude. Build Through Colaberry. Deploy In The Real World.
            </p>
          </div>

          <div className="col-6 col-lg-3 mb-4">
            <h5 className="text-light">Explore</h5>
            <ul className="list-unstyled">
              {FOOTER_LINKS.map((link) => (
                <li key={link.path}>
                  <Link to={link.path} className="text-secondary">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-6 col-lg-2 mb-4">
            <h5 className="text-light">Connect</h5>
            <ul className="list-unstyled text-secondary">
              <li>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-secondary">{CONTACT_EMAIL}</a></li>
              <li>LinkedIn: <a href="https://www.linkedin.com/company/colaberry" className="text-secondary" target="_blank" rel="noopener noreferrer">Colaberry Inc</a></li>
              <li>Twitter: <a href="https://twitter.com/Colaberry" className="text-secondary" target="_blank" rel="noopener noreferrer">@Colaberry</a></li>
            </ul>
          </div>

          {/* Two doors into one program. */}
          <div className="col-lg-3 mb-4">
            <h5 className="text-light">Pick your door</h5>
            <p className="text-secondary small">
              One program, two ways in.
            </p>
            <div className="d-grid gap-2">
              {/* Door A — individuals self-serve the $149/mo membership. */}
              <CtaLink to={PRIMARY_CTA.path} variant="primary">
                {PRIMARY_CTA.label}
              </CtaLink>
              {/* Door B — employers sponsor annual seats (talent discovery). */}
              <CtaLink to={SECONDARY_CTA.path} variant="outline">
                {SECONDARY_CTA.label}
              </CtaLink>
            </div>
          </div>
        </div>

        <hr className="border-secondary" />
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-2">
          <p className="text-secondary mb-0">
            &copy; {new Date().getFullYear()} Colaberry Inc. All rights reserved.
          </p>
          {/* Real DS Button: guarantees the .cb-btn stylesheet injects for the
              router-aware CtaLink siblings above. */}
          <Button as="a" href={`mailto:${CONTACT_EMAIL}`} variant="ghost" size="sm">
            Talk to us
          </Button>
        </div>
      </div>
    </footer>
  );
}

export default PublicFooter;
