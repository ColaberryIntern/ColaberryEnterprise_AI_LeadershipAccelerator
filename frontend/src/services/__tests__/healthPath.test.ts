/**
 * The SPA's health call, pinned to the route it actually reaches (Growth
 * Journey OS Phase 6, T603).
 *
 * Production's nginx log carries a repeating `GET /api/health 401` - a path
 * that is not a route (the backend serves `/health` and `/health/full`, and
 * `/api/*` falls through to the admin guard, which answers 401). T602's
 * production read traced the caller to a hand-run `curl` loop on the host, not
 * to the SPA. This suite is the standing proof of the second half of that:
 * NO frontend source requests `/api/health`, and the one health call the app
 * does make resolves to an admin route that exists.
 *
 * The resolved URL is what matters, not the string at the call site: the call
 * passes `'/health'`, but its client carries `baseURL = '/api/admin/intelligence'`,
 * so the request is `/api/admin/intelligence/health` - which is exactly the
 * route `routes/admin/intelligenceRoutes.ts` declares. (The Phase 6 contract's
 * finding 14 said this call went to `/health`; it goes to the intelligence
 * route. Either way it is not `/api/health`, which was the point.)
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');
const API = fs.readFileSync(path.join(SRC, 'services', 'intelligenceApi.ts'), 'utf8');

/** Every source file under src, tests excluded. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full);
        continue;
      }
      if (/\.(tsx?|jsx?|css|html|json)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(SRC);
  return out.sort();
}

const rel = (p: string) => path.relative(SRC, p).split(path.sep).join('/');

describe('the health call', () => {
  it('resolves to /api/admin/intelligence/health: the client\'s base plus the call\'s path', () => {
    const base = API.match(/^const API_BASE = '([^']+)';$/m)?.[1];
    const call = API.match(/^export const getHealth = \(\) => api\.get<HealthStatus>\('([^']+)'\);$/m)?.[1];
    expect(base).toBe('/api/admin/intelligence');
    expect(call).toBe('/health');
    expect(`${base}${call}`).toBe('/api/admin/intelligence/health');
    expect(API).toContain('baseURL: API_BASE');
  });

  it('is the app\'s only health request, and it is not /api/health', () => {
    const callers = sourceFiles().filter((f) => /['"`]\/api\/health['"`]|['"`]\/health['"`]/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(callers).toEqual(['services/intelligenceApi.ts']);
  });

  it('no frontend source - of any kind - names /api/health', () => {
    const named = sourceFiles().filter((f) => fs.readFileSync(f, 'utf8').includes('/api/health')).map(rel);
    expect(named).toEqual([]);
  });

  it('the scan is not vacuous: it reads enough files, and it does find the one health path there is', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(500);
    expect(files.map(rel)).toContain('services/intelligenceApi.ts');
    expect(files.filter((f) => fs.readFileSync(f, 'utf8').includes("'/health'")).map(rel)).toEqual(['services/intelligenceApi.ts']);
  });
});
