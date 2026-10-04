/**
 * Importing a project from its repository.
 *
 *     "Also allow me to add projects that aren't connected to the system, but I
 *      can give you the repo to read and upload the project."  (Ali, 2026-09-29)
 *
 * The rules worth holding are about what this REFUSES to invent. A plan built
 * from an empty repository, or from a URL that was not the repository someone
 * meant, is confident fiction — and it arrives looking exactly like a real
 * plan, which is what makes it dangerous rather than merely wrong.
 */
const mockStartBuild = jest.fn();
const mockResolveProject = jest.fn();
jest.mock('../../sbp/sbpOrchestrator', () => ({ startBuild: (...a: unknown[]) => mockStartBuild(...a) }));
jest.mock('../../projectService', () => ({
  resolveProjectForNewBuild: (...a: unknown[]) => mockResolveProject(...a),
}));

import {
  parseRepoRef, briefFromRepo, importProjectFromRepo, IMPORT_DOC_PATHS, DOC_MAX_CHARS,
} from '../repoProjectImport';

const REF = { owner: 'ColaberryIntern', repo: 'patriot-ai' };
const ENROLLMENT = 'enr-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveProject.mockResolvedValue({ project: { id: 'proj-1' }, reused: false });
  mockStartBuild.mockResolvedValue({ projectId: 'proj-1', correlationId: 'corr-1', status: 'generating' });
});

describe('the repository someone pasted', () => {
  it('accepts the forms people actually paste', () => {
    for (const input of [
      'https://github.com/ColaberryIntern/patriot-ai',
      'https://github.com/ColaberryIntern/patriot-ai.git',
      'https://www.github.com/ColaberryIntern/patriot-ai/tree/main',
      'git@github.com:ColaberryIntern/patriot-ai.git',
      'ColaberryIntern/patriot-ai',
      '  https://github.com/ColaberryIntern/patriot-ai  ',
    ]) {
      expect(parseRepoRef(input)).toEqual(REF);
    }
  });

  it('refuses anything else by name rather than guessing', () => {
    // Guessing produces a confident plan about the wrong project, which reads
    // as real work until somebody notices.
    for (const bad of ['', '   ', 'https://gitlab.com/a/b', 'just some words', 'https://github.com/only-owner']) {
      expect(() => parseRepoRef(bad)).toThrow();
    }
  });
});

describe('the brief the decomposer receives', () => {
  it('carries the documentation verbatim, under its own path', () => {
    const brief = briefFromRepo(REF, [
      { path: 'README.md', content: 'A bid qualification assistant for federal contracts.' },
      { path: 'docs/ARCHITECTURE.md', content: 'Ingest, score, then hand to a human.' },
    ]);
    expect(brief).toContain('ColaberryIntern/patriot-ai');
    expect(brief).toContain('--- README.md ---');
    expect(brief).toContain('A bid qualification assistant for federal contracts.');
    expect(brief).toContain('--- docs/ARCHITECTURE.md ---');
    expect(brief).toContain('Ingest, score, then hand to a human.');
  });

  it('tells the decomposer not to fill silence with invention', () => {
    const brief = briefFromRepo(REF, [{ path: 'README.md', content: 'x' }]);
    expect(brief).toContain('leave the requirement out');
  });

  it('clips a single enormous document rather than the whole brief', () => {
    const huge = 'y'.repeat(DOC_MAX_CHARS + 5_000);
    const brief = briefFromRepo(REF, [
      { path: 'README.md', content: huge },
      { path: 'CLAUDE.md', content: 'the last word' },
    ]);
    // The later document still arrives: clipping is per document, so a long
    // README cannot silently evict everything after it.
    expect(brief).toContain('the last word');
    expect(brief.length).toBeLessThan(huge.length + 5_000);
  });

  it('REFUSES an empty repository instead of building from nothing', () => {
    // The whole failure this guards: a plan assembled from no input is
    // invention, and it is indistinguishable from a real one on the board.
    expect(() => briefFromRepo(REF, [])).toThrow(/would be invention/);
    try {
      briefFromRepo(REF, []);
    } catch (e: any) {
      expect(e.status).toBe(422);
      expect(e.error_class).toBe('EmptyRepository');
    }
  });
});

describe('importing', () => {
  const fetchDoc = (files: Record<string, string>) =>
    jest.fn(async (_ref: unknown, path: string) => files[path] ?? null);

  it('builds through startBuild, not through anything of its own', async () => {
    const read = fetchDoc({ 'README.md': 'A bid qualification assistant.' });
    await importProjectFromRepo({ repoUrl: 'ColaberryIntern/patriot-ai', enrollmentId: ENROLLMENT, fetchDoc: read });

    expect(mockStartBuild).toHaveBeenCalledTimes(1);
    const arg = mockStartBuild.mock.calls[0][0];
    expect(arg.enrollmentId).toBe(ENROLLMENT);
    expect(arg.idea).toContain('A bid qualification assistant.');
  });

  it('HOLDS it for review, because a plan from a README wants a human read', async () => {
    const read = fetchDoc({ 'README.md': 'A bid qualification assistant.' });
    await importProjectFromRepo({ repoUrl: 'ColaberryIntern/patriot-ai', enrollmentId: ENROLLMENT, fetchDoc: read });
    expect(mockStartBuild.mock.calls[0][0].holdForReview).toBe(true);
  });

  it('names the project after the repo when no name was given', async () => {
    const read = fetchDoc({ 'README.md': 'x y z' });
    await importProjectFromRepo({ repoUrl: 'ColaberryIntern/patriot-ai', enrollmentId: ENROLLMENT, fetchDoc: read });
    expect(mockStartBuild.mock.calls[0][0].name).toBe('patriot-ai');
  });

  it('reads the documents it knows about and reports which it found', async () => {
    const read = fetchDoc({ 'README.md': 'one', 'docs/ARCHITECTURE.md': 'two' });
    const res = await importProjectFromRepo({ repoUrl: 'ColaberryIntern/patriot-ai', enrollmentId: ENROLLMENT, fetchDoc: read });
    expect(res.docs_read).toEqual(['README.md', 'docs/ARCHITECTURE.md']);
    expect(read).toHaveBeenCalledTimes(IMPORT_DOC_PATHS.length);
  });

  it('does not feed the same document twice on a case-insensitive checkout', async () => {
    // README.md and readme.md resolve to one file; sending it twice would
    // weight it double in the brief for no reason.
    const read = fetchDoc({ 'README.md': 'the same text', 'readme.md': 'the same text' });
    const res = await importProjectFromRepo({ repoUrl: 'ColaberryIntern/patriot-ai', enrollmentId: ENROLLMENT, fetchDoc: read });
    expect(res.docs_read).toEqual(['README.md']);
  });

  it('refuses a repository it could read nothing from, before touching a project', async () => {
    const read = fetchDoc({});
    await expect(importProjectFromRepo({
      repoUrl: 'ColaberryIntern/patriot-ai', enrollmentId: ENROLLMENT, fetchDoc: read,
    })).rejects.toMatchObject({ error_class: 'EmptyRepository' });
    expect(mockResolveProject).not.toHaveBeenCalled();
    expect(mockStartBuild).not.toHaveBeenCalled();
  });

  it('refuses a bad URL before reading anything at all', async () => {
    const read = fetchDoc({ 'README.md': 'x' });
    await expect(importProjectFromRepo({
      repoUrl: 'not a repo', enrollmentId: ENROLLMENT, fetchDoc: read,
    })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it('reports when it landed on an existing empty project rather than a new one', async () => {
    mockResolveProject.mockResolvedValue({ project: { id: 'proj-9' }, reused: true });
    const read = fetchDoc({ 'README.md': 'x y z' });
    const res = await importProjectFromRepo({ repoUrl: 'ColaberryIntern/patriot-ai', enrollmentId: ENROLLMENT, fetchDoc: read });
    expect(res.reused_project).toBe(true);
    expect(res.project_id).toBe('proj-9');
  });
});
