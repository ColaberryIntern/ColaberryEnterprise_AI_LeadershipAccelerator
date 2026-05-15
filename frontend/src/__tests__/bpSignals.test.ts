/**
 * Operational Honest-Build-Signal Sprint, 2026-05-15.
 *
 * Covers the BP signal layer:
 *   bpPillars / bpKindLabel / bpBuiltness / domainBuildBreakdown / domainBuildSummary
 */
import {
  bpPillars,
  bpKindLabel,
  bpBuiltness,
  domainBuildBreakdown,
  domainBuildSummary,
  type BPLikeSignal,
} from '../utils/bpSignals';

const usable = (over: Partial<BPLikeSignal> = {}): BPLikeSignal => ({
  usability: { backend: 'n/a', frontend: 'ready', agent: 'n/a', usable: true },
  is_page_bp: true, source: 'frontend_page', is_complete: true,
  ...over,
});

const partial = (over: Partial<BPLikeSignal> = {}): BPLikeSignal => ({
  usability: { backend: 'partial', frontend: 'partial', agent: 'ready', usable: false },
  source: 'brownfield_discovered',
  ...over,
});

const empty = (over: Partial<BPLikeSignal> = {}): BPLikeSignal => ({
  usability: { backend: 'n/a', frontend: 'n/a', agent: 'n/a', usable: false },
  ...over,
});

// ---------------------------------------------------------------------------
describe('bpPillars', () => {
  test('returns 3 pillars in order: backend, frontend, agent', () => {
    const pillars = bpPillars(usable());
    expect(pillars.map(p => p.label)).toEqual(['backend', 'frontend', 'agent']);
  });

  test('mapping: ready/partial/n-a/missing get distinct statuses', () => {
    const bp = { usability: { backend: 'ready', frontend: 'partial', agent: 'missing' } };
    const ps = bpPillars(bp);
    expect(ps[0].status).toBe('ready');
    expect(ps[1].status).toBe('partial');
    expect(ps[2].status).toBe('missing');
  });

  test('"n/a" literal normalizes to na status (not "missing")', () => {
    const ps = bpPillars({ usability: { backend: 'n/a', frontend: 'n/a', agent: 'n/a' } });
    expect(ps.every(p => p.status === 'na')).toBe(true);
  });

  test('tooltip description is humane and operator-readable', () => {
    const ps = bpPillars({ usability: { backend: 'ready', frontend: 'missing', agent: 'partial' } });
    expect(ps[0].description).toBe('Backend ready');
    expect(ps[1].description).toBe('Frontend not yet built');
    expect(ps[2].description).toBe('Agent partially wired');
  });
});

// ---------------------------------------------------------------------------
describe('bpKindLabel', () => {
  test('is_page_bp or frontend_page source → Page', () => {
    expect(bpKindLabel({ is_page_bp: true })).toBe('Page');
    expect(bpKindLabel({ source: 'frontend_page' })).toBe('Page');
  });

  test('only agent non-NA → Agent', () => {
    expect(bpKindLabel({ usability: { backend: 'n/a', frontend: 'n/a', agent: 'ready' } })).toBe('Agent');
  });

  test('only backend non-NA → Service', () => {
    expect(bpKindLabel({ usability: { backend: 'partial', frontend: 'n/a', agent: 'n/a' } })).toBe('Service');
  });

  test('multiple non-NA pillars (and not a page) → Process', () => {
    expect(bpKindLabel({ usability: { backend: 'partial', frontend: 'partial', agent: 'ready' } })).toBe('Process');
  });

  test('all n/a and not a page → Process (fallback)', () => {
    expect(bpKindLabel({ usability: { backend: 'n/a', frontend: 'n/a', agent: 'n/a' } })).toBe('Process');
  });
});

// ---------------------------------------------------------------------------
describe('bpBuiltness', () => {
  test('usable=true → Built (honest, regardless of completion %)', () => {
    expect(bpBuiltness(usable())).toBe('Built');
  });

  test('is_complete=true → Built (page BPs)', () => {
    expect(bpBuiltness({ is_complete: true, usability: { usable: false } })).toBe('Built');
  });

  test('some pillar ready, none usable → Wired', () => {
    expect(bpBuiltness({ usability: { backend: 'ready', frontend: 'n/a', agent: 'n/a', usable: false } })).toBe('Wired');
  });

  test('some pillar partial, no ready → Partial', () => {
    expect(bpBuiltness({ usability: { backend: 'partial', frontend: 'n/a', agent: 'n/a', usable: false } })).toBe('Partial');
  });

  test('all pillars n/a or missing → Not built yet', () => {
    expect(bpBuiltness(empty())).toBe('Not built yet');
    expect(bpBuiltness({ usability: { backend: 'missing', frontend: 'missing', agent: 'missing', usable: false } })).toBe('Not built yet');
  });
});

// ---------------------------------------------------------------------------
describe('domainBuildBreakdown + domainBuildSummary', () => {
  test('empty domain → all zeros + null summary', () => {
    const b = domainBuildBreakdown([]);
    expect(b).toEqual({ total: 0, built: 0, wired: 0, partial: 0, foundation: 0, notBuilt: 0 });
    expect(domainBuildSummary(b)).toBeNull();
  });

  test('mixed domain → counts each tier + composes calm summary', () => {
    const bps: BPLikeSignal[] = [
      usable(),                                                                                            // Built
      usable(),                                                                                            // Built
      { usability: { backend: 'ready', frontend: 'n/a', agent: 'n/a' } },                                  // Wired
      { usability: { backend: 'partial', frontend: 'n/a', agent: 'n/a' } },                                // Partial
      empty(),                                                                                              // Not built yet
    ];
    const b = domainBuildBreakdown(bps);
    expect(b.total).toBe(5);
    expect(b.built).toBe(2);
    expect(b.wired).toBe(1);
    expect(b.partial).toBe(1);
    expect(b.notBuilt).toBe(1);
    const sum = domainBuildSummary(b)!;
    expect(sum).toBe('2 built · 1 wired · 1 partial · 1 not built yet — of 5 total');
  });
});
