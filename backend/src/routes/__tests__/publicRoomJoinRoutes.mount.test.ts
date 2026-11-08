/**
 * publicRoomJoinRoutes - mount order and router structure.
 *
 * WHY A STRUCTURAL SUITE. The failure this guards against - mounting a public
 * router below `adminRoutes` - turns the endpoint into a 401 for anonymous
 * traffic while every authenticated smoke test still passes. For this route that
 * is worse than usual: the URL is pasted into recurring calendar invites, so the
 * breakage surfaces weeks after the deploy that caused it, at the start of a
 * session, to people who cannot debug it and will simply not get in.
 *
 * So the ordering is asserted against the text of `server.ts`, the path against
 * `router.stack` (a 200 alone does not prove a path is declared where you think
 * it is), and the "never a bare `router.use`" rule against Express's own
 * `fast_slash` flag. Modelled on publicCaseStudyRoutes.mount.test.ts.
 *
 * No database, no network, no supertest.
 */

import fs from 'fs';
import path from 'path';
import publicRoomJoinRoutes from '../publicRoomJoinRoutes';
import { ROOM_JOIN_PATH_PREFIX } from '../../services/communityRooms/roomJoinToken';

const BACKEND = path.join(__dirname, '../../..');
const read = (rel: string): string => fs.readFileSync(path.join(BACKEND, rel), 'utf8');

interface Layer {
  name: string;
  route?: { path: string; methods: Record<string, boolean> };
  regexp: RegExp & { fast_slash?: boolean };
}

const layers = (): Layer[] => (publicRoomJoinRoutes as unknown as { stack: Layer[] }).stack;

/* --------------------------------------------------------- declared paths --- */

describe('the router declares exactly one public endpoint', () => {
  it('declares the join path and nothing else', () => {
    const declared = layers().filter((l) => l.route).map((l) => l.route!.path);
    expect(declared).toEqual([`${ROOM_JOIN_PATH_PREFIX}/:token`]);
  });

  it('declares it as a GET, and nothing else', () => {
    for (const layer of layers()) {
      if (!layer.route) continue;
      expect(Object.keys(layer.route.methods)).toEqual(['get']);
    }
  });

  it('uses an absolute path, so the flat app.use(router) mount resolves it', () => {
    for (const declared of layers().filter((l) => l.route).map((l) => l.route!.path)) {
      expect(declared.startsWith('/api/public/')).toBe(true);
    }
  });

  // publicCareerPortfolioRoutes.ts documents this trap: `/api/public/portfolio/:token`
  // already exists, and a `:token` segment will happily match a slug, a collision
  // resolved by mount order and maddening to debug.
  it('is not mounted under a prefix an existing :token route could shadow', () => {
    expect(ROOM_JOIN_PATH_PREFIX).not.toMatch(/^\/api\/public\/portfolio/);
    const portfolio = read('src/routes/publicPortfolioRoutes.ts');
    const theirPrefix = (/\/api\/public\/portfolio[a-z/-]*/.exec(portfolio) || [''])[0];
    expect(ROOM_JOIN_PATH_PREFIX.startsWith(theirPrefix)).toBe(false);
  });
});

/* ------------------------------------------------------ path-scoped guards --- */

describe('no bare router.use()', () => {
  it('every middleware layer is path-scoped', () => {
    const bare = layers().filter((l) => !l.route && l.regexp.fast_slash === true);
    expect(bare).toEqual([]);
  });

  it('the rate limiter is scoped to the join prefix', () => {
    const sources = layers().filter((l) => !l.route).map((l) => String(l.regexp));
    expect(sources.some((s) => s.includes('join'))).toBe(true);
  });

  it('the source carries the warning, so the next editor sees the rule', () => {
    expect(read('src/routes/publicRoomJoinRoutes.ts')).toMatch(/NEVER BARE/);
  });
});

/* --------------------------------------------------- the redirect contract --- */

describe('the redirect contract is pinned in the source', () => {
  const source = read('src/routes/publicRoomJoinRoutes.ts');

  // A 301 is cached by the browser more or less indefinitely, so one click
  // before a re-mint would pin that person to the dead room forever -
  // reintroducing the exact defect this route exists to remove.
  it('redirects with 302 and never 301', () => {
    expect(source).toMatch(/res\.redirect\(302,/);
    expect(source).not.toMatch(/res\.redirect\(301/);
    expect(source).toMatch(/301/); // the reasoning is written down, not just obeyed
  });

  it('sends no-store, because the target is expected to change', () => {
    expect(source).toMatch(/'Cache-Control',\s*'no-store'/);
  });

  it('answers every refusal with the same 404 and never a 403 or 410', () => {
    expect(source).toMatch(/res\.status\(404\)/);
    expect(source).not.toMatch(/res\.status\(403\)/);
    expect(source).not.toMatch(/res\.status\(410\)/);
  });

  it('never logs the token itself', () => {
    // the token is a credential: its length distinguishes malformed from
    // well-formed without putting a working address into the log
    expect(source).toMatch(/token_length/);
    expect(source).not.toMatch(/token:\s*token/);
  });
});

/* -------------------------------------------------------------- server.ts --- */

describe('mount order in server.ts', () => {
  const server = read('src/server.ts');
  const lineOf = (needle: string): number =>
    server.split('\n').findIndex((l) => l.trim().startsWith(needle));

  it('is mounted at all', () => {
    expect(lineOf('app.use(publicRoomJoinRoutes);')).toBeGreaterThan(-1);
  });

  it('is mounted ABOVE adminRoutes', () => {
    const mount = lineOf('app.use(publicRoomJoinRoutes);');
    const admin = lineOf('app.use(adminRoutes);');
    expect(admin).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(admin);
  });

  it('carries a note saying why it cannot move below adminRoutes', () => {
    const note = server.indexOf('mounting it below adminRoutes would 401 every attendee');
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(server.indexOf('app.use(adminRoutes);'));
  });
});
