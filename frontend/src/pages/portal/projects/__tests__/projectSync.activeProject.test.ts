/**
 * Which build the student is looking at, and which project their local snapshot
 * gets written into. Two halves of the same defect: the browser knew, and never
 * told the server.
 *
 * SYMPTOM ONE — the next-step card names the wrong build. `enrollments.
 * active_project_id` is what `GET /api/portal/projects/active` returns, what
 * `orderProjects` ranks first, and therefore what `projects[0]` — the "Your next
 * step" hero — renders. Opening a second build only ever set React state, so the
 * pointer stayed on the first build: the hero kept naming it, and a reload
 * dropped the student back onto it. Reported alongside the merge bug ("a
 * next-step card still scoped to CoreOps").
 *
 * SYMPTOM TWO — one build's local snapshot overwriting another's rows.
 * `mirrorToBackend` posts `loadProjects().find((p) => !p.sample)`, i.e. position
 * zero, and the server's `importProject` wrote it into whatever project was
 * ACTIVE. When those two disagree — which is the normal state of affairs the
 * moment a student has two builds — the snapshot lands on the wrong project.
 * The payload now names its project and the server targets it.
 */
jest.mock('../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import portalApi from '../../../../utils/portalApi';
import { pushActiveProject } from '../projectSync';

const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock; put: jest.Mock; patch: jest.Mock };
const UUID_A = '3f1c9d2e-5b8a-4c17-9e04-8a7b6c5d4e3f';

beforeEach(() => jest.clearAllMocks());

describe('pushActiveProject', () => {
  it('tells the server which build the student switched to', async () => {
    api.put.mockResolvedValue({ data: { id: UUID_A, active: true } });
    await pushActiveProject(UUID_A);
    expect(api.put).toHaveBeenCalledWith('/api/portal/projects/active', { project_id: UUID_A });
  });

  it('does not call the server for a build that only exists in this browser', async () => {
    // A pseudo id has no row to point at; the request would only 400.
    await pushActiveProject('p1755012345678');
    expect(api.put).not.toHaveBeenCalled();
  });

  it('never throws — a failed preference write must not undo the switch', async () => {
    api.put.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } }));
    await expect(pushActiveProject(UUID_A)).resolves.toBeUndefined();
  });

  it('stays silent when the projects API is switched off', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
    api.put.mockRejectedValue(Object.assign(new Error('off'), { response: { status: 404 } }));
    await pushActiveProject(UUID_A);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

/**
 * Source-level wiring checks.
 *
 * ProjectsPage has no test harness of its own — it pulls in PortalShell, the
 * router and a dozen portal contexts — so the alternative to reading the file is
 * asserting nothing at all about whether the call is actually made. The repo
 * already uses this shape where the cost of a full render is not worth paying
 * (see backend sbpOrchestrator.activeProject.test.ts and
 * buildTiers.wizardCopy.test.ts). It fails loudly if the wiring is removed or
 * the function is renamed, which is the failure mode worth catching.
 */
describe('the page is wired to persist the switch', () => {
  const page = readFileSync(join(__dirname, '..', 'ProjectsPage.tsx'), 'utf8');

  it('imports pushActiveProject from projectSync', () => {
    expect(page).toMatch(/import\s*\{[^}]*pushActiveProject[^}]*\}\s*from\s*'\.\/projectSync'/);
  });

  it('calls it from openInterior, which is how a build is switched', () => {
    const fn = /const openInterior = \([\s\S]*?\n {2}\};/.exec(page);
    expect(fn).not.toBeNull();
    expect(fn![0]).toContain('pushActiveProject');
  });

  it('guards the wizard against a double confirm creating two builds', () => {
    // Every confirm now genuinely creates a project, so the second press a
    // student makes when the first appears to do nothing is no longer free.
    expect(page).toMatch(/creatingRef\.current/);
    const handler = /const handleCreate = useCallback\([\s\S]*?\n {2}\}, \[/.exec(page);
    expect(handler).not.toBeNull();
    expect(handler![0]).toContain('if (creatingRef.current) return;');
  });

  it('clears the previous build\'s banner before starting a new one', () => {
    const handler = /const handleCreate = useCallback\([\s\S]*?\n {2}\}, \[/.exec(page);
    expect(handler![0]).toContain("setPipeline({ state: 'idle' })");
  });
});

describe('the mirrored snapshot names its own project', () => {
  const sync = readFileSync(join(__dirname, '..', 'projectSync.ts'), 'utf8');

  it('sends project_id in the import payload', () => {
    const fn = /function toImportPayload\([\s\S]*?\n\}/.exec(sync);
    expect(fn).not.toBeNull();
    // Without this the server falls back to "the active project", which is a
    // DIFFERENT build as soon as the student has two.
    expect(fn![0]).toMatch(/project_id:\s*p\.pipelineProjectId/);
  });

  it('leaves project_id undefined for a build the server has never seen', () => {
    const fn = /function toImportPayload\([\s\S]*?\n\}/.exec(sync);
    expect(fn![0]).toMatch(/isUuid\(p\.id\)\s*\?\s*p\.id\s*:\s*undefined/);
  });
});
