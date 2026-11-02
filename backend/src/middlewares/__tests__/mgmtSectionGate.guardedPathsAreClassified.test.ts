/**
 * A route guarded `requireSection(S)` must have its path classified as S by `mgmtSectionGate`.
 *
 * ## Why this test exists
 *
 * On 2 Nov 2026 four agent builders reported the same 403 on the same day. One of them,
 * `PATCH /api/admin/agents/:agentId/display-name`, was guarded `requireSection('dashboard')` and
 * every one of those builders already held `dashboard`. The route guard was correct. The path was
 * simply absent from `PATH_SECTION`, and the gate runs first:
 *
 *     const section = pathToSection(req.path);                       // null when unclassified
 *     if (section && allowed.includes(section)) return next();       // null fails this
 *     res.status(403).json({ error: 'You do not have access to this section.' });
 *
 * So the gate refused them before their route's own guard could admit them. Five routes were in
 * that state.
 *
 * What made it invisible: a `mgmt_role === 'admin'` caller takes the `isBroad` branch, which
 * denies only paths that ARE mapped — an unmapped path passes for admin and is refused for every
 * scoped role. Owner and admin accounts therefore see all of this working perfectly, which is
 * exactly who tends to test it.
 *
 * `requireSection(S)` is a claim about who may reach a route. This test holds the gate to that
 * claim, so the next route mounted without a classification fails here instead of in an intern's
 * browser a fortnight later.
 *
 * ## Why it reads source text
 *
 * Importing every admin router would pull in database handles and service singletons. The repo
 * already has the lighter precedent of reading a router's own source to enumerate its guards
 * (`agentDisplayNameRoutes.access.test.ts` reads `ROUTER_SRC`). This does the same across the
 * whole route tree. The floor assertion below is what keeps a parser that silently stops matching
 * from turning this into a test that passes by finding nothing.
 */
import fs from 'fs';
import path from 'path';
import { pathToSection } from '../mgmtSectionGate';

const ROUTES_DIR = path.join(__dirname, '..', '..', 'routes');

/** Every `.ts` file under `routes/`, excluding test directories. */
function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') routeFiles(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Block and line comments removed, so prose that merely MENTIONS `requireSection('x')` -- and
 * several of these files discuss their own guards at length -- cannot be read as a route.
 * Lengths are preserved so nothing downstream depends on offsets being unchanged.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

const METHOD_OPENERS = ['get', 'post', 'put', 'patch', 'delete'].map((m) => `router.${m}(`);

interface GuardedRoute {
  readonly file: string;
  readonly routePath: string;
  readonly section: string;
}

/** Each `router.METHOD('<path>', ..., requireSection('<section>'), ...)` under `/api/admin`. */
function guardedRoutes(): GuardedRoute[] {
  const found: GuardedRoute[] = [];

  for (const file of routeFiles(ROUTES_DIR)) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(path.join(__dirname, '..', '..'), file).replace(/\\/g, '/');

    for (const m of src.matchAll(/requireSection\(\s*'([a-z_]+)'\s*\)/g)) {
      const section = m[1] as string;
      const at = m.index ?? 0;

      // Walk back to the router call this guard sits inside, then take that call's FIRST path
      // literal -- which is the route path, because it is the first argument.
      const before = src.slice(0, at);
      const callStart = Math.max(...METHOD_OPENERS.map((o) => before.lastIndexOf(o)));
      if (callStart < 0) continue;

      const window = src.slice(callStart, at);
      const firstPath = window.match(/['"`](\/api\/[^'"`]+)['"`]/);
      if (!firstPath) continue;

      const routePath = firstPath[1] as string;
      if (!routePath.startsWith('/api/admin')) continue;

      found.push({ file: rel, routePath, section });
    }
  }
  return found;
}

describe('mgmtSectionGate classifies every path whose route guard names a section', () => {
  const routes = guardedRoutes();

  // A regex that stops matching would otherwise make every assertion below vacuously true. There
  // were 108 such routes when this landed; the floor is deliberately well under that so ordinary
  // churn does not trip it, while a parser that breaks outright does.
  it('finds a realistic number of requireSection-guarded admin routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(90);
  });

  it('classifies every one of them, so no route guard is unreachable', () => {
    const unreachable = routes
      .filter((r) => pathToSection(r.routePath) === null)
      .map((r) => `${r.routePath} wants '${r.section}' (${r.file})`);

    expect(unreachable).toEqual([]);
  });

  it('classifies each one as the SAME section its route guard names', () => {
    const mismatched = routes
      .map((r) => ({ ...r, got: pathToSection(r.routePath) }))
      .filter((r) => r.got !== null && r.got !== r.section)
      .map((r) => `${r.routePath}: gate says '${r.got}', route guard says '${r.section}' (${r.file})`);

    expect(mismatched).toEqual([]);
  });

  // The seven that were broken on 2 Nov 2026, named individually. The sweeping assertions above
  // would cover a regression here, but they would not say which surface broke or who it blocks,
  // and the next person reading a failure deserves the specific sentence.
  describe('the seven found unclassified on 2 Nov 2026', () => {
    it.each([
      ['/api/admin/agents/:agentId/display-name', 'dashboard', 'the agent naming save'],
      ['/api/admin/agent-domains-summary', 'program', 'the domain summary'],
      ['/api/admin/agent-nudges', 'internship', 'the nudge list'],
      ['/api/admin/agent-nudges/:domain', 'internship', 'the per-domain nudge'],
      ['/api/admin/agent-domains-builders', 'internship', 'the builder roster, applicant data'],
      ['/api/admin/agent-domains-authorization', 'program', 'the authorization read'],
    ])('%s resolves to %s (%s)', (routePath, section) => {
      expect(pathToSection(routePath as string)).toBe(section);
    });
  });

  // The '-domains' family is a row of hyphen siblings, and `matchesPrefix` requires an exact
  // match or a '/' boundary — which is the whole reason each needs its own row. If that ever
  // relaxed to a bare `startsWith`, '/api/admin/agent-domains' would start swallowing all of
  // them and silently reclassify four surfaces at once.
  it('keeps each agent-domains sibling on its own section', () => {
    expect({
      mine: pathToSection('/api/admin/agent-domains-mine'),
      provisioned: pathToSection('/api/admin/agent-domains-provisioned'),
      summary: pathToSection('/api/admin/agent-domains-summary'),
      builders: pathToSection('/api/admin/agent-domains-builders'),
      authorization: pathToSection('/api/admin/agent-domains-authorization'),
      plain: pathToSection('/api/admin/agent-domains'),
    }).toEqual({
      mine: 'dashboard',
      provisioned: 'program',
      summary: 'program',
      builders: 'internship',
      authorization: 'program',
      plain: 'program',
    });
  });

  // `/api/admin/agents` classifies a whole subtree because a static prefix cannot express
  // ':agentId/display-name'. That is only safe while every other route under it carries its own
  // guard, so the claim is asserted rather than left in a comment.
  it('leaves every other /api/admin/agents route carrying its own guard', () => {
    const unguarded: string[] = [];

    for (const file of routeFiles(ROUTES_DIR)) {
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      const rel = path.relative(path.join(__dirname, '..', '..'), file).replace(/\\/g, '/');

      for (const m of src.matchAll(/router\.(?:get|post|put|patch|delete)\(\s*['"`](\/api\/admin\/agents[^'"`]*)['"`]([\s\S]{0,300}?)\)\s*;/g)) {
        const routePath = m[1] as string;
        const rest = m[2] as string;
        const guarded = /require(Admin|Section|AgentManagerOrAdmin)/.test(rest);
        if (!guarded) unguarded.push(`${routePath} (${rel})`);
      }
    }

    expect(unguarded).toEqual([]);
  });
});
