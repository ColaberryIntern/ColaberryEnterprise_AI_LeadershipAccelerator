/**
 * Frontend route validation tests (2026-05-19, Tier-2 #6).
 *
 * Catches the failure mode the phantom-page scanner fix doesn't:
 * routes registered when the cap was created but later REMOVED from
 * React Router. Each engine refresh re-checks every cap's
 * frontend_route against the current registry; stale routes are
 * cleared in-memory so deep-links don't 404.
 *
 * Safety nets identical to pruneCapLinkedFiles — small registry or
 * >50% clear rate aborts to protect cap data from a misconfigured
 * registry fetch.
 */
import { validateCapFrontendRoutes } from '../systemStateEngine';

// Registries need ≥ ROUTE_VALIDATION_MIN_REGISTRY (10) routes to clear the gate.
const FILLER_ROUTES = Array.from({ length: 15 }, (_, i) => `/filler-${i}`);

describe('validateCapFrontendRoutes', () => {
  it('clears frontend_route when route is no longer registered', () => {
    const caps = [
      { name: 'Trust Badges Page', frontend_route: '/trust-badges' },     // stale
      { name: 'Contact Page', frontend_route: '/contact' },               // live
    ];
    const registry = new Set(['/contact', ...FILLER_ROUTES]);
    const summary = validateCapFrontendRoutes(caps, registry);
    expect(caps[0].frontend_route).toBeNull();
    expect(caps[1].frontend_route).toBe('/contact');
    expect(summary.totalCleared).toBe(1);
    expect(summary.aborted).toBe(false);
    expect(summary.clearedRoutes[0]).toEqual({ capName: 'Trust Badges Page', staleRoute: '/trust-badges' });
  });

  it('matches parameterized routes by base (admin/generator vs admin/generator/:id)', () => {
    const caps = [{ name: 'Generator', frontend_route: '/admin/generator' }];
    const registry = new Set(['/admin/generator/:sourceSlug/:entrySlug', ...FILLER_ROUTES]);
    const summary = validateCapFrontendRoutes(caps, registry);
    expect(caps[0].frontend_route).toBe('/admin/generator'); // preserved
    expect(summary.totalCleared).toBe(0);
  });

  it('skips caps with no frontend_route (no-op)', () => {
    const caps = [{ name: 'Service', frontend_route: null }, { name: 'Other' }];
    const registry = new Set([...FILLER_ROUTES]);
    const summary = validateCapFrontendRoutes(caps as any, registry);
    expect(summary.totalCleared).toBe(0);
  });

  it('aborts when registry is empty', () => {
    const caps = [{ name: 'A', frontend_route: '/a' }];
    const summary = validateCapFrontendRoutes(caps, new Set());
    expect(caps[0].frontend_route).toBe('/a');
    expect(summary.aborted).toBe(true);
    expect(summary.abortReason).toMatch(/empty/);
  });

  it('aborts when registry is suspiciously small (< 10 routes)', () => {
    const caps = [{ name: 'A', frontend_route: '/a' }];
    const summary = validateCapFrontendRoutes(caps, new Set(['/a', '/b', '/c']));
    expect(caps[0].frontend_route).toBe('/a');
    expect(summary.aborted).toBe(true);
    expect(summary.abortReason).toMatch(/below min|partial parse/);
  });

  it('aborts when >50% of caps would have routes cleared (probable registry mismatch)', () => {
    // 4 caps, 3 stale = 75% — should abort to preserve data
    const caps = [
      { name: 'A', frontend_route: '/stale1' },
      { name: 'B', frontend_route: '/stale2' },
      { name: 'C', frontend_route: '/stale3' },
      { name: 'D', frontend_route: '/live' },
    ];
    const registry = new Set(['/live', ...FILLER_ROUTES]);
    const summary = validateCapFrontendRoutes(caps, registry);
    // All routes preserved (no mutation)
    expect(caps[0].frontend_route).toBe('/stale1');
    expect(caps[3].frontend_route).toBe('/live');
    expect(summary.aborted).toBe(true);
    expect(summary.abortReason).toMatch(/would clear 75%|wrong-repo|stale/);
  });

  it('does NOT abort when clear rate is reasonable (< 50%)', () => {
    // 4 caps, 1 stale = 25% — well under threshold
    const caps = [
      { name: 'A', frontend_route: '/stale' },
      { name: 'B', frontend_route: '/live1' },
      { name: 'C', frontend_route: '/live2' },
      { name: 'D', frontend_route: '/live3' },
    ];
    const registry = new Set(['/live1', '/live2', '/live3', ...FILLER_ROUTES]);
    const summary = validateCapFrontendRoutes(caps, registry);
    expect(caps[0].frontend_route).toBeNull();
    expect(caps[1].frontend_route).toBe('/live1');
    expect(summary.totalCleared).toBe(1);
    expect(summary.aborted).toBe(false);
  });

  it('handles null registry safely', () => {
    const caps = [{ name: 'A', frontend_route: '/a' }];
    const summary = validateCapFrontendRoutes(caps, null);
    expect(caps[0].frontend_route).toBe('/a');
    expect(summary.aborted).toBe(true);
  });
});
