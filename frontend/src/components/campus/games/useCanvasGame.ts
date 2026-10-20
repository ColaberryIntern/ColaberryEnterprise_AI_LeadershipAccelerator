import { useEffect, useRef, useState } from 'react';
import { H, W, NO_INPUT, Engine, Hud, Input, Palette } from './engine/engineTypes';

/**
 * Runs one engine on a canvas (Colaberry Campus C10): requestAnimationFrame loop (dt capped at 0.05 s), keyboard (arrows, WASD, Space;
 * Space and arrows do not scroll the page while playing), pointer (scaled to the 480 x 360 world) and touch swipes. Colors come from the
 * page's shell tokens at run time (no literals in code). jsdom has no canvas: a missing context means the game simply does not draw.
 *
 * C11: keys are read from the CANVAS (focusable, focused when a game starts), never the window, so typing in the DM dock, Where to or
 * any other field is never swallowed (WCAG 2.1.4). Leaving the canvas releases every held key. A pointer is captured for the whole
 * press so a drag that leaves the canvas still ends, and a cancelled touch (the browser took it for a scroll) clears the press.
 * The palette is re-read when the theme changes (data-theme on <html>), so a game keeps its contrast in dark mode.
 */
const TOKENS: Record<keyof Palette, string> = {
  bg: '--surface', ink: '--strong', muted: '--muted', line: '--border', berry: '--berry', cherry: '--cherry', leaf: '--leaf', amber: '--amber', surface: '--sunken',
};
const FALLBACK: Palette = { bg: 'white', ink: 'black', muted: 'gray', line: 'silver', berry: 'steelblue', cherry: 'crimson', leaf: 'seagreen', amber: 'goldenrod', surface: 'whitesmoke' };

export function paletteFrom(el: Element | null): Palette {
  const css = el ? window.getComputedStyle(el) : null;
  const out = { ...FALLBACK };
  for (const k of Object.keys(TOKENS) as (keyof Palette)[]) { const v = css?.getPropertyValue(TOKENS[k]).trim(); if (v) out[k] = v; }
  return out;
}

const KEYMAP: Record<string, keyof Input> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' };

export function useCanvasGame<S>(engine: Engine<S>, running: boolean, onOver: (score: number) => void): { canvasRef: React.RefObject<HTMLCanvasElement>; hud: Hud } {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 0, level: 1, over: false, hint: '' });
  const overRef = useRef(onOver);
  overRef.current = onOver;

  useEffect(() => {
    if (!running) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d') ?? null;
    const state = engine.init(Math.random);
    const input: Input = { ...NO_INPUT };
    let palette = paletteFrom(canvas);
    const themeWatch = typeof MutationObserver === 'function' ? new MutationObserver(() => { palette = paletteFrom(canvas); }) : null;
    themeWatch?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    let touchStart: { x: number; y: number } | null = null;
    const toWorld = (cx: number, cy: number) => { const r = canvas!.getBoundingClientRect(); return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H }; };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); if (down) input.action = true; return; }
      const k = KEYMAP[e.key];
      if (k) { e.preventDefault(); (input as unknown as Record<string, boolean>)[k] = down; }
    };
    const kd = onKey(true); const ku = onKey(false);
    const release = () => { input.left = false; input.right = false; input.up = false; input.down = false; };
    const pd = (e: PointerEvent) => {
      try { canvas?.setPointerCapture?.(e.pointerId); } catch { /* a pointer that is already gone cannot be captured; the press still counts */ }
      input.pointer = { ...toWorld(e.clientX, e.clientY), down: true }; touchStart = { x: e.clientX, y: e.clientY };
    };
    const pm = (e: PointerEvent) => { input.pointer = { ...toWorld(e.clientX, e.clientY), down: input.pointer?.down ?? false }; };
    const pu = (e: PointerEvent) => {
      input.pointer = { ...toWorld(e.clientX, e.clientY), down: false };
      if (touchStart) {
        const dx = e.clientX - touchStart.x; const dy = e.clientY - touchStart.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) input.swipe = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      }
      touchStart = null;
    };
    const pc = () => { input.pointer = input.pointer ? { ...input.pointer, down: false } : null; touchStart = null; };
    canvas?.addEventListener('keydown', kd); canvas?.addEventListener('keyup', ku); canvas?.addEventListener('blur', release);
    canvas?.addEventListener('pointerdown', pd); canvas?.addEventListener('pointermove', pm); canvas?.addEventListener('pointerup', pu);
    canvas?.addEventListener('pointercancel', pc);
    canvas?.focus({ preventScroll: true });
    let last = performance.now(); let raf = 0; let lastHud = 0; let ended = false;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      engine.update(state, dt, input, Math.random);
      input.action = false; input.swipe = null;
      if (ctx) engine.draw(ctx as never, state, palette);
      const h = engine.hud(state);
      if (now - lastHud > 100 || h.over) { setHud(h); lastHud = now; }
      if (h.over && !ended) { ended = true; overRef.current(h.score); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      themeWatch?.disconnect();
      canvas?.removeEventListener('keydown', kd); canvas?.removeEventListener('keyup', ku); canvas?.removeEventListener('blur', release);
      canvas?.removeEventListener('pointerdown', pd); canvas?.removeEventListener('pointermove', pm); canvas?.removeEventListener('pointerup', pu);
      canvas?.removeEventListener('pointercancel', pc);
    };
  }, [engine, running]);

  return { canvasRef, hud };
}
