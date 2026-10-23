import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ShareSheet, { captionFor, publicSlots, shareLabel } from '../ShareSheet';
import type { PortfolioSlot } from '../presentationApi';

/**
 * SHARING OFF-PLATFORM.
 *
 * The thing worth guarding here is not the markup, it is the gate: only a video
 * the learner has actually made public may appear in this sheet. A private take
 * leaking into a share panel would be the product handing someone a path to
 * posting a recording they chose to keep to themselves.
 */

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

const slot = (over: Partial<PortfolioSlot>): PortfolioSlot => ({
  typeId: 'project_introduction',
  typeLabel: 'Project introduction',
  timing: '1.5 min',
  description: 'Explain what your project is for.',
  prominent: true,
  recorded: true,
  recordingId: 'rec-1',
  takeCount: 1,
  durationSeconds: 90,
  recordedAt: '2026-10-20T15:04:00.000Z',
  playbackUrl: '/play',
  thumbnailUrl: '/thumb',
  downloadUrl: '/download',
  shareState: 'published',
  showcaseId: 'show-1',
  viewCount: 3,
  viewLabel: '3 people have watched it',
  ...over,
});

const PUBLIC_INTRO = slot({});
const PUBLIC_DEMO = slot({
  typeId: 'working_system_demo', typeLabel: 'Working-system demo', shareState: 'published', recordingId: 'rec-2',
});
const PRIVATE_DECK = slot({
  typeId: 'ai_visual_presentation', typeLabel: 'AI visual presentation', shareState: 'private', showcaseId: null,
});
const PENDING_SHOWCASE = slot({
  typeId: 'final_showcase', typeLabel: 'Final showcase', shareState: 'pending',
});
const UNRECORDED = slot({
  typeId: 'client_handoff', typeLabel: 'Client handoff', recorded: false, recordingId: null, shareState: 'private',
});

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const render = (slots: PortfolioSlot[], copy?: (t: string) => Promise<void>) => {
  act(() => {
    const r = createRoot(container);
    root = r;
    r.render(<ShareSheet slots={slots} copy={copy} />);
  });
};

const click = (testid: string) => {
  const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null;
  act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return el;
};

const q = (testid: string) => container.querySelector(`[data-testid="${testid}"]`);

describe('publicSlots — the gate', () => {
  it('keeps only published recordings', () => {
    const kept = publicSlots([PUBLIC_INTRO, PRIVATE_DECK, PENDING_SHOWCASE, UNRECORDED, PUBLIC_DEMO]);
    expect(kept.map((s) => s.typeId)).toEqual(['project_introduction', 'working_system_demo']);
  });

  it('excludes a showcase still awaiting staff approval', () => {
    expect(publicSlots([PENDING_SHOWCASE])).toEqual([]);
  });

  it('excludes a slot that is published but has no recording', () => {
    expect(publicSlots([slot({ recorded: false })])).toEqual([]);
  });
});

describe('shareLabel', () => {
  it.each([
    [0, 'Share videos'],
    [1, 'Share 1 public video'],
    [2, 'Share 2 public videos'],
    [7, 'Share 7 public videos'],
  ])('reads %i as "%s"', (n, expected) => {
    expect(shareLabel(n)).toBe(expected);
  });
});

describe('ShareSheet', () => {
  it('disables the button and explains why when nothing is public', () => {
    render([PRIVATE_DECK, UNRECORDED]);
    const btn = q('ps-share-open') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Share videos');
    expect(q('ps-share-none')?.textContent).toContain('Nothing is public yet');
    expect(q('ps-share-sheet')).toBeNull();
  });

  it('opens a row per public video, and none for the private ones', () => {
    render([PUBLIC_INTRO, PRIVATE_DECK, PENDING_SHOWCASE, PUBLIC_DEMO]);
    expect((q('ps-share-open') as HTMLButtonElement).textContent).toBe('Share 2 public videos');

    click('ps-share-open');

    expect(q('ps-share-row-project_introduction')).not.toBeNull();
    expect(q('ps-share-row-working_system_demo')).not.toBeNull();
    expect(q('ps-share-row-ai_visual_presentation')).toBeNull();
    expect(q('ps-share-row-final_showcase')).toBeNull();
  });

  it('toggles shut again', () => {
    render([PUBLIC_INTRO]);
    click('ps-share-open');
    expect(q('ps-share-sheet')).not.toBeNull();
    click('ps-share-open');
    expect(q('ps-share-sheet')).toBeNull();
  });

  it('points the composer links at the platform with the caption encoded', () => {
    render([PUBLIC_INTRO]);
    click('ps-share-open');

    const li = q('ps-share-linkedin-project_introduction') as HTMLAnchorElement;
    const x = q('ps-share-x-project_introduction') as HTMLAnchorElement;
    const caption = captionFor('Project introduction');

    expect(li.href).toContain('linkedin.com');
    expect(li.href).toContain(encodeURIComponent(caption));
    expect(x.href).toContain('twitter.com/intent/tweet');
    expect(x.href).toContain(encodeURIComponent(caption));
    // A composer opened over the portal would lose the learner's work in progress.
    expect(li.target).toBe('_blank');
    expect(li.rel).toContain('noopener');
  });

  it('offers the file itself, because that is what a platform can actually play', () => {
    render([PUBLIC_INTRO]);
    click('ps-share-open');
    const dl = q('ps-share-download-project_introduction') as HTMLAnchorElement;
    expect(dl.getAttribute('href')).toBe('/download');
  });

  it('confirms a copied caption', async () => {
    const copy = jest.fn().mockResolvedValue(undefined);
    render([PUBLIC_INTRO], copy);
    click('ps-share-open');

    await act(async () => {
      (q('ps-share-caption-project_introduction') as HTMLElement)
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(copy).toHaveBeenCalledWith(captionFor('Project introduction'));
    expect(q('ps-share-caption-project_introduction')?.textContent).toBe('Caption copied');
    expect(q('ps-share-copy-failed')).toBeNull();
  });

  it('says so, rather than silently doing nothing, when the clipboard is refused', async () => {
    const copy = jest.fn().mockRejectedValue(new Error('NotAllowedError'));
    render([PUBLIC_INTRO], copy);
    click('ps-share-open');

    await act(async () => {
      (q('ps-share-caption-project_introduction') as HTMLElement)
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(q('ps-share-copy-failed')).not.toBeNull();
    expect(q('ps-share-caption-project_introduction')?.textContent).toBe('Copy caption');
  });

  it('survives a public video with no download url', () => {
    render([slot({ downloadUrl: null })]);
    click('ps-share-open');
    expect(q('ps-share-row-project_introduction')).not.toBeNull();
    expect(q('ps-share-download-project_introduction')).toBeNull();
  });

  it('renders nothing shareable for an empty portfolio', () => {
    render([]);
    expect((q('ps-share-open') as HTMLButtonElement).disabled).toBe(true);
  });
});
