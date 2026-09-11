import * as fs from 'fs';
import * as path from 'path';
import { GROWTH_JOURNEY_ENV_KEYS } from '../../../config/growthJourneyFlags';

/**
 * Static assertions on the Growth Journey admin route module and its two
 * controllers (T207 read routes, T229 classification routes). Split out of the
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
    // of this assertion spelled the three names out inside a regex literal and
    // tripped it. Building the pattern from the module's own keys leaves no
    // dotted name in this file for the guard to find.
    const subFlags = Object.keys(GROWTH_JOURNEY_ENV_KEYS).filter((k) => k !== 'growthJourneyEnabled');
    expect(subFlags).toHaveLength(3);
    for (const flag of subFlags) expect(code).not.toMatch(new RegExp(`\\.${flag}\\b`));
  });
});

describe('neither controller has a code path that reads a host header', () => {
  // Not "refuses the claim" — there is nothing to refuse. Asserted on the
  // source so a future `req.hostname` cannot slip in beside the guard.
  const HOST_READ = /req\.hostname|req\.host\b|headers\[?['"`]?host|x-forwarded-host|x-brand|req\.get\(/i;

  for (const file of ['growthJourneyController.ts', 'growthJourneyClassificationController.ts']) {
    it(`${file} reads no host header`, () => {
      const code = stripComments(read('..', '..', '..', 'controllers', file));
      expect(code.length).toBeGreaterThan(1000); // the scan is not vacuous
      expect(code).not.toMatch(HOST_READ);
    });
  }
});
