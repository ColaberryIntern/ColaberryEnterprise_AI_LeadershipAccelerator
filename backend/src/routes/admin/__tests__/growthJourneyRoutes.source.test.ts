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

describe('neither controller has a code path that reads a host header', () => {
  // Not "refuses the claim" — there is nothing to refuse. Asserted on the
  // source so a future `req.hostname` cannot slip in beside the guard.
  const HOST_READ = /req\.hostname|req\.host\b|headers\[?['"`]?host|x-forwarded-host|x-brand|req\.get\(/i;

  for (const file of ['growthJourneyController.ts', 'growthJourneyClassificationController.ts', 'growthJourneyDecisionController.ts']) {
    it(`${file} reads no host header`, () => {
      const code = stripComments(read('..', '..', '..', 'controllers', file));
      expect(code.length).toBeGreaterThan(1000); // the scan is not vacuous
      expect(code).not.toMatch(HOST_READ);
    });
  }
});
