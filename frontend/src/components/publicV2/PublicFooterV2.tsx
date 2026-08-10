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

/**
 * Footer destinations.
 *
 * FIXED IN 1.10, AND IT WAS MY BUG: these were written as root paths (/platform,
 * /proof, /services/...) while every V2 page is mounted under /v2. Nine of the
 * thirteen links 404'd. The original tests asserted the links rendered, which
 * they did -- to nowhere. `FooterLinkResolution` in the footer test now checks
 * every entry against the real route table instead.
 *
 * Two entries were removed rather than repaired:
 *   - "Terms", which pointed at /terms. No terms page exists and drafting one is
 *     legal work, not something to invent to satisfy a link.
 *   - "Evidence classes", which pointed at /proof#evidence. No such anchor
 *     exists; the Proof Room link covers it.
 * A link to a policy that does not exist is worse than no link, because it
 * implies a document someone has written.
 */
const GROUPS: readonly FooterGroup[] = [
  {
    heading: 'Services',
    links: [
      { label: 'Opportunity Sprint', to: '/v2/services/ai-opportunity-sprint' },
      { label: 'Production Pilot', to: '/v2/services/claude-production-pilot' },
      { label: 'Build & Modernization', to: '/v2/services/enterprise-build-modernization' },
      { label: 'Workforce Accelerator', to: '/v2/services/workforce-architect-accelerator' },
      { label: 'Embedded AI Ops', to: '/v2/services/embedded-ai-operations' },
    ],
  },
  {
    heading: 'Platform',
    links: [
      { label: 'Platform', to: '/v2/platform' },
      { label: 'Free workspace', to: '/v2/try' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  {
    heading: 'Proof',
    links: [
      { label: 'Proof Room', to: '/v2/proof' },
      { label: 'Map an opportunity', to: '/v2/lab' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Contact', to: '/contact' },
      { label: 'What we collect', to: '/v2/privacy' },
    ],
  },
];

/** Exported so the test can check each destination resolves to a real route. */
export const FOOTER_LINKS: readonly string[] = GROUPS.flatMap((g) => g.links.map((l) => l.to));

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
