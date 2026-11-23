import * as fs from 'fs';
import * as path from 'path';
import api from '../../utils/api';
import {
  EXPLORER_BRAND_READS_API,
  getExplorerDistribution,
  getExplorerLearner,
  getExplorerLearnerDecisions,
  getExplorerOutreach,
  getExplorerSummary,
  type ScopedResponse,
} from '../growthJourneyExplorerApi';
import { BRAND_ROLE_API, getBrandRole, putBrandRole } from '../growthJourneyBrandRoleApi';
import type { ExplorerSummary } from '../explorerGrowthApi';

jest.mock('../../utils/api', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() } }));

const mockGet = (api as unknown as { get: jest.Mock }).get;
const mockPut = (api as unknown as { put: jest.Mock }).put;

const BRAND = '10ebfb01-dc51-450d-bbef-a2c10e42efa8';

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({ data: { data: null, scope: { in_scope: false, reason: 'other_brand' } } });
  mockPut.mockResolvedValue({ data: { brand_id: BRAND, status: 'saved', role: {} } });
});

describe('the brand rides the query string, and only when there is one', () => {
  it('sends brand_id when a brand is selected', async () => {
    await getExplorerSummary(BRAND);
    expect(mockGet).toHaveBeenCalledWith(
      `/api/admin/growth-journey/explorers/summary?brand_id=${BRAND}`
    );
  });

  it('sends NO brand_id when none is selected, rather than an empty one', async () => {
    // An empty `brand_id=` is a malformed uuid and the server answers 400.
    // Absent means "nothing is narrowed yet", which is the honest state before
    // memberships are seeded, and it is the only way the page is useful today.
    await getExplorerSummary(null);
    expect(mockGet).toHaveBeenCalledWith('/api/admin/growth-journey/explorers/summary');
  });

  it('carries the path parameter in the path and the brand in the query', async () => {
    await getExplorerLearner(BRAND, 'enr-1');
    expect(mockGet).toHaveBeenCalledWith(
      `/api/admin/growth-journey/explorers/learners/enr-1?brand_id=${BRAND}`
    );
  });

  it('merges a read\'s own parameters with the brand', async () => {
    await getExplorerDistribution(BRAND, 14);
    expect(mockGet.mock.calls[0][0]).toContain('days=14');
    expect(mockGet.mock.calls[0][0]).toContain(`brand_id=${BRAND}`);

    await getExplorerOutreach(BRAND, { view: 'engaged', limit: 50, offset: 100 });
    const url = mockGet.mock.calls[1][0] as string;
    expect(url).toContain('view=engaged');
    expect(url).toContain('limit=50');
    expect(url).toContain('offset=100');
  });

  it('omits an untouched filter instead of sending it empty', async () => {
    // `params` skips undefined and ''. Several of these endpoints answer a
    // malformed value with a 400 rather than an empty list, so sending
    // `date=` is a visible error, not a no-op.
    await getExplorerLearnerDecisions(BRAND, 'enr-1', {});
    expect(mockGet.mock.calls[0][0]).toBe(
      `/api/admin/growth-journey/explorers/learners/enr-1/decisions?brand_id=${BRAND}`
    );
  });

  it('never sends `program_id`, which the server refuses', async () => {
    // It was accepted and echoed at first while nothing read it. The client
    // cannot send one now, and no signature here accepts one.
    await Promise.all([
      getExplorerSummary(BRAND),
      getExplorerDistribution(BRAND, 30),
      getExplorerLearner(BRAND, 'enr-1'),
    ]);
    for (const call of mockGet.mock.calls) {
      expect(String(call[0])).not.toContain('program_id');
    }
  });
});

describe('the brand role', () => {
  it('requires a brand on the read and the write', async () => {
    await getBrandRole(BRAND);
    expect(mockGet).toHaveBeenCalledWith(`/api/admin/growth-journey/brand-role?brand_id=${BRAND}`);

    await putBrandRole(BRAND, { title: 'Enrollment Specialist', description: 'Reaches out.' });
    expect(mockPut).toHaveBeenCalledWith(
      `/api/admin/growth-journey/brand-role?brand_id=${BRAND}`,
      { title: 'Enrollment Specialist', description: 'Reaches out.' }
    );
  });

  it('is the only write on this surface, and it is a PUT', async () => {
    // A POST would imply a brand can hold more than one role. It cannot: the
    // operation replaces one value and is idempotent.
    //
    // Checked across BOTH client modules rather than one, which is the point of
    // keeping the write in a file of its own: the assertion is "exactly one
    // mutating call exists on this surface", not "this file looks fine".
    const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const reads = read('growthJourneyExplorerApi.ts');
    const role = read('growthJourneyBrandRoleApi.ts');

    for (const src of [reads, role]) {
      expect(src).not.toMatch(/\.post[(<]/);
      expect(src).not.toMatch(/\.delete[(<]/);
      expect(src).not.toMatch(/\.patch[(<]/);
    }
    // The reads module has no write at all; the role module has exactly one.
    expect(reads).not.toMatch(/\.put[(<]/);
    expect((role.match(/\.put</g) ?? []).length).toBe(1);
  });
});

describe('the counts cannot drift', () => {
  it('names fifteen functions across the two modules, one per route', async () => {
    const reads = await import('../growthJourneyExplorerApi');
    const role = await import('../growthJourneyBrandRoleApi');

    expect(EXPLORER_BRAND_READS_API).toHaveLength(13);
    expect(BRAND_ROLE_API).toHaveLength(2);
    // Thirteen plus two is fifteen, matching T4's fifteen paths.
    const all = [...EXPLORER_BRAND_READS_API, ...BRAND_ROLE_API];
    expect(new Set(all).size).toBe(15);

    for (const name of EXPLORER_BRAND_READS_API) {
      expect(typeof (reads as unknown as Record<string, unknown>)[name]).toBe('function');
    }
    for (const name of BRAND_ROLE_API) {
      expect(typeof (role as unknown as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('declares no fetcher the lists do not name', async () => {
    // The reverse direction. Without it a fourteenth read could be added,
    // called by a panel, and never appear in the list the count cell checks.
    const fetchersOf = (mod: unknown) =>
      Object.entries(mod as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'function')
        .map(([k]) => k)
        .sort();

    expect(fetchersOf(await import('../growthJourneyExplorerApi'))).toEqual(
      [...EXPLORER_BRAND_READS_API].sort()
    );
    expect(fetchersOf(await import('../growthJourneyBrandRoleApi'))).toEqual(
      [...BRAND_ROLE_API].sort()
    );
  });
});

describe('the unscoped surface is reachable only as a TYPE', () => {
  const SRC = path.join(__dirname, '..', '..');

  function tsFilesUnder(abs: string): string[] {
    if (!fs.existsSync(abs)) return [];
    const out: string[] = [];
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const full = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') out.push(...tsFilesUnder(full));
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  /** This client plus every Growth Journey component. */
  function guardedFiles(): string[] {
    const candidates = [
      path.join(SRC, 'services', 'growthJourneyExplorerApi.ts'),
      path.join(SRC, 'services', 'growthJourneyBrandRoleApi.ts'),
      ...tsFilesUnder(path.join(SRC, 'components', 'growthJourney')),
      ...tsFilesUnder(path.join(SRC, 'components', 'explorerGrowth', 'explorers')),
    ];
    return candidates.filter((p) => fs.existsSync(p));
  }

  it('finds the files it is supposed to be guarding', () => {
    // A scan over nothing passes an "and none of them does X" assertion. The
    // panels arrive in T6, so the floor is the client plus the existing tab
    // registry rather than a number that would have to be raised per sub-task.
    const files = guardedFiles();
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.some((p) => p.endsWith('growthJourneyExplorerApi.ts'))).toBe(true);
    expect(files.some((p) => p.includes('tabViews'))).toBe(true);
  });

  /**
   * Value imports of Explorer's clients, found by STATEMENT rather than by line.
   *
   * The first version matched line by line and reported this very file's own
   * import as an offender: a multi-line `import type { ... } from './x'` puts
   * the module path on a closing line that does not begin with `import type`.
   * Line-based classification cannot see a multi-line import at all - in either
   * direction - so it would equally have missed a multi-line VALUE import, which
   * is the hazard. Statements it is.
   */
  const EXPLORER_CLIENT = /explorer(GrowthApi|CampusApi|RosterApi|KnowledgeApi)/;

  function valueImportsOf(src: string): string[] {
    const out: string[] = [];
    const statements = src.matchAll(/import\s+(type\s+)?[\s\S]*?from\s+['"]([^'"]+)['"]/g);
    for (const [whole, isType, spec] of statements) {
      if (!EXPLORER_CLIENT.test(spec)) continue;
      if (!isType) out.push(whole.replace(/\s+/g, ' ').trim());
    }
    // `require` is not an import statement and would slip past the above.
    for (const [whole, spec] of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (EXPLORER_CLIENT.test(spec)) out.push(whole);
    }
    return out;
  }

  it('imports Explorer\'s clients for their TYPES only, never their fetchers', () => {
    // The hazard is specific: a panel that imports Explorer's fetchers calls the
    // UNSCOPED surface and shows one brand's learners under another brand's
    // name. A type import cannot do that - types are erased and emit no
    // JavaScript - so the ban is on VALUE imports, which is where the hazard is.
    const offenders: string[] = [];
    for (const file of guardedFiles()) {
      for (const stmt of valueImportsOf(fs.readFileSync(file, 'utf8'))) {
        offenders.push(`${path.relative(SRC, file).replace(/\\/g, '/')}: ${stmt}`);
      }
    }
    // Named rather than counted, so a failure says which file to look at.
    expect(offenders).toEqual([]);
  });

  it('and that scan can fail, on every spelling a leak could use', () => {
    // The positive control. Without it the cell above passes on an empty list
    // whether or not the pattern works - and this scan has already been wrong
    // once, in the line-based version it replaced.
    expect(valueImportsOf("import { getLearners } from './explorerGrowthApi';")).toHaveLength(1);
    expect(valueImportsOf("import api, { getSummary } from './explorerGrowthApi';")).toHaveLength(1);
    expect(valueImportsOf("import * as ex from './explorerGrowthApi';")).toHaveLength(1);
    expect(valueImportsOf("const { getLearners } = require('./explorerGrowthApi');")).toHaveLength(1);
    // The multi-line value import the line-based version could not classify.
    expect(
      valueImportsOf("import {\n  getLearners,\n  getSummary,\n} from './explorerGrowthApi';")
    ).toHaveLength(1);

    // ...and passes the forms that are genuinely safe.
    expect(valueImportsOf("import type { LearnerProfile } from './explorerGrowthApi';")).toEqual([]);
    expect(
      valueImportsOf("import type {\n  LearnerProfile,\n} from './explorerGrowthApi';")
    ).toEqual([]);
    // A genuinely different module is not matched.
    expect(valueImportsOf("import { getStatus } from './growthJourneyApi';")).toEqual([]);
    expect(valueImportsOf("import api from '../utils/api';")).toEqual([]);

    // The specifier match is UNANCHORED on purpose, so a module whose name
    // merely starts with one of these is still caught. That is the re-export
    // shim the backend's own leak guard says it cannot see: a wrapper called
    // `explorerGrowthApiScoped` re-exporting Explorer's fetchers would be the
    // cheapest way to get the unscoped surface into a panel while passing a
    // scan that demanded an exact module name.
    expect(valueImportsOf("import { getLearners } from './explorerGrowthApiScoped';")).toHaveLength(1);
  });
});

/**
 * ─── THE TYPE-LEVEL PIN ─────────────────────────────────────────────────────
 *
 * `data` is `T | null` so a consumer cannot render a page without handling the
 * out-of-scope case. Nothing at runtime can assert that; `@ts-expect-error` can,
 * and it fails LOUDLY in the right direction: if `data` ever became
 * non-nullable, the directive would be unused and `tsc` reports
 * "Unused '@ts-expect-error' directive". The frontend tsconfig includes `src`,
 * so this file is typechecked.
 *
 * This is the whole reason the envelope exists, so it is pinned rather than
 * trusted to review.
 */
export function typeLevelPins(res: ScopedResponse<ExplorerSummary>): void {
  // @ts-expect-error `data` is nullable on purpose: a consumer must handle the
  // out-of-scope case rather than render zeros for a brand it may not see.
  const forced: NonNullable<typeof res.data> = res.data;
  void forced;

  // The handled form compiles, which is what a panel is expected to write.
  if (res.data !== null) {
    const handled: NonNullable<typeof res.data> = res.data;
    void handled;
  }
}
