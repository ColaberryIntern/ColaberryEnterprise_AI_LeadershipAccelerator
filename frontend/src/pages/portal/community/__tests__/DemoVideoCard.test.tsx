import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DemoVideoCard from '../DemoVideoCard';

/**
 * THE CARD THAT FINALLY PLAYS.
 *
 * A published demo has produced a community post since Phase 6, and the feed drew
 * it as body text with a "demo_video" chip. The author was told their demo was
 * shared with the cohort; nobody could press play.
 *
 * Two properties carry most of the weight here. Nothing loads or sounds until
 * somebody asks — a feed that starts several people talking as you scroll is
 * hostile on a phone. And the card never builds its own URL: the one it is given
 * was minted for this viewer by a server that checked they may watch, so
 * reconstructing it would be asserting an access decision the card cannot make.
 */

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

const URL_ = '/api/portal/projects/p1/tasks/PREP-4/recordings/r1/file?t=tkt';

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

async function mount(over: Record<string, unknown> = {}) {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(
      <DemoVideoCard
        playbackUrl={URL_}
        durationSeconds={71}
        viewLabel="No views yet"
        {...(over as any)}
      />,
    );
  });
}

const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const video = () => q('[data-testid="demo-video-player"]') as HTMLVideoElement;
const click = async (el: HTMLElement) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

describe('before anyone presses play', () => {
  it('shows a play control rather than starting', async () => {
    await mount();
    expect(q('[data-testid="demo-video-play"]')).not.toBeNull();
    expect(video().hasAttribute('autoplay')).toBe(false);
    expect(video().hasAttribute('controls')).toBe(false);
  });

  it('loads metadata only — not the whole rehearsal', async () => {
    // A feed of demos must not pull megabytes per card on open.
    await mount();
    expect(video().getAttribute('preload')).toBe('metadata');
  });

  it('paints a still from ONE SECOND IN, not frame zero', async () => {
    // There is no stored thumbnail (no ffmpeg in the backend image), so the media
    // fragment is what produces a still at all. Frame zero of a screen share is
    // usually a blank desktop, which makes every card look identical.
    await mount();
    expect(video().getAttribute('src')).toBe(`${URL_}#t=1`);
  });

  it('shows the duration so a viewer knows what they are committing to', async () => {
    await mount();
    expect(q('[data-testid="demo-video-duration"]')!.textContent).toBe('1:11');
  });

  it('omits the duration rather than printing a bogus one', async () => {
    await mount({ durationSeconds: null });
    expect(q('[data-testid="demo-video-duration"]')).toBeNull();
  });
});

describe('pressing play', () => {
  it('starts, and swaps the fragment url for the real one', async () => {
    await mount();
    await click(q('[data-testid="demo-video-play"]')!);

    expect(video().getAttribute('src')).toBe(URL_);
    expect(video().hasAttribute('controls')).toBe(true);
    expect(q('[data-testid="demo-video-play"]')).toBeNull();
  });

  it('NEVER rebuilds the url — the signed one is used verbatim', async () => {
    // The ticket in the query string is the only authority the request carries,
    // and it was minted for this viewer. Reconstructing the url would drop it.
    await mount();
    await click(q('[data-testid="demo-video-play"]')!);
    expect(video().getAttribute('src')).toBe(URL_);
    expect(video().getAttribute('src')).toContain('?t=tkt');
  });
});

describe('what it says about itself', () => {
  it('names it a demo and reports who watched', async () => {
    await mount({ viewLabel: '4 people have watched this' });
    expect(q('[data-testid="demo-video-views"]')!.textContent).toContain('Demo');
    expect(q('[data-testid="demo-video-views"]')!.textContent).toContain('4 people have watched this');
  });

  it('offers a plain link for a browser that cannot play it', async () => {
    await mount();
    expect(container.querySelector('a')!.getAttribute('href')).toBe(URL_);
  });
});
