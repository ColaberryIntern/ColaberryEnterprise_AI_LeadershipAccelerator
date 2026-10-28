import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import * as fs from 'fs';
import * as path from 'path';
import LiveMiniPlayer from '../LiveMiniPlayer';
import { BroadcastPlayerProvider, useBroadcastPlayer, BroadcastSession } from '../../../contexts/BroadcastPlayerContext';
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import type { GrantResponse } from '../../../services/broadcastPlaybackAdapter';

/**
 * P3-03: theater, fullscreen, captions, keyboard order, the live region, reduced motion and
 * theming.
 *
 * WHAT IS NOT HERE, AND IS NOT CLAIMED. There is no axe-core sweep. axe-core 4.11.1 exists in
 * this tree only transitively (react-scripts -> eslint-config-react-app ->
 * eslint-plugin-jsx-a11y), and reaching into a transitive dependency makes a suite that dies
 * on an unrelated upgrade. Declaring it is a deliberate dependency add, which is Ali's call.
 * So the checks below are the specific WCAG obligations this component owns, named one at a
 * time — NOT a substitute for the sweep, whose whole value is catching what nobody thought of.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OCC = '11111111-2222-4333-8444-555555555555';

const grant = (asset: string): GrantResponse => ({
  url: `/bm/broadcast/${OCC}/${asset}?e=${Date.now() + 120_000}&s=sig-${asset}`,
  expires_at: Date.now() + 120_000,
  ttl_seconds: 120,
  grant: 'full',
  preview_seconds_remaining: null,
});

// No implementation here: react-scripts sets `resetMocks: true`, which wipes anything passed
// to jest.fn() before every test. Set in beforeEach, like every sibling suite.
const fetchGrant = jest.fn<Promise<GrantResponse>, [string, string]>();

let container: HTMLDivElement;
let root: Root;

function Opener({ session }: { session: BroadcastSession }) {
  const { open } = useBroadcastPlayer();
  return <button type="button" data-testid="open" onClick={() => open(session)} />;
}

function App({ session }: { session: BroadcastSession }) {
  return (
    <ParticipantAuthProvider>
      <BroadcastPlayerProvider>
        <Opener session={session} />
        <LiveMiniPlayer fetchGrant={fetchGrant} />
      </BroadcastPlayerProvider>
    </ParticipantAuthProvider>
  );
}

const BASE: BroadcastSession = { occurrenceId: OCC, asset: 'replay.mp4', title: 'Week 9 class' };

async function mount(session: BroadcastSession = BASE): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<App session={session} />); });
  await click('open');
}

const find = (testid: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${testid}"]`);

async function click(testid: string): Promise<void> {
  const el = find(testid);
  if (!el) throw new Error(`nothing to click: ${testid}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
});

beforeEach(() => {
  fetchGrant.mockImplementation((_occ: string, asset: string) => Promise.resolve(grant(asset)));
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
});

/** Fullscreen support is opted INTO per test; jsdom's default is "unsupported". */
function enableFullscreen(): jest.Mock {
  const request = jest.fn(() => Promise.resolve());
  (document as unknown as Record<string, unknown>).fullscreenEnabled = true;
  window.HTMLElement.prototype.requestFullscreen = request as unknown as () => Promise<void>;
  return request;
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
  delete (document as unknown as Record<string, unknown>).fullscreenEnabled;
  delete (document as unknown as Record<string, unknown>).fullscreenElement;
  // The prototype is shared across the whole file. Leaving this behind made every test after
  // the first fullscreen one see support where jsdom has none, which is how the
  // "no element fullscreen" case passed for the wrong reason.
  delete (window.HTMLElement.prototype as unknown as Record<string, unknown>).requestFullscreen;
});

describe('theater mode', () => {
  it('starts mini and expands on request, without rebuilding the video', async () => {
    await mount();
    const before = find('live-mini-player-video');
    expect(find('live-mini-player')!.dataset.mode).toBe('mini');

    await click('lmp-theater');

    const frame = find('live-mini-player')!;
    expect(frame.dataset.mode).toBe('theater');
    expect(frame.className).toContain('is-theater');
    // Expanding must not restart playback any more than navigating does.
    expect(Object.is(before, find('live-mini-player-video'))).toBe(true);
  });

  it('reports its state to assistive technology, and the label follows', async () => {
    await mount();
    const button = find('lmp-theater')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toBe('Theater');

    await click('lmp-theater');

    expect(find('lmp-theater')!.getAttribute('aria-pressed')).toBe('true');
    expect(find('lmp-theater')!.textContent).toBe('Minimise');
  });
});

describe('fullscreen', () => {
  it('offers a LABELLED alternative when the device has no element fullscreen', async () => {
    // jsdom implements none of the Fullscreen API, which is exactly the iPhone-Safari case.
    await mount();
    expect(find('lmp-fullscreen')).toBeNull();
    const note = find('lmp-fullscreen-unavailable');
    expect(note).not.toBeNull();
    // It says what to do instead rather than just disappearing.
    expect(note!.textContent).toMatch(/Theater/);
  });

  it('requests fullscreen on the whole player frame when supported', async () => {
    const request = enableFullscreen();

    await mount();
    await click('lmp-fullscreen');

    expect(request).toHaveBeenCalledTimes(1);
    // The frame, not the <video>: the controls have to come with it.
    expect((request.mock.instances[0] as unknown as HTMLElement).dataset.testid)
      .toBe('live-mini-player');
  });

  it('puts focus back on the trigger when fullscreen ends', async () => {
    enableFullscreen();

    await mount();
    const trigger = find('lmp-fullscreen')!;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await click('lmp-fullscreen');

    // Move focus somewhere REAL first. The earlier version called document.body.focus(),
    // which is a no-op in jsdom because <body> has no tabindex — so focus never left the
    // trigger and the assertion below held whether or not the focus-return code ran. A
    // mutation that deleted that code survived, which is how this was found.
    const elsewhere = find('lmp-close')!;
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);

    (document as unknown as Record<string, unknown>).fullscreenElement = null;
    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    // Without the return, a keyboard user lands wherever the browser chose — often the
    // document top, with no way back to the player.
    expect(document.activeElement).toBe(find('lmp-fullscreen'));
  });
});

describe('captions', () => {
  it('offers no control at all when the broadcast has no captions asset', async () => {
    await mount(BASE);
    // A toggle that can only fail is worse than no toggle.
    expect(find('lmp-captions')).toBeNull();
  });

  it('fetches a SEPARATE signed grant for the caption track', async () => {
    await mount({ ...BASE, captionsAsset: 'captions.vtt' });
    expect(fetchGrant).toHaveBeenCalledTimes(1);          // the video only, so far

    await click('lmp-captions');

    expect(fetchGrant).toHaveBeenCalledTimes(2);
    expect(fetchGrant).toHaveBeenLastCalledWith(OCC, 'captions.vtt');
    const track = container.querySelector('track');
    expect(track).not.toBeNull();
    expect(track!.getAttribute('src')).toContain('captions.vtt');
    expect(find('lmp-captions')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('does not mint a caption credential nobody asked for', async () => {
    await mount({ ...BASE, captionsAsset: 'captions.vtt' });
    expect(container.querySelector('track')).toBeNull();
    expect(fetchGrant).toHaveBeenCalledTimes(1);
  });

  it('degrades to a plain message when the caption grant is refused, and keeps the video', async () => {
    await mount({ ...BASE, captionsAsset: 'captions.vtt' });
    fetchGrant.mockRejectedValueOnce({ response: { status: 403, data: { reason: 'not_entitled' } } });

    await click('lmp-captions');

    expect(container.querySelector('track')).toBeNull();
    expect(find('lmp-status')!.textContent).toContain('Captions are unavailable');
    // The reason is deliberately not surfaced, and the video is untouched.
    expect(find('lmp-status')!.textContent).not.toContain('not_entitled');
    expect(find('live-mini-player-video')).not.toBeNull();
  });

  it('turns captions off again without another request', async () => {
    await mount({ ...BASE, captionsAsset: 'captions.vtt' });
    await click('lmp-captions');
    expect(container.querySelector('track')).not.toBeNull();

    await click('lmp-captions');

    expect(container.querySelector('track')).toBeNull();
    expect(fetchGrant).toHaveBeenCalledTimes(2);
  });
});

describe('keyboard and screen-reader obligations', () => {
  it('puts every control AFTER the video, in the documented tab order', async () => {
    enableFullscreen();
    await mount({ ...BASE, captionsAsset: 'captions.vtt' });

    const order = Array.from(container.querySelectorAll('video, button[data-testid^="lmp-"]'))
      .map((el) => (el.tagName === 'VIDEO' ? 'video' : (el as HTMLElement).dataset.testid));

    // play/mute come from the native controls INSIDE <video>, so the video coming first is
    // what makes the documented order true: play/mute -> captions -> theater -> fullscreen
    // -> close.
    expect(order).toEqual(['video', 'lmp-captions', 'lmp-theater', 'lmp-fullscreen', 'lmp-close']);
  });

  it('keeps that order when there is no fullscreen button to show', async () => {
    await mount({ ...BASE, captionsAsset: 'captions.vtt' });
    const order = Array.from(container.querySelectorAll('video, button[data-testid^="lmp-"]'))
      .map((el) => (el.tagName === 'VIDEO' ? 'video' : (el as HTMLElement).dataset.testid));
    expect(order).toEqual(['video', 'lmp-captions', 'lmp-theater', 'lmp-close']);
  });

  it('gives every control an accessible name', async () => {
    await mount({ ...BASE, captionsAsset: 'captions.vtt' });
    const buttons = Array.from(container.querySelectorAll('button[data-testid^="lmp-"]'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? '';
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it('names the player region, including which broadcast it is', async () => {
    await mount();
    expect(find('live-mini-player')!.getAttribute('aria-label')).toBe('Broadcast player: Week 9 class');
  });

  it('keeps ONE live region mounted even while it is empty', async () => {
    await mount();
    const status = find('lmp-status');
    // A region inserted at the same moment it gains text is frequently never announced.
    expect(status).not.toBeNull();
    expect(status!.getAttribute('role')).toBe('status');
    expect(status!.getAttribute('aria-live')).toBe('polite');
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
  });
});

describe('reduced motion', () => {
  it('drops the transition when the viewer asks for less movement', async () => {
    const original = window.matchMedia;
    (window as unknown as Record<string, unknown>).matchMedia = (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    try {
      await mount();
      expect(find('live-mini-player')!.className).toContain('is-still');
    } finally {
      (window as unknown as Record<string, unknown>).matchMedia = original;
    }
  });

  it('does not add the class when no preference is set', async () => {
    await mount();
    expect(find('live-mini-player')!.className).not.toContain('is-still');
  });
});

describe('theming comes from the global token layer, not the portal shell', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '..', 'liveMiniPlayer.css'), 'utf8',
  );

  it('uses NO token that TodayShell scopes to .te-shell', () => {
    // This is the bug the P3-02 version shipped with: the player is mounted outside
    // `.te-shell` so that it survives navigation, and TodayShell.css scopes its dark palette
    // to `[data-theme="dark"] .te-shell`. Using those names meant the light-mode fallbacks
    // applied in dark mode — a white card on a dark page.
    const shellScoped = ['--surface', '--border', '--muted', '--berry', '--strong', '--body', '--sunken', '--page', '--border-sub'];
    const used = Array.from(css.matchAll(/var\((--[a-z0-9-]+)/g)).map((m) => m[1]);
    expect(used.filter((name) => shellScoped.includes(name))).toEqual([]);
  });

  it('uses only tokens that the dark theme actually redefines, or palette constants', () => {
    const tokens = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'colaberry', 'tokens', 'colors.css'), 'utf8',
    );
    const darkBlock = tokens.slice(tokens.indexOf('[data-theme="dark"]'));
    const used = new Set(Array.from(css.matchAll(/var\((--[a-z0-9-]+)/g)).map((m) => m[1]));

    // Deliberately theme-invariant: palette primitives and the brand constants, which are the
    // same colour in both themes by design, plus the two non-colour tokens.
    const invariant = new Set([
      '--neutral-1000', '--border-brand', '--border-focus', '--shadow-lg', '--z-player',
      // --action-fg is theme-invariant BECAUSE --action-bg is: the primary action is red-500
      // in both themes, so a white foreground is required in both, not merely tolerated. That
      // premise is asserted in the next test rather than trusted here — an allowlist entry
      // whose reason is only a comment is how a guard like this stops guarding.
      '--action-fg',
      // C28b: the Events Hall dock geometry. These four hold LENGTHS that useStageDock
      // writes at runtime — the measured rectangle of the hall's screen — so there is no
      // colour for a theme to redefine and nothing for the tokens file to declare. The
      // premise, that they are geometry and never anything a theme has an opinion about,
      // is asserted below rather than trusted to this comment.
      '--lmp-stage-top', '--lmp-stage-left', '--lmp-stage-width', '--lmp-stage-height',
    ]);

    const unthemed = [...used].filter((name) => !invariant.has(name) && !darkBlock.includes(`${name}:`));
    expect(unthemed).toEqual([]);
  });

  it('the action pair really is theme-invariant, which is why --action-fg may skip the dark block', () => {
    // The premise behind the allowlist entry above. If a future theme pass gives the dark
    // mode its own --action-bg, the white foreground stops being automatically correct and
    // this fails — which is the point: the exemption expires with its reason.
    const tokens = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'colaberry', 'tokens', 'colors.css'), 'utf8',
    );
    const cut = tokens.indexOf('[data-theme="dark"]');
    expect(cut).toBeGreaterThan(0);
    const lightSide = tokens.slice(0, cut);
    const darkSide = tokens.slice(cut);

    const light = /--action-bg:\s*(.+?);/.exec(lightSide);
    const dark = /--action-bg:\s*(.+?);/.exec(darkSide);
    expect(light).not.toBeNull();
    expect(dark).not.toBeNull();
    expect(dark?.[1].trim()).toBe(light?.[1].trim());
    // and --action-fg genuinely has no dark override to find
    expect(darkSide).not.toContain('--action-fg:');
  });

  it('the stage dock tokens really are geometry, which is why they may skip the dark block', () => {
    // The premise behind the four --lmp-stage-* entries on the allowlist above. Each one may
    // only ever be the value of a geometry property. If a later change used one for a colour,
    // a shadow or a border, the exemption would be wrong and this fails instead of quietly
    // widening the allowlist.
    const GEOMETRY = new Set(['top', 'left', 'right', 'bottom', 'width', 'height']);
    const NAMES = ['--lmp-stage-top', '--lmp-stage-left', '--lmp-stage-width', '--lmp-stage-height'];
    for (const name of NAMES) {
      const props = Array.from(css.matchAll(new RegExp(`([a-z-]+)\\s*:\\s*var\\(${name}\\)`, 'g')))
        .map((m) => m[1]);
      // A guard that scanned nothing reports a clean pass over a stylesheet it never read.
      expect(props.length).toBeGreaterThan(0);
      expect(props.filter((p) => !GEOMETRY.has(p))).toEqual([]);
    }
  });

  it('positions the mini player clear of the DM dock and the tab bar', () => {
    expect(css).toMatch(/right:\s*332px/);
    expect(css).toMatch(/@media \(max-width: 820px\)/);
    expect(css).toMatch(/bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom/);
  });

  it('never reorders the controls in CSS, which would desync visual order from tab order', () => {
    // Found by a surviving mutation: adding `order: -1` to .lmp-controls moves the buttons
    // ABOVE the video visually while the DOM order — and therefore the tab order — stays put.
    // The tab-order test reads the DOM and cannot see it. A sighted keyboard user would tab
    // from the video backwards into controls drawn above it (WCAG 1.3.2, 2.4.3).
    expect(css).not.toMatch(/\border\s*:/);
    expect(css).not.toMatch(/flex-direction:\s*(row|column)-reverse/);
  });

  it('guards the transition in CSS as well as in JS', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/\.lmp\.is-still\s*\{\s*transition:\s*none/);
  });
});
