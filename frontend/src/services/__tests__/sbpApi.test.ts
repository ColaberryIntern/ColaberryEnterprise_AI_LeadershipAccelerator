/**
 * sbpApi — the client that replaces the browser-side fake generator.
 *
 * What matters here is the failure behaviour. The layer this replaces swallowed
 * everything in a bare `catch {}`, which is how a 100%-failing import went
 * unnoticed for months. Every call must surface a typed, showable error.
 */
jest.mock('../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

import portalApi from '../../utils/portalApi';
import {
  startBuild, getBuildState, publishBuild, getStoryPrompt, pollBuild, isTerminal,
  resolveBackendProjectId,
} from '../sbpApi';

const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock };
const PROJECT = '11111111-1111-1111-1111-111111111111';

const httpError = (status: number, error?: string) =>
  Object.assign(new Error(`Request failed with status ${status}`), {
    response: { status, data: error ? { error } : {} },
  });

beforeEach(() => jest.clearAllMocks());

// ── start ───────────────────────────────────────────────────────────────────
describe('startBuild', () => {
  it('sends the wizard answers and returns the correlation id', async () => {
    api.post.mockResolvedValue({ data: { correlationId: 'corr-1', status: 'generating' } });
    const result = await startBuild({ project_id: PROJECT, idea: 'A sponsor dashboard for corporate buyers.' });
    expect(result).toEqual({ ok: true, correlationId: 'corr-1' });
    expect(api.post).toHaveBeenCalledWith('/api/portal/sbp/builds', expect.objectContaining({ project_id: PROJECT }));
  });

  it('passes every sharpening answer through — the pilot dropped these', async () => {
    api.post.mockResolvedValue({ data: { correlationId: 'c' } });
    await startBuild({
      project_id: PROJECT, idea: 'x'.repeat(40), users: 'L&D managers',
      data_sources: 'PaySimple', done_definition: 'exactly once', target_weeks: 6, size: 'project',
    });
    const body = api.post.mock.calls[0][1];
    expect(body).toMatchObject({
      users: 'L&D managers', data_sources: 'PaySimple',
      done_definition: 'exactly once', target_weeks: 6, size: 'project',
    });
  });

  it('surfaces a failure instead of swallowing it', async () => {
    api.post.mockRejectedValue(httpError(500, 'Generation service unavailable'));
    const result = await startBuild({ project_id: PROJECT, idea: 'x'.repeat(40) });
    expect(result).toEqual({ ok: false, error: { status: 500, message: 'Generation service unavailable' } });
  });

  it('explains a 404 as "not enabled" rather than "not found"', async () => {
    api.post.mockRejectedValue(httpError(404));
    const result = await startBuild({ project_id: PROJECT, idea: 'x'.repeat(40) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/not enabled/i);
  });

  it('explains a 503 as capacity, with a next step', async () => {
    api.post.mockRejectedValue(httpError(503));
    const result = await startBuild({ project_id: PROJECT, idea: 'x'.repeat(40) });
    if (!result.ok) expect(result.error.message).toMatch(/try again/i);
  });
});

// ── state ───────────────────────────────────────────────────────────────────
describe('getBuildState', () => {
  it('returns the state', async () => {
    api.get.mockResolvedValue({ data: { project_id: PROJECT, status: 'drafted', gate: { ok: true, violations: [] }, plan: null } });
    const result = await getBuildState(PROJECT);
    expect(result).toMatchObject({ ok: true, state: { status: 'drafted' } });
  });

  it('treats 404 as "no build yet", not an error', async () => {
    api.get.mockRejectedValue(httpError(404));
    expect(await getBuildState(PROJECT)).toEqual({ ok: true, state: null });
  });

  it('reports a 500 as a real error', async () => {
    api.get.mockRejectedValue(httpError(500));
    const result = await getBuildState(PROJECT);
    expect(result.ok).toBe(false);
  });
});

// ── publish ─────────────────────────────────────────────────────────────────
describe('publishBuild', () => {
  it('sends the reviewed hash so a changed plan is refused server-side', async () => {
    api.post.mockResolvedValue({ data: { commitSha: 'abc1234', filesWritten: 19, status: 'published' } });
    const result = await publishBuild(PROJECT, 'a'.repeat(64));
    expect(api.post.mock.calls[0][1]).toEqual({ expected_sha256: 'a'.repeat(64) });
    expect(result).toMatchObject({ ok: true, commitSha: 'abc1234', filesWritten: 19 });
  });

  it('omits the hash when none was supplied', async () => {
    api.post.mockResolvedValue({ data: { status: 'awaiting_repo' } });
    await publishBuild(PROJECT);
    expect(api.post.mock.calls[0][1]).toEqual({});
  });

  it('surfaces the 409 a gate-failed plan produces', async () => {
    api.post.mockRejectedValue(httpError(409, 'this plan has unresolved gate violations'));
    const result = await publishBuild(PROJECT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/gate violations/);
  });
});

// ── prompt ──────────────────────────────────────────────────────────────────
describe('getStoryPrompt', () => {
  it('returns the prompt and whether its paths were verified against the repo', async () => {
    api.get.mockResolvedValue({ data: { prompt: 'x'.repeat(2000), has_repo: true, paths_verified: true } });
    const result = await getStoryPrompt(PROJECT, 'STORY-001');
    expect(result).toMatchObject({ ok: true, hasRepo: true, pathsVerified: true });
  });

  it('passes the student\'s notes through', async () => {
    api.get.mockResolvedValue({ data: { prompt: 'p' } });
    await getStoryPrompt(PROJECT, 'STORY-001', 'use TypeScript');
    expect(api.get.mock.calls[0][1]).toEqual({ params: { notes: 'use TypeScript' } });
  });

  it('surfaces the 409 when assembly refuses to cite an unwritten path', async () => {
    api.get.mockRejectedValue(httpError(409, 'refusing to build a prompt citing docs/STORIES.md'));
    const result = await getStoryPrompt(PROJECT, 'STORY-001');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/refusing to build a prompt/);
  });
});

// ── polling ─────────────────────────────────────────────────────────────────
describe('pollBuild', () => {
  it('stops as soon as the build reaches a terminal state', async () => {
    api.get
      .mockResolvedValueOnce({ data: { project_id: PROJECT, status: 'generating' } })
      .mockResolvedValueOnce({ data: { project_id: PROJECT, status: 'drafted' } });
    const seen: string[] = [];
    const result = await pollBuild(PROJECT, { intervalMs: 1, onUpdate: (s) => seen.push(s.status) });
    expect(result.ok).toBe(true);
    expect(seen).toEqual(['generating', 'drafted']);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('treats gate_failed as terminal — the student must act, not wait', async () => {
    api.get.mockResolvedValue({ data: { project_id: PROJECT, status: 'gate_failed' } });
    const result = await pollBuild(PROJECT, { intervalMs: 1 });
    expect(result.ok).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('gives up at the deadline and says it TIMED OUT, not that it failed', async () => {
    api.get.mockResolvedValue({ data: { project_id: PROJECT, status: 'generating' } });
    const result = await pollBuild(PROJECT, { intervalMs: 1, timeoutMs: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.timedOut).toBe(true);
      expect(result.error.message).toMatch(/may still be running/);
    }
  });

  it('stops polling on a real transport error rather than spinning', async () => {
    api.get.mockRejectedValue(httpError(500));
    const result = await pollBuild(PROJECT, { intervalMs: 1 });
    expect(result.ok).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('honours an abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await pollBuild(PROJECT, { intervalMs: 1, signal: controller.signal });
    expect(result.ok).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it.each([
    ['generating', false], ['captured', false],
    ['drafted', true], ['gate_failed', true], ['published', true], ['awaiting_repo', true], ['failed', true],
  ] as const)('isTerminal(%s) === %s', (status, expected) => {
    expect(isTerminal(status)).toBe(expected);
  });
});

// ── resolving the backend project id ────────────────────────────────────────
describe('resolveBackendProjectId', () => {
  it('uses the active project when there is one', async () => {
    api.get.mockResolvedValue({ data: { id: PROJECT, lists: [] } });
    const result = await resolveBackendProjectId();
    expect(result).toEqual({ ok: true, projectId: PROJECT, created: false });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('creates one ONLY when there is no active project', async () => {
    api.get.mockResolvedValue({ data: { project: null } });
    api.post.mockResolvedValue({ data: { id: PROJECT } });
    const result = await resolveBackendProjectId();
    expect(result).toEqual({ ok: true, projectId: PROJECT, created: true });
    expect(api.post).toHaveBeenCalledWith('/api/portal/projects', {});
  });

  // createNewProjectForEnrollment ALWAYS creates, so a spurious call leaves an
  // empty project behind on every build attempt.
  it('does not create a second project when one is already active', async () => {
    api.get.mockResolvedValue({ data: { id: PROJECT } });
    await resolveBackendProjectId();
    await resolveBackendProjectId();
    expect(api.post).toHaveBeenCalledTimes(0);
  });

  it('surfaces a create failure rather than returning a bogus id', async () => {
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
    const result = await resolveBackendProjectId();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Could not create a project/);
  });

  it('reports the pipeline being disabled instead of silently creating', async () => {
    api.get.mockRejectedValue(httpError(404));
    const result = await resolveBackendProjectId();
    expect(result.ok).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });
});
