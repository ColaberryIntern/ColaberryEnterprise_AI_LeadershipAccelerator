/**
 * The loader `explorerKnowledgeSource` was written for and never had.
 *
 * Two things carry real risk here and both are driven directly rather than reasoned about.
 *
 * THE SPA FALLBACK. The hub is static files behind a single-page-app fallback, which
 * answers an unknown path with `index.html` and status **200**. So a 200 is not evidence
 * the export exists, and a loader that trusted the status code would report "invalid JSON"
 * for a deployment problem - or, if the fallback ever served something JSON-shaped, would
 * treat it as a knowledge base. There is a test for exactly that body.
 *
 * CACHING A FAILURE. The cache exists so one nightly batch performs one fetch. If a
 * failure were cached, a single transient blip would silence the knowledge base for the
 * whole TTL and every draft in that window would be ungrounded with no signal. The test
 * below fails a call and then succeeds at the SAME clock reading, which is only possible
 * if failures are not cached.
 */

jest.mock('../../../config/env', () => ({
  env: { publicAppUrl: 'https://example.test' },
}));

import {
  loadExplorerKnowledge,
  knowledgeUrl,
  KNOWLEDGE_PATH,
  KNOWLEDGE_CACHE_TTL_MS,
  KNOWLEDGE_FETCH_TIMEOUT_MS,
  __resetExplorerKnowledgeCacheForTests,
  type KnowledgeFetcher,
} from '../explorerKnowledgeLoader';
import { SUPPORTED_SCHEMA } from '../explorerKnowledgeSource';

function entryJson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sales-1',
    domain: 'sales',
    category: 'Program basics',
    category_key: 'program-basics',
    question: 'What is it?',
    answer: 'A program.',
    detail: '',
    tags: ['overview'],
    reference: 'sales/index.html#cat-program-basics',
    reference_label: 'Program basics',
    confidence: 'grounded',
    ...overrides,
  };
}

function docJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schema: SUPPORTED_SCHEMA,
    version: '1.1',
    description: 'test base',
    core_facts: 'some facts',
    generated_at: '2026-10-28T00:00:00.000Z',
    count: 1,
    entries: [entryJson()],
    ...overrides,
  });
}

/** A fetcher that answers with one fixed response and counts its calls. */
function respondWith(text: string, status = 200): { fetcher: KnowledgeFetcher; calls: () => number } {
  let n = 0;
  const fetcher: KnowledgeFetcher = async () => {
    n += 1;
    return { ok: status >= 200 && status < 300, status, text };
  };
  return { fetcher, calls: () => n };
}

/** A fetcher that throws the given error. */
function throwing(err: Error): KnowledgeFetcher {
  return async () => {
    throw err;
  };
}

beforeEach(() => {
  __resetExplorerKnowledgeCacheForTests();
});

describe('knowledgeUrl', () => {
  it('derives the export URL from the public app origin', () => {
    expect(knowledgeUrl()).toBe(`https://example.test${KNOWLEDGE_PATH}`);
  });

  it('does not double the slash when the configured origin has a trailing one', () => {
    // A trailing slash in PUBLIC_APP_URL is a plausible operator entry, and `//knowledge`
    // would be a different path to NGINX.
    jest.resetModules();
    jest.doMock('../../../config/env', () => ({ env: { publicAppUrl: 'https://example.test/' } }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const reloaded = require('../explorerKnowledgeLoader') as typeof import('../explorerKnowledgeLoader');
    expect(reloaded.knowledgeUrl()).toBe(`https://example.test${KNOWLEDGE_PATH}`);
  });
});

describe('loadExplorerKnowledge — success and caching', () => {
  it('fetches, parses, and reports that it did not come from cache', async () => {
    const { fetcher, calls } = respondWith(docJson());

    const result = await loadExplorerKnowledge({ fetcher, nowMs: 1_000 });

    expect(result.loaded).toBe(true);
    if (!result.loaded) return;
    expect(result.fromCache).toBe(false);
    expect(result.base.version).toBe('1.1');
    expect(result.base.entries).toHaveLength(1);
    expect(calls()).toBe(1);
  });

  it('reuses a recent success instead of fetching again', async () => {
    const { fetcher, calls } = respondWith(docJson());

    await loadExplorerKnowledge({ fetcher, nowMs: 1_000 });
    const second = await loadExplorerKnowledge({ fetcher, nowMs: 1_000 + KNOWLEDGE_CACHE_TTL_MS - 1 });

    expect(second.loaded).toBe(true);
    if (!second.loaded) return;
    expect(second.fromCache).toBe(true);
    // The whole point: 142 decisions in one batch cost one fetch.
    expect(calls()).toBe(1);
  });

  it('fetches again once the cache has expired', async () => {
    const { fetcher, calls } = respondWith(docJson());

    await loadExplorerKnowledge({ fetcher, nowMs: 1_000 });
    await loadExplorerKnowledge({ fetcher, nowMs: 1_000 + KNOWLEDGE_CACHE_TTL_MS });

    expect(calls()).toBe(2);
  });

  it('bypasses the cache when asked, so an operator re-run sees current copy', async () => {
    const { fetcher, calls } = respondWith(docJson());

    await loadExplorerKnowledge({ fetcher, nowMs: 1_000 });
    const forced = await loadExplorerKnowledge({ fetcher, nowMs: 1_000, bypassCache: true });

    expect(calls()).toBe(2);
    expect(forced.loaded).toBe(true);
    if (!forced.loaded) return;
    expect(forced.fromCache).toBe(false);
  });

  it('does NOT cache a failure, so one blip cannot silence the base for the whole TTL', async () => {
    const failing = respondWith('', 503);
    const good = respondWith(docJson());

    const first = await loadExplorerKnowledge({ fetcher: failing.fetcher, nowMs: 5_000 });
    expect(first.loaded).toBe(false);

    // SAME clock reading. If the failure had been cached this would return it.
    const second = await loadExplorerKnowledge({ fetcher: good.fetcher, nowMs: 5_000 });

    expect(second.loaded).toBe(true);
    expect(good.calls()).toBe(1);
  });
});

describe('loadExplorerKnowledge — a 200 is not evidence the file exists', () => {
  it('names the SPA fallback when the body is HTML with a 200', async () => {
    const { fetcher } = respondWith('<!doctype html>\n<html><body><div id="root"></div></body></html>');

    const result = await loadExplorerKnowledge({ fetcher, nowMs: 1 });

    expect(result.loaded).toBe(false);
    if (result.loaded) return;
    expect(result.reason).toBe('spa_fallback_html');
    expect(result.errorClass).toBe('ContractViolation');
    // The detail has to point at the deployment, not at the JSON parser.
    expect(result.detail).toContain('single-page-app fallback');
  });

  it('detects the fallback even with leading whitespace before the markup', async () => {
    const { fetcher } = respondWith('   \n  <html></html>');

    const result = await loadExplorerKnowledge({ fetcher, nowMs: 1 });

    expect(result.loaded).toBe(false);
    if (result.loaded) return;
    expect(result.reason).toBe('spa_fallback_html');
  });

  it('refuses valid JSON that is not a knowledge base', async () => {
    const { fetcher } = respondWith(JSON.stringify({ hello: 'world' }));

    const result = await loadExplorerKnowledge({ fetcher, nowMs: 1 });

    expect(result.loaded).toBe(false);
    if (result.loaded) return;
    expect(result.reason).toBe('contract_violation');
    expect(result.errorClass).toBe('ContractViolation');
  });

  it('refuses an export older than the minimum supported version', async () => {
    // Schema 1.1 added the raw confidence value. An older export reads as fully verified,
    // which is the precise reason the parser refuses it rather than defaulting.
    const { fetcher } = respondWith(docJson({ version: '1.0' }));

    const result = await loadExplorerKnowledge({ fetcher, nowMs: 1 });

    expect(result.loaded).toBe(false);
    if (result.loaded) return;
    expect(result.reason).toBe('contract_violation');
  });

  it('reports a body that is neither HTML nor JSON', async () => {
    const { fetcher } = respondWith('not json at all');

    const result = await loadExplorerKnowledge({ fetcher, nowMs: 1 });

    expect(result.loaded).toBe(false);
    if (result.loaded) return;
    expect(result.reason).toBe('not_json');
  });

  it('reports a non-2xx status with the status in the detail', async () => {
    const { fetcher } = respondWith('Not Found', 404);

    const result = await loadExplorerKnowledge({ fetcher, nowMs: 1 });

    expect(result.loaded).toBe(false);
    if (result.loaded) return;
    expect(result.reason).toBe('http_error');
    expect(result.detail).toContain('404');
  });
});

describe('loadExplorerKnowledge — transport failures', () => {
  it('classifies an abort as a timeout, naming the budget', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';

    const result = await loadExplorerKnowledge({ fetcher: throwing(abort), nowMs: 1 });

    expect(result.loaded).toBe(false);
    if (result.loaded) return;
    expect(result.reason).toBe('timeout');
    expect(result.errorClass).toBe('TimeoutError');
    expect(result.detail).toContain(String(KNOWLEDGE_FETCH_TIMEOUT_MS));
  });

  it('classifies anything else as upstream unavailable', async () => {
    const result = await loadExplorerKnowledge({
      fetcher: throwing(new Error('ECONNRESET')),
      nowMs: 1,
    });

    expect(result.loaded).toBe(false);
    if (result.loaded) return;
    expect(result.reason).toBe('network_error');
    expect(result.errorClass).toBe('UpstreamUnavailable');
  });

  it('never rejects, because a knowledge outage must not crash the draft batch', async () => {
    const boom: KnowledgeFetcher = () => Promise.reject(new Error('boom'));

    await expect(loadExplorerKnowledge({ fetcher: boom, nowMs: 1 })).resolves.toMatchObject({
      loaded: false,
    });
  });
});
