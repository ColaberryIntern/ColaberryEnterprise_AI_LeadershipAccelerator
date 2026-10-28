/**
 * AF2.7 item 2 — a student's project page shows no preview address unless one is configured.
 *
 * This page rendered `https://<slug>.preview.colaberry.ai` unconditionally, on every project,
 * for every student. Measured 2026-10-20 and again 2026-10-28: `preview.colaberry.ai` has no DNS
 * at all, apex or subdomain, checked against a hostname that does resolve so the probe itself was
 * known good. The link has never worked for anybody; the ten interns were just the newest people
 * shown it.
 *
 * The page reads the host PER RENDER, so these cases just set process.env and mount. An earlier
 * version read it at module scope and reloaded the module per case with `jest.isolateModules` --
 * which pulled a second copy of React into the isolated registry and killed every render with
 * "Invalid hook call". Reading per render is both simpler here and free in the bundle, since CRA
 * replaces `process.env.REACT_APP_*` with a literal at build time.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';
import ProjectInterior from '../ProjectInterior';

jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));
jest.mock('../NextSessionStrip', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: string, title: string): ProjectTask =>
  ({ id, title, storyId: id, state: 'todo', due: 'up', what: `do ${id}`, points: 57 } as ProjectTask);

const project = (): StudentProject => ({
  id: 'p1', name: 'PropertyPulse AI', slug: 'ppa', descriptor: 'scores properties',
  accent: '#367895', cover: 'linear-gradient(#000,#111)', icon: 'M0 0h1',
  status: 'ready', createdAt: 1, stage: 'Release 0', curStep: 2, size: 'project',
  idea: 'x', reqs: [],
  lists: [{ id: 'L0', step: 2, name: 'Release 0', sub: '', tasks: [task('STORY-001', 'Pick a location')] }],
  activity: [],
  preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
} as unknown as StudentProject);

let container: HTMLDivElement;
let root: Root | undefined;
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  root = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  // Guarded: if a mount throws, this must not throw a SECOND error on top of the real one and
  // bury it. That is exactly what happened on the first run of this file.
  if (root) act(() => { root!.unmount(); });
  document.body.removeChild(container);
  process.env = ORIGINAL_ENV;
});

/** Mount ProjectInterior with the preview host env var set to `host` (undefined = unset). */
async function mountWithHost(host?: string) {
  if (host === undefined) delete process.env.REACT_APP_PROJECT_PREVIEW_HOST;
  else process.env.REACT_APP_PROJECT_PREVIEW_HOST = host;

  const noop = () => { /* */ };
  await act(async () => {
    root = createRoot(container);
    root.render(<ProjectInterior project={project()} onBack={noop} onOpenTask={noop} />);
  });
}

/** Every link on the page that points at a preview host, by href. */
const previewHrefs = () => Array.from(container.querySelectorAll('a'))
  .map((a) => a.getAttribute('href') || '')
  .filter((h) => h.includes('preview'));

describe('with no preview host configured (every environment today)', () => {
  it('renders no preview link', async () => {
    await mountWithHost(undefined);
    expect(previewHrefs()).toEqual([]);
  });

  it('never mentions the dead hostname anywhere on the page', async () => {
    await mountWithHost(undefined);
    expect(container.textContent).not.toContain('preview.colaberry.ai');
  });

  it('and an empty string counts as unset, not as a host', async () => {
    await mountWithHost('   ');
    expect(previewHrefs()).toEqual([]);
  });

  it('still renders the project it was given', async () => {
    // Proves the three assertions above are not passing because nothing rendered at all.
    await mountWithHost(undefined);
    expect(container.textContent).toContain('PropertyPulse AI');
  });
});

/**
 * THE CONTROL. Without it, deleting the link outright would pass everything above — and the
 * intended feature would have quietly lost the one place its address was ever rendered.
 */
describe('once a preview host is configured', () => {
  it('renders the project address against that host', async () => {
    await mountWithHost('preview.example.test');
    expect(previewHrefs()).toEqual(['https://ppa.preview.example.test']);
    expect(container.textContent).toContain('ppa.preview.example.test');
  });
});
