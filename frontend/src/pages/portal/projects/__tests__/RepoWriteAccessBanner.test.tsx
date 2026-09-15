/**
 * The banner a student sees when the platform can read their repo but not
 * write to it. Measured 2026-09-15: 14 of 26 active students with a repo were
 * in this state and the only signal was a chip with a tooltip.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import RepoWriteAccessBanner, { collaboratorsUrl, PLATFORM_GITHUB_LOGIN } from '../RepoWriteAccessBanner';

let container: HTMLDivElement;
let root: Root | null = null;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { if (root) { act(() => { root!.unmount(); }); root = null; } container.remove(); });

function mount(props: React.ComponentProps<typeof RepoWriteAccessBanner>) {
  const r = createRoot(container);
  root = r;
  act(() => { r.render(<RepoWriteAccessBanner {...props} />); });
}

describe('collaboratorsUrl — the link goes to the exact page on GitHub', () => {
  it('maps a repo url to its collaborators settings page', () => {
    expect(collaboratorsUrl('https://github.com/Martin2100-AI/Architect-Workspace'))
      .toBe('https://github.com/Martin2100-AI/Architect-Workspace/settings/access');
  });
  it('drops a .git suffix and tolerates a trailing path', () => {
    expect(collaboratorsUrl('https://github.com/o/r.git')).toBe('https://github.com/o/r/settings/access');
    expect(collaboratorsUrl('https://github.com/o/r/tree/main')).toBe('https://github.com/o/r/settings/access');
  });
  it('returns null for anything that is not a GitHub repo url', () => {
    expect(collaboratorsUrl(null)).toBeNull();
    expect(collaboratorsUrl('')).toBeNull();
    expect(collaboratorsUrl('https://gitlab.com/o/r')).toBeNull();
  });
});

describe('RepoWriteAccessBanner', () => {
  it('renders nothing unless the recorded state is blocked', () => {
    // 'unknown' and 'no_repo' are expected states for weeks 1-3; a banner that
    // cried wolf there would get the real one ignored.
    for (const state of ['ok', 'unknown', 'no_repo', undefined, null]) {
      mount({ state, repoUrl: 'https://github.com/o/r' });
      expect(container.textContent).toBe('');
      act(() => { root!.unmount(); }); root = null;
    }
  });

  it('names the account, the access level, and links straight to the page', () => {
    mount({ state: 'blocked', repoUrl: 'https://github.com/Martin2100-AI/Architect-Workspace' });
    expect(container.textContent).toContain(PLATFORM_GITHUB_LOGIN);
    expect(container.textContent).toMatch(/Write/);
    const a = container.querySelector('a[href="https://github.com/Martin2100-AI/Architect-Workspace/settings/access"]');
    expect(a).toBeTruthy();
    expect(a?.getAttribute('target')).toBe('_blank');
  });

  it('says what is actually broken in the words the student used', () => {
    // "my command center not synced" — the banner has to connect that symptom to this cause.
    mount({ state: 'blocked', repoUrl: 'https://github.com/o/r' });
    expect(container.textContent).toMatch(/Command Center/);
    expect(container.textContent).toMatch(/cannot write/i);
    expect(container.textContent).toMatch(/Nothing you have built is lost/);
  });

  it('still gives the steps when the repo url is unknown, without a dead link', () => {
    mount({ state: 'blocked', repoUrl: null });
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toMatch(/Settings/);
    expect(container.textContent).toMatch(/Collaborators/);
  });

  it('explains the seven-day expiry, because "I already added it" is the common reply', () => {
    mount({ state: 'blocked', repoUrl: 'https://github.com/o/r' });
    expect(container.textContent).toMatch(/seven days/);
    expect(container.textContent).toMatch(/Add it again/);
  });

  it('offers the workspace when a way there is provided', () => {
    const open = jest.fn();
    mount({ state: 'blocked', repoUrl: 'https://github.com/o/r', onOpenWorkspace: open });
    const btn = Array.from(container.querySelectorAll('button')).find((b) => /workspace/i.test(b.textContent || ''));
    expect(btn).toBeTruthy();
    act(() => { btn!.click(); });
    expect(open).toHaveBeenCalledTimes(1);
  });
});
