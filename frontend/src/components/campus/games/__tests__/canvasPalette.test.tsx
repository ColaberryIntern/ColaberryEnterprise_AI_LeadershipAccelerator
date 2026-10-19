/**
 * C11 dark mode in the Game Room: the canvas reads its colors from the page's tokens when a game starts, and again whenever the
 * theme changes (data-theme on <html>), so a game switched to dark mid-play keeps its contrast instead of drawing light colors
 * on a dark page. A stub engine records the palette it is handed each frame.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import GameCanvas from '../GameCanvas';
import type { Engine, Palette } from '../engine/engineTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIGHT: Record<string, string> = { '--surface': 'rgb(255, 255, 255)', '--strong': 'rgb(26, 26, 26)' };
const DARK: Record<string, string> = { '--surface': 'rgb(30, 30, 30)', '--strong': 'rgb(244, 244, 244)' };

const drawn: Palette[] = [];
const engine = {
  id: 'byte-chase',
  init: () => ({}),
  update: () => undefined,
  draw: (_ctx: unknown, _s: unknown, p: Palette) => { drawn.push({ ...p }); },
  hud: () => ({ score: 0, lives: 3, level: 1, over: false, hint: '' }),
} as unknown as Engine<object>;

let container: HTMLDivElement;
let root: Root;
let frames: FrameRequestCallback[] = [];
const runFrame = async (t: number) => { const cb = frames.shift(); if (cb) await act(async () => { cb(t); }); };

beforeEach(() => {
  drawn.length = 0;
  frames = [];
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => { frames.push(cb); return frames.length; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  // jsdom has no 2d context; any object lets the loop call draw().
  (HTMLCanvasElement.prototype as unknown as { getContext: () => object }).getContext = () => ({});
  // Token values follow the theme on <html>, as the shell's [data-theme="dark"] rules do in a browser.
  jest.spyOn(window, 'getComputedStyle').mockImplementation(() => ({
    getPropertyValue: (name: string) => (document.documentElement.getAttribute('data-theme') === 'dark' ? DARK : LIGHT)[name] ?? '',
  }) as unknown as CSSStyleDeclaration);
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); document.documentElement.removeAttribute('data-theme'); });

it('draws with the light tokens, then the dark ones after data-theme flips mid-game', async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<GameCanvas engine={engine} running onOver={() => undefined} label="Byte Chase" />); });
  await runFrame(16);
  expect(drawn.at(-1)).toMatchObject({ bg: LIGHT['--surface'], ink: LIGHT['--strong'] });

  await act(async () => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await act(async () => { await Promise.resolve(); }); // MutationObserver callbacks are microtasks
  await runFrame(32);
  expect(drawn.at(-1)).toMatchObject({ bg: DARK['--surface'], ink: DARK['--strong'] });
});

it('stops watching the theme once the game ends (no observer left behind)', async () => {
  const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<GameCanvas engine={engine} running onOver={() => undefined} label="Byte Chase" />); });
  await act(async () => { root.render(<GameCanvas engine={engine} running={false} onOver={() => undefined} label="Byte Chase" />); });
  expect(disconnect).toHaveBeenCalled();
});
