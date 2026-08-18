/**
 * repoConnectService — the connect step end to end, with GitHub and the DB
 * mocked.
 *
 * Every assertion here maps to a way a real student loses work or gets stuck:
 * a repo bound before they proved they could push it, a repo silently claimed
 * from another build, a project quietly re-pointed away from commits it already
 * has, or a rejection so vague they cannot act on it.
 */

jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(async (id: string) => {
      if (id === 'prj-1') return { id: 'prj-1', enrollment_id: 'enr-1', name: 'Nightshift Dispatch' };
      if (id === 'prj-2') return { id: 'prj-2', enrollment_id: 'enr-1', name: 'Second Build' };
      if (id === 'prj-foreign') return { id: 'prj-foreign', enrollment_id: 'enr-other', name: 'Not Yours' };
      return null;
    }),
  },
}));

jest.mock('../../../models', () => {
  const rows: Record<string, any> = {};
  const make = (data: any) => ({ ...data, save: jest.fn(async function (this: any) { return this; }) });
  return {
    GitHubConnection: {
      _rows: rows,
      _reset: () => { for (const k of Object.keys(rows)) delete rows[k]; },
      _seed: (projectId: string, data: any) => {
        rows[projectId] = make({ project_id: projectId, enrollment_id: 'enr-1', status_json: {}, ...data });
        return rows[projectId];
      },
      findOrCreate: jest.fn(async ({ where, defaults }: any) => {
        if (rows[where.project_id]) return [rows[where.project_id], false];
        rows[where.project_id] = make(defaults);
        return [rows[where.project_id], true];
      }),
      // Supports the two shapes the service uses: by project_id, and the
      // owner/name claim lookup.
      findOne: jest.fn(async ({ where }: any) => {
        if (typeof where.project_id === 'string') return rows[where.project_id] ?? null;
        const ownerMatch = Object.getOwnPropertySymbols(where.repo_owner ?? {}).map((s) => (where.repo_owner as any)[s])[0];
        const nameMatch = Object.getOwnPropertySymbols(where.repo_name ?? {}).map((s) => (where.repo_name as any)[s])[0];
        const excluded = Object.getOwnPropertySymbols(where.project_id ?? {}).map((s) => (where.project_id as any)[s])[0];
        return Object.values(rows).find((r: any) =>
          r.project_id && r.project_id !== excluded
          && String(r.repo_owner ?? '').toLowerCase() === String(ownerMatch).toLowerCase()
          && String(r.repo_name ?? '').toLowerCase() === String(nameMatch).toLowerCase()) ?? null;
      }),
    },
    Enrollment: { findByPk: jest.fn(async (id: string) => ({ id, full_name: 'Test Student' })) },
  };
});

import * as connect from '../repoConnect/repoConnectService';
import { RepoConnectError } from '../repoConnect/connectErrors';
import { CONNECT_FILE_PATH, renderChallengeFile, CHALLENGE_TTL_MS } from '../repoConnect/connectChallenge';
import { GitHubConnection } from '../../../models';

const Conn = GitHubConnection as any;
const ENR = 'enr-1';
const PRJ = 'prj-1';

/** A scriptable GitHub. Each key is a URL fragment; the value is the response. */
function github(routes: Array<{ match: RegExp; status: number; body?: any; headers?: Record<string, string> }>): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    const route = routes.find((r) => r.match.test(u));
    if (!route) throw new Error(`unscripted GitHub call: ${u}`);
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      headers: { get: (k: string) => route.headers?.[k.toLowerCase()] ?? null },
      text: async () => (typeof route.body === 'string' ? route.body : JSON.stringify(route.body ?? {})),
    };
  }) as unknown as typeof fetch;
}

const repoOk = (over: Record<string, unknown> = {}) => ({
  match: /\/repos\/[^/]+\/[^/]+$/,
  status: 200,
  body: {
    owner: { login: 'a-student' }, name: 'nightshift', full_name: 'a-student/nightshift',
    html_url: 'https://github.com/a-student/nightshift', private: true, default_branch: 'main',
    // The DEFAULT is a repo the platform can write, because that is the shape the
    // rest of the pipeline assumes: managed block installed, docs refreshed,
    // `.colaberry/progress.json` seeded. `push: false` is a real and supported
    // choice, and it gets its own fixture below rather than being the silent
    // default nobody notices.
    permissions: { push: true }, archived: false, fork: false, ...over,
  },
});

/** The same repo, with the platform holding read access only. */
const repoPullOnly = () => repoOk({ permissions: { push: false, pull: true } });
const fileWith = (content: string) => ({
  match: /\/contents\//, status: 200, body: { content: Buffer.from(content, 'utf8').toString('base64') },
});
const fileMissing = { match: /\/contents\//, status: 404, body: { message: 'Not Found' } };

async function caught(fn: () => Promise<unknown>): Promise<RepoConnectError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof RepoConnectError) return err;
    throw err;
  }
  throw new Error('expected a RepoConnectError');
}

beforeEach(() => {
  jest.clearAllMocks();
  Conn._reset();
  process.env.GITHUB_TOKEN = 'platform-token';
  delete process.env.GITHUB_API_URL;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ── door A: bring your own repo ─────────────────────────────────────────────

describe('startConnect', () => {
  it('validates the repo and issues a push challenge WITHOUT binding it', async () => {
    const view = await connect.startConnect(ENR, PRJ, 'https://github.com/a-student/nightshift', {
      fetchImpl: github([repoOk()]),
    });

    expect(view.state).toBe('awaiting_proof');
    expect(view.method).toBe('byo');
    expect(view.owner).toBe('a-student');
    expect(view.challenge?.path).toBe(CONNECT_FILE_PATH);
    expect(view.challenge?.token).toMatch(/^[a-f0-9]{32}$/);
    expect(view.challenge?.commands.join('\n')).toContain('git push -u origin main');

    // The commands must name the repo the student just pasted. An agent asked to
    // run a block with no remote in it will refuse rather than guess the URL,
    // which is exactly how this step failed in the field (2026-08-15). The repo
    // is not bound yet, so this URL can only have come from the pending connect.
    const commands = view.challenge!.commands.join('\n');
    expect(commands).toContain('git remote add origin https://github.com/a-student/nightshift');
    // And the block must work from a folder that is not a git repo at all.
    expect(commands).toContain('git init');

    // The crucial half: nothing is BOUND yet. A candidate must not look like a
    // live repo to the rest of the platform.
    const row = Conn._rows[PRJ];
    expect(row.repo_owner).toBeUndefined();
    expect(row.repo_name).toBeUndefined();
    expect(connect.isWritableConnection(row)).toBe(false);
  });

  it('rejects a bad reference before any network call', async () => {
    const fetchImpl = jest.fn();
    const err = await caught(() => connect.startConnect(ENR, PRJ, 'not a repo', { fetchImpl: fetchImpl as any }));
    expect(err.error_class).toBe('InvalidRepoReference');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is idempotent: a second start for the same repo reuses the SAME token', async () => {
    const impl = github([repoOk()]);
    const first = await connect.startConnect(ENR, PRJ, 'a-student/nightshift', { fetchImpl: impl });
    const second = await connect.startConnect(ENR, PRJ, 'a-student/nightshift', { fetchImpl: impl });
    // A student who refreshes must not find the command they already ran void.
    expect(second.challenge?.token).toBe(first.challenge?.token);
  });

  it('mints a NEW token when they point at a different repo', async () => {
    const first = await connect.startConnect(ENR, PRJ, 'a-student/nightshift', { fetchImpl: github([repoOk()]) });
    const second = await connect.startConnect(ENR, PRJ, 'a-student/other', {
      fetchImpl: github([repoOk({ name: 'other', full_name: 'a-student/other', html_url: 'https://github.com/a-student/other' })]),
    });
    expect(second.challenge?.token).not.toBe(first.challenge?.token);
  });

  it('refuses a repo already claimed by another project, and says which', async () => {
    Conn._seed('prj-2', {
      repo_owner: 'a-student', repo_name: 'nightshift',
      status_json: { connect: { state: 'connected', method: 'byo' } },
    });
    const err = await caught(() => connect.startConnect(ENR, PRJ, 'a-student/nightshift', { fetchImpl: github([repoOk()]) }));
    expect(err.error_class).toBe('RepoAlreadyClaimed');
    expect(err.http_status).toBe(409);
    expect(err.student_message).toContain('a-student/nightshift');
    expect(err.student_message).toMatch(/another build/i);
  });

  it('matches a claim case-insensitively, because GitHub does', async () => {
    Conn._seed('prj-2', { repo_owner: 'A-Student', repo_name: 'NightShift', status_json: {} });
    const err = await caught(() => connect.startConnect(ENR, PRJ, 'a-student/nightshift', { fetchImpl: github([repoOk()]) }));
    expect(err.error_class).toBe('RepoAlreadyClaimed');
  });

  it('refuses to silently rebind a project whose current repo HAS COMMITS', async () => {
    Conn._seed(PRJ, {
      repo_owner: 'a-student', repo_name: 'first-attempt',
      status_json: { connect: { state: 'connected', method: 'byo' } },
    });
    const err = await caught(() => connect.startConnect(ENR, PRJ, 'a-student/nightshift', {
      fetchImpl: github([
        { match: /\/commits\?/, status: 200, body: [{ sha: 'abc123' }] },
        repoOk(),
      ]),
    }));
    expect(err.error_class).toBe('RepoRebindRefused');
    expect(err.student_message).toContain('first-attempt');
    expect(err.details.requires).toBe('confirm_replace');
    // Still pointed where it was — the refusal changed nothing.
    expect(Conn._rows[PRJ].repo_name).toBe('first-attempt');
  });

  it('allows the rebind when the student explicitly confirms it', async () => {
    Conn._seed(PRJ, {
      repo_owner: 'a-student', repo_name: 'first-attempt',
      status_json: { connect: { state: 'connected', method: 'byo' } },
    });
    const view = await connect.startConnect(ENR, PRJ, 'a-student/nightshift', {
      confirmReplace: true,
      fetchImpl: github([repoOk()]),
    });
    expect(view.state).toBe('awaiting_proof');
  });

  it('allows a rebind off an EMPTY current repo without asking — there is nothing to orphan', async () => {
    Conn._seed(PRJ, {
      repo_owner: 'a-student', repo_name: 'empty-one',
      status_json: { connect: { state: 'connected', method: 'byo' } },
    });
    const view = await connect.startConnect(ENR, PRJ, 'a-student/nightshift', {
      fetchImpl: github([
        { match: /\/commits\?/, status: 409, body: { message: 'Git Repository is empty.' } },
        repoOk(),
      ]),
    });
    expect(view.state).toBe('awaiting_proof');
  });

  it('refuses the rebind when it CANNOT TELL whether the current repo has work', async () => {
    Conn._seed(PRJ, {
      repo_owner: 'a-student', repo_name: 'unreadable',
      status_json: { connect: { state: 'connected', method: 'byo' } },
    });
    const err = await caught(() => connect.startConnect(ENR, PRJ, 'a-student/nightshift', {
      fetchImpl: github([
        { match: /\/commits\?/, status: 403, headers: { 'x-ratelimit-remaining': '0' } },
        repoOk(),
      ]),
    }));
    // Not "assume empty and proceed" — a wrong guess strands their work.
    expect(err.error_class).toBe('RepoRebindRefused');
  });

  it('refuses an archived repo, because nobody can push to it', async () => {
    const err = await caught(() => connect.startConnect(ENR, PRJ, 'a-student/nightshift', {
      fetchImpl: github([repoOk({ archived: true })]),
    }));
    expect(err.error_class).toBe('NoPushAccess');
    expect(err.student_message).toMatch(/archived/i);
  });
});

describe('startConnect — GitHub failures are classified, never generic', () => {
  it.each([
    [404, 'RepoNotFound', 404],
    [401, 'Unauthorized', 502],
  ])('status %i becomes %s', async (status, error_class, http) => {
    const err = await caught(() => connect.startConnect(ENR, PRJ, 'a-student/nightshift', {
      fetchImpl: github([{ match: /\/repos\//, status }]),
    }));
    expect(err.error_class).toBe(error_class);
    expect(err.http_status).toBe(http);
  });

  it('a 404 says BOTH possible causes, so a real private repo is not called imaginary', async () => {
    const err = await caught(() => connect.startConnect(ENR, PRJ, 'a-student/nightshift', {
      fetchImpl: github([{ match: /\/repos\//, status: 404 }]),
    }));
    expect(err.student_message).toMatch(/private/i);
    expect(err.student_message).toMatch(/spelling|address is wrong/i);
  });

  it('a rate limit is reported as a rate limit, not as a missing repo', async () => {
    const err = await caught(() => connect.startConnect(ENR, PRJ, 'a-student/nightshift', {
      fetchImpl: github([{ match: /\/repos\//, status: 403, headers: { 'x-ratelimit-remaining': '0', 'retry-after': '60' } }]),
    }));
    expect(err.error_class).toBe('RateLimited');
    expect(err.student_message).toMatch(/Your repo is fine/i);
    expect(err.details.retry_after_seconds).toBe(60);
  });

  it('a missing platform token is reported as OUR problem', async () => {
    delete process.env.GITHUB_TOKEN;
    const err = await caught(() => connect.startConnect(ENR, PRJ, 'a-student/nightshift', { fetchImpl: github([]) }));
    expect(err.error_class).toBe('ConfigError');
    expect(err.student_message).toMatch(/our side/i);
  });
});

describe('confirmConnect', () => {
  async function pending(): Promise<string> {
    const view = await connect.startConnect(ENR, PRJ, 'a-student/nightshift', { fetchImpl: github([repoOk()]) });
    return view.challenge!.token;
  }

  it('binds the repo once the proof file is pushed', async () => {
    const token = await pending();
    const view = await connect.confirmConnect(ENR, PRJ, { fetchImpl: github([fileWith(renderChallengeFile(token))]) });

    expect(view.state).toBe('connected');
    expect(view.method).toBe('byo');
    expect(view.owner).toBe('a-student');
    expect(view.repo).toBe('nightshift');
    expect(view.connected_at).toBeTruthy();

    const row = Conn._rows[PRJ];
    expect(row.repo_owner).toBe('a-student');
    expect(row.repo_url).toBe('https://github.com/a-student/nightshift');
    expect(connect.isWritableConnection(row)).toBe(true);
    // The spent token is not kept around to be replayed.
    expect(row.status_json.connect.challenge_token).toBeUndefined();
    // No credential of the student's is ever stored.
    expect(row.access_token_encrypted).toBe('');
  });

  it('tells the student to push when the file is not there yet', async () => {
    await pending();
    const err = await caught(() => connect.confirmConnect(ENR, PRJ, { fetchImpl: github([fileMissing]) }));
    expect(err.error_class).toBe('ChallengeNotFound');
    expect(err.student_message).toContain(CONNECT_FILE_PATH);
    expect(err.student_message).toMatch(/push/i);
    // Nothing bound on a failed proof.
    expect(Conn._rows[PRJ].repo_owner).toBeUndefined();
  });

  it('distinguishes a WRONG token from a missing file', async () => {
    await pending();
    const err = await caught(() => connect.confirmConnect(ENR, PRJ, {
      fetchImpl: github([fileWith(renderChallengeFile('f'.repeat(32)))]),
    }));
    expect(err.error_class).toBe('ChallengeMismatch');
    expect(err.student_message).toMatch(/two builds/i);
  });

  it('is idempotent — confirming twice succeeds and reads the repo only once', async () => {
    const token = await pending();
    const impl = jest.fn(github([fileWith(renderChallengeFile(token))]) as any);
    await connect.confirmConnect(ENR, PRJ, { fetchImpl: impl as any });
    const callsAfterFirst = impl.mock.calls.length;
    const again = await connect.confirmConnect(ENR, PRJ, { fetchImpl: impl as any });
    expect(again.state).toBe('connected');
    expect(impl.mock.calls.length).toBe(callsAfterFirst);
  });

  it('refuses when nothing is pending', async () => {
    const err = await caught(() => connect.confirmConnect(ENR, PRJ, { fetchImpl: github([]) }));
    expect(err.error_class).toBe('NoPendingConnect');
  });

  it('re-checks the claim at bind time, so a concurrent connect cannot double-bind', async () => {
    const token = await pending();
    // Another project claims it between start and confirm.
    Conn._seed('prj-2', { repo_owner: 'a-student', repo_name: 'nightshift', status_json: {} });
    const err = await caught(() => connect.confirmConnect(ENR, PRJ, {
      fetchImpl: github([fileWith(renderChallengeFile(token))]),
    }));
    expect(err.error_class).toBe('RepoAlreadyClaimed');
  });

  it('refuses an expired challenge rather than binding on stale proof', async () => {
    await pending();
    const row = Conn._rows[PRJ];
    row.status_json.connect.challenge_issued_at = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const err = await caught(() => connect.confirmConnect(ENR, PRJ, { fetchImpl: github([]) }));
    expect(err.error_class).toBe('ChallengeNotFound');
    expect(err.student_message).toMatch(/expired/i);
  });
});

// ── door B ──────────────────────────────────────────────────────────────────

describe('adoptProvisionedRepo', () => {
  it('creates an EMPTY repo and hands back the commands to point an existing folder at it', async () => {
    const impl = jest.fn(github([
      { match: /\/users\//, status: 200, body: { login: 'a-student' } },
      { match: /\/orgs\/[^/]+\/repos$/, status: 201, body: {} },
      { match: /\/collaborators\//, status: 201, body: {} },
    ]) as any);
    global.fetch = impl as unknown as typeof fetch;

    const view = await connect.adoptProvisionedRepo(ENR, PRJ, 'a-student');

    expect(view.state).toBe('awaiting_push');
    expect(view.method).toBe('provisioned');
    expect(view.adopt_commands?.join('\n')).toContain('git remote add origin');
    expect(view.adopt_commands?.join('\n')).toContain('git push -u origin main');

    // auto_init FALSE is what makes their first push a fast-forward instead of
    // a rejected non-fast-forward they would try to fix with --force.
    const createCall = impl.mock.calls.find((c: any[]) => /\/repos$/.test(String(c[0])));
    expect(JSON.parse(String(createCall![1].body)).auto_init).toBe(false);
    expect(JSON.parse(String(createCall![1].body)).private).toBe(true);

    // Not writable until they push — publish must take the no-repo path.
    expect(connect.isWritableConnection(Conn._rows[PRJ])).toBe(false);
  });

  it('refuses to provision over a build that is already connected', async () => {
    Conn._seed(PRJ, {
      repo_owner: 'a-student', repo_name: 'nightshift',
      status_json: { connect: { state: 'connected', method: 'byo' } },
    });
    const err = await caught(() => connect.adoptProvisionedRepo(ENR, PRJ, 'a-student'));
    expect(err.error_class).toBe('RepoRebindRefused');
    expect(err.student_message).toContain('a-student/nightshift');
  });
});

describe('markPushObserved', () => {
  it('moves awaiting_push to connected', async () => {
    Conn._seed(PRJ, {
      repo_owner: 'ColaberryIntern', repo_name: 'nightshift-abc12345',
      status_json: { connect: { state: 'awaiting_push', method: 'provisioned' } },
    });
    await connect.markPushObserved(PRJ);
    expect(Conn._rows[PRJ].status_json.connect.state).toBe('connected');
    expect(connect.isWritableConnection(Conn._rows[PRJ])).toBe(true);
  });

  it('never touches any other state', async () => {
    Conn._seed(PRJ, { status_json: { connect: { state: 'awaiting_proof', method: 'byo', owner: 'a', repo: 'b' } } });
    await connect.markPushObserved(PRJ);
    expect(Conn._rows[PRJ].status_json.connect.state).toBe('awaiting_proof');
  });

  it('is a no-op for a project with no connection row', async () => {
    await expect(connect.markPushObserved('prj-nothing')).resolves.toBeUndefined();
  });
});

// ── ownership and legacy rows ───────────────────────────────────────────────

describe('project ownership', () => {
  it.each([
    ['startConnect', () => connect.startConnect(ENR, 'prj-foreign', 'a/b', { fetchImpl: github([]) })],
    ['confirmConnect', () => connect.confirmConnect(ENR, 'prj-foreign', { fetchImpl: github([]) })],
    ['getConnectState', () => connect.getConnectState(ENR, 'prj-foreign')],
    ['adoptProvisionedRepo', () => connect.adoptProvisionedRepo(ENR, 'prj-foreign', 'a-student')],
  ])('%s refuses a foreign project as 404, indistinguishable from missing', async (_n, call) => {
    const err = await caught(call);
    expect(err.error_class).toBe('ProjectNotFound');
    expect(err.http_status).toBe(404);
  });
});

describe('isWritableConnection', () => {
  it('treats a legacy row with no connect key as writable, exactly as before', () => {
    expect(connect.isWritableConnection({
      repo_owner: 'ColaberryIntern', repo_name: 'old-one', status_json: { provisioned: true },
    })).toBe(true);
  });
  it('is false with no repo bound', () => {
    expect(connect.isWritableConnection({ status_json: {} })).toBe(false);
    expect(connect.isWritableConnection(null)).toBe(false);
  });
});

describe('getConnectState', () => {
  it('reports not_connected for a project with no row — day one, not an error', async () => {
    const view = await connect.getConnectState(ENR, PRJ);
    expect(view.state).toBe('not_connected');
    expect(view.challenge).toBeNull();
  });

  it('surfaces a lost-access marker without losing the repo pointer', async () => {
    Conn._seed(PRJ, {
      repo_owner: 'a-student', repo_name: 'nightshift',
      status_json: {
        connect: { state: 'connected', method: 'byo' },
        access: { ok: false, error_class: 'RepoNotFound', checked_at: '2026-08-14T00:00:00Z' },
      },
    });
    const view = await connect.getConnectState(ENR, PRJ);
    // Still connected. Losing read access is a reconnect prompt, not an unbind.
    expect(view.state).toBe('connected');
    expect(view.access).toEqual({ ok: false, error_class: 'RepoNotFound', checked_at: '2026-08-14T00:00:00Z' });
  });

  /**
   * A student mid-connect who comes back later is the normal case, not the edge
   * case: they paste a repo, get distracted, and reopen the workspace days on.
   * The row still says `awaiting_proof` forever, so the view — not the row — is
   * what has to notice the token died.
   */
  describe('a challenge that has aged out', () => {
    const seedAwaitingProof = (issuedAt: string) => Conn._seed(PRJ, {
      status_json: {
        connect: {
          state: 'awaiting_proof', method: 'byo',
          owner: 'a-student', repo: 'nightshift',
          url: 'https://github.com/a-student/nightshift',
          challenge_token: 'a'.repeat(32),
          challenge_issued_at: issuedAt,
        },
      },
    });

    it('still shows a LIVE token, with the commands, inside the window', async () => {
      seedAwaitingProof(new Date(Date.now() - 60_000).toISOString());
      const view = await connect.getConnectState(ENR, PRJ);
      expect(view.state).toBe('awaiting_proof');
      expect(view.challenge?.token).toBe('a'.repeat(32));
      expect(view.challenge?.commands.join('\n')).toContain('git remote add origin https://github.com/a-student/nightshift');
    });

    it('never renders a DEAD token as if it were live', async () => {
      seedAwaitingProof(new Date(Date.now() - CHALLENGE_TTL_MS - 60_000).toISOString());
      const view = await connect.getConnectState(ENR, PRJ);
      // Degraded to the paste-your-repo step, where startConnect mints a fresh
      // one. Showing the dead code would send them to run commands that cannot
      // succeed and only fail at the very end, on confirm.
      expect(view.state).toBe('not_connected');
      expect(view.challenge).toBeNull();
    });

    it('keeps the repo on the degraded view so the recovery is one click', async () => {
      seedAwaitingProof(new Date(Date.now() - CHALLENGE_TTL_MS - 60_000).toISOString());
      const view = await connect.getConnectState(ENR, PRJ);
      expect(view.url).toBe('https://github.com/a-student/nightshift');
      expect(view.owner).toBe('a-student');
    });

    it('does not write anything — reading a stale row is a read', async () => {
      const issued = new Date(Date.now() - CHALLENGE_TTL_MS - 60_000).toISOString();
      seedAwaitingProof(issued);
      await connect.getConnectState(ENR, PRJ);
      // The token stays on the row. Only startConnect mints, and only confirm spends.
      expect(Conn._rows[PRJ].status_json.connect.challenge_token).toBe('a'.repeat(32));
      expect(Conn._rows[PRJ].status_json.connect.state).toBe('awaiting_proof');
    });
  });
});

/**
 * ── PULL-ONLY IS A REAL ANSWER, AND THE PLATFORM HAS TO SAY IT ───────────────
 *
 * `fetchRepoFacts` has always returned `platform_can_push`. Nothing read it.
 * `confirmConnect` stamped `provisioned: true` on every repo whose proof file
 * landed, so a connection the platform holds READ access to was recorded — and
 * reported — as a fully working one.
 *
 * The consequences are all silent. No managed block in their CLAUDE.md, no
 * seeded `.colaberry/progress.json`, no doc refresh on sync. Their agent then
 * has nothing in-repo to copy the contract from and invents a shape the reader
 * rejects. On production, 4 of the 5 live workspace connections were in exactly
 * this state (2026-08-17).
 *
 * A repo we cannot write is a legitimate choice. Recording it as one we can is
 * not.
 */
describe('connecting a repo the platform cannot push to', () => {
  const pending = async (repo: ReturnType<typeof repoOk>): Promise<string> => {
    const view = await connect.startConnect(ENR, PRJ, 'a-student/nightshift', { fetchImpl: github([repo]) });
    return view.challenge!.token;
  };
  const confirmWith = async (token: string) =>
    connect.confirmConnect(ENR, PRJ, { fetchImpl: github([fileWith(renderChallengeFile(token))]) });

  it('records the permission at connect instead of assuming it', async () => {
    await pending(repoPullOnly());
    // Captured at the only moment the platform reads the repo's own metadata.
    expect(Conn._rows[PRJ].status_json.connect.platform_can_push).toBe(false);
  });

  it('still binds the repo and still reports connected — reading works', async () => {
    const view = await confirmWith(await pending(repoPullOnly()));
    expect(view.state).toBe('connected');
    expect(Conn._rows[PRJ].repo_owner).toBe('a-student');
  });

  it('does NOT record provisioned: true for a repo it cannot write', async () => {
    await confirmWith(await pending(repoPullOnly()));
    expect(Conn._rows[PRJ].status_json.provisioned).toBe(false);
  });

  it('surfaces the access level on the view, so the panel can say what it means', async () => {
    const view = await confirmWith(await pending(repoPullOnly()));
    expect(view.write_access).toBe('pull_only');
  });

  it('refuses to hand a pull-only repo to the writer', async () => {
    await confirmWith(await pending(repoPullOnly()));
    // repoForProject gates on this. Returning true here means every publish and
    // every sync tries a commit that GitHub will refuse.
    expect(connect.isWritableConnection(Conn._rows[PRJ])).toBe(false);
  });

  it('a repo the platform CAN push is unchanged in every one of those respects', async () => {
    const view = await confirmWith(await pending(repoOk()));
    expect(view.state).toBe('connected');
    expect(view.write_access).toBe('push');
    expect(Conn._rows[PRJ].status_json.provisioned).toBe(true);
    expect(Conn._rows[PRJ].status_json.connect.platform_can_push).toBe(true);
    expect(connect.isWritableConnection(Conn._rows[PRJ])).toBe(true);
  });

  it('leaves a connection that predates permission capture exactly as it was', async () => {
    // Every row connected before this shipped. Withdrawing write access on a
    // guess would break working builds to fix a reporting problem.
    Conn._seed(PRJ, {
      repo_owner: 'a-student', repo_name: 'nightshift',
      status_json: { provisioned: true, connect: { state: 'connected', method: 'byo' } },
    });
    expect(connect.isWritableConnection(Conn._rows[PRJ])).toBe(true);
    expect((await connect.getConnectState(ENR, PRJ)).write_access).toBeNull();
  });
});
