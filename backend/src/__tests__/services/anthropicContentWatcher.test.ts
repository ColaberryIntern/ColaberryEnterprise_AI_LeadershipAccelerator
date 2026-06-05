import { runContentWatcher } from '../../services/anthropicContentWatcher';
import AnthropicContentRegistry from '../../models/AnthropicContentRegistry';

// Mock the model so no DB is needed
jest.mock('../../models/AnthropicContentRegistry');

const MockRegistry = AnthropicContentRegistry as jest.Mocked<typeof AnthropicContentRegistry>;

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function makeRow(overrides: Partial<{
  url: string;
  content_hash: string | null;
  etag: string | null;
  last_modified: Date | null;
}> = {}): any {
  const update = jest.fn().mockResolvedValue(undefined);
  return {
    url: overrides.url ?? 'https://docs.anthropic.com',
    content_hash: overrides.content_hash ?? null,
    etag: overrides.etag ?? null,
    last_modified: overrides.last_modified ?? null,
    update,
  };
}

function makeResponse(opts: {
  ok?: boolean;
  status?: number;
  body?: string;
  headers?: Record<string, string | null>;
}): any {
  const { ok = true, status = 200, body = '<html>content</html>', headers = {} } = opts;
  return {
    ok,
    status,
    text: jest.fn().mockResolvedValue(body),
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runContentWatcher — happy paths', () => {
  it('detects change via Last-Modified header when value differs', async () => {
    const row = makeRow({ last_modified: new Date('2025-01-01T00:00:00Z') });
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);
    mockFetch.mockResolvedValue(
      makeResponse({ headers: { 'last-modified': 'Thu, 05 Jun 2026 10:00:00 GMT' } }),
    );

    const result = await runContentWatcher();

    expect(result.checked).toBe(1);
    expect(result.changed).toBe(1);
    expect(result.errors).toBe(0);
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ change_detected: true, change_summary: expect.objectContaining({ detection_method: 'last_modified_header' }) }),
    );
  });

  it('detects change via ETag when Last-Modified absent and ETag differs', async () => {
    const row = makeRow({ etag: '"old-etag"' });
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);
    mockFetch.mockResolvedValue(
      makeResponse({ headers: { etag: '"new-etag"' } }),
    );

    const result = await runContentWatcher();

    expect(result.changed).toBe(1);
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ etag: '"new-etag"', change_detected: true, change_summary: expect.objectContaining({ detection_method: 'etag' }) }),
    );
  });

  it('detects change via content hash when no headers available', async () => {
    const row = makeRow({ content_hash: 'aaa111' });
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);
    // Body differs from stored hash
    mockFetch.mockResolvedValue(makeResponse({ body: '<html>new content</html>' }));

    const result = await runContentWatcher();

    expect(result.changed).toBe(1);
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ change_detected: true, change_summary: expect.objectContaining({ detection_method: 'content_hash' }) }),
    );
  });

  it('reports unchanged when Last-Modified matches stored value', async () => {
    const storedDate = new Date('2026-01-01T00:00:00Z');
    const row = makeRow({ last_modified: storedDate });
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);
    mockFetch.mockResolvedValue(
      makeResponse({ headers: { 'last-modified': storedDate.toUTCString() } }),
    );

    const result = await runContentWatcher();

    expect(result.changed).toBe(0);
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ last_checked: expect.any(Date) }));
    expect(row.update).toHaveBeenCalledWith(expect.not.objectContaining({ change_detected: true }));
  });
});

describe('runContentWatcher — failure paths', () => {
  it('records error and continues when fetch returns 5xx', async () => {
    const row = makeRow();
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);
    mockFetch.mockResolvedValue(makeResponse({ ok: false, status: 500, body: 'Internal Server Error' }));

    const result = await runContentWatcher();

    expect(result.errors).toBe(1);
    expect(result.changed).toBe(0);
    // last_checked still updated despite error
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ last_checked: expect.any(Date) }));
  });

  it('records TimeoutError and continues when fetch times out', async () => {
    const row = makeRow();
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    mockFetch.mockRejectedValue(abortErr);

    const result = await runContentWatcher();

    expect(result.errors).toBe(1);
    expect(result.results[0].error_class).toBe('TimeoutError');
    // No DB update on a network-level failure (row never reached)
    expect(row.update).not.toHaveBeenCalled();
  });

  it('records NetworkError and continues when fetch throws a generic error', async () => {
    const row = makeRow();
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await runContentWatcher();

    expect(result.errors).toBe(1);
    expect(result.results[0].error_class).toBe('NetworkError');
  });

  it('processes remaining rows after one row errors', async () => {
    const failRow = makeRow({ url: 'https://fail.example.com' });
    const okRow = makeRow({ url: 'https://docs.anthropic.com', content_hash: null });
    MockRegistry.findAll = jest.fn().mockResolvedValue([failRow, okRow]);

    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(makeResponse({ body: '<html>content</html>' }));

    const result = await runContentWatcher();

    expect(result.checked).toBe(2);
    expect(result.errors).toBe(1);
    // Second row was still processed
    expect(okRow.update).toHaveBeenCalled();
  });
});

describe('runContentWatcher — boundary cases', () => {
  it('returns zeroes immediately when registry is empty', async () => {
    MockRegistry.findAll = jest.fn().mockResolvedValue([]);

    const result = await runContentWatcher();

    expect(result.checked).toBe(0);
    expect(result.changed).toBe(0);
    expect(result.errors).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('runContentWatcher — idempotency', () => {
  it('running twice on unchanged URL produces the same end state (no duplicate change flags)', async () => {
    const body = '<html>stable content</html>';
    // First run: no stored hash yet
    const row = makeRow({ content_hash: null });
    MockRegistry.findAll = jest.fn().mockResolvedValue([row]);
    mockFetch.mockResolvedValue(makeResponse({ body }));

    const first = await runContentWatcher();
    // First run: hash was null, body is new → counts as changed (first-time baseline)
    expect(first.changed).toBe(1);

    // Simulate the row now having the hash stored after first run
    const updateCall = row.update.mock.calls[0][0] as any;
    row.content_hash = updateCall.content_hash;
    row.update.mockClear();
    mockFetch.mockResolvedValue(makeResponse({ body }));

    const second = await runContentWatcher();
    // Second run: hash matches → no change
    expect(second.changed).toBe(0);
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ last_checked: expect.any(Date) }));
    expect(row.update).not.toHaveBeenCalledWith(expect.objectContaining({ change_detected: true }));
  });
});
