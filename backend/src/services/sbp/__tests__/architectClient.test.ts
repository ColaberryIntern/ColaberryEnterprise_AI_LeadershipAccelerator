/**
 * The Architect client — bounded, retry-correct, and impossible to hang.
 *
 * The whole point of this module is that it waits ~15 minutes on someone else's
 * server. Every test here is about a way that wait can go wrong: the job errors,
 * it stalls, it never finishes, the id collides with another student's, or the
 * document comes back below quality threshold.
 *
 * `fetch` is stubbed throughout — the live contract was verified separately
 * against advisor.colaberry.ai (422 on a short `requirements`, 404 on an unknown
 * job id), and re-verifying it here would make the suite depend on a third-party
 * host being up.
 */
import {
  startJob, getStatus, downloadDocument, awaitDocument, jobNameFor,
  depthForSize, blueprintForSize, ArchitectError,
} from '../architectClient';

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

/** Queue of canned responses, consumed in order; the last one repeats. */
function stubFetch(responses: Array<Partial<Response> & { jsonBody?: unknown; textBody?: string }>) {
  let i = 0;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  global.fetch = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return {
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      headers: new Headers((r.headers as any) ?? {}),
      json: async () => r.jsonBody ?? {},
      text: async () => r.textBody ?? JSON.stringify(r.jsonBody ?? {}),
    } as any;
  }) as any;
  return calls;
}

const STARTED = { status: 202, jsonBody: { job_id: 'launchloop', status: 'started', blueprint: 'standard' } };

describe('starting a job', () => {
  it('posts the documented payload and returns the job id', async () => {
    const calls = stubFetch([STARTED]);
    const out = await startJob({ projectName: 'LaunchLoop', requirements: 'x'.repeat(500), depthMode: 'professional' });

    expect(out.jobId).toBe('launchloop');
    expect(calls[0].url).toContain('/api/v1/generate');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ project_name: 'LaunchLoop', depth_mode: 'professional', blueprint: 'standard' });
  });

  it('refuses a requirements string the API would 422 on, without the round trip', async () => {
    const calls = stubFetch([STARTED]);
    await expect(startJob({ projectName: 'p', requirements: 'short' }))
      .rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(calls).toHaveLength(0);
  });

  it('truncates at the documented 100k ceiling rather than being rejected', async () => {
    const calls = stubFetch([STARTED]);
    await startJob({ projectName: 'p', requirements: 'y'.repeat(250_000) });
    expect(JSON.parse(calls[0].init.body as string).requirements).toHaveLength(100_000);
  });

  it('surfaces a 409 as JobConflict — another job already owns this id', async () => {
    stubFetch([{ status: 409, jsonBody: { detail: 'already running' } }]);
    await expect(startJob({ projectName: 'LaunchLoop', requirements: 'x'.repeat(50) }))
      .rejects.toMatchObject({ error_class: 'JobConflict', status: 409 });
  });

  it('NEVER retries a 4xx', async () => {
    // A 422 fails identically forever, and retrying a 409 races the job holding
    // the id. Both must cost exactly one call.
    const calls = stubFetch([{ status: 422, textBody: '{"detail":"bad"}' }]);
    await expect(startJob({ projectName: 'p', requirements: 'x'.repeat(50) })).rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(calls).toHaveLength(1);
  });

  it('retries a 5xx and succeeds', async () => {
    const calls = stubFetch([{ status: 503 }, { status: 503 }, STARTED]);
    const out = await startJob({ projectName: 'p', requirements: 'x'.repeat(50) });
    expect(out.jobId).toBe('launchloop');
    expect(calls).toHaveLength(3);
  });

  it('gives up after the capped attempts rather than retrying forever', async () => {
    const calls = stubFetch([{ status: 503 }]);
    await expect(startJob({ projectName: 'p', requirements: 'x'.repeat(50) }))
      .rejects.toMatchObject({ error_class: 'UpstreamUnavailable' });
    expect(calls).toHaveLength(3);
  });

  it('fails cleanly when the API accepts but returns no job id', async () => {
    stubFetch([{ status: 202, jsonBody: { status: 'started' } }]);
    await expect(startJob({ projectName: 'p', requirements: 'x'.repeat(50) }))
      .rejects.toMatchObject({ error_class: 'UpstreamUnavailable' });
  });
});

describe('job ids cannot collide between students', () => {
  it('appends the project uuid, because two students WILL name a project the same thing', async () => {
    const a = jobNameFor('Inventory Tracker', '3747aaca-a76e-4b00-a51b-1b6c3679da9a');
    const b = jobNameFor('Inventory Tracker', 'f82efade-6533-46ea-8901-e6a9406127ee');
    expect(a).not.toBe(b);
    expect(a).toContain('Inventory Tracker');
  });

  it('survives an empty or punctuation-only project name', () => {
    expect(jobNameFor('', 'f82efade-6533-46ea-8901-e6a9406127ee')).toMatch(/AI System/);
    expect(jobNameFor('!!! ???', 'f82efade-6533-46ea-8901-e6a9406127ee')).toMatch(/AI System/);
  });
});

describe('tier mapping', () => {
  it.each([
    ['workflow', 'standard', 'standard'],
    ['project', 'professional', 'standard'],
    ['autonomous', 'enterprise', 'autonomous'],
    [undefined, 'professional', 'standard'],
    ['nonsense', 'professional', 'standard'],
  ])('size %s → depth %s / blueprint %s', (size, depth, blueprint) => {
    expect(depthForSize(size as any)).toBe(depth);
    expect(blueprintForSize(size as any)).toBe(blueprint);
  });
});

describe('downloading', () => {
  it('treats 409 as "not ready" rather than an error', async () => {
    stubFetch([{ status: 409 }]);
    expect(await downloadDocument('job')).toBeNull();
  });

  it('takes a below-threshold document and records the warning', async () => {
    // Serving beats refusing: a slightly-low 6,000-word document still beats the
    // 1,450-word single-call alternative, and the traceability gate is the real
    // quality bar for what a student sees.
    stubFetch([{
      status: 200,
      textBody: 'word '.repeat(6000),
      headers: { 'X-Quality-Warning': 'below threshold', 'X-Quality-Score': '0.61', 'X-Quality-Threshold': '0.70' },
    }]);
    const doc = await downloadDocument('job');
    expect(doc!.words).toBe(6000);
    expect(doc!.qualityWarning).toEqual({ score: '0.61', threshold: '0.70' });
  });

  it('rejects an empty document rather than passing it downstream', async () => {
    stubFetch([{ status: 200, textBody: '   \n  ' }]);
    await expect(downloadDocument('job')).rejects.toMatchObject({ error_class: 'EmptyDocument' });
  });
});

describe('status', () => {
  it('maps a 404 to GenerationFailed — the Architect has forgotten the job', async () => {
    stubFetch([{ status: 404, jsonBody: { detail: 'no pipeline' } }]);
    await expect(getStatus('gone')).rejects.toMatchObject({ error_class: 'GenerationFailed', status: 404 });
  });
});

describe('awaiting a job — every path terminates', () => {
  const fast = { intervalMs: 0, deadlineMs: 60_000 };

  it('returns the document once the job completes', async () => {
    stubFetch([
      { status: 200, jsonBody: { status: 'running', percent: 40 } },
      { status: 200, jsonBody: { status: 'complete', percent: 100 } },
      { status: 200, textBody: 'chapter one '.repeat(1000) },
    ]);
    const doc = await awaitDocument('job', fast);
    expect(doc.words).toBeGreaterThan(1000);
  });

  it('reports progress so the wait can be shown to the student', async () => {
    stubFetch([
      { status: 200, jsonBody: { status: 'running', percent: 25 } },
      { status: 200, jsonBody: { status: 'complete' } },
      { status: 200, textBody: 'text '.repeat(100) },
    ]);
    const seen: number[] = [];
    await awaitDocument('job', { ...fast, onProgress: (s) => { if (s.percent != null) seen.push(s.percent); } });
    expect(seen).toContain(25);
  });

  it('fails fast on error rather than polling to the deadline', async () => {
    stubFetch([{ status: 200, jsonBody: { status: 'error' } }]);
    await expect(awaitDocument('job', fast)).rejects.toMatchObject({ error_class: 'GenerationFailed' });
  });

  it('takes the document on quality_failed instead of discarding the work', async () => {
    stubFetch([
      { status: 200, jsonBody: { status: 'quality_failed' } },
      { status: 200, textBody: 'usable '.repeat(3000), headers: { 'X-Quality-Warning': 'low' } },
    ]);
    const doc = await awaitDocument('job', fast);
    expect(doc.words).toBe(3000);
  });

  it('tolerates a transient stall but not an endless one', async () => {
    // `stalled` means upstream rebuilt progress from disk after losing its
    // in-memory events — recoverable, so it is not an instant failure. It must
    // still terminate.
    stubFetch([{ status: 200, jsonBody: { status: 'stalled' } }]);
    await expect(awaitDocument('job', fast)).rejects.toMatchObject({ error_class: 'GenerationStalled' });
  });

  it('a stall that recovers does not count against the streak', async () => {
    stubFetch([
      { status: 200, jsonBody: { status: 'stalled' } },
      { status: 200, jsonBody: { status: 'running' } },
      { status: 200, jsonBody: { status: 'stalled' } },
      { status: 200, jsonBody: { status: 'complete' } },
      { status: 200, textBody: 'ok '.repeat(500) },
    ]);
    await expect(awaitDocument('job', fast)).resolves.toBeTruthy();
  });

  it('gives up at the deadline instead of waiting forever', async () => {
    let t = 0;
    stubFetch([{ status: 200, jsonBody: { status: 'running' } }]);
    await expect(awaitDocument('job', {
      intervalMs: 0, deadlineMs: 100, now: () => (t += 60),
    })).rejects.toMatchObject({ error_class: 'DeadlineExceeded' });
  });

  it('keeps polling when status says complete but the download is not served yet', async () => {
    stubFetch([
      { status: 200, jsonBody: { status: 'complete' } },
      { status: 409 },                                    // download not ready
      { status: 200, jsonBody: { status: 'complete' } },
      { status: 200, textBody: 'finally '.repeat(200) },
    ]);
    await expect(awaitDocument('job', fast)).resolves.toBeTruthy();
  });
});
