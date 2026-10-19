/**
 * C10 Byte Chase: scoring (bits, keys, frozen-glitch reboots, levels), lives, a maze where every bit is reachable, and originality
 * (a different maze from the prototype, a player drawn without arcs, glitches frozen by a shield instead of fleeing to be eaten).
 */
import fs from 'fs';
import path from 'path';
import { byteChase, MAZE, POINTS, SHIELD_S, drawPlayer, open, ByteChaseState } from '../byteChaseEngine';
import { seededRng } from '../engineTypes';
import { PALETTE, recordingCtx, input } from '../testKit';

const rng = seededRng(1);
const fresh = (): ByteChaseState => byteChase.init(rng);

describe('the maze', () => {
  it('is 20 x 15 tiles (480 x 360 at 24 px) with walls all round', () => {
    expect(MAZE).toHaveLength(15);
    for (const row of MAZE) expect(row).toHaveLength(20);
    expect(MAZE[0]).toBe('#'.repeat(20));
    expect(MAZE[14]).toBe('#'.repeat(20));
    for (const row of MAZE) { expect(row[0]).toBe('#'); expect(row[19]).toBe('#'); }
  });
  it('every bit and key is reachable from the start', () => {
    const s = fresh();
    const seen = new Set<string>([`${s.player.x},${s.player.y}`]);
    const q: Array<[number, number]> = [[s.player.x, s.player.y]];
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (!seen.has(k) && open(s.grid, x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); }
      }
    }
    s.grid.forEach((row, y) => row.forEach((c, x) => { if (c === '.' || c === 'k') expect(seen.has(`${x},${y}`)).toBe(true); }));
  });
});

describe('scoring and lives', () => {
  it('a bit is 10, a key is 50 and raises a 6 s shield', () => {
    const s = fresh();
    s.glitches = [];
    s.grid[s.player.y][s.player.x + 1] = '.';
    s.grid[s.player.y][s.player.x + 2] = 'k';
    s.grid[s.player.y][s.player.x + 3] = '#'; // stop there: only what this test placed is collected
    for (let i = 0; i < 30; i += 1) byteChase.update(s, 0.02, input({ right: true }), rng);
    expect(s.score).toBe(POINTS.bit + POINTS.key);
    expect(s.shield).toBeGreaterThan(SHIELD_S - 0.7);
  });
  it('with a shield, glitches are FROZEN and touching one reboots it to its spawn for 100 (nothing flees, nothing is eaten)', () => {
    const s = fresh();
    s.shield = 5; s.safe = 0;
    const g = s.glitches[0];
    const before = s.glitches.map((x) => [x.x, x.y, x.prog, x.dir]);
    for (let i = 0; i < 40; i += 1) byteChase.update(s, 0.05, input(), rng); // two seconds of shield: an active glitch would cross several tiles
    expect(s.glitches.map((x) => [x.x, x.y, x.prog, x.dir])).toEqual(before); // frozen: no tile change, no progress
    g.x = s.player.x; g.y = s.player.y;
    byteChase.update(s, 0.01, input(), rng);
    expect(s.score).toBe(POINTS.reboot);
    expect([g.x, g.y]).toEqual([g.sx, g.sy]);
  });
  it('an active glitch costs a life; the third ends the game', () => {
    const s = fresh();
    for (let i = 1; i <= 3; i += 1) {
      s.safe = 0;
      s.glitches[0].x = s.player.x; s.glitches[0].y = s.player.y;
      byteChase.update(s, 0.01, input(), rng);
      expect(s.lives).toBe(3 - i);
    }
    expect(s.over).toBe(true);
    expect(byteChase.hud(s).over).toBe(true);
  });
  it('clearing the board is a level (500) and the next level is faster', () => {
    const s = fresh();
    s.glitches = [];
    s.grid = s.grid.map((r) => r.map((c) => (c === '.' || c === 'k' ? ' ' : c)));
    s.grid[s.player.y][s.player.x + 1] = '.';
    for (let i = 0; i < 30 && s.level === 1; i += 1) byteChase.update(s, 0.02, input({ right: true }), rng);
    expect(s.score).toBe(POINTS.bit + POINTS.level);
    expect(s.level).toBe(2);
    expect(s.grid.some((r) => r.includes('.'))).toBe(true);
  });
});

describe('originality (not the prototype\'s maze game)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'docs', 'design', 'campus', 'colaberry-campus.html'), 'utf8');
  const proto = (html.match(/const MAP=\[([^\]]+)\]/)?.[1] ?? '').match(/'([^']*)'/g)!.map((q) => q.slice(1, -1));

  it('the maze shares fewer than 70% of its interior cells (wall vs open) with the prototype', () => {
    expect(proto.length).toBe(15);
    let same = 0; let total = 0;
    for (let y = 1; y < 14; y += 1) for (let x = 1; x < 19; x += 1) {
      total += 1;
      if ((proto[y][x] === '#') === (MAZE[y][x] === '#')) same += 1;
    }
    expect(same / total).toBeLessThan(0.7);
  });
  it('the player is drawn with straight lines only: no arc, so no mouth', () => {
    const ctx = recordingCtx();
    drawPlayer(ctx, 100, 100, PALETTE);
    expect(ctx.calls.some((c) => c.op === 'arc')).toBe(false);
    expect(ctx.calls.filter((c) => c.op === 'lineTo').length).toBeGreaterThanOrEqual(3);
  });
  it('a full frame draws no arc at all and never uses the cherry color for collectibles', () => {
    const ctx = recordingCtx();
    byteChase.draw(ctx, fresh(), PALETTE);
    expect(ctx.calls.some((c) => c.op === 'arc')).toBe(false);
    const small = ctx.calls.filter((c) => c.op === 'fillRect' && (c.args[2] as number) <= 10);
    expect(small.every((c) => c.fill !== 'cherry')).toBe(true);
  });
  it('names: bits, keys, glitches, a shield (no dots, cherries, ghosts or power pellets)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'byteChaseEngine.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/\b(dot|dots|cherry_?pellet|ghost|pellet|chomp|pac)\b/i);
  });
});
