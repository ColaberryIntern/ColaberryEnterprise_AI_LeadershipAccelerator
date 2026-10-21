import { baseView, clampW, focusView, followView, inView, MAX_W, MIN_W, panBy, place, settled, step, viewBoxOf, zoomBy } from '../campusCamera';

const desk = { W: 1440, H: 900 };
const phone = { W: 390, H: 844 };
/** Where world point p lands on screen for camera c. */
const onScreen = (c: { cx: number; cy: number; w: number }, vp: { W: number; H: number }, p: { x: number; y: number }) => {
  const s = vp.W / c.w;
  return { x: (p.x - c.cx) * s + vp.W / 2, y: (p.y - c.cy) * s + vp.H / 2 };
};

describe('campusCamera: the prototype framing, as pure functions', () => {
  it('place puts a world point on a chosen screen point at a chosen scale', () => {
    const c = place(desk, 500, 400, 300, 200, 2);
    expect(c.w).toBe(720);
    const p = onScreen(c, desk, { x: 500, y: 400 });
    expect(p.x).toBeCloseTo(300); expect(p.y).toBeCloseTo(200);
  });

  it('desktop base view: the whole campus centered in the area the panels leave free (prototype: 420 px left, 70 px top)', () => {
    const c = baseView(desk, { left: 420, top: 70, right: 0, bottom: 0 });
    const s = Math.min((1440 - 450) / 1010, (900 - 90) / 600, 1.6);
    expect(c.w).toBeCloseTo(1440 / s);
    const p = onScreen(c, desk, { x: 530, y: 380 });
    expect(p.x).toBeCloseTo((420 + 1440) / 2); expect(p.y).toBeCloseTo((70 + 900) / 2);
    // every building's ground line is on screen, right of the panel
    for (const x of [100, 900]) expect(onScreen(c, desk, { x, y: 400 }).x).toBeGreaterThan(420);
  });

  it('desktop base view with no panel: the tallest roof and the gate path both stay on screen', () => {
    const vp = { W: 1440, H: 830 };
    const c = baseView(vp);
    expect(onScreen(c, vp, { x: 500, y: 80 }).y).toBeGreaterThan(0);
    expect(onScreen(c, vp, { x: 500, y: 670 }).y).toBeLessThan(vp.H);
  });

  it('phone base view: fits 640 world units across, centered above the bottom sheet', () => {
    const c = baseView(phone, { left: 0, top: 118, right: 0, bottom: phone.H * 0.44 });
    expect(c.w).toBeCloseTo(640);
    expect(onScreen(c, phone, { x: 500, y: 390 }).y).toBeCloseTo((118 + phone.H * 0.56) / 2);
  });

  it('focus frames one building beside its card, closer in', () => {
    const b = { x: 250, y: 215, h: 74 };
    const c = focusView(desk, b, { left: 0, top: 0, right: 400, bottom: 0 });
    expect(c.w).toBeLessThan(baseView(desk).w);
    const p = onScreen(c, desk, { x: 250, y: 215 - 37 });
    expect(p.x).toBeCloseTo((1440 - 400) / 2);
    const m = focusView(phone, b, { left: 0, top: 0, right: 0, bottom: phone.H * 0.55 });
    expect(onScreen(m, phone, { x: 250, y: 178 }).y).toBeCloseTo((phone.H * 0.45) / 2);
  });

  it('follow centers just above the avatar', () => {
    const c = followView(desk, { x: 600, y: 500 });
    const p = onScreen(c, desk, { x: 600, y: 480 });
    expect(p.x).toBeCloseTo(720); expect(p.y).toBeCloseTo(450);
  });

  it('zoom and every framing clamp the view width (no zooming past a building or out to nothing)', () => {
    expect(clampW(10)).toBe(MIN_W);
    expect(clampW(1e6)).toBe(MAX_W);
    expect(zoomBy({ cx: 0, cy: 0, w: 300 }, 0.1).w).toBe(MIN_W);
    expect(zoomBy({ cx: 0, cy: 0, w: 2000 }, 5).w).toBe(MAX_W);
    expect(place(desk, 0, 0, 0, 0, 100).w).toBe(MIN_W);
  });

  it('a drag moves the world with the pointer', () => {
    const c = { cx: 500, cy: 400, w: 720 };
    const before = onScreen(c, desk, { x: 500, y: 400 });
    const after = onScreen(panBy(c, desk, 50, -30), desk, { x: 500, y: 400 });
    expect(after.x - before.x).toBeCloseTo(50); expect(after.y - before.y).toBeCloseTo(-30);
  });

  it('easing approaches the target; ease 1 (reduce motion) jumps; settled stops the loop', () => {
    const a = { cx: 0, cy: 0, w: 1000 }, t = { cx: 100, cy: 50, w: 500 };
    expect(step(a, t, 0.5)).toEqual({ cx: 50, cy: 25, w: 750 });
    expect(step(a, t, 1)).toEqual(t);
    expect(settled(a, t, desk)).toBe(false);
    expect(settled(t, t, desk)).toBe(true);
  });

  it('inView tells whether a focused building is on screen (with a margin)', () => {
    const c = { cx: 500, cy: 350, w: 1000 };
    expect(inView(c, desk, { x: 500, y: 350 })).toBe(true);
    expect(inView(c, desk, { x: 5, y: 350 })).toBe(false);
  });

  it('viewBoxOf matches the screen aspect', () => {
    expect(viewBoxOf({ cx: 500, cy: 350, w: 1440 }, desk)).toBe('-220 -100 1440 900');
  });
});
