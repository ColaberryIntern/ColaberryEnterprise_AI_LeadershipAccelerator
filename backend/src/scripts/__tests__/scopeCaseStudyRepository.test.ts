const listRepositories = jest.fn();
const setRepositoryPathScope = jest.fn();

jest.mock('../../services/caseStudy/caseStudyRepoCollection', () => ({
  listRepositories: (...a: unknown[]) => listRepositories(...a),
  setRepositoryPathScope: (...a: unknown[]) => setRepositoryPathScope(...a),
}));

import { main } from '../scopeCaseStudyRepository';

/**
 * The operator surface for scoping a Case Study's repository.
 *
 * WHAT IS ACTUALLY WORTH TESTING HERE. Not that it calls the service — that is
 * one line. The value is in the refusals and in the no-op detection:
 *
 *   · a production write without `--confirm-production` must be REFUSED, and the
 *     guard is `DATABASE_URL`-shaped, so it is easy to write one that never
 *     fires and looks identical from the outside;
 *   · a bare repo name matching two owners must not be resolved by picking the
 *     first — silently scoping the wrong repository is the worst outcome this
 *     script has available to it;
 *   · re-running with the SAME scope must report `unchanged` and write nothing,
 *     because an operator will run it twice and a second "success" that wrote
 *     again teaches them the script is not idempotent when it is.
 */

const CASE_STUDY = '11111111-1111-4111-8111-111111111111';
const repo = (over: Record<string, unknown> = {}) => ({
  id: 'r1', collectionId: 'c1', repoOwner: 'acme', repoName: 'monorepo',
  repoUrl: 'https://github.com/acme/monorepo', role: 'primary',
  visibility: 'private', accessStatus: 'connected', allowPublicRepoLink: false,
  ...over,
});

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
let out: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  out = [];
  jest.spyOn(console, 'log').mockImplementation((s: unknown) => { out.push(String(s)); });
  listRepositories.mockResolvedValue([repo()]);
  setRepositoryPathScope.mockImplementation(async (input: { pathScope: string[] }) =>
    repo({ pathScope: input.pathScope }));
  delete process.env.DATABASE_URL;
});
afterEach(() => {
  jest.restoreAllMocks();
  if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB_URL;
});

const json = () => JSON.parse(out.join('\n'));

describe('argument contract', () => {
  it('requires a case study', async () => {
    await expect(main(['--repo', 'acme/monorepo', '--scope', 'a'])).rejects.toThrow('--case-study');
  });

  it('refuses --clear and --scope together rather than guessing', async () => {
    await expect(main([
      '--case-study', CASE_STUDY, '--repo', 'acme/monorepo', '--clear', '--scope', 'a',
    ])).rejects.toThrow('mutually exclusive');
  });

  it('refuses a scope-less write, so a typo cannot silently clear a scope', async () => {
    await expect(main(['--case-study', CASE_STUDY, '--repo', 'acme/monorepo']))
      .rejects.toThrow('at least one --scope');
  });

  it('refuses --scope with no value', async () => {
    await expect(main([
      '--case-study', CASE_STUDY, '--repo', 'acme/monorepo', '--scope', '--dry-run',
    ])).rejects.toThrow('--scope requires a path prefix');
  });
});

describe('production guard', () => {
  const args = ['--case-study', CASE_STUDY, '--repo', 'acme/monorepo', '--scope', 'backend/src'];

  it('REFUSES a production write without --confirm-production', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@host:5432/accelerator_prod';
    await expect(main(args)).rejects.toThrow('--confirm-production');
    expect(setRepositoryPathScope).not.toHaveBeenCalled();
  });

  it('allows the write once it is confirmed', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@host:5432/accelerator_prod';
    await main([...args, '--confirm-production']);
    expect(setRepositoryPathScope).toHaveBeenCalled();
  });

  it('allows a dry run against production, because reading is safe anywhere', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@host:5432/accelerator_prod';
    await main([...args, '--dry-run']);
    expect(setRepositoryPathScope).not.toHaveBeenCalled();
    expect(json().dry_run).toBe(true);
  });

  it('does not mistake a dev database for production', async () => {
    // The negative control. A guard that fires on every URL is indistinguishable
    // from a correct one until it blocks legitimate dev work.
    process.env.DATABASE_URL = 'postgres://u:p@host:5432/accelerator_dev1';
    await main(args);
    expect(setRepositoryPathScope).toHaveBeenCalled();
  });
});

describe('choosing the repository', () => {
  it('refuses a bare name that matches two attached repositories', async () => {
    listRepositories.mockResolvedValue([
      repo({ id: 'r1', repoOwner: 'acme', repoName: 'platform' }),
      repo({ id: 'r2', repoOwner: 'other', repoName: 'platform' }),
    ]);
    await expect(main([
      '--case-study', CASE_STUDY, '--repo', 'platform', '--scope', 'backend/src',
    ])).rejects.toThrow('matches 2 attached repositories');
    expect(setRepositoryPathScope).not.toHaveBeenCalled();
  });

  it('names what IS attached when nothing matches', async () => {
    // An operator who mistyped needs the list; an error that only says "not
    // found" sends them back to the admin UI to look it up.
    await expect(main([
      '--case-study', CASE_STUDY, '--repo', 'acme/nope', '--scope', 'backend/src',
    ])).rejects.toThrow('acme/monorepo');
  });
});

describe('writing the scope', () => {
  it('sets the scope and says the facts have not moved yet', async () => {
    await main([
      '--case-study', CASE_STUDY, '--repo', 'acme/monorepo',
      '--scope', 'backend/src/services/agents/corybrain',
    ]);
    expect(setRepositoryPathScope).toHaveBeenCalledWith(expect.objectContaining({
      caseStudyId: CASE_STUDY, repositoryId: 'r1',
      pathScope: ['backend/src/services/agents/corybrain'],
    }));
    expect(json().next).toMatch(/re-sync/);
  });

  it('accepts several prefixes', async () => {
    await main([
      '--case-study', CASE_STUDY, '--repo', 'acme/monorepo',
      '--scope', 'backend/src/a', '--scope', 'frontend/src/b',
    ]);
    expect(setRepositoryPathScope).toHaveBeenCalledWith(expect.objectContaining({
      pathScope: ['backend/src/a', 'frontend/src/b'],
    }));
  });

  it('clears a scope', async () => {
    listRepositories.mockResolvedValue([repo({ pathScope: ['backend/src'] })]);
    await main(['--case-study', CASE_STUDY, '--repo', 'acme/monorepo', '--clear']);
    expect(setRepositoryPathScope).toHaveBeenCalledWith(expect.objectContaining({ pathScope: [] }));
  });

  it('is IDEMPOTENT: the same scope twice writes once', async () => {
    listRepositories.mockResolvedValue([repo({ pathScope: ['backend/src'] })]);
    await main(['--case-study', CASE_STUDY, '--repo', 'acme/monorepo', '--scope', 'backend/src']);
    expect(setRepositoryPathScope).not.toHaveBeenCalled();
    expect(json().outcome).toBe('unchanged');
  });

  it('treats a differently-typed but identical scope as unchanged', async () => {
    // `/Backend/SRC/` and `backend/src` are one scope. Without this the script
    // rewrites the row on every run and reports a change that did not happen.
    listRepositories.mockResolvedValue([repo({ pathScope: ['backend/src'] })]);
    await main(['--case-study', CASE_STUDY, '--repo', 'acme/monorepo', '--scope', '/Backend/SRC/']);
    expect(setRepositoryPathScope).not.toHaveBeenCalled();
  });

  it('still writes when the scope genuinely differs', async () => {
    // Non-vacuity for the two tests above: the comparison must not report
    // "unchanged" for everything.
    listRepositories.mockResolvedValue([repo({ pathScope: ['backend/src'] })]);
    await main(['--case-study', CASE_STUDY, '--repo', 'acme/monorepo', '--scope', 'frontend/src']);
    expect(setRepositoryPathScope).toHaveBeenCalled();
  });
});

describe('--list', () => {
  it('reports what is attached and each stored scope, writing nothing', async () => {
    listRepositories.mockResolvedValue([repo({ pathScope: ['backend/src'] })]);
    await main(['--case-study', CASE_STUDY, '--list']);
    expect(setRepositoryPathScope).not.toHaveBeenCalled();
    expect(json().repositories).toEqual([
      expect.objectContaining({ repo: 'acme/monorepo', path_scope: ['backend/src'] }),
    ]);
  });

  it('needs no --repo, so it works before you know what is attached', async () => {
    await expect(main(['--case-study', CASE_STUDY, '--list'])).resolves.toBeUndefined();
  });
});
