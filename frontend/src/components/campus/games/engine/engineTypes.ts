/**
 * Shared shapes for the Game Room engines (Colaberry Campus C10). Engines are PURE: state in, state out, a seeded rng and an input
 * snapshot injected, drawing only through the 2D context they are handed. That is what lets them be tested without a canvas (jsdom has
 * none) and driven by a bot to prove the server's score ceilings.
 */
export const W = 480;
export const H = 360;

export type Rng = () => number;

/** A deterministic rng (mulberry32) for tests and bots. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the player is doing this frame. `action` is an EDGE (true only on the frame it was pressed). */
export interface Input {
  left: boolean; right: boolean; up: boolean; down: boolean;
  action: boolean;
  pointer: { x: number; y: number; down: boolean } | null;
  /** A swipe direction from touch, if one ended this frame. */
  swipe: 'left' | 'right' | 'up' | 'down' | null;
}
export const NO_INPUT: Input = { left: false, right: false, up: false, down: false, action: false, pointer: null, swipe: null };

/** Colors the page resolves from shell tokens at run time (no literals in code; see useCanvasGame). */
export interface Palette {
  bg: string; ink: string; muted: string; line: string;
  berry: string; cherry: string; leaf: string; amber: string; surface: string;
}

/** The minimal 2D context surface the engines use (a recording mock implements it in tests). */
export type Ctx = Pick<CanvasRenderingContext2D,
  'fillRect' | 'strokeRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'fill' | 'stroke' | 'arc' | 'fillText' | 'save' | 'restore'>
  & { fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern; lineWidth: number; font: string; textAlign: CanvasTextAlign; globalAlpha: number };

export interface Hud { score: number; lives: number; level: number; over: boolean; hint: string }

export interface Engine<S> {
  id: 'byte-chase' | 'launch-lab' | 'bug-breaker' | 'stack-drop' | 'token-trail';
  init: (rng: Rng) => S;
  update: (s: S, dt: number, input: Input, rng: Rng) => void;
  draw: (ctx: Ctx, s: S, p: Palette) => void;
  hud: (s: S) => Hud;
}
