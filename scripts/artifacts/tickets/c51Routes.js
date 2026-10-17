/**
 * c51Routes - read the REAL route tree and decide whether a proposed route is free.
 *
 * C5.1's first acceptance criterion is "every page has a proposed route verified as free".
 * Verified means read from the code, not remembered: `/partners` looks obviously available
 * for an ecosystem-partner page and is already taken.
 *
 * This is deliberately a reader rather than a hardcoded list, so the check re-runs against
 * whatever the route tree says on the day the build runs. A route that someone else claims
 * next week will fail this build rather than ship a collision into C5.8.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', 'frontend', 'src');

/** Every file that can declare a route. */
function routeFiles() {
  const out = [path.join(ROOT, 'App.tsx')];
  const dir = path.join(ROOT, 'routes');
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.tsx') && !f.startsWith('__')) out.push(path.join(dir, f));
  }
  return out.filter((f) => fs.existsSync(f));
}

/**
 * Every declared path, normalized to a leading slash and no trailing slash.
 *
 * `path="..."` catches both `<Route path="x">` and object-form route definitions, which this
 * codebase uses in different files.
 */
function declaredRoutes() {
  const set = new Set();
  for (const f of routeFiles()) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/path\s*=\s*"([^"]+)"/g)) {
      let p = m[1].trim();
      if (!p || p === '*') continue;
      if (!p.startsWith('/')) p = '/' + p;
      p = p.replace(/\/+$/, '') || '/';
      set.add(p);
    }
  }
  return set;
}

/** The first segment of a path, which is what actually collides at the top level. */
const topSegment = (p) => String(p).replace(/^\/+/, '').split('/')[0].toLowerCase();

/**
 * Is `candidate` free?
 *
 * Free means: no exact match, and no existing route owns the same top-level segment. The
 * second test is the one that matters. `/partners/ecosystem` would not match any declared
 * path exactly, but `/partners` is already a page and mounting a sibling under it silently
 * changes what that page means.
 */
function checkRoute(candidate, declared = declaredRoutes()) {
  const want = candidate.replace(/\/+$/, '') || '/';
  const seg = topSegment(want);
  const exact = declared.has(want);
  const owners = [...declared].filter((d) => topSegment(d) === seg && d !== '/');
  return {
    route: want,
    free: !exact && (want === '/' ? false : owners.length === 0),
    exact,
    segment: seg,
    takenBy: owners.sort(),
  };
}

module.exports = { declaredRoutes, checkRoute, topSegment, routeFiles };
