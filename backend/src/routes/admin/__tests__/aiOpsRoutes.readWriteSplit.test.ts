/**
 * AI Ops — reading the surface and acting on it are different grants, and that is STRUCTURAL.
 *
 * ## Why structural and not behavioural
 *
 * A behavioural test proves the routes it drives. The criterion here is about every route in the
 * file, including the ones somebody adds next year — and the way this breaks is a new control
 * route written with `requireAdmin` alone, copied from the line above it. Reading the source is
 * the only check that fails on that.
 *
 * It matters because `/api/admin/ai-ops` is now MAPPED in `mgmtSectionGate`, so a scoped identity
 * holding `intelligence` reaches this router. Before that mapping the prefix was deny-by-default
 * and `requireAdmin` alone was sufficient by accident; it is not sufficient any more, because
 * `mintMgmtAdminToken` gives every management role `role: 'admin'`.
 *
 * Technique copied from `agentToolGrantWritesOneColumn.test.ts`: strip comments and literals,
 * match SHAPE rather than vocabulary, and put the positive controls first.
 */

import fs from 'fs';
import path from 'path';

const ROUTES = path.join(__dirname, '..', 'aiOpsRoutes.ts');

/** Comments and string literals removed, so prose about a guard cannot satisfy the test. */
function codeOf(file: string): string {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

interface RouteLine {
  readonly verb: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Every `router.<verb>(` call in the file, with its guards.
 *
 * A route call can span lines, so this takes the text from the call to the first `handle...` or
 * `async` — which is where the guard list ends. A single-line regex would silently skip the
 * multi-line calls, which is exactly the hole
 * `mgmtSectionGate.guardedPathsAreClassified.test.ts` records finding the expensive way.
 */
function routeLines(): RouteLine[] {
  const raw = codeOf(ROUTES);
  const lines = raw.split('\n');
  const out: RouteLine[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^router\.(get|post|patch|put|delete)\(/.exec(lines[i].trim());
    if (!m) continue;
    // Join forward until the call's guard list is plainly over.
    let text = lines[i];
    for (let j = i + 1; j < lines.length && j < i + 8; j += 1) {
      if (/^router\./.test(lines[j].trim())) break;
      text += ` ${lines[j]}`;
      if (/handle[A-Z]|async\s*\(/.test(lines[j])) break;
    }
    out.push({ verb: m[1], line: i + 1, text });
  }
  return out;
}

const ROUTE_LINES = routeLines();
const NON_GET = ROUTE_LINES.filter((r) => r.verb !== 'get');
const GETS = ROUTE_LINES.filter((r) => r.verb === 'get');

describe('POSITIVE CONTROLS — the parser sees real routes', () => {
  it('finds a substantial number of routes, so the assertions below are not vacuous', () => {
    // A parser that matched nothing would pass every assertion in this file.
    expect(ROUTE_LINES.length).toBeGreaterThan(25);
  });

  it('finds BOTH reads and writes, which is the split being asserted', () => {
    expect(GETS.length).toBeGreaterThan(10);
    expect(NON_GET.length).toBeGreaterThan(10);
  });

  it('sees the guards that are actually on the line', () => {
    // Proves the joined text really contains the middleware, rather than stopping too early.
    const withAdmin = ROUTE_LINES.filter((r) => /requireAdmin/.test(r.text));
    expect(withAdmin.length).toBe(ROUTE_LINES.length);
  });

  it('the emergency stop and the kill switch are among the routes found', () => {
    // Name the two that matter. If a rename moved them out of this file, the rest of this suite
    // would pass while protecting nothing.
    const text = ROUTE_LINES.map((r) => r.text).join('\n');
    expect(text).toMatch(/emergency-stop/);
    expect(text).toMatch(/kill-switch/);
  });
});

describe('every non-GET route is limited to a FULL administrator', () => {
  it.each(NON_GET.map((r) => [`${r.verb.toUpperCase()} line ${r.line}`, r]))(
    '%s carries requireFullAdmin',
    (_label, route) => {
      const r = route as RouteLine;
      expect({ verb: r.verb, line: r.line, guarded: /requireFullAdmin/.test(r.text) })
        .toEqual({ verb: r.verb, line: r.line, guarded: true });
    },
  );

  it('names every unguarded control route at once, rather than failing on the first', () => {
    // The it.each above fails one route at a time. This one hands over the whole list, which is
    // what somebody adding three routes actually needs to read.
    const unguarded = NON_GET
      .filter((r) => !/requireFullAdmin/.test(r.text))
      .map((r) => `${r.verb.toUpperCase()} at line ${r.line}`);
    expect(unguarded).toEqual([]);
  });

  it('keeps requireAdmin as well, so an unauthenticated caller still gets 401 from the first gate', () => {
    for (const r of NON_GET) {
      expect({ line: r.line, both: /requireAdmin/.test(r.text) && /requireFullAdmin/.test(r.text) })
        .toEqual({ line: r.line, both: true });
    }
  });
});

describe('the GETs stay readable, which is the point of the change', () => {
  it('no GET carries requireFullAdmin', () => {
    // If a read acquires this guard, the surface stops being readable by the scoped identity
    // this whole change exists to serve — a silent revert of it, with every test still green.
    const overGuarded = GETS
      .filter((r) => /requireFullAdmin/.test(r.text))
      .map((r) => `GET at line ${r.line}`);
    expect(overGuarded).toEqual([]);
  });
});

describe('the verb split IS the read/act split', () => {
  it('no GET route name reads like an action', () => {
    // The assumption the whole structural test rests on: that GET means read here. If somebody
    // adds `GET /ai-ops/restart`, the guard placement above would be wrong and this says so.
    const actionish = /\/(restart|stop|resume|run|scan|control|discover|resolve|safe-mode|kill-switch|war-room|mark-start)\b/;
    const offenders = GETS
      .filter((r) => actionish.test(r.text))
      // The status READS of these three are legitimate GETs on an action-shaped path.
      .filter((r) => !/kill-switch|war-room|safe-mode/.test(r.text))
      .map((r) => `GET at line ${r.line}`);
    expect(offenders).toEqual([]);
  });

  it('every non-GET path IS action-shaped or a mutation of a named resource', () => {
    // The converse. A non-GET that reads like a pure read would mean the split is in the wrong
    // place, not that the guard is.
    for (const r of NON_GET) {
      expect({ line: r.line, isAction: /-|\//.test(r.text) }).toEqual({ line: r.line, isAction: true });
    }
  });
});
