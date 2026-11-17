import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';

/**
 * enterprise.colaberry.ai/portal/login serves two audiences (Ali, 2026-11-17: "Make sure
 * it doesn't conflict with the training site"). Enterprise visitors get the Colaberry
 * Enterprise look; students arriving from training.colaberry.com keep the Training look.
 *
 * Pinned here:
 *  1. Who is recognised as training, and that anything unrecognised is enterprise.
 *  2. Each look carries its own brand and nothing of the other's: no ENTERPRISE tag or
 *     blue theme for a training student, no red-green wordmark or "Enterprise AI
 *     Leadership Accelerator" label for an enterprise visitor.
 *  3. The sign-in itself is the same for both (same field, same button).
 *  4. The theme is scoped to the enterprise root, so it cannot recolor training.
 */
jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { post: jest.fn() } }));

/* eslint-disable import/first */
import PortalLoginPage from '../PortalLoginPage';
import { resolveLoginBrand } from '../loginBrand';
/* eslint-enable import/first */

const render = (url: string, referrer = ''): string => {
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <PortalLoginPage />
    </MemoryRouter>,
  );
};

describe('resolveLoginBrand', () => {
  const q = (s: string) => new URLSearchParams(s);
  it('is enterprise by default', () => {
    expect(resolveLoginBrand(q(''), '')).toBe('enterprise');
    expect(resolveLoginBrand(q(''), 'https://enterprise.colaberry.ai/services')).toBe('enterprise');
    expect(resolveLoginBrand(q(''), 'https://www.google.com/')).toBe('enterprise');
  });
  it('is training for ?brand=training, whatever the referrer', () => {
    expect(resolveLoginBrand(q('brand=training'), '')).toBe('training');
    expect(resolveLoginBrand(q('next=%2Fportal&brand=Training'), 'https://enterprise.colaberry.ai/')).toBe('training');
  });
  it('is training when the visitor came from the training site', () => {
    expect(resolveLoginBrand(q(''), 'https://training.colaberry.com/')).toBe('training');
    expect(resolveLoginBrand(q(''), 'https://www.training.colaberry.com/membership')).toBe('training');
  });
  it('lets an explicit brand=enterprise win, and ignores junk', () => {
    expect(resolveLoginBrand(q('brand=enterprise'), 'https://training.colaberry.com/')).toBe('enterprise');
    expect(resolveLoginBrand(q('brand=<script>'), 'not a url')).toBe('enterprise');
    expect(resolveLoginBrand(q(''), 'https://training.colaberry.com.evil.example/')).toBe('enterprise');
  });
});

describe('/portal/login: the enterprise look', () => {
  const h = () => render('/portal/login');
  it('wears the Colaberry Enterprise lockup and theme', () => {
    expect(h()).toContain('data-brand="enterprise"');
    expect(h()).toContain('data-enterprise-mark');
    expect(h()).toContain('cbv2-lockup__tag');
    expect(h()).toContain('--red-500:#2E6A86');
  });
  it('carries nothing of the training brand', () => {
    expect(h()).not.toContain('colaberry-logo-transparent.png');
    expect(h()).not.toContain('Enterprise AI Leadership');
    expect(h()).toContain('Back to enterprise.colaberry.ai');
  });
});

describe('/portal/login: the training look', () => {
  for (const [label, url, ref] of [
    ['from the training link', '/portal/login?brand=training', ''],
    ['from the training referrer', '/portal/login', 'https://training.colaberry.com/'],
  ]) {
    it(`keeps the Training wordmark and red theme, ${label}`, () => {
      const h = render(url, ref);
      expect(h).toContain('data-brand="training"');
      expect(h).toContain('colaberry-logo-transparent.png');
      expect(h).not.toContain('data-enterprise-mark');
      expect(h).not.toContain('--red-500:#2E6A86');
      expect(h).not.toContain('Enterprise');
      expect(h).toContain('Back to training.colaberry.com');
    });
  }
});

describe('/portal/login: one sign-in for both', () => {
  it('has the same email field and button in both looks', () => {
    for (const h of [render('/portal/login'), render('/portal/login?brand=training')]) {
      expect(h).toContain('id="portal-email"');
      expect(h).toContain('Send me an access link');
    }
  });
  it('scopes every enterprise rule to the enterprise root', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'portalLoginEnterpriseStyles.ts'), 'utf8');
    const body = css.slice(css.indexOf('`') + 1, css.lastIndexOf('`'));
    const selectors = body.replace(/@font-face\{[^}]*\}/, '').match(/[^{}]+(?=\{)/g) || [];
    expect(selectors.length).toBeGreaterThan(4);
    for (const s of selectors) expect(s.trim()).toMatch(/^\.cbpl-root/);
  });
});
