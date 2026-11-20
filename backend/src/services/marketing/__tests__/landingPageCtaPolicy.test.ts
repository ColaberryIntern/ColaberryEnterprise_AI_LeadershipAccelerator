import {
  isAllowedCtaHref, disallowedCtaHrefs, CTA_DESTINATION_MESSAGE, PHONE_REQUIRING_CTA_ROUTES,
} from '../landingPageCtaPolicy';
import { parseLandingPageContent } from '../../../schemas/landingPageContentSchema';

/**
 * PH1 (Ali, 2026-11-19): every public signup/lead form requires a phone number, so a landing
 * page's buttons may only hand people to a signup page that asks for one.
 */

const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;
beforeEach(() => { process.env.FRONTEND_URL = 'https://enterprise.colaberry.ai'; });
afterAll(() => {
  if (ORIGINAL_FRONTEND_URL === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
});

describe('isAllowedCtaHref', () => {
  it.each([
    '/open-house',
    '/open-house/',
    '/portal/signup',
    '/portal/signup?utm_source=fb&utm_medium=paid',
    '/enroll#start',
    '/ai-pilot',
    '/ai-pilot/transport',
    '/try',
    '/demo-pilot',
    '/book',
    '/sponsorship',
    'https://enterprise.colaberry.ai/open-house',
  ])('allows %s', (href) => {
    expect(isAllowedCtaHref(href)).toBe(true);
  });

  it.each([
    '/apply',
    '/',
    '/open-house-old',
    '/ai-pilotx',
    '/portal/today',
    '//evil.example/open-house',
    'https://evil.example/open-house',
    'https://enterprise.colaberry.ai/pricing',
    'https://training.colaberry.com/open-house',
    'javascript:alert(1)',
    '',
  ])('refuses %s', (href) => {
    expect(isAllowedCtaHref(href)).toBe(false);
  });

  it('refuses every absolute URL when the app host is not configured', () => {
    delete process.env.FRONTEND_URL;
    expect(isAllowedCtaHref('https://enterprise.colaberry.ai/open-house')).toBe(false);
    expect(isAllowedCtaHref('/open-house')).toBe(true);
  });
});

describe('disallowedCtaHrefs', () => {
  it('finds every off-policy button anywhere in the content, in order', () => {
    const content = {
      sections: [
        { type: 'hero', headline: 'H', cta: { label: 'A', href: '/apply' } },
        { type: 'text', paragraphs: ['x'], cta: { label: 'B', href: '/open-house' } },
        { type: 'cta', headline: 'C', cta: { label: 'C', href: 'https://evil.example/x' } },
      ],
    };
    expect(disallowedCtaHrefs(content)).toEqual(['/apply', 'https://evil.example/x']);
  });

  it('is empty for a page with no buttons, and for one that points at /open-house (the live pages)', () => {
    expect(disallowedCtaHrefs({ sections: [{ type: 'text', paragraphs: ['x'] }] })).toEqual([]);
    expect(disallowedCtaHrefs({ sections: [{ type: 'cta', headline: 'Go', cta: { label: 'Go', href: '/open-house' } }] })).toEqual([]);
  });

  it('the message names every allowed route, so the operator knows what to use', () => {
    for (const r of PHONE_REQUIRING_CTA_ROUTES) expect(CTA_DESTINATION_MESSAGE).toContain(r.path);
    expect(CTA_DESTINATION_MESSAGE).not.toMatch(/\bfree\b/i);
  });
});

describe('the public renderer is not affected', () => {
  it('a page with an older destination still parses for rendering - the rule is save-time only', () => {
    const r = parseLandingPageContent({ sections: [{ type: 'cta', headline: 'Go', cta: { label: 'Go', href: '/apply' } }] });
    expect(r.ok).toBe(true);
  });
});
