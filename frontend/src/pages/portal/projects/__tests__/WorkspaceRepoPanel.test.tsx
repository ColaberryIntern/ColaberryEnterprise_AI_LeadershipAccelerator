/**
 * WorkspaceRepoPanel — what a student SEES at each step of connecting the
 * folder they already have.
 *
 * The copy is the feature here, not decoration. A student on day one has a
 * folder open in another window; a panel that says "create a repo" or "clone"
 * sends them to start over and produces the two-homes-for-one-project failure
 * this step exists to end. So these tests assert on the words.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';

const mockStart = jest.fn();
const mockConfirm = jest.fn();
const mockProvision = jest.fn();
const mockSync = jest.fn();
const mockDownload = jest.fn();

// Plain functions where CRA's resetMocks would otherwise strip implementations.
jest.mock('../../../../services/workspaceRepoApi', () => ({
  __esModule: true,
  startRepoConnect: (...a: unknown[]) => mockStart(...a),
  confirmRepoConnect: (...a: unknown[]) => mockConfirm(...a),
  provisionWorkspaceRepo: (...a: unknown[]) => mockProvision(...a),
  syncWorkspaceRepo: (...a: unknown[]) => mockSync(...a),
  downloadDocsBundle: (...a: unknown[]) => mockDownload(...a),
  // The webhook block fetches its own setup. Rejecting is the honest default
  // for these tests: an unconfigured platform is exactly the case where the
  // block must render nothing and leave the student with the Sync button.
  getWebhookSetup: () => Promise.reject(new Error('not configured')),
  connectErrorOf: (err: any, fallback: string) => {
    const data = err?.response?.data;
    return data?.error
      ? { error: data.error, error_class: data.error_class ?? null, details: data.details }
      : { error: fallback, error_class: null };
  },
}));

import WorkspaceRepoPanel from '../WorkspaceRepoPanel';
import { WorkspaceRepoView, ConnectStateView } from '../../../../services/workspaceRepoApi';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const onRepoChange = jest.fn();
const onConnectChange = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockStart.mockReset(); mockConfirm.mockReset(); mockProvision.mockReset();
  mockSync.mockReset(); mockDownload.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

const connectState = (over: Partial<ConnectStateView> = {}): ConnectStateView => ({
  state: 'not_connected', method: null, owner: null, repo: null, url: null,
  private: null, default_branch: null, challenge: null, adopt_commands: null,
  write_access: null, access: null, connected_at: null, ...over,
});

const view = (over: Partial<WorkspaceRepoView> = {}): WorkspaceRepoView => ({
  connected: false, provisioned: false, repo_url: null, repo_owner: null, repo_name: null,
  student_github_login: null, file_count: null, last_sync: null, recent_commits: [],
  connect: connectState(), ...over,
});

async function mount(repo: WorkspaceRepoView | null) {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <WorkspaceRepoPanel
        projectId="p1"
        repo={repo}
        onRepoChange={onRepoChange}
        onConnectChange={onConnectChange}
      />,
    );
  });
}

const text = () => container.textContent ?? '';
const buttons = () => Array.from(container.querySelectorAll('button'));
const buttonNamed = (label: string) =>
  buttons().find((b) => (b.textContent ?? '').toLowerCase().includes(label.toLowerCase()));
const click = async (label: string) => {
  await act(async () => { buttonNamed(label)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const type = async (placeholderFragment: string, value: string) => {
  const input = Array.from(container.querySelectorAll('input'))
    .find((i) => (i.placeholder ?? '').includes(placeholderFragment))!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

// ── day one ─────────────────────────────────────────────────────────────────

describe('a student whose challenge expired while they were away', () => {
  const repoInput = () => Array.from(container.querySelectorAll('input'))
    .find((i) => (i.placeholder ?? '').includes('github.com'));

  /**
   * The backend degrades an expired `awaiting_proof` to `not_connected` but
   * keeps owner/repo/url on the view. That is only useful if the panel offers
   * the repo back: otherwise the student is asked to retype an address they
   * already gave us, having been shown nothing about why.
   */
  it('offers their repo back, pre-filled, so reconnecting is one click', async () => {
    await mount(view({
      connect: connectState({ owner: 'me', repo: 'nightshift', url: 'https://github.com/me/nightshift' }),
    }));
    expect(repoInput()!.value).toBe('https://github.com/me/nightshift');
    expect(buttonNamed('Connect this repo')).toBeDefined();
  });

  it('leaves the box empty when there is no repo to offer', async () => {
    await mount(view());
    expect(repoInput()!.value).toBe('');
  });

  it('does not fight the student for the field once they edit it', async () => {
    await mount(view({ connect: connectState({ url: 'https://github.com/me/nightshift' }) }));
    await type('github.com', 'https://github.com/me/a-different-repo');
    expect(repoInput()!.value).toBe('https://github.com/me/a-different-repo');
  });
});

describe('a student with a folder and no connection', () => {
  it('leads with connecting the repo they already have', async () => {
    await mount(view());

    expect(text()).toContain('Connect your project folder');
    expect(text()).toMatch(/You already have a folder for this build/);
    // Bring-your-own is the PRIMARY action, and it is the one styled as primary.
    expect(buttonNamed('Connect this repo')!.className).toContain('pri');
  });

  it('never tells them to start over', async () => {
    await mount(view());
    const copy = text().toLowerCase();
    for (const forbidden of ['git clone', 'start a new project', 'create a new project']) {
      expect(copy).not.toContain(forbidden);
    }
  });

  it('says the repo stays theirs and names exactly what the platform writes', async () => {
    await mount(view());
    expect(text()).toMatch(/the repo stays yours/i);
    expect(text()).toMatch(/never your code/i);
    expect(text()).toContain('CLAUDE.md');
    expect(text()).toContain('docs/');
    expect(text()).toContain('.colaberry/');
  });

  it('folds provisioning away as the fallback it now is', async () => {
    await mount(view());
    // Not visible until asked for, so it cannot compete with the primary path.
    expect(container.querySelector('input[placeholder="your-github-username"]')).toBeNull();

    await click('My folder is not on GitHub yet');
    expect(container.querySelector('input[placeholder="your-github-username"]')).not.toBeNull();
    // And even the fallback adopts the existing folder rather than starting one.
    expect(text()).toMatch(/push your existing folder into it/i);
    expect(text()).toMatch(/empty/i);
  });

  it('offers the download and states plainly what it cannot do', async () => {
    await mount(view());
    expect(text()).toMatch(/no points are awarded/i);
    expect(text()).toMatch(/cannot be verified/i);
    expect(buttonNamed('Download the documents')).toBeDefined();
  });

  it('sends the pasted reference verbatim, without confirm_replace', async () => {
    mockStart.mockResolvedValue(connectState({ state: 'awaiting_proof' }));
    await mount(view());

    await type('https://github.com/you/', 'https://github.com/me/nightshift');
    await click('Connect this repo');

    expect(mockStart).toHaveBeenCalledWith('p1', 'https://github.com/me/nightshift', false);
    expect(onConnectChange).toHaveBeenCalled();
  });
});

// ── rejections ──────────────────────────────────────────────────────────────

describe('rejections are specific and actionable', () => {
  it('shows the backend\'s own sentence, not a generic failure', async () => {
    mockStart.mockRejectedValue({
      response: { data: { error: 'The platform cannot see github.com/me/typo. Either the address is wrong, or the repo is private.', error_class: 'RepoNotFound' } },
    });
    await mount(view());
    await type('https://github.com/you/', 'me/typo');
    await click('Connect this repo');

    expect(text()).toContain('Either the address is wrong, or the repo is private');
  });

  it('offers an explicit confirm when a rebind is refused, rather than a dead end', async () => {
    mockStart.mockRejectedValueOnce({
      response: { data: { error: 'That repo has commits in it.', error_class: 'RepoRebindRefused' } },
    });
    await mount(view());
    await type('https://github.com/you/', 'me/second');
    await click('Connect this repo');

    const confirmBtn = buttonNamed('Move this build to the new repo anyway');
    expect(confirmBtn).toBeDefined();

    mockStart.mockResolvedValueOnce(connectState({ state: 'awaiting_proof' }));
    await click('Move this build to the new repo anyway');
    // The retry is the ONLY place confirm_replace is ever true.
    expect(mockStart).toHaveBeenLastCalledWith('p1', 'me/second', true);
  });

  it('does not offer that confirm for any other failure', async () => {
    mockStart.mockRejectedValue({
      response: { data: { error: 'Already claimed.', error_class: 'RepoAlreadyClaimed' } },
    });
    await mount(view());
    await type('https://github.com/you/', 'me/taken');
    await click('Connect this repo');

    expect(buttonNamed('anyway')).toBeUndefined();
  });
});

// ── the two proof steps ─────────────────────────────────────────────────────

describe('door A — proving the push', () => {
  const awaitingProof = view({
    connect: connectState({
      state: 'awaiting_proof', method: 'byo', owner: 'me', repo: 'nightshift',
      challenge: {
        path: '.colaberry/connect.txt',
        token: 'a'.repeat(32),
        file_content: 'x',
        commands: ['mkdir -p .colaberry', 'echo "aaa" > .colaberry/connect.txt', 'git push'],
      },
    }),
  });

  it('shows the commands to run in the folder they already have', async () => {
    await mount(awaitingProof);
    expect(text()).toMatch(/Run in your project folder/i);
    expect(text()).toContain('git push');
    expect(buttonNamed("I've pushed")).toBeDefined();
  });

  /**
   * This copy used to promise "Nothing else in your folder is touched". It was
   * false: the commands `git add -A` and the first push carries every untracked
   * file with it. On a folder holding two weeks of class work — and, in the case
   * that found this, pointed at a PUBLIC repo — the gap between that sentence
   * and the behaviour is how a student uploads a .env without knowing.
   */
  it('warns that the first push carries the whole folder, and never claims otherwise', async () => {
    await mount(awaitingProof);
    expect(text()).toMatch(/uploads everything in the folder/i);
    expect(text()).toMatch(/git status/i);
    expect(text()).not.toMatch(/Nothing else in your folder is touched/i);
  });

  it('confirms by project alone', async () => {
    mockConfirm.mockResolvedValue(connectState({ state: 'connected', owner: 'me', repo: 'nightshift' }));
    await mount(awaitingProof);
    await click("I've pushed");
    expect(mockConfirm).toHaveBeenCalledWith('p1');
  });

  it('lets them back out to a different repo without losing the panel', async () => {
    await mount(awaitingProof);
    await click('Use a different repo');
    expect(onConnectChange).toHaveBeenCalledWith(expect.objectContaining({ state: 'not_connected' }));
  });
});

describe('door B — pointing the existing folder at a new empty repo', () => {
  const awaitingPush = view({
    connect: connectState({
      state: 'awaiting_push', method: 'provisioned', owner: 'ColaberryIntern', repo: 'nightshift-abc12345',
      url: 'https://github.com/ColaberryIntern/nightshift-abc12345',
      adopt_commands: ['git remote add origin https://github.com/ColaberryIntern/nightshift-abc12345', 'git branch -M main', 'git push -u origin main'],
    }),
  });

  it('promises the history survives and shows the remote commands', async () => {
    await mount(awaitingPush);
    expect(text()).toMatch(/your files and your whole history go up exactly as they are/i);
    expect(text()).toMatch(/Nothing is overwritten and nothing is forced/i);
    expect(text()).toContain('git push -u origin main');
  });

  it('checks by syncing, which is what observes their first push', async () => {
    mockSync.mockResolvedValue(view({ connected: true }));
    await mount(awaitingPush);
    await click("I've pushed");
    expect(mockSync).toHaveBeenCalledWith('p1');
  });
});

// ── connected, and connected-but-unreadable ─────────────────────────────────

describe('once connected', () => {
  const connected = view({
    connected: true, provisioned: true, repo_owner: 'me', repo_name: 'nightshift',
    repo_url: 'https://github.com/me/nightshift', file_count: 42,
    connect: connectState({ state: 'connected', method: 'byo', owner: 'me', repo: 'nightshift' }),
  });

  it('links the repo and offers a sync', async () => {
    await mount(connected);
    expect(container.querySelector('a[href="https://github.com/me/nightshift"]')).not.toBeNull();
    expect(text()).toContain('42 files');
    expect(buttonNamed('Sync from GitHub')).toBeDefined();
  });

  it('treats lost access as a reconnect prompt AND promises verified work survives', async () => {
    await mount(view({
      ...connected,
      connect: connectState({
        state: 'connected', method: 'byo', owner: 'me', repo: 'nightshift',
        access: { ok: false, error_class: 'RepoNotFound', checked_at: '2026-08-14T00:00:00Z' },
      }),
    }));

    expect(text()).toMatch(/cannot read this repo/i);
    // The load-bearing promise: evidence lives in our tables, not in the repo.
    expect(text()).toMatch(/already had verified stays exactly as it is/i);
    expect(buttonNamed('Reconnect')).toBeDefined();
  });
});

/**
 * ── A READ-ONLY CONNECTION HAS TO SAY SO ────────────────────────────────────
 *
 * The platform can hold `pull` and not `push` on a student's repo, and until
 * 2026-08-17 nothing said which it had: `confirmConnect` stamped
 * `provisioned: true` regardless and the panel rendered an ordinary connected
 * repo. The student's experience of that is a connection that looks fine and
 * quietly never receives anything — no managed block in their CLAUDE.md, no
 * seeded `.colaberry/progress.json` — so their agent invents a progress file
 * shape the platform's reader rejects, and the portal reports nothing useful.
 *
 * The copy is the fix. It has to say what the platform CANNOT do, name the one
 * file that becomes theirs, and point at where the exact contents live.
 */
describe('a repo the platform can only read', () => {
  const connected = (writeAccess: 'push' | 'pull_only' | null) => view({
    connected: true, provisioned: writeAccess !== 'pull_only',
    repo_owner: 'me', repo_name: 'nightshift', repo_url: 'https://github.com/me/nightshift',
    connect: connectState({
      state: 'connected', method: 'byo', owner: 'me', repo: 'nightshift',
      url: 'https://github.com/me/nightshift', write_access: writeAccess,
    }),
  });

  it('states the access level plainly rather than leaving it to be discovered', async () => {
    await mount(connected('pull_only'));
    expect(text()).toContain('The platform has read-only access to this repo');
  });

  it('names the file that is now the student\'s to create, and where to get it', async () => {
    await mount(connected('pull_only'));
    expect(text()).toContain('.colaberry/progress.json');
    expect(text()).toContain('STORY-000');
  });

  it('does not present it as a failure — verification still works either way', async () => {
    await mount(connected('pull_only'));
    // The reassurance is load-bearing: a student who reads this as broken will
    // go looking for a problem that is not there.
    expect(text()).toContain('confirms your stories exactly as normal');
    // And the repo is still connected, with its Sync button.
    expect(buttonNamed('Sync from GitHub')).toBeDefined();
  });

  it('offers the way out, for a student who would rather we maintained it', async () => {
    await mount(connected('pull_only'));
    expect(text()).toContain('write access and reconnect');
  });

  it('says NOTHING of the sort on a repo the platform can write', async () => {
    await mount(connected('push'));
    expect(text()).not.toContain('read-only access');
  });

  it('says nothing on a connection made before the permission was recorded', async () => {
    // `null` is every pre-existing row. Guessing "pull_only" there would put a
    // false warning on working builds.
    await mount(connected(null));
    expect(text()).not.toContain('read-only access');
  });
});

/*
 * ── A CONNECTED STUDENT STILL NEEDS THEIR .colaberry FILES ──────────────────
 *
 * STORY-000 criteria 3 and 4 require the Command Center to read
 * `.colaberry/plan.json` and `.colaberry/manifest.json` at runtime. The prompt
 * tells the student those files are "committed by the platform" and rewritten
 * on every sync. On a repo we cannot push to, that never happens: the write
 * fails at the GitHub boundary and the two files simply never arrive.
 *
 * The only surface that hands a student those exact files is the document
 * bundle, and it was offered ONLY in the `not_connected` branch — so connecting
 * a repo removed the one way to obtain them. A student who connected correctly
 * was strictly worse off than one who had not, and had no route to the files at
 * all. Confirmed live on 2026-08-18: a student sat at 3 of 5 with the two
 * outstanding criteria pointing at files absent from their repo.
 *
 * The download is therefore offered whenever a repo is connected too. It costs
 * nothing on a repo we can write, and it is the whole answer on one we cannot.
 */
describe('a connected student who needs the data files the platform could not write', () => {
  const connectedRepo = (writeAccess: 'push' | 'pull_only' | null = null) => view({
    connected: true, provisioned: true,
    repo_owner: 'me', repo_name: 'nightshift', repo_url: 'https://github.com/me/nightshift',
    connect: connectState({
      state: 'connected', method: 'byo', owner: 'me', repo: 'nightshift',
      url: 'https://github.com/me/nightshift', write_access: writeAccess,
    }),
  });

  it('can still reach the documents after connecting, not only before', async () => {
    await mount(connectedRepo());
    expect(buttonNamed('Download the documents')).toBeDefined();
  });

  it('hands back the same bundle, for this project', async () => {
    mockDownload.mockResolvedValue({ blob: new Blob(['x']), filename: 'build-docs.zip' });
    await mount(connectedRepo());
    await click('Download the documents');
    expect(mockDownload).toHaveBeenCalledWith('p1');
  });

  it('keeps Sync as the primary action rather than displacing it', async () => {
    await mount(connectedRepo());
    expect(buttonNamed('Sync from GitHub')).toBeDefined();
  });

  it('names every file that becomes the student\'s on a read-only repo, not just progress.json', async () => {
    // progress.json was the only one named. Criteria 3 and 4 are scored against
    // the other two, so a student told about one file of three cannot finish.
    await mount(connectedRepo('pull_only'));
    expect(text()).toContain('.colaberry/progress.json');
    expect(text()).toContain('.colaberry/plan.json');
    expect(text()).toContain('.colaberry/manifest.json');
  });
});
