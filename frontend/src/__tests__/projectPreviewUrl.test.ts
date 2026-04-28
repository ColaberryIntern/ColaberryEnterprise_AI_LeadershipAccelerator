/**
 * Tests for buildPreviewUrl + a guard that prevents the portal's domain
 * from being hardcoded as the iframe base in any preview-style render.
 *
 * Background: ShipCES (and any other project) has its own running URL
 * (e.g. http://95.216.199.47:8889). When a frontend iframe was hardcoded
 * to enterprise.colaberry.ai, opening a Page BP preview in ShipCES showed
 * Colaberry portal pages instead. This test pins down the contract so
 * that regression can't slip back in.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildPreviewUrl } from '../utils/projectPreviewUrl';

describe('buildPreviewUrl', () => {
  test('returns null when project has no preview base', () => {
    expect(buildPreviewUrl(null, '/anything')).toBeNull();
    expect(buildPreviewUrl({}, '/anything')).toBeNull();
    expect(buildPreviewUrl({ direct_preview_url: '', portfolio_url: '' }, '/x')).toBeNull();
  });

  test('uses direct_preview_url when present', () => {
    const out = buildPreviewUrl({ direct_preview_url: 'http://95.216.199.47:8889' }, '/#/ops');
    expect(out).toBe('http://95.216.199.47:8889/#/ops');
  });

  test('reads project_variables.direct_preview_url as a fallback shape', () => {
    const out = buildPreviewUrl(
      { project_variables: { direct_preview_url: 'http://95.216.199.47:8889' } },
      '/#/ops',
    );
    expect(out).toBe('http://95.216.199.47:8889/#/ops');
  });

  test('falls back to portfolio_url when direct is missing', () => {
    const out = buildPreviewUrl({ portfolio_url: '/preview/shipces' }, '/#/ops');
    expect(out).toBe('/preview/shipces/#/ops');
  });

  test('absolute user-typed route passes through unchanged', () => {
    const out = buildPreviewUrl(
      { direct_preview_url: 'http://95.216.199.47:8889' },
      'https://example.com/something',
    );
    expect(out).toBe('https://example.com/something');
  });

  test('strips trailing slash on base before joining', () => {
    const out = buildPreviewUrl({ direct_preview_url: 'http://95.216.199.47:8889/' }, '/ops');
    expect(out).toBe('http://95.216.199.47:8889/ops');
  });

  test('adds leading slash to route when missing', () => {
    const out = buildPreviewUrl({ direct_preview_url: 'http://x.com' }, 'admin');
    expect(out).toBe('http://x.com/admin');
  });

  test('NEVER injects the portal domain when the project has its own base', () => {
    const out = buildPreviewUrl(
      { direct_preview_url: 'http://95.216.199.47:8889', portfolio_url: '/preview/shipces' },
      '/#/ops',
    );
    expect(out).not.toMatch(/enterprise\.colaberry\.ai/i);
    expect(out).not.toMatch(/colaberry\.ai/i);
  });
});

// ---------------------------------------------------------------------------
// Source guard: no iframe in the codebase may build its src by concatenating
// the portal's domain with a route. Every preview iframe must go through
// buildPreviewUrl. This catches the regression at file-save time, not
// runtime.
// ---------------------------------------------------------------------------

describe('source guard: no hardcoded portal-domain iframe srcs', () => {
  const FRONTEND_SRC = path.resolve(__dirname, '..');

  function listFiles(dir: string, ext: RegExp, acc: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // Skip docs and tests themselves
        if (e.name === '__tests__' || e.name === 'docs' || e.name === 'node_modules') continue;
        listFiles(full, ext, acc);
      } else if (ext.test(e.name)) {
        acc.push(full);
      }
    }
    return acc;
  }

  test('no .tsx/.ts file constructs an iframe src using enterprise.colaberry.ai', () => {
    const files = listFiles(FRONTEND_SRC, /\.(tsx|ts)$/);
    const offenders: string[] = [];

    // Pattern: a string-template literal that interpolates a route variable
    // alongside the portal host. e.g. `https://enterprise.colaberry.ai${url}`
    // or `'https://enterprise.colaberry.ai' + url`.
    const TEMPLATE_PORTAL_HOST = /https?:\/\/enterprise\.colaberry\.ai\$\{/;
    const CONCAT_PORTAL_HOST = /['"`]https?:\/\/enterprise\.colaberry\.ai['"`]\s*\+/;

    for (const f of files) {
      const txt = fs.readFileSync(f, 'utf-8');
      if (TEMPLATE_PORTAL_HOST.test(txt) || CONCAT_PORTAL_HOST.test(txt)) {
        offenders.push(path.relative(FRONTEND_SRC, f));
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `These files build a URL by combining a route with the portal host. Use buildPreviewUrl(project, route) instead so each project's iframe loads its own preview base, not the portal's:\n  - ${offenders.join('\n  - ')}`,
      );
    }
  });
});
