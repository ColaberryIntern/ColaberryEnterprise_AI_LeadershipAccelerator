/**
 * shell.test.tsx — header and footer guarantees.
 *
 * Asserts the things the audit found missing or broken on the current site:
 * a skip link, Privacy/Terms in the footer, accessible menu semantics, and
 * governed footer copy that cannot smuggle an unverified claim.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import PublicHeaderV2, { V2_NAV } from '../PublicHeaderV2';
import PublicFooterV2 from '../PublicFooterV2';

const at = (path: string, el: React.ReactElement): string =>
  renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>);

const textOf = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('PublicHeaderV2', () => {
  it('renders every primary nav item', () => {
    const html = at('/', <PublicHeaderV2 />);
    V2_NAV.forEach((item) => {
      expect(html).toContain(`href="${item.to}"`);
      expect(textOf(html)).toContain(item.label);
    });
  });

  it('exposes an accessible primary landmark and a log-in route', () => {
    const html = at('/', <PublicHeaderV2 />);
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('href="/portal/login"');
  });

  it('marks the active route with aria-current', () => {
    const html = at('/platform', <PublicHeaderV2 />);
    expect(html).toContain('aria-current="page"');
  });

  it('does not mark aria-current on an unrelated route', () => {
    expect(at('/contact', <PublicHeaderV2 />)).not.toContain('aria-current="page"');
  });

  it('wires the menu toggle to the panel it controls, for screen readers', () => {
    const html = at('/', <PublicHeaderV2 />);
    expect(html).toContain('aria-controls="cbv2-navlinks"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('id="cbv2-navlinks"');
  });

  it('keeps both CTAs available inside the mobile menu, not merely hidden', () => {
    // hiding only the primary button still overflowed the bar at 390px
    const html = at('/', <PublicHeaderV2 />);
    expect(html).toContain('cbv2-navcta-mobile');
    const ctaBlock = html.slice(html.indexOf('cbv2-navcta-mobile'));
    expect(ctaBlock).toContain('Talk to an Architect');
    expect(ctaBlock).toContain('Explore the Platform');
  });

  it('accepts an overridden nav, so IA changes do not require editing markup', () => {
    const html = at('/', <PublicHeaderV2 navItems={[{ label: 'Only', to: '/only' }]} />);
    expect(html).toContain('href="/only"');
    expect(textOf(html)).not.toContain('Proof');
  });
});

describe('PublicFooterV2', () => {
  it('links Privacy Policy and Terms — the audit called their absence a launch blocker', () => {
    const html = at('/', <PublicFooterV2 />);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(textOf(html)).toContain('Privacy Policy');
    expect(textOf(html)).toContain('Terms');
  });

  it('renders the positioning line through the claims registry', () => {
    expect(textOf(at('/', <PublicFooterV2 />))).toContain(
      'Build the system. Build the people. Prove the capability.',
    );
  });

  it('renders the capability statement, not the unverified partner designation', () => {
    const text = textOf(at('/', <PublicFooterV2 />));
    expect(text).toContain('We build on Claude and Claude Code.');
    expect(text).not.toContain('Claude Code partner');
    expect(text).not.toContain('Anthropic / Claude Code');
  });

  it('never renders a blocked claim anywhere in the footer', () => {
    const text = textOf(at('/', <PublicFooterV2 />));
    ['5,000+', '10,000+', '$100M', 'Since 2012', '477%', '$1,788', '$4,500'].forEach((banned) => {
      expect(text).not.toContain(banned);
    });
  });

  it('links the five service detail routes', () => {
    const html = at('/', <PublicFooterV2 />);
    [
      'ai-opportunity-sprint',
      'claude-production-pilot',
      'enterprise-build-modernization',
      'workforce-architect-accelerator',
      'embedded-ai-operations',
    ].forEach((slug) => expect(html).toContain(`/services/${slug}`));
  });

  it('shows the current year', () => {
    expect(textOf(at('/', <PublicFooterV2 />))).toContain(String(new Date().getFullYear()));
  });
});
