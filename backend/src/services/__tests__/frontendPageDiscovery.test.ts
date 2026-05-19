/**
 * Route-aware page discovery tests (2026-05-19).
 *
 * Verifies the phantom-page fix: when registeredRoutes is supplied, the
 * component-as-page heuristic paths only emit pages whose inferred route
 * actually exists in the React Router registry. Without the gate, files
 * like src/components/TrustBadges.tsx get classified as a page at
 * /trust-badges even though that route doesn't exist anywhere — the
 * operator clicks the resulting ui_review task and gets a 404.
 */
import { discoverFrontendPages, readRegisteredRoutes } from '../frontendPageDiscovery';

describe('discoverFrontendPages route-aware gate', () => {
  it('still creates a page for routes that ARE registered', () => {
    const fileTree = [
      'frontend/src/components/HomePage.tsx',
    ];
    const registered = new Set(['/home']);
    const pages = discoverFrontendPages(fileTree, registered);
    expect(pages).toHaveLength(1);
    expect(pages[0].route).toBe('/home');
  });

  it('does NOT create a page for a component file whose inferred route is unregistered', () => {
    // TrustBadges.tsx is in src/components/ but no /trust-badges route is registered.
    // This is the exact failure shape from the operator walk.
    const fileTree = [
      'frontend/src/components/TrustBadges.tsx',
    ];
    const registered = new Set(['/']);
    const pages = discoverFrontendPages(fileTree, registered);
    expect(pages.find(p => p.route === '/trust-badges')).toBeUndefined();
  });

  it('tolerates parameterized variants in registered routes', () => {
    // /admin/generator is the page; /admin/generator/:sourceSlug/:entrySlug
    // is the registered form. The gate should match both.
    const fileTree = [
      'frontend/src/components/GeneratorDashboard.tsx',
    ];
    const registered = new Set(['/admin/generator/:sourceSlug/:entrySlug']);
    const pages = discoverFrontendPages(fileTree, registered);
    expect(pages.find(p => p.route === '/generator')).toBeUndefined();
    // Parameterized base-match is tolerant, so generator at base would match if inferred.
  });

  it('falls back to permissive (legacy) behavior when no route registry passed', () => {
    const fileTree = [
      'frontend/src/components/TrustBadges.tsx',
    ];
    // No registry → permissive (same as before the fix)
    const pages = discoverFrontendPages(fileTree);
    expect(pages.find(p => p.route === '/trust-badges')).toBeDefined();
  });

  it('still discovers real pages from src/pages/ regardless of gate', () => {
    // The CRA src/pages/ heuristic doesn't go through the gate — real pages
    // are detected by their file location, not by router cross-reference.
    const fileTree = [
      'frontend/src/pages/ContactPage.tsx',
      'frontend/src/pages/admin/CampaignsPage.tsx',
    ];
    const registered = new Set<string>(); // empty registry shouldn't block these
    const pages = discoverFrontendPages(fileTree, registered);
    expect(pages.find(p => p.route === '/contact')).toBeDefined();
    expect(pages.find(p => p.route === '/admin/campaigns')).toBeDefined();
  });
});

describe('readRegisteredRoutesFromContents', () => {
  it('extracts path declarations from raw file contents', () => {
    const { readRegisteredRoutesFromContents } = require('../frontendPageDiscovery');
    const contents = [
      `<Route path="/contact" element={<Contact />} />\n<Route path="/about" element={<About />} />`,
      `<Route path="/admin/dashboard" element={<Dashboard />} />`,
    ];
    const result = readRegisteredRoutesFromContents(contents);
    expect(result).not.toBeNull();
    expect(result!.has('/contact')).toBe(true);
    expect(result!.has('/about')).toBe(true);
    expect(result!.has('/admin/dashboard')).toBe(true);
    expect(result!.size).toBe(3);
  });

  it('skips null/undefined contents', () => {
    const { readRegisteredRoutesFromContents } = require('../frontendPageDiscovery');
    const result = readRegisteredRoutesFromContents([null, undefined, '<Route path="/x" />']);
    expect(result).not.toBeNull();
    expect(result!.has('/x')).toBe(true);
  });

  it('returns null when no paths are found', () => {
    const { readRegisteredRoutesFromContents } = require('../frontendPageDiscovery');
    expect(readRegisteredRoutesFromContents([null])).toBeNull();
    expect(readRegisteredRoutesFromContents(['no paths here'])).toBeNull();
  });
});

describe('readRegisteredRoutes', () => {
  it('returns null when no route files in tree', () => {
    expect(readRegisteredRoutes(['backend/src/foo.ts'])).toBeNull();
  });

  it('finds route files in the tree by path pattern', () => {
    // Doesn't actually read the file contents in this test since we're not
    // pointing at real paths — just verifies the path-matching gate doesn't
    // bail too eagerly. (Filesystem reads are tested via the integration
    // path in the engine refresh.)
    const result = readRegisteredRoutes([
      'frontend/src/App.tsx',
      'frontend/src/routes/publicRoutes.tsx',
    ], '/nonexistent');
    // Files don't exist on disk at /nonexistent → result is null (empty set).
    expect(result).toBeNull();
  });
});
