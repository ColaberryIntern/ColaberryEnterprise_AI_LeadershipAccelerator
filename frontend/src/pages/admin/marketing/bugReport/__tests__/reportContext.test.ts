/**
 * THE EVIDENCE A BUG REPORT CARRIES, AND WHAT USED TO EVICT IT.
 *
 * 2026-11-11. Sohail filed three reports from the Marketing composer and all three
 * arrived with `failed_requests` at the cap of 15 — every entry the same line,
 * `GET /api/admin/system/safe-mode -> 403`. A banner mounted across the whole admin
 * shell was asking for that endpoint every thirty seconds and being refused, because
 * it is section-gated and he is a section-scoped admin. nginx counted 46 in one
 * 23-minute session.
 *
 * The cap did its job and the ring buffer did its job, and between them they threw away
 * the only thing the report was for. A reporter cannot be expected to notice that, so
 * the recorder has to not do it: identical failures now collapse into one entry carrying
 * how many times it happened.
 *
 * The centrepiece below is `replays Sohail's session` — his real data, asserting the
 * errors he was reporting survive. The rest guards the properties that make that safe.
 */
import { installRecorders, collectContext, __resetForTests } from '../reportContext';

const realFetch = window.fetch;
let underlying: jest.Mock;

/** A response good enough for the recorder, which only reads `ok` and `status`. */
const response = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

beforeEach(() => {
  __resetForTests();
  underlying = jest.fn().mockResolvedValue(response(200));
  window.fetch = underlying as unknown as typeof window.fetch;
  installRecorders();
});

afterEach(() => {
  window.fetch = realFetch;
  __resetForTests();
});

const failed = () => collectContext(null).failedRequests;

describe("replays Sohail's session", () => {
  it('keeps the errors he was reporting, instead of 15 copies of a banner poll', async () => {
    underlying.mockResolvedValueOnce(response(500));  // the generate call that broke
    await window.fetch('/api/admin/content/4a1eed1d/variants/generate', { method: 'POST' });

    underlying.mockResolvedValueOnce(response(409));  // and the links conflict
    await window.fetch('/api/admin/content/4a1eed1d/links', { method: 'POST' });

    // Then the banner grinds away for 23 minutes.
    underlying.mockResolvedValue(response(403));
    for (let i = 0; i < 46; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sequential on purpose, as it happened
      await window.fetch('/api/admin/system/safe-mode');
    }

    const urls = failed().map((r) => r.url);
    // The whole point. Under the old ring buffer both of these were gone.
    expect(urls).toContain('/api/admin/content/4a1eed1d/variants/generate');
    expect(urls).toContain('/api/admin/content/4a1eed1d/links');
  });

  it('reports the noise once, and says it happened 46 times', async () => {
    underlying.mockResolvedValue(response(403));
    for (let i = 0; i < 46; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await window.fetch('/api/admin/system/safe-mode');
    }

    const entries = failed().filter((r) => r.url === '/api/admin/system/safe-mode');
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBe(46);
  });

  it('does not silently swallow the noise either', async () => {
    // Collapsing it to nothing would hide the banner defect, which is the thing that
    // needed finding. One entry with a count is more information, not less.
    underlying.mockResolvedValue(response(403));
    await window.fetch('/api/admin/system/safe-mode');
    await window.fetch('/api/admin/system/safe-mode');
    expect(failed()).toHaveLength(1);
    expect(failed()[0].status).toBe(403);
  });
});

describe('what counts as the same failure', () => {
  it('a repeat of the same call at the same status', async () => {
    underlying.mockResolvedValue(response(500));
    await window.fetch('/api/x', { method: 'POST' });
    await window.fetch('/api/x', { method: 'POST' });
    expect(failed()).toHaveLength(1);
    expect(failed()[0].count).toBe(2);
  });

  it('but NOT the same URL failing differently - 403 then 500 is two facts', async () => {
    underlying.mockResolvedValueOnce(response(403));
    await window.fetch('/api/x');
    underlying.mockResolvedValueOnce(response(500));
    await window.fetch('/api/x');
    expect(failed()).toHaveLength(2);
  });

  it('and NOT a different method on the same path', async () => {
    underlying.mockResolvedValue(response(405));
    await window.fetch('/api/x', { method: 'GET' });
    await window.fetch('/api/x', { method: 'POST' });
    expect(failed()).toHaveLength(2);
  });

  it('counts a network failure the same way', async () => {
    underlying.mockRejectedValue(new Error('offline'));
    await expect(window.fetch('/api/y')).rejects.toThrow('offline');
    await expect(window.fetch('/api/y')).rejects.toThrow('offline');
    const entries = failed().filter((r) => r.status === 'network-failure');
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBe(2);
  });
});

describe('the properties that keep this safe', () => {
  it('still caps DISTINCT failures, so dedup is not a licence to grow', async () => {
    underlying.mockResolvedValue(response(500));
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await window.fetch(`/api/thing/${i}`);
    }
    expect(failed()).toHaveLength(15);
  });

  it('and keeps the newest of them, dropping the oldest', async () => {
    underlying.mockResolvedValue(response(500));
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await window.fetch(`/api/thing/${i}`);
    }
    const urls = failed().map((r) => r.url);
    expect(urls).toContain('/api/thing/39');
    expect(urls).not.toContain('/api/thing/0');
  });

  it('CONTROL: a successful request is still never recorded', async () => {
    // Without this the assertions above could pass by recording everything, which would
    // flood the report from the other direction.
    underlying.mockResolvedValue(response(200));
    await window.fetch('/api/fine');
    expect(failed()).toHaveLength(0);
  });

  it('CONTROL: the recorder is actually installed, so none of this is vacuous', async () => {
    underlying.mockResolvedValue(response(503));
    await window.fetch('/api/broken');
    expect(failed()).toHaveLength(1);
  });

  it('still calls through to the real fetch and returns its response', async () => {
    // A recorder that broke the app's networking would be a far worse defect than the
    // one it was written for.
    underlying.mockResolvedValue(response(418));
    const res = await window.fetch('/api/teapot');
    expect(res.status).toBe(418);
    expect(underlying).toHaveBeenCalled();
  });

  it('redacts a token in the URL before it ever reaches the report', async () => {
    underlying.mockResolvedValue(response(500));
    await window.fetch('/api/thing?token=supersecret&page=2');
    const url = failed()[0].url;
    // The marker arrives PERCENT-ENCODED - URLSearchParams serialises it as
    // token=%5Bredacted%5D - so the raw string is decoded before looking for it. The
    // security property is the second assertion; the first only documents the shape.
    expect(decodeURIComponent(url)).toContain('[redacted]');
    expect(url).not.toContain('supersecret');
    expect(decodeURIComponent(url)).not.toContain('supersecret');
    // The rest of the query survives: redaction is targeted, not a blunt truncation
    // that would throw away the context the report is for.
    expect(url).toContain('page=2');
  });
});
