/**
 * Unit tests for the GENERIC intelligence engine's pure surface — no DB, no LLM,
 * no network. Covers:
 *   - the source registry (register/get/list, validation, last-write-wins, clear)
 *   - resolveMaterialization: the cost gate + per-run card cap, incl. fail-safe
 *     fallbacks for absent / empty / non-numeric / negative env values
 *   - fetchWithTimeout: first-try success, retry-then-success, cap-then-throw,
 *     non-2xx-is-retryable (the failure-first HTTP contract)
 *
 * The DB/LLM engine functions (ingest/materialize/run/boot) are intentionally NOT
 * exercised here — they require a database and are validated by integration tests.
 */
import {
  registerIntelSource,
  getIntelSource,
  listIntelSources,
  clearIntelSources,
  resolveMaterialization,
  DEFAULT_CATCHUP_STALE_HOURS,
  IntelSourceConfig,
  NormalizedIntelItem,
} from '../intelRegistry';
import { fetchWithTimeout } from '../intelHttp';

const stubSource = (slug: string, over: Partial<IntelSourceConfig> = {}): IntelSourceConfig => ({
  slug,
  label: `Label ${slug}`,
  enableEnv: `${slug.toUpperCase()}_ENABLED`,
  maxPerRunEnv: `${slug.toUpperCase()}_MAX_PER_RUN`,
  collect: async (): Promise<NormalizedIntelItem[]> => [],
  ...over,
});

describe('intel source registry', () => {
  beforeEach(() => clearIntelSources());

  it('registers and retrieves a source by slug', () => {
    const cfg = stubSource('papers');
    registerIntelSource(cfg);
    expect(getIntelSource('papers')).toBe(cfg);
  });

  it('lists all registered sources', () => {
    registerIntelSource(stubSource('a'));
    registerIntelSource(stubSource('b'));
    expect(listIntelSources().map((s) => s.slug).sort()).toEqual(['a', 'b']);
  });

  it('returns undefined for an unknown slug', () => {
    expect(getIntelSource('nope')).toBeUndefined();
  });

  it('is last-write-wins for a repeated slug (idempotent re-register)', () => {
    registerIntelSource(stubSource('dup', { label: 'first' }));
    registerIntelSource(stubSource('dup', { label: 'second' }));
    expect(listIntelSources()).toHaveLength(1);
    expect(getIntelSource('dup')?.label).toBe('second');
  });

  it('rejects a config with no slug or no collect()', () => {
    expect(() => registerIntelSource({ ...stubSource('x'), slug: '' })).toThrow(/slug/);
    // collect deliberately wrong-typed to prove the guard fires
    expect(() => registerIntelSource({ ...stubSource('y'), collect: undefined as any })).toThrow(/collect/);
  });
});

describe('resolveMaterialization (cost gate + per-run cap)', () => {
  const cfg = { enableEnv: 'X_ENABLED', maxPerRunEnv: 'X_MAX' };

  it('gates materialization off unless the enable env is exactly "true"', () => {
    expect(resolveMaterialization(cfg, {}, {}).materializeOn).toBe(false);
    expect(resolveMaterialization(cfg, {}, { X_ENABLED: 'false' }).materializeOn).toBe(false);
    expect(resolveMaterialization(cfg, {}, { X_ENABLED: '1' }).materializeOn).toBe(false);
    expect(resolveMaterialization(cfg, {}, { X_ENABLED: 'true' }).materializeOn).toBe(true);
  });

  it('force overrides the env cost gate', () => {
    expect(resolveMaterialization(cfg, { force: true }, {}).materializeOn).toBe(true);
  });

  it('defaults maxCards to the code floor of 1 when nothing is set', () => {
    expect(resolveMaterialization(cfg, {}, {}).maxCards).toBe(1);
  });

  it('reads maxCards from the env var', () => {
    expect(resolveMaterialization(cfg, {}, { X_MAX: '3' }).maxCards).toBe(3);
  });

  it('lets opts.maxCards win over the env var', () => {
    expect(resolveMaterialization(cfg, { maxCards: 5 }, { X_MAX: '3' }).maxCards).toBe(5);
  });

  it('falls back to the floor for empty / non-numeric / non-positive env values', () => {
    expect(resolveMaterialization(cfg, {}, { X_MAX: '' }).maxCards).toBe(1);
    expect(resolveMaterialization(cfg, {}, { X_MAX: 'abc' }).maxCards).toBe(1);
    expect(resolveMaterialization(cfg, {}, { X_MAX: '0' }).maxCards).toBe(1);
    expect(resolveMaterialization(cfg, {}, { X_MAX: '-4' }).maxCards).toBe(1);
  });

  it('floors a fractional cap', () => {
    expect(resolveMaterialization(cfg, { maxCards: 2.9 }, {}).maxCards).toBe(2);
  });
});

describe('DEFAULT_CATCHUP_STALE_HOURS', () => {
  it('matches the AI News Flash 20h default', () => {
    expect(DEFAULT_CATCHUP_STALE_HOURS).toBe(20);
  });
});

describe('fetchWithTimeout (failure-first HTTP)', () => {
  const okResponse = (body: string) => ({ ok: true, status: 200, text: async () => body });
  const origFetch = global.fetch;

  afterEach(() => {
    global.fetch = origFetch;
    jest.restoreAllMocks();
  });

  it('returns the body text on a first-try 2xx', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse('hello'));
    global.fetch = fetchMock as any;
    await expect(fetchWithTimeout('https://x.test', { attempts: 3 })).resolves.toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries after a transient failure then succeeds (capped)', async () => {
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(okResponse('recovered'));
    global.fetch = fetchMock as any;
    await expect(fetchWithTimeout('https://x.test', { attempts: 3 })).resolves.toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after exhausting the capped attempts', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('down'));
    global.fetch = fetchMock as any;
    await expect(fetchWithTimeout('https://x.test', { attempts: 3 })).rejects.toThrow('down');
    expect(fetchMock).toHaveBeenCalledTimes(3); // capped — never unbounded
  });

  it('treats a non-2xx status as a retryable failure', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '' });
    global.fetch = fetchMock as any;
    await expect(fetchWithTimeout('https://x.test', { attempts: 2 })).rejects.toThrow(/HTTP 503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('makes at least one attempt even if attempts is set below 1', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse('once'));
    global.fetch = fetchMock as any;
    await expect(fetchWithTimeout('https://x.test', { attempts: 0 })).resolves.toBe('once');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
