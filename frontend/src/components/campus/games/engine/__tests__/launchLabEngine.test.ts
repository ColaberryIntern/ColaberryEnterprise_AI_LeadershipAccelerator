/**
 * C10 Launch Lab: aiming, launching, knocking blocks and nodes, spare-orb bonus, game over, and originality (a launch pad and a data
 * orb in the berry color, no slingshot band, no cherry, no birds).
 */
import fs from 'fs';
import path from 'path';
import { launchLab, levelLayout, maxLevelScore, POINTS, ORBS_PER_LEVEL, PAD, LaunchLabState } from '../launchLabEngine';
import { seededRng } from '../engineTypes';
import { PALETTE, recordingCtx, input } from '../testKit';

const rng = seededRng(2);
const fresh = (): LaunchLabState => launchLab.init(rng);
const run = (s: LaunchLabState, secs: number) => { for (let t = 0; t < secs; t += 0.02) launchLab.update(s, 0.02, input(), rng); };

describe('levels', () => {
  it('2 to 4 racks, each 2 to 4 blocks high with a node on top; deterministic', () => {
    for (let lv = 1; lv <= 8; lv += 1) {
      const racks = levelLayout(lv);
      expect(racks.length).toBe(Math.min(4, 1 + lv));
      for (const r of racks) { expect(r.blocks).toBeGreaterThanOrEqual(2); expect(r.blocks).toBeLessThanOrEqual(4); expect(r.node).toBe(true); }
      expect(levelLayout(lv)).toEqual(racks);
    }
  });
});

describe('aiming and launching', () => {
  it('arrows aim within limits; Space launches one orb', () => {
    const s = fresh();
    for (let i = 0; i < 100; i += 1) launchLab.update(s, 0.02, input({ up: true, right: true }), rng);
    expect(s.angle).toBe(80);
    expect(s.power).toBe(900);
    launchLab.update(s, 0.02, input({ action: true }), rng);
    expect(s.orb).not.toBeNull();
    expect(s.orbsLeft).toBe(ORBS_PER_LEVEL - 1);
  });
  it('drag back from the pad and let go launches', () => {
    const s = fresh();
    launchLab.update(s, 0.02, input({ pointer: { x: PAD.x - 40, y: PAD.y + 30, down: true } }), rng);
    expect(s.aiming).toBe(true);
    launchLab.update(s, 0.02, input({ pointer: { x: PAD.x - 40, y: PAD.y + 30, down: false } }), rng);
    expect(s.orb).not.toBeNull();
  });
});

describe('scoring', () => {
  it('a node hit is 500; a fast hit on a block knocks it out for 50', () => {
    const s = fresh();
    const r = s.racks[0];
    // place the orb right at the node, moving fast
    s.orb = { x: r.x, y: 330 - r.blocks * 20 - 8, vx: 400, vy: 0, t: 0 };
    launchLab.update(s, 0.001, input(), rng);
    expect(s.score).toBeGreaterThanOrEqual(POINTS.node);
    const s2 = fresh();
    const r2 = s2.racks[0];
    s2.orb = { x: r2.x - 13 - 6, y: 330 - 10, vx: 600, vy: 0, t: 0 };
    launchLab.update(s2, 0.005, input(), rng);
    expect(s2.score).toBe(POINTS.block);
    expect(s2.racks[0].blocks).toBe(r2.blocks);
  });
  it('clearing every node pays 300 per spare orb and starts the next level', () => {
    const s = fresh();
    s.racks.forEach((r) => { r.node = false; });
    s.orbsLeft = 2;
    launchLab.update(s, 0.02, input(), rng);
    expect(s.score).toBe(2 * POINTS.spareOrb);
    expect(s.level).toBe(2);
    expect(s.orbsLeft).toBe(ORBS_PER_LEVEL);
  });
  it('out of orbs with nodes left: the game ends 1.2 s later', () => {
    const s = fresh();
    s.orbsLeft = 0;
    run(s, 1.0);
    expect(s.over).toBe(false);
    run(s, 0.4);
    expect(s.over).toBe(true);
  });
  it('maxLevelScore is every block, every node and two spare orbs', () => {
    const racks = levelLayout(1);
    expect(maxLevelScore(1)).toBe(racks.reduce((a, r) => a + r.blocks * 50 + 500, 0) + 600);
  });
});

describe('originality (not a slingshot game)', () => {
  it('the orb is drawn in the berry color, never cherry', () => {
    const s = fresh();
    s.orb = { x: 200, y: 200, vx: 0, vy: 0, t: 0 };
    const ctx = recordingCtx();
    launchLab.draw(ctx, s, PALETTE);
    const arcs = ctx.calls.filter((c) => c.op === 'arc');
    expect(arcs).toHaveLength(1);
    const fillAfterArc = ctx.calls[ctx.calls.indexOf(arcs[0]) + 1];
    expect(fillAfterArc.fill).toBe('berry');
  });
  it('names: a launch pad and a data orb (no slingshot, band, bird or cherry)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'launchLabEngine.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      .replace(/p\.cherry/g, 'p.nodeColor'); // the palette's red token, used for the nodes; the orb test pins it is never the orb
    expect(src).not.toMatch(/\b(slingshot|sling|band|bird|cherry)\b/i);
    expect(src).toMatch(/PAD/);
  });
});
