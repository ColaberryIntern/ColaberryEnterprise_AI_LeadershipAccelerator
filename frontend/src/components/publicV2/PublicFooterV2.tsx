import React from 'react';
import { Link } from 'react-router-dom';
import { Claim, canShow } from './Claim';

/**
 * PublicFooterV2 — the V2 public site footer.
 *
 * Carries Privacy Policy and Terms links. The audit flagged their absence as a
 * launch blocker rather than a nicety: the site fingerprints visitors via
 * utils/tracker.ts and stores identifiers in localStorage, so shipping without a
 * privacy policy is a compliance exposure, not a missing page.
 *
 * All copy resolves through the claims registry, so nothing unverified can be
 * added here later by editing markup.
 */

interface FooterGroup {
  readonly heading: string;
  readonly links: readonly { readonly label: string; readonly to: string }[];
}

const GROUPS: readonly FooterGroup[] = [
  {
    heading: 'Services',
    links: [
      { label: 'Opportunity Sprint', to: '/services/ai-opportunity-sprint' },
      { label: 'Production Pilot', to: '/services/claude-production-pilot' },
      { label: 'Build & Modernization', to: '/services/enterprise-build-modernization' },
      { label: 'Workforce Accelerator', to: '/services/workforce-architect-accelerator' },
      { label: 'Embedded AI Ops', to: '/services/embedded-ai-operations' },
    ],
  },
  {
    heading: 'Platform',
    links: [
      { label: 'Platform', to: '/platform' },
      { label: 'Free workspace', to: '/try' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  {
    heading: 'Proof',
    links: [
      { label: 'Proof Room', to: '/proof' },
      { label: 'Evidence classes', to: '/proof#evidence' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Contact', to: '/contact' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
];

function PublicFooterV2(): React.ReactElement {
  const year = new Date().getFullYear();

  return (
    <footer className="cbv2-footer">
      <div className="cbv2-wrap">
        <div className="cbv2-footer__grid">
          <div>
            <div className="cbv2-footer__brand">
              <img src="/colaberry-logo.png" alt="Colaberry" width={291} height={82} />
            </div>
            <p style={{ fontSize: 'var(--fs-caption)', maxWidth: '32ch', margin: 0 }}>
              <Claim claimKey="positioning.primary" />
            </p>
            {canShow('anthropic.capability') ? (
              <p
                style={{
                  fontSize: 'var(--fs-caption)',
                  marginTop: 'var(--space-3)',
                  opacity: 0.8,
                }}
              >
                <Claim claimKey="anthropic.capability" />
              </p>
            ) : null}
          </div>

          {GROUPS.map((group) => (
            <div key={group.heading}>
              <h2>{group.heading}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={`${group.heading}-${link.to}-${link.label}`}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="cbv2-footer__bottom">
          <span>&copy; {year} Colaberry Inc. All rights reserved.</span>
          <span>
            <a href="mailto:info@colaberry.com">info@colaberry.com</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

export default PublicFooterV2;
