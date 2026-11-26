/**
 * Adopting a platform-built demo into the durable public link.
 *
 * The defect this closes: a platform-built project could never have a permanent public demo
 * address. The portal serves its demo through `/api/platform-view/<token>/`, and that token
 * expires in 12 hours, while the durable `/api/public/demo/:token` route reads
 * `projects.demo_spec`, which only a data-model upload could write. A platform-built project has
 * no repository to take a data model out of, so the two halves never met.
 *
 * What is asserted here is the joining: the stored spec is found, re-validated, and persisted
 * through the SAME write path a generated one uses, and every way of not having a usable stored
 * demo is distinguished from every other.
 */
const activeArtifact = jest.fn();
const activeArtifactSummary = jest.fn();
jest.mock('../platformBuild/artifactStore', () => ({
  __esModule: true,
  activeArtifact: (...a: unknown[]) => activeArtifact(...a),
  activeArtifactSummary: (...a: unknown[]) => activeArtifactSummary(...a),
}));

/*
 * `persistConnectedDemoSpec` is spied, not reimplemented. Its own behavior (contract check,
 * content policy, COALESCE on the token) is `connectedDemoStore.test.ts`'s subject; what this
 * file has to prove is that this module REACHES it, with the parsed spec, and writes by no other
 * route. `ConnectedDemoStoreError` is re-exported from the factory because a mocked module's
 * missing export is `undefined` at runtime, and `throw new undefined(...)` fails a long way from
 * the cause.
 */
const persistConnectedDemoSpec = jest.fn();
jest.mock('../connectedDemoStore', () => {
  class ConnectedDemoStoreError extends Error {
    readonly name = 'ConnectedDemoStoreError';

    constructor(readonly error_class: string, message: string) {
      super(message);
    }
  }
  return {
    __esModule: true,
    ConnectedDemoStoreError,
    persistConnectedDemoSpec: (...a: unknown[]) => persistConnectedDemoSpec(...a),
  };
});

import fs from 'fs';
import path from 'path';
import {
  DEMO_SPEC_ARTIFACT_PATH,
  adoptPlatformConnectedDemo,
  platformDemoAvailability,
} from '../platformDemoAdopt';

const PROJECT = 'c0ffee00-0000-4000-8000-000000000001';
const SPEC = { schema_version: 2, app: { name: 'Coverage console' }, events: [{ event_id: 'e1' }] };

function artifact(files: Record<string, string>, version = 3): unknown {
  return { version, files, created_at: new Date('2026-11-25T17:56:00Z') };
}

beforeEach(() => {
  activeArtifact.mockReset();
  activeArtifactSummary.mockReset();
  persistConnectedDemoSpec.mockReset();
  persistConnectedDemoSpec.mockResolvedValue({
    projectId: PROJECT, shareToken: 'tok', shareEnabled: false, spec: SPEC, eventCount: 1,
  });
});

describe('the artifact path is the same string in all three places', () => {
  /*
   * A tripwire, not a tautology. `artifactStore` WRITES this key, `serveMap` RESOLVES it, and
   * this module READS it, and none of them can see the others. If a rename landed in one place
   * only, adoption would quietly answer "no demo to adopt" for every project: a feature that
   * disappears with no error anywhere. Reading the source is the only way to assert agreement
   * without a database and a build run.
   */
  const SRC = path.join(__dirname, '..', 'platformBuild');

  it('artifactStore writes the key this module reads', () => {
    const src = fs.readFileSync(path.join(SRC, 'artifactStore.ts'), 'utf8');
    expect(src).toContain(`'${DEMO_SPEC_ARTIFACT_PATH}'`);
  });

  it('serveMap resolves the key this module reads', () => {
    const src = fs.readFileSync(path.join(SRC, 'serveMap.ts'), 'utf8');
    expect(src).toContain(`'${DEMO_SPEC_ARTIFACT_PATH}'`);
  });

  it('is the path it is documented to be, so neither assertion above can pass vacuously', () => {
    expect(DEMO_SPEC_ARTIFACT_PATH).toBe('demo/demo-spec.json');
  });
});

describe('adoptPlatformConnectedDemo: the happy path', () => {
  it('persists the stored spec through the shared write path', async () => {
    activeArtifact.mockResolvedValue(artifact({ [DEMO_SPEC_ARTIFACT_PATH]: JSON.stringify(SPEC) }));

    const result = await adoptPlatformConnectedDemo(PROJECT);

    expect(result).not.toBeNull();
    expect(activeArtifact).toHaveBeenCalledWith(PROJECT, 'demo');
    expect(persistConnectedDemoSpec).toHaveBeenCalledTimes(1);
    // The PARSED spec, not the string. Handing the raw JSON on would store a quoted string.
    expect(persistConnectedDemoSpec).toHaveBeenCalledWith(PROJECT, SPEC);
  });

  it('never sets demo_share_enabled: adopting and publishing stay two decisions', async () => {
    activeArtifact.mockResolvedValue(artifact({ [DEMO_SPEC_ARTIFACT_PATH]: JSON.stringify(SPEC) }));
    await adoptPlatformConnectedDemo(PROJECT);
    // Asserted against the ARGUMENTS this module controls: nothing it passes can enable a link.
    const args = JSON.stringify(persistConnectedDemoSpec.mock.calls[0]);
    expect(args).not.toContain('demo_share_enabled');
    expect(args).not.toContain('enabled');
  });

  it('IDEMPOTENT: adopting twice passes the same spec both times', async () => {
    activeArtifact.mockResolvedValue(artifact({ [DEMO_SPEC_ARTIFACT_PATH]: JSON.stringify(SPEC) }));
    await adoptPlatformConnectedDemo(PROJECT);
    await adoptPlatformConnectedDemo(PROJECT);
    expect(persistConnectedDemoSpec.mock.calls[0]).toEqual(persistConnectedDemoSpec.mock.calls[1]);
  });
});

describe('adoptPlatformConnectedDemo: not having a demo is an answer, not a failure', () => {
  it('returns null when the project has no demo artifact, and writes nothing', async () => {
    activeArtifact.mockResolvedValue(null);
    await expect(adoptPlatformConnectedDemo(PROJECT)).resolves.toBeNull();
    expect(persistConnectedDemoSpec).not.toHaveBeenCalled();
  });
});

describe('adoptPlatformConnectedDemo: a demo that exists but cannot be used REFUSES', () => {
  /*
   * The distinction these two cases protect. "No demo" must fall through to asking for a data
   * model; "a demo we stored and cannot read" must not, because then a student with no
   * repository would be asked for a file that does not exist, to fix a bug of ours.
   */
  it('throws when the artifact row carries no spec file', async () => {
    activeArtifact.mockResolvedValue(artifact({ 'demo/other.json': '{}' }));
    await expect(adoptPlatformConnectedDemo(PROJECT)).rejects.toMatchObject({
      error_class: 'ConnectedDemoSpecInvalid',
    });
    expect(persistConnectedDemoSpec).not.toHaveBeenCalled();
  });

  it('throws when the stored spec is not valid JSON, and leaks none of it', async () => {
    activeArtifact.mockResolvedValue(artifact({ [DEMO_SPEC_ARTIFACT_PATH]: '{"events": [oops' }));
    try {
      await adoptPlatformConnectedDemo(PROJECT);
      throw new Error('expected a refusal');
    } catch (err) {
      const e = err as { error_class?: string; message?: string };
      expect(e.error_class).toBe('ConnectedDemoSpecInvalid');
      // The message reaches an HTTP response, so it carries the project and nothing else.
      expect(e.message).toContain(PROJECT);
      expect(e.message).not.toContain('oops');
      expect(e.message).not.toContain('events');
    }
    expect(persistConnectedDemoSpec).not.toHaveBeenCalled();
  });

  it('BOUNDARY: an empty or whitespace-only spec file refuses rather than parsing to nothing', async () => {
    for (const body of ['', '   ', '\n']) {
      activeArtifact.mockResolvedValue(artifact({ [DEMO_SPEC_ARTIFACT_PATH]: body }));
      await expect(adoptPlatformConnectedDemo(PROJECT)).rejects.toMatchObject({
        error_class: 'ConnectedDemoSpecInvalid',
      });
    }
    expect(persistConnectedDemoSpec).not.toHaveBeenCalled();
  });

  it('BOUNDARY: a files map that is missing entirely refuses instead of throwing a TypeError', async () => {
    activeArtifact.mockResolvedValue({ version: 1, files: undefined, created_at: new Date() });
    await expect(adoptPlatformConnectedDemo(PROJECT)).rejects.toMatchObject({
      error_class: 'ConnectedDemoSpecInvalid',
    });
  });
});

describe('platformDemoAvailability', () => {
  it('reports the stored demo version', async () => {
    const built = new Date('2026-11-25T17:56:00Z');
    activeArtifactSummary.mockResolvedValue({
      command_center: { version: 9, built_at: built },
      demo: { version: 4, built_at: built },
    });
    await expect(platformDemoAvailability(PROJECT)).resolves.toEqual({ version: 4, built_at: built });
  });

  it('reports null when the platform built a Command Center but NO demo', async () => {
    // Both directions. A summary with a command_center and no demo is the real shape of a build
    // whose demo spec failed its upload check, and it must not read as "there is a demo".
    activeArtifactSummary.mockResolvedValue({
      command_center: { version: 9, built_at: new Date() },
      demo: null,
    });
    await expect(platformDemoAvailability(PROJECT)).resolves.toEqual({ version: null, built_at: null });
  });

  it('reports null for a project the platform never built at all', async () => {
    activeArtifactSummary.mockResolvedValue({ command_center: null, demo: null });
    await expect(platformDemoAvailability(PROJECT)).resolves.toEqual({ version: null, built_at: null });
  });
});
