/**
 * WorkspaceRepoPanel — Door B says, before the student presses it, that the
 * repo it is about to create is PUBLIC.
 *
 * This panel used to promise the opposite: "The platform will create an empty
 * private repo and add you to it." That single word was the student-facing half
 * of a contradiction that ran through the whole product — the provisioning code
 * really did send `private: true`, while the webhook panel warned in bold that
 * "your repo is public", STORY-000's prompt asserted "This repo is public", and
 * GitHub Pages then refused to publish the Command Center on the final step of
 * the first story because a free account cannot serve one from a private repo.
 *
 * Ali Muwwakkil decided on 2026-08-19 to provision public and make every
 * document match. Flipping the boolean without the copy would have been the
 * more dangerous half of the job: a student who has been told the repo is
 * private will put a `.env` in it. So the warning is a tested part of the
 * panel, not a nicety, and it has to appear BEFORE the button rather than after
 * the push that publishes the folder.
 *
 * Kept in its own file rather than added to WorkspaceRepoPanel.test.tsx because
 * that file is owned by an open PR at the time of writing.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';

// Plain functions where CRA's resetMocks would otherwise strip implementations.
jest.mock('../../../../services/workspaceRepoApi', () => ({
  __esModule: true,
  startRepoConnect: () => Promise.resolve(null),
  confirmRepoConnect: () => Promise.resolve(null),
  provisionWorkspaceRepo: () => Promise.resolve(null),
  syncWorkspaceRepo: () => Promise.resolve(null),
  downloadDocsBundle: () => Promise.resolve({ blob: new Blob(), filename: 'x.zip' }),
  // An unconfigured platform is the honest default here: the webhook block then
  // renders nothing and cannot contribute its own "public" wording to the
  // assertions below, so what they read is Door B's copy alone.
  getWebhookSetup: () => Promise.reject(new Error('not configured')),
  connectErrorOf: (_e: unknown, fallback: string) => ({ error: fallback, error_class: null }),
}));

import WorkspaceRepoPanel from '../WorkspaceRepoPanel';
import { WorkspaceRepoView, ConnectStateView } from '../../../../services/workspaceRepoApi';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

const buttonSaying = (text: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll('button'))
    .find((b) => (b.textContent || '').trim() === text);

const textOf = (): string => (container.textContent || '').replace(/\s+/g, ' ');

/** Mount, then open Door B — the fallback for a folder not yet on GitHub. */
async function openDoorB() {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <WorkspaceRepoPanel
        projectId="p1"
        repo={view()}
        onRepoChange={() => { /* not under test */ }}
        onConnectChange={() => { /* not under test */ }}
      />,
    );
  });
  await act(async () => { buttonSaying('My folder is not on GitHub yet')!.click(); });
}

describe('Door B states the repo will be public', () => {
  it('does not promise a private repo', async () => {
    await openDoorB();
    expect(textOf()).not.toMatch(/private repo/i);
  });

  it('says public, in the sentence describing what will be created', async () => {
    await openDoorB();
    expect(textOf()).toMatch(/empty public repo/i);
  });

  it('warns that anyone can read it and names what must never be committed', async () => {
    await openDoorB();
    const text = textOf();
    expect(text).toMatch(/anyone on the internet can read it/i);
    // Naming the artifacts beats an abstract "keep secrets out": the student who
    // leaks one is usually not thinking of it as a secret.
    expect(text).toMatch(/API key/i);
    expect(text).toMatch(/\.env/);
  });

  it('puts the warning before the create button, not after it', async () => {
    await openDoorB();
    const warn = container.querySelector('.rt-hook-warn');
    const create = buttonSaying('Create an empty repo');
    expect(warn).toBeTruthy();
    expect(create).toBeTruthy();
    // A student who reads this after pushing has already published the folder.
    // DOCUMENT_POSITION_FOLLOWING === the button comes after the warning.
    // eslint-disable-next-line no-bitwise
    const buttonIsAfter = Boolean(
      warn!.compareDocumentPosition(create!) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(buttonIsAfter).toBe(true);
  });
});
