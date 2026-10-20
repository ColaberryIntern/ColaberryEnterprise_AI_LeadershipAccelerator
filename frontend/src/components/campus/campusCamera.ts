/**
 * The campus camera, ported from the prototype (docs/design/campus/colaberry-campus.html, "CAMERA"): an eased viewBox matched to
 * the screen's aspect. Pure functions only (the hook in useCampusCamera.ts runs them), so the framing is unit-tested.
 *
 * The prototype hard-codes its panels (a 420 px concierge on the left, a 70 px top bar, a bottom sheet on phones); here they are
 * `insets`, the screen pixels a panel covers, so the same formulas frame the campus home, the map overlay and the phone sheet.
 */
export interface Cam { cx: number; cy: number; w: number }
export interface Viewport { W: number; H: number }
export interface Insets { left: number; top: number; right: number; bottom: number }
export type Pt = { x: number; y: number };

export const NO_INSETS: Insets = { left: 0, top: 0, right: 0, bottom: 0 };
export const MIN_W = 260;
export const MAX_W = 2200;
/** The prototype's phone breakpoint (isMobile: innerWidth <= 760). */
export const isMobileWidth = (width: number): boolean => width <= 760;
export const clampW = (w: number): number => Math.max(MIN_W, Math.min(MAX_W, w));

/** Put world point (bx,by) at screen point (sx,sy) at scale s (screen px per world unit). */
export function place(vp: Viewport, bx: number, by: number, sx: number, sy: number, s: number): Cam {
  return { w: clampW(vp.W / s), cx: bx + (vp.W / 2 - sx) / s, cy: by + (vp.H / 2 - sy) / s };
}

const free = (vp: Viewport, i: Insets) => ({ x0: i.left, x1: vp.W - i.right, y0: i.top, y1: vp.H - i.bottom });

/** The whole campus, centered in the screen area the panels leave free (prototype baseView). */
export function baseView(vp: Viewport, insets: Insets = NO_INSETS): Cam {
  const f = free(vp, insets);
  if (isMobileWidth(vp.W)) return place(vp, 500, 390, vp.W / 2, (f.y0 + f.y1) / 2, Math.min(vp.W / 640, 1));
  // The prototype fits 550 world units of height around y 392, which only holds while its 420 px panel makes the fit
  // width-bound; with no side panel the fit is height-bound and that cut the roofs off. Fit the art's real extent instead:
  // the tallest roof (about y 80) to the gate path (about y 670), centered on y 380.
  const s = Math.min((f.x1 - f.x0 - 30) / 1010, (f.y1 - f.y0 - 20) / 600, 1.6);
  return place(vp, 530, 380, (f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, s);
}

/** One building, framed beside its arrival panel (prototype focusBuilding). b: center x, ground line y, height. */
export function focusView(vp: Viewport, b: { x: number; y: number; h: number }, insets: Insets = NO_INSETS): Cam {
  const f = free(vp, insets);
  if (isMobileWidth(vp.W)) return place(vp, b.x, b.y - b.h / 2, vp.W / 2, (f.y0 + f.y1) / 2, vp.W / 430);
  return place(vp, b.x, b.y - b.h / 2, (f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2 + 20, Math.min(2, (f.x1 - f.x0 - 20) / 480));
}

/** The walking camera: closer in, centered just above the avatar (prototype startFollow + camLoop). */
export function followView(vp: Viewport, at: Pt, insets: Insets = NO_INSETS): Cam {
  const s = isMobileWidth(vp.W) ? vp.W / 470 : Math.min(1.7, vp.W / 760);
  const f = free(vp, insets);
  return place(vp, at.x, at.y - 20, (f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, s);
}

/** One easing step toward the target (prototype camEase: .06 walking about, .13 flying in; 1 = jump, for reduce motion). */
export function step(cam: Cam, target: Cam, ease: number): Cam {
  return { cx: cam.cx + (target.cx - cam.cx) * ease, cy: cam.cy + (target.cy - cam.cy) * ease, w: cam.w + (target.w - cam.w) * ease };
}

/** Close enough to stop the animation loop (under a tenth of a screen pixel). */
export function settled(cam: Cam, target: Cam, vp: Viewport): boolean {
  const s = vp.W / cam.w;
  return Math.abs(cam.cx - target.cx) * s < 0.1 && Math.abs(cam.cy - target.cy) * s < 0.1 && Math.abs(cam.w - target.w) * s < 0.1;
}

/** Drag: move the world with the pointer (screen px -> world units at the current scale). */
export function panBy(cam: Cam, vp: Viewport, dx: number, dy: number): Cam {
  const s = vp.W / cam.w;
  return { ...cam, cx: cam.cx - dx / s, cy: cam.cy - dy / s };
}

/** Wheel and the +/- buttons: scale the view width by f around its center, clamped. */
export function zoomBy(cam: Cam, f: number): Cam {
  return { ...cam, w: clampW(cam.w * f) };
}

/** Is world point p inside the view (with a margin in screen px)? Used to bring a keyboard-focused building into view. */
export function inView(cam: Cam, vp: Viewport, p: Pt, marginPx = 40): boolean {
  const s = vp.W / cam.w, vh = cam.w * vp.H / vp.W, m = marginPx / s;
  return p.x >= cam.cx - cam.w / 2 + m && p.x <= cam.cx + cam.w / 2 - m && p.y >= cam.cy - vh / 2 + m && p.y <= cam.cy + vh / 2 - m;
}

export function viewBoxOf(cam: Cam, vp: Viewport): string {
  const vh = cam.w * vp.H / vp.W;
  const r = (n: number) => Math.round(n * 100) / 100;
  return `${r(cam.cx - cam.w / 2)} ${r(cam.cy - vh / 2)} ${r(cam.w)} ${r(vh)}`;
}
