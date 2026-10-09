import * as fs from 'fs';
import * as path from 'path';
import { GROWTH_JOURNEY_ENV_KEYS } from '../../../config/growthJourneyFlags';

/**
 * Static assertions on the Growth Journey admin route module and its three
 * controllers (T207 read routes, T229 classification routes, T312 decision routes). Split out of the
 * HTTP access suite when that file crossed the 500-line ceiling: these read
 * SOURCE, need no app, no token and no mock, and guard properties a behaviour
 * test cannot see (a flag name that never appears; a header that is never read).
 */

const HERE = __dirname;
const read = (...rel: string[]) => fs.readFileSync(path.join(HERE, ...rel), 'utf8');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the route module reads the MASTER flag only', () => {
  it('never a sub-flag - so the dark-launch guard stays green', () => {
    const code = stripComments(read('..', 'growthJourneyRoutes.ts'));
    expect(code).toMatch(/growthJourney\.growthJourneyEnabled/);
    // The sub-flag names are DERIVED here, never written: the dark-launch guard
    // scans every .ts file's raw text - this one included - and the first draft
    // of this assertion spelled the names out inside a regex literal and
    // tripped it. Building the pattern from the module's own keys leaves no
    // dotted name in this file for the guard to find.
    const subFlags = Object.keys(GROWTH_JOURNEY_ENV_KEYS).filter((k) => k !== 'growthJourneyEnabled');
    // This assertion used to pin the sub-flag COUNT, and that pin went stale the
    // moment T303 added a fourth flag: the canonical count lives in
    // `config/__tests__/growthJourneyFlags.test.ts`, that one was updated, and
    // this second copy was not. It stayed red and unseen because the per-task
    // surface runs were scoped and never included this file. One count pin, in
    // one place. Non-vacuity here is the two properties that actually make the
    // loop below mean something: there are names to scan for, and the pattern
    // really does match a dotted read when one is present.
    expect(subFlags.length).toBeGreaterThan(0);
    for (const flag of subFlags) {
      expect(new RegExp(`\\.${flag}\\b`).test(`if (flags.${flag}) {}`)).toBe(true);
      expect(code).not.toMatch(new RegExp(`\\.${flag}\\b`));
    }
  });
});

describe('no controller has a code path that reads a host header', () => {
  // Not "refuses the claim" — there is nothing to refuse. Asserted on the
  // source so a future `req.hostname` cannot slip in beside the guard.
  const HOST_READ = /req\.hostname|req\.host\b|headers\[?['"`]?host|x-forwarded-host|x-brand|req\.get\(/i;

  for (const file of ['growthJourneyController.ts', 'growthJourneyClassificationController.ts', 'growthJourneyDecisionController.ts', 'growthJourneyHandoffController.ts', 'growthJourneyPersonController.ts', 'growthJourneyExecutionController.ts']) {
    it(`${file} reads no host header`, () => {
      const code = stripComments(read('..', '..', '..', 'controllers', file));
      expect(code.length).toBeGreaterThan(1000); // the scan is not vacuous
      expect(code).not.toMatch(HOST_READ);
    });
  }
});

/**
 * T612: every Growth Journey router carries the rate limit, and carries it PATH-SCOPED.
 *
 * The acceptance line for this task asked for a test that lists the four router files
 * and asserts each imports `express-rate-limit`. That is weaker than it sounds in two
 * directions, so this asserts something stronger instead. A direct import of the
 * library would be satisfied by four copies of the same nine-line config - the
 * duplication the shared module exists to remove - and the files now import that module
 * rather than the library. And an import proves nothing about the line that matters:
 * `router.use(limiter)` bare would pass an import check while gating every unrelated
 * router mounted after it, which is the failure this repo has had in production twice.
 * So each file must MOUNT the limiter, and the mount must carry a path argument.
 */
describe('T612: the rate limiter is mounted on every Growth Journey router, path-scoped', () => {
  const ADMIN_ROUTERS = ['growthJourneyRoutes.ts', 'growthJourneyStatusRoutes.ts', 'growthJourneyReadRoutes.ts'];

  describe.each(ADMIN_ROUTERS)('%s', (file) => {
    const code = () => stripComments(read('..', file));

    it('imports the shared limiter', () => {
      expect(code()).toMatch(/import \{[^}]*growthJourneyAdminLimiter[^}]*\} from '\.\.\/growthJourneyRateLimit'/);
    });

    it('mounts it WITH a path prefix', () => {
      expect(code()).toMatch(/router\.use\(\s*[A-Za-z_$][\w$]*\s*,\s*growthJourneyAdminLimiter\s*\)/);
    });

    it('never mounts it bare - a bare use() bills unrelated routers', () => {
      expect(code()).not.toMatch(/router\.use\(\s*growthJourneyAdminLimiter\s*\)/);
    });

    it('mounts it BELOW requireAdmin, so the key is an admin and not the CDN edge', () => {
      // Inverted after T612's verifier proved the original ordering keyed on a
      // Cloudflare edge node in production: no guard runs before this router, so
      // `req.admin` was never set and `req.ip` - the edge - was the only key. Every
      // caller behind one PoP shared a 120/min bucket, and an unauthenticated flood
      // would have spent it and locked out every admin. `authFailureLog.ts` has
      // recorded since August 2026 that `req.ip` here names the CDN and must never
      // become a rate-limiting input.
      const c = code();
      const limiter = c.indexOf('growthJourneyAdminLimiter)');
      const guard = c.search(/router\.use\([A-Za-z_$][\w$]*, requireAdmin\)/);
      expect(limiter).toBeGreaterThan(-1);
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(limiter);
    });
  });

  describe('journeyNudgeRoutes.ts', () => {
    const code = () => stripComments(read('..', '..', 'journeyNudgeRoutes.ts'));

    it('builds its OWN bucket rather than sharing the admin one', () => {
      const c = code();
      expect(c).toMatch(/import \{[^}]*makeGrowthJourneyLimiter[^}]*\} from '\.\/growthJourneyRateLimit'/);
      expect(c).toMatch(/makeGrowthJourneyLimiter\('journey-nudges'\)/);
      // An admin id means nothing on a learner surface, and one shared IP bucket would
      // let a learner and an admin exhaust each other's budget.
      expect(c).not.toContain('growthJourneyAdminLimiter');
    });

    it('sits AFTER requireParticipant in every route chain, and is never a bare use()', () => {
      // These guards are per-route, so there is no `router.use` to sit below. Ahead of
      // them the limiter would key on `req.ip` - the Cloudflare edge, not a learner.
      const c = code();
      const chains = c.match(/router\.(get|post)\([^)]*\)/g) ?? [];
      const guarded = chains.filter((line) => line.includes('requireParticipant'));
      expect(guarded.length).toBeGreaterThanOrEqual(2);
      for (const line of guarded) {
        expect(line).toContain('nudgeLimiter');
        expect(line.indexOf('requireParticipant')).toBeLessThan(line.indexOf('nudgeLimiter'));
      }
      expect(c).not.toMatch(/router\.use\(\s*nudgeLimiter\s*\)/);
    });
  });

  it('the shared module is the ONLY place the library is imported for these routers', () => {
    // One answer in the repo to "how fast may a client hit this surface", rather than
    // four that can drift apart.
    for (const file of ADMIN_ROUTERS) {
      expect(stripComments(read('..', file))).not.toContain('express-rate-limit');
    }
    expect(stripComments(read('..', '..', 'journeyNudgeRoutes.ts'))).not.toContain('express-rate-limit');
    expect(stripComments(read('..', '..', 'growthJourneyRateLimit.ts'))).toContain("from 'express-rate-limit'");
  });

  it('the scan is anchored on CODE, not prose - a header that discusses the mount does not satisfy it', () => {
    // The positive control. Without it this whole describe could be passing on comment
    // text, which is exactly how a grep in this task reported a deleted guard as present.
    const commentOnly = stripComments(
      '// router.use(BASE, growthJourneyAdminLimiter);\n/* router.use(X, growthJourneyAdminLimiter) */\n',
    );
    expect(commentOnly).not.toMatch(/router\.use\(\s*[A-Za-z_$][\w$]*\s*,\s*growthJourneyAdminLimiter\s*\)/);
  });
});
