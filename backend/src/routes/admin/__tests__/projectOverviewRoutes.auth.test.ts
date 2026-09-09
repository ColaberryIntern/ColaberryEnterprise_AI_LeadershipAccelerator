import router from '../projectOverviewRoutes';

/**
 * Every new Projects endpoint must sit behind `requireAdmin`.
 *
 * WHY A TEST AND NOT THE LINT. `scripts/lint-route-auth.js` does a WHOLE-FILE substring
 * match: `projectOverviewRoutes.ts` already mentions `requireAdmin` many times, so a new
 * unguarded endpoint added to it passes CI silently. This asserts per route.
 *
 * WHY THE ROUTER STACK AND NOT A BOOTED APP. Importing the routes pulls `../../models`
 * at module scope; a supertest-style boot would need a database and end up on
 * `jest.ci.config.ts`'s ignore list, leaving the gate real locally and absent in CI.
 * Reading the stack needs no connection. `requireAdmin` is a named function declaration
 * (`authMiddleware.ts`), so its `.name` survives onto the layer.
 */

interface Layer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ name: string; handle: unknown }>;
  };
}

function routesOf(method: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const layer of (router as any).stack as Layer[]) {
    if (!layer.route || !layer.route.methods[method]) continue;
    out.set(layer.route.path, layer.route.stack.map((s) => s.name));
  }
  return out;
}

const GUARDED_GETS = [
  '/api/admin/projects/delivery',
  '/api/admin/projects/:projectId/gantt',
  '/api/admin/projects/:projectId/evidence',
  '/api/admin/projects/:projectId/artifacts',
];

describe('projectOverviewRoutes — admin guard', () => {
  const gets = routesOf('get');

  it('registers every new Projects endpoint', () => {
    // Non-vacuity: if a rename made these paths absent, every assertion below would
    // pass over an empty set and prove nothing.
    for (const path of GUARDED_GETS) {
      expect(gets.has(path)).toBe(true);
    }
  });

  it.each(GUARDED_GETS)('%s is guarded by requireAdmin', (path) => {
    expect(gets.get(path)).toContain('requireAdmin');
  });

  it('puts the guard BEFORE the handler, not after it', () => {
    // Order matters: a guard registered after the handler never runs.
    for (const path of GUARDED_GETS) {
      const names = gets.get(path) as string[];
      const guard = names.indexOf('requireAdmin');
      expect(guard).toBeGreaterThanOrEqual(0);
      expect(guard).toBeLessThan(names.length - 1);
    }
  });

  it('leaves no GET route on this router unguarded', () => {
    // Catches the next endpoint somebody adds here, not just today's four.
    const unguarded = [...gets.entries()]
      .filter(([, names]) => !names.includes('requireAdmin'))
      .map(([path]) => path);
    expect(unguarded).toEqual([]);
  });
});
