import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { BuildArtifactCards, BuildArtifactViewer } from '../BuildArtifactCards';
import type { GovSubmittedArtifact } from '../../../../../services/govProjectPortalApi';

/**
 * No RTL in this repo (same react-dom/client + act convention as the other studio tests). These assert the
 * behaviours that matter: a submitted artifact becomes a typed card, HTML renders in a SANDBOXED iframe from
 * fetched text (never on our origin), Markdown renders as text, and a non-viewable kind offers a download
 * without fetching on open.
 */

let container: HTMLDivElement; let root: Root;
async function render(node: React.ReactElement) { await act(async () => { root.render(node); }); }
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const HTML_ART: GovSubmittedArtifact = { id: 'a1', title: 'Project overview', name: 'project-overview.html', kind: 'html', repoPath: 'docs/project-overview.html' };
const MD_ART: GovSubmittedArtifact = { id: 'a2', title: 'Test report', name: 'TEST-REPORT.md', kind: 'markdown', repoPath: 'docs/TEST-REPORT.md' };
const OTHER_ART: GovSubmittedArtifact = { id: 'a3', title: 'Archive', name: 'bundle.zip', kind: 'other', repoPath: 'dist/bundle.zip' };

/** A stand-in Blob whose only use here is .text(); avoids jsdom Blob/createObjectURL gaps. */
const blob = (text: string) => ({ text: async () => text } as unknown as Blob);

describe('BuildArtifactCards', () => {
  it('renders one typed card per submitted artifact', async () => {
    await render(<BuildArtifactCards artifacts={[HTML_ART, MD_ART]} onOpen={() => {}} />);
    const cards = container.querySelectorAll('[data-testid="ev-build-artifact-card"]');
    expect(cards.length).toBe(2);
    expect(Array.from(cards).map((c) => c.getAttribute('data-kind')).sort()).toEqual(['html', 'markdown']);
  });
});

describe('BuildArtifactViewer', () => {
  it('renders an HTML artifact in a sandboxed iframe from the fetched text', async () => {
    const fetchFile = jest.fn().mockResolvedValue(blob('<h1>hello from the repo</h1>'));
    await render(<BuildArtifactViewer artifact={HTML_ART} fetchFile={fetchFile} onClose={() => {}} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const frame = container.querySelector('[data-testid="ev-build-artifact-frame"]') as HTMLIFrameElement | null;
    expect(frame).not.toBeNull();
    expect(frame!.getAttribute('srcdoc')).toContain('hello from the repo');
    expect(frame!.getAttribute('sandbox')).toBe(''); // empty sandbox: no scripts, no same-origin
    expect(fetchFile).toHaveBeenCalledWith('a1');
  });

  it('renders a Markdown artifact as text', async () => {
    const fetchFile = jest.fn().mockResolvedValue(blob('# Test Report\nAll passing.'));
    await render(<BuildArtifactViewer artifact={MD_ART} fetchFile={fetchFile} onClose={() => {}} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const pre = container.querySelector('[data-testid="ev-build-artifact-text"]');
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain('All passing.');
  });

  it('offers a download for a non-viewable kind and does not fetch on open', async () => {
    const fetchFile = jest.fn();
    await render(<BuildArtifactViewer artifact={OTHER_ART} fetchFile={fetchFile} onClose={() => {}} />);
    expect(container.querySelector('[data-testid="ev-build-artifact-download"]')).not.toBeNull();
    expect(fetchFile).not.toHaveBeenCalled();
  });
});
