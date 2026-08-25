/**
 * T023 area 1 — the GitHub token must not reach a log, a thrown error, or any
 * value a caller can serialise.
 *
 * WHY IT LIVES HERE AND NOT IN `services/caseStudy/__tests__/`. T023's plan entry
 * names that directory, but a concurrent task owns it for the duration of this
 * run. The suite is about a boundary (what leaves the process), so it sits with
 * the other boundary suites; nothing about it depends on the directory.
 *
 * HOW IT PROVES ANYTHING. It does not read the code and agree with the comments.
 * It sets `GITHUB_TOKEN` to a sentinel string that appears nowhere else in the
 * repository, drives the real analyzer through its success, 401, timeout,
 * network-error and malformed-body branches with an injected `fetchImpl`, and
 * captures every byte written to console.log / console.warn / console.error.
 * Then it greps the capture. A test that only asserts on a curated log line
 * would pass while a token leaked through a line nobody thought to look at.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. It does not assert the logs are free of
 * repository identity. They are not — see V-04 in the run's verification log,
 * and `securityAndPrivacyProof` in the T023 directory. The private-repo naming
 * that the shared SBP client does is MEASURED here and printed, so the proof
 * document quotes a real line rather than a remembered one.
 */
import { analyzeRepository } from '../../services/caseStudy/caseStudyRepoAnalyzer';
import { repoLogIdentity, opaqueRepoRef } from '../../services/caseStudy/caseStudyRepoReader';

/** Long, unique, and not a substring of anything else in the tree. */
const TOKEN = 'ghp_T023SENTINELtokenDoNotLogZZ9q7x';
/** A body GitHub itself could return. If an error body is echoed, this shows up. */
const UPSTREAM_BODY_SENTINEL = 'T023SENTINELupstreamBodyPayload';

const PRIVATE_OWNER = 't023privateowner';
const PRIVATE_REPO = 't023privaterepo';

interface Capture {
  readonly lines: string[];
  readonly text: string;
}

/** Run `fn` with console fully captured and `GITHUB_TOKEN` set to the sentinel. */
async function capturing<T>(fn: () => Promise<T>): Promise<{ result: T | null; error: unknown; capture: Capture }> {
  const lines: string[] = [];
  const sinks = ['log', 'warn', 'error', 'info', 'debug'] as const;
  const originals = sinks.map((s) => console[s]);
  for (const s of sinks) {
    // Capture the ARGUMENTS, stringified the way a transport would, so an object
    // logged without JSON.stringify is still searchable.
    (console as unknown as Record<string, unknown>)[s] = (...args: unknown[]): void => {
      lines.push(args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' '));
    };
  }
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = TOKEN;
  let result: T | null = null;
  let error: unknown = null;
  try {
    result = await fn();
  } catch (err) {
    error = err;
  } finally {
    sinks.forEach((s, i) => { (console as unknown as Record<string, unknown>)[s] = originals[i]; });
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  }
  return { result, error, capture: { lines, text: lines.join('\n') } };
}

/** Serialise anything, including an Error's non-enumerable fields and cycles. */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v instanceof Error) {
      const out: Record<string, unknown> = {
        name: v.name, message: v.message, stack: v.stack,
      };
      for (const key of Object.getOwnPropertyNames(v)) {
        out[key] = walk((v as unknown as Record<string, unknown>)[key]);
      }
      return out;
    }
    if (v && typeof v === 'object') {
      if (seen.has(v as object)) return '[cycle]';
      seen.add(v as object);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
      return out;
    }
    if (typeof v === 'function') return `[function ${(v as { name?: string }).name ?? ''}]`;
    return v;
  };
  try {
    return JSON.stringify(walk(value));
  } catch {
    return String(value);
  }
}

/* --------------------------------------------------------------- fixtures --- */

const repoBody = (visibility: 'public' | 'private'): string => JSON.stringify({
  owner: { login: PRIVATE_OWNER },
  name: PRIVATE_REPO,
  full_name: `${PRIVATE_OWNER}/${PRIVATE_REPO}`,
  html_url: `https://github.com/${PRIVATE_OWNER}/${PRIVATE_REPO}`,
  private: visibility === 'private',
  visibility,
  default_branch: 'main',
  permissions: { push: false },
  archived: false,
  fork: false,
});

const ok = (body: string): Response => new Response(body, {
  status: 200, headers: { 'content-type': 'application/json' },
});

/** A fetch that answers metadata then whatever the caller wants next. */
function scriptedFetch(after: (url: string) => Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (/\/repos\/[^/]+\/[^/]+$/.test(url)) return ok(repoBody('private'));
    return after(url);
  }) as typeof fetch;
}

/* ------------------------------------------------------------------ tests --- */

describe('T023 area 1 — the GitHub token never leaves the process', () => {
  const measured: string[] = [];

  afterAll(() => {
    // Printed so the proof document can quote a real captured line.
    // eslint-disable-next-line no-console
    console.log(['', '=== T023 area 1 measurements ===', ...measured, ''].join('\n'));
  });

  it('the sentinel is not a substring of anything the analyzer logs on the SUCCESS path', async () => {
    const { capture, error } = await capturing(() => analyzeRepository({
      owner: PRIVATE_OWNER,
      repo: PRIVATE_REPO,
      correlationId: 'T023-A1-success',
      fetchImpl: scriptedFetch(async (url) => {
        if (url.includes('/commits')) return ok(JSON.stringify([{ sha: 'a'.repeat(40), commit: { author: { date: '2026-01-01T00:00:00Z' } } }]));
        if (url.includes('/languages')) return ok(JSON.stringify({ TypeScript: 100 }));
        if (url.includes('/git/trees')) return ok(JSON.stringify({ sha: 'b'.repeat(40), truncated: false, tree: [] }));
        return ok('{}');
      }),
    }));
    expect(error).toBeNull();
    expect(capture.lines.length).toBeGreaterThan(0); // the capture actually captured
    expect(capture.text).not.toContain(TOKEN);
    expect(capture.text.toLowerCase()).not.toContain('authorization');
    expect(capture.text.toLowerCase()).not.toContain('bearer ');
    measured.push(`success path: ${capture.lines.length} log line(s), token present = ${capture.text.includes(TOKEN)}`);
  });

  it('a 401 whose BODY carries a sentinel neither logs the body nor returns it', async () => {
    const { capture, result } = await capturing(() => analyzeRepository({
      owner: PRIVATE_OWNER,
      repo: PRIVATE_REPO,
      correlationId: 'T023-A1-401',
      fetchImpl: (async () => new Response(
        JSON.stringify({ message: `Bad credentials ${UPSTREAM_BODY_SENTINEL}`, token: TOKEN }),
        { status: 401 },
      )) as typeof fetch,
    }));
    expect(capture.text).not.toContain(TOKEN);
    expect(capture.text).not.toContain(UPSTREAM_BODY_SENTINEL);
    // …and the value handed back to the caller carries neither.
    expect(safeStringify(result)).not.toContain(TOKEN);
    expect(safeStringify(result)).not.toContain(UPSTREAM_BODY_SENTINEL);
    measured.push(`401 path: upstream body echoed = ${capture.text.includes(UPSTREAM_BODY_SENTINEL)}`);
  });

  it('a fetch implementation that leaks the request config in its ERROR does not carry it into a log', async () => {
    // The realistic shape of this defect: an HTTP client (axios does this) that
    // attaches the outgoing request — headers included — to the thrown error.
    const { capture, result } = await capturing(() => analyzeRepository({
      owner: PRIVATE_OWNER,
      repo: PRIVATE_REPO,
      correlationId: 'T023-A1-leaky-error',
      fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const err = new Error('socket hang up') as Error & { config?: unknown };
        err.config = { headers: init?.headers };
        throw err;
      }) as typeof fetch,
    }));
    expect(capture.text).not.toContain(TOKEN);
    expect(safeStringify(result)).not.toContain(TOKEN);
    measured.push(`leaky-error path: token in ${capture.lines.length} captured line(s) = ${capture.text.includes(TOKEN)}`);
  });

  it('an aborted request (timeout branch) logs no token', async () => {
    const { capture } = await capturing(() => analyzeRepository({
      owner: PRIVATE_OWNER,
      repo: PRIVATE_REPO,
      correlationId: 'T023-A1-timeout',
      fetchImpl: (async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }) as typeof fetch,
    }));
    expect(capture.text).not.toContain(TOKEN);
    measured.push(`timeout path lines:\n${capture.lines.map((l) => `      ${l}`).join('\n')}`);
  });

  it('a malformed (non-JSON) upstream body is not echoed anywhere', async () => {
    const { capture, result } = await capturing(() => analyzeRepository({
      owner: PRIVATE_OWNER,
      repo: PRIVATE_REPO,
      correlationId: 'T023-A1-malformed',
      fetchImpl: (async () => ok(`<html>${UPSTREAM_BODY_SENTINEL}</html>`)) as typeof fetch,
    }));
    expect(capture.text).not.toContain(UPSTREAM_BODY_SENTINEL);
    expect(safeStringify(result)).not.toContain(UPSTREAM_BODY_SENTINEL);
    expect(capture.text).not.toContain(TOKEN);
  });

  it('the capture harness can actually see a leak (negative control)', async () => {
    // If this fails, every assertion above is vacuous.
    const { capture } = await capturing(async () => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ context: { authorization: `Bearer ${TOKEN}` } }));
      return null;
    });
    expect(capture.text).toContain(TOKEN);
  });
});

describe('T023 area 1 — repository identity in the ANALYZER\'s own log lines', () => {
  it('a private repository is named by its opaque handle, never its owner/name', () => {
    expect(repoLogIdentity(PRIVATE_OWNER, PRIVATE_REPO, 'private'))
      .toEqual({ repo_ref: opaqueRepoRef(PRIVATE_OWNER, PRIVATE_REPO) });
    // Fails closed: unknown visibility is treated as private, not as public.
    expect(repoLogIdentity(PRIVATE_OWNER, PRIVATE_REPO, 'unknown'))
      .toEqual({ repo_ref: opaqueRepoRef(PRIVATE_OWNER, PRIVATE_REPO) });
    expect(repoLogIdentity(PRIVATE_OWNER, PRIVATE_REPO, undefined))
      .toEqual({ repo_ref: opaqueRepoRef(PRIVATE_OWNER, PRIVATE_REPO) });
    // A public repository IS named — the gate keys on visibility, it is not a
    // blanket erasure that would pass this test for the wrong reason.
    expect(repoLogIdentity(PRIVATE_OWNER, PRIVATE_REPO, 'public'))
      .toEqual({ owner: PRIVATE_OWNER, repo: PRIVATE_REPO });
  });

  it('the opaque handle is stable and does not reverse to the name', () => {
    const a = opaqueRepoRef(PRIVATE_OWNER, PRIVATE_REPO);
    const b = opaqueRepoRef(PRIVATE_OWNER.toUpperCase(), PRIVATE_REPO.toUpperCase());
    expect(a).toBe(b);
    expect(a).not.toContain(PRIVATE_OWNER);
    expect(a).not.toContain(PRIVATE_REPO);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  /**
   * V-04, held open and disclosed rather than asserted away.
   *
   * The shared SBP client names the repository in its own `path` field. This
   * test MEASURES that and prints the line; it does not assert the leak is
   * present (which would block the fix) nor that it is absent (which would be
   * false). If someone closes V-04, this test still passes and the printed
   * measurement changes — which is the signal to update the proof document.
   */
  it('MEASUREMENT ONLY — what the shared SBP client writes on its timeout branch', async () => {
    const { capture } = await capturing(() => analyzeRepository({
      owner: PRIVATE_OWNER,
      repo: PRIVATE_REPO,
      correlationId: 'T023-V04',
      fetchImpl: (async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }) as typeof fetch,
    }));
    const namesRepo = capture.lines.filter((l) => l.includes(PRIVATE_REPO) || l.includes(PRIVATE_OWNER));
    // eslint-disable-next-line no-console
    console.log([
      '',
      '=== T023 V-04 measurement: lines naming a PRIVATE repository ===',
      `count: ${namesRepo.length} of ${capture.lines.length}`,
      ...namesRepo.map((l) => `  ${l}`),
      '=== end V-04 measurement ===',
      '',
    ].join('\n'));
    expect(capture.text).not.toContain(TOKEN); // the part that IS a hard rule
  });

  /**
   * V-04's SCOPE, measured rather than inherited.
   *
   * The run's note describes the shared client as logging "the full API path"
   * on three branches. On the file-read branch it is wider than that: `owner`
   * and `repo` are logged as first-class context fields, and the Case Study
   * analyzer DOES reach that branch — `caseStudyRepoReader.ts:441` calls
   * `fetchRepoFile` for every selected document.
   */
  it('MEASUREMENT ONLY — the file-read failure branch, which the analyzer reaches', async () => {
    const { fetchRepoFile } = await import('../../services/sbp/repoConnect/githubRepoClient');
    const { capture } = await capturing(async () => {
      try {
        await fetchRepoFile(PRIVATE_OWNER, PRIVATE_REPO, 'README.md', {
          correlationId: 'T023-V04-fileread',
          fetchImpl: (async () => new Response('{"message":"Bad credentials"}', { status: 401 })) as typeof fetch,
        });
      } catch { /* the classified error is expected; the LOG is what is measured */ }
      return null;
    });
    // eslint-disable-next-line no-console
    console.log([
      '',
      '=== T023 V-04 measurement: fetchRepoFile failure branch ===',
      ...capture.lines.map((l) => `  ${l}`),
      `owner logged as a field: ${capture.text.includes(`"owner":"${PRIVATE_OWNER}"`)}`,
      `repo  logged as a field: ${capture.text.includes(`"repo":"${PRIVATE_REPO}"`)}`,
      '=== end V-04 file-read measurement ===',
      '',
    ].join('\n'));
    expect(capture.text).not.toContain(TOKEN);
  });
});
