/**
 * Serving model-written HTML from our own origin is the risk in this feature, and expiry is
 * the promise §21 makes about it. Both are tested here; the CSP that backs them up lives in
 * the controller.
 */

const mockFindByPk = jest.fn();
const mockGenerate = jest.fn();

jest.mock('../../../models/ProjectUnderstandingRecord', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a) },
}));

jest.mock('../../../models/Lead', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));

jest.mock('../uiConceptGenerator', () => ({
  generateConcepts: (...a: any[]) => mockGenerate(...a),
}));

import {
  ensurePrototypes,
  prototypeLinks,
  prototypeHtml,
  PROTOTYPE_TTL_DAYS,
  type PrototypeSet,
} from '../appPrototypeService';

const concept = (key: string, recommended = false) => ({
  key,
  title: key,
  recommended,
  rationale: 'why',
  html: '<style>body{font-family:sans-serif}</style><p>Concept for Ralph</p>',
});

const setOf = (expiresInDays: number): PrototypeSet => ({
  concepts: [concept('command_center', true), concept('operational')],
  generated_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
});

const record = (over: any = {}) => ({
  id: 'rec-1',
  status: 'extracted',
  title: 'Dispatcher Workflow Automation',
  proposed_surfaces: [],
  lead_id: 2736,
  items: [
    { dimension: 'actors', value: 'Ralph is the project manager', classification: 'FACT', provenance: 'client_confirmed' },
  ],
  scope: null,
  update: jest.fn(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGenerate.mockResolvedValue({
    ok: true,
    concepts: [concept('command_center', true)],
    rejected: [],
    runtime_ms: 100,
    cost_usd: 0.01,
  });
});

describe('ensurePrototypes', () => {
  it('generates and caches on the first request', async () => {
    const r = record();
    mockFindByPk.mockResolvedValue(r);

    const set = await ensurePrototypes('rec-1');

    expect(set?.concepts).toHaveLength(1);
    expect(r.update).toHaveBeenCalled();
  });

  it('reuses a cached set rather than paying for generation twice', async () => {
    mockFindByPk.mockResolvedValue(record({ scope: { prototypes: setOf(10) } }));

    const set = await ensurePrototypes('rec-1');

    expect(set?.concepts).toHaveLength(2);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('regenerates once the cached set has expired', async () => {
    mockFindByPk.mockResolvedValue(record({ scope: { prototypes: setOf(-1) } }));

    await ensurePrototypes('rec-1');

    expect(mockGenerate).toHaveBeenCalled();
  });

  it('sets an expiry §21 requires rather than serving forever', async () => {
    mockFindByPk.mockResolvedValue(record());

    const set = await ensurePrototypes('rec-1');
    const days = (new Date(set!.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000);

    expect(Math.round(days)).toBe(PROTOTYPE_TTL_DAYS);
  });

  it('returns nothing when every concept was refused, rather than an empty gallery', async () => {
    mockGenerate.mockResolvedValue({ ok: false, error_class: 'ContractViolation', error: 'all refused', rejected: [] });
    mockFindByPk.mockResolvedValue(record());

    expect(await ensurePrototypes('rec-1')).toBeNull();
  });

  it('does not generate for an understanding that failed extraction', async () => {
    mockFindByPk.mockResolvedValue(record({ status: 'failed' }));

    expect(await ensurePrototypes('rec-1')).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('survives a cache write failure — losing the cache must not fail the page', async () => {
    const r = record({ update: jest.fn().mockRejectedValue(new Error('disk full')) });
    mockFindByPk.mockResolvedValue(r);

    const set = await ensurePrototypes('rec-1');
    expect(set?.concepts).toHaveLength(1);
  });
});

describe('prototypeLinks', () => {
  it('builds an absolute URL a phone can actually reach', async () => {
    const links = await prototypeLinks('tok-1', setOf(10), 'https://enterprise.colaberry.ai');

    // A relative path or an internal hostname produces a QR that resolves to nothing on a
    // device that has never talked to this server.
    expect(links[0].url).toBe('https://enterprise.colaberry.ai/api/flotation/app/tok-1/command_center');
  });

  it('tolerates a trailing slash on the base url', async () => {
    const links = await prototypeLinks('tok-1', setOf(10), 'https://enterprise.colaberry.ai/');
    expect(links[0].url).not.toContain('//api');
  });

  it('mints a scannable SVG per concept', async () => {
    const links = await prototypeLinks('tok-1', setOf(10), 'https://enterprise.colaberry.ai');

    links.forEach((l) => {
      expect(l.qr_svg).toContain('<svg');
      // SVG rather than a PNG data URI so it stays crisp when somebody leans in with a phone.
      expect(l.qr_svg).not.toContain('data:image/png');
    });
  });

  it('carries the recommendation through, so the page can lead with one', async () => {
    const links = await prototypeLinks('tok-1', setOf(10), 'https://x.test');
    expect(links.filter((l) => l.recommended).map((l) => l.key)).toEqual(['command_center']);
  });

  it('escapes a token rather than pasting it into a URL raw', async () => {
    const links = await prototypeLinks('a b/c', setOf(10), 'https://x.test');
    expect(links[0].url).toContain('a%20b%2Fc');
  });
});

describe('prototypeHtml', () => {
  it('returns the concept when it is live', async () => {
    mockFindByPk.mockResolvedValue(record({ scope: { prototypes: setOf(10) } }));

    const result = await prototypeHtml('rec-1', 'operational');
    expect(result).toMatchObject({ ok: true, title: 'operational' });
  });

  it('reports expiry distinctly, so a stale link can explain itself', async () => {
    mockFindByPk.mockResolvedValue(record({ scope: { prototypes: setOf(-1) } }));

    expect(await prototypeHtml('rec-1', 'operational')).toEqual({ ok: false, reason: 'expired' });
  });

  it('is not found for a key that was never generated', async () => {
    mockFindByPk.mockResolvedValue(record({ scope: { prototypes: setOf(10) } }));

    expect(await prototypeHtml('rec-1', 'nope')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('is not found when nothing has been generated at all', async () => {
    mockFindByPk.mockResolvedValue(record({ scope: {} }));
    expect(await prototypeHtml('rec-1', 'operational')).toEqual({ ok: false, reason: 'not_found' });
  });
});
