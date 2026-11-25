/**
 * platformBuildRoutes: the runner is refused without OIDC, the view is refused without a valid
 * token, and a valid view serves the build sandboxed with the shim first and live data beside it.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../config/env', () => ({
  env: { jwtSecret: 'route-test-secret', platformBuildRepo: 'o/r', platformBuildWorkflow: 'platform-build-runner.yml' },
}));
jest.mock('../../services/sbp/platformBuild/runnerIdentity', () => {
  class RunnerIdentityError extends Error { error_class = 'AuthError'; }
  return {
    RunnerIdentityError,
    verifyRunnerToken: jest.fn(async (token: string) => {
      if (token !== 'good-oidc') throw new RunnerIdentityError('bad');
      return {};
    }),
  };
});
jest.mock('../../services/sbp/platformBuild/runStore', () => ({
  getRun: jest.fn(),
  transitionRun: jest.fn(async () => true),
}));
jest.mock('../../services/sbp/platformBuild/artifactStore', () => {
  class RunNotAcceptingUpload extends Error {}
  return { RunNotAcceptingUpload, saveRunArtifacts: jest.fn(), activeArtifact: jest.fn(), activeArtifactSummary: jest.fn(async () => ({ command_center: null, demo: null })) };
});
jest.mock('../../services/sbp/platformBuild/bundle', () => ({
  runnerBundle: jest.fn(),
  liveProjectFile: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const runStore = require('../../services/sbp/platformBuild/runStore');
const artifacts = require('../../services/sbp/platformBuild/artifactStore');
const bundle = require('../../services/sbp/platformBuild/bundle');
import router from '../platformBuildRoutes';
import { mintViewToken } from '../../services/sbp/platformBuild/viewToken';

const PROJECT = '3f2b6c1e-8a1d-4c2b-9d3e-1a2b3c4d5e6f';
const RUN = '11111111-2222-4333-8444-555555555555';
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(router);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('runner routes', () => {
  it('refuse a caller without our workflow token', async () => {
    const res = await request(app).get(`/api/platform-build/runs/${RUN}/bundle`).set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
    expect(runStore.getRun).not.toHaveBeenCalled();
  });

  it('refuse a malformed run id before checking anything', async () => {
    const res = await request(app).get('/api/platform-build/runs/not-a-uuid/bundle').set('Authorization', 'Bearer good-oidc');
    expect(res.status).toBe(400);
  });

  it('serve the bundle once, and answer 409 for a run already uploaded', async () => {
    runStore.getRun.mockResolvedValue({ id: RUN, project_id: PROJECT, status: 'dispatched', correlation_id: null });
    bundle.runnerBundle.mockResolvedValue({ plan_version: 1, files: { 'a.md': 'x' }, prompts: { command_center: 'a', demo: 'b' }, done_marker: 'D' });
    const ok = await request(app).get(`/api/platform-build/runs/${RUN}/bundle`).set('Authorization', 'Bearer good-oidc');
    expect(ok.status).toBe(200);
    expect(runStore.transitionRun).toHaveBeenCalledWith(RUN, ['dispatched'], 'building');

    runStore.getRun.mockResolvedValue({ id: RUN, project_id: PROJECT, status: 'uploaded' });
    const again = await request(app).get(`/api/platform-build/runs/${RUN}/bundle`).set('Authorization', 'Bearer good-oidc');
    expect(again.status).toBe(409);
  });

  it('refuse an upload outside the contract with every problem listed', async () => {
    runStore.getRun.mockResolvedValue({ id: RUN, project_id: PROJECT, status: 'building' });
    const res = await request(app).post(`/api/platform-build/runs/${RUN}/artifacts`)
      .set('Authorization', 'Bearer good-oidc')
      .send({ files: { '../x.js': '1', 'command-center/a.svg': '2' } });
    expect(res.status).toBe(422);
    expect(res.body.problems.length).toBeGreaterThanOrEqual(3);
    expect(artifacts.saveRunArtifacts).not.toHaveBeenCalled();
  });

  it('store a valid upload', async () => {
    runStore.getRun.mockResolvedValue({ id: RUN, project_id: PROJECT, status: 'building' });
    artifacts.saveRunArtifacts.mockResolvedValue({ duplicate: false, commandCenterVersion: 1, demoVersion: null });
    const res = await request(app).post(`/api/platform-build/runs/${RUN}/artifacts`)
      .set('Authorization', 'Bearer good-oidc')
      .send({ files: { 'index.html': '<html></html>' }, cost_usd: 2 });
    expect(res.status).toBe(200);
    expect(res.body.commandCenterVersion).toBe(1);
  });

  it('record a reported failure, validating the error class', async () => {
    runStore.getRun.mockResolvedValue({ id: RUN, project_id: PROJECT, status: 'building' });
    const bad = await request(app).post(`/api/platform-build/runs/${RUN}/failure`).set('Authorization', 'Bearer good-oidc').send({ error_class: 'rm -rf' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post(`/api/platform-build/runs/${RUN}/failure`).set('Authorization', 'Bearer good-oidc').send({ error_class: 'AgentIncomplete', detail: 'x' });
    expect(ok.status).toBe(200);
    expect(runStore.transitionRun).toHaveBeenCalledWith(RUN, ['dispatched', 'building'], 'failed', expect.objectContaining({ errorClass: 'AgentIncomplete' }));
  });
});

describe('view route', () => {
  const token = () => mintViewToken(PROJECT, 'route-test-secret');

  it('answers the same 404 for a bad token and for a path it does not serve', async () => {
    const bad = await request(app).get('/api/platform-view/forged.token/');
    const odd = await request(app).get(`/api/platform-view/${token()}/docs/STORIES.md`);
    expect(bad.status).toBe(404);
    expect(odd.status).toBe(404);
    expect(bad.text).toBe(odd.text);
    expect(artifacts.activeArtifact).not.toHaveBeenCalled();
  });

  it('serves the Command Center sandboxed, with the storage shim first', async () => {
    artifacts.activeArtifact.mockResolvedValue({ version: 1, files: { 'index.html': '<html><head><script src="command-center/js/core.js"></script></head></html>' } });
    const res = await request(app).get(`/api/platform-view/${token()}/`);
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toMatch(/^sandbox allow-scripts/);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.text.indexOf('__platform/storage-shim.js')).toBeLessThan(res.text.indexOf('core.js'));
  });

  it('links the Command Center to the demo only when there is one, and survives a failed lookup', async () => {
    artifacts.activeArtifact.mockResolvedValue({ version: 1, files: { 'index.html': '<html><head></head><body></body></html>' } });
    const page = () => request(app).get(`/api/platform-view/${token()}/`);
    expect((await page()).text).not.toContain('platform-demo-link');
    artifacts.activeArtifactSummary.mockResolvedValueOnce({ command_center: null, demo: { version: 1, built_at: new Date() } });
    expect((await page()).text).toContain('href="demo/"');
    artifacts.activeArtifactSummary.mockRejectedValueOnce(new Error('db down'));
    const res = await page();
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('platform-demo-link');
  });

  it('serves .colaberry files live, readable from the sandboxed page', async () => {
    bundle.liveProjectFile.mockResolvedValue('{"plan":1}');
    const res = await request(app).get(`/api/platform-view/${token()}/.colaberry/plan.json`);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['content-type']).toMatch(/json/);
    expect(bundle.liveProjectFile).toHaveBeenCalledWith(PROJECT, '.colaberry/plan.json');
  });

  it('serves the demo engine with a nonce and the shim one level up', async () => {
    artifacts.activeArtifact.mockResolvedValue({ version: 1, files: { 'demo/demo-spec.json': '{}' } });
    const res = await request(app).get(`/api/platform-view/${token()}/demo/`);
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toMatch(/'nonce-/);
    expect(res.text).toContain('../__platform/storage-shim.js');
    const redirect = await request(app).get(`/api/platform-view/${token()}/demo`);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toMatch(/\/demo\/$/);
  });

  it('refuses an encoded path traversal', async () => {
    const res = await request(app).get(`/api/platform-view/${token()}/%2e%2e/%2e%2e/etc/passwd.js`);
    expect(res.status).toBe(404);
    expect(artifacts.activeArtifact).not.toHaveBeenCalled();
  });

  it('answers a missing data file with a 404 the sandboxed page can read', async () => {
    bundle.liveProjectFile.mockResolvedValue(null);
    const res = await request(app).get(`/api/platform-view/${token()}/.colaberry/enrichment/STORY-001.json`);
    expect(res.status).toBe(404);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('says "not ready" when nothing has been built yet', async () => {
    artifacts.activeArtifact.mockResolvedValue(null);
    const res = await request(app).get(`/api/platform-view/${token()}/`);
    expect(res.status).toBe(404);
    expect(res.text).toMatch(/not ready yet/);
  });
});
