import * as fs from 'fs';
import * as path from 'path';
import {
  CASE_STUDY_SURFACES,
  PUBLISHABLE_CASE_STUDY_SURFACES,
} from '../caseStudySurfaces';

/**
 * The frontend's copy of "which surfaces can be published to" must agree with
 * the backend's.
 *
 * WHY THIS EXISTS, and it is a specific failure rather than a hypothetical one.
 * On 2026-09-07 the backend added `training` to `PUBLISHABLE_SURFACE_KEYS` and
 * training.colaberry.com/student-projects went live. This file's copy still
 * said `['enterprise', 'ai-flotation']`, so the admin's publish panel rendered
 * no Training row and the record could not be published to it at all.
 *
 * NOTHING FAILED. No error, no console warning, no red test. A missing row
 * looks exactly like a surface that was never meant to be there, which is why
 * it was found by a person looking at the screen rather than by CI. The mirror
 * is deliberate — the publish gate re-checks server-side, so a stale copy can
 * only ever offer a button the server refuses — but "fails safe" is not the
 * same as "fails visibly", and this one failed silently in the other direction:
 * it withheld a button the server would have accepted.
 *
 * So the test reads the BACKEND SOURCE, not a second hand-written list. A guard
 * whose expected value is typed out here would drift in exactly the same way as
 * the thing it guards.
 */

const BACKEND_TYPES = path.resolve(
  __dirname, '..', '..', '..', '..', 'backend', 'src', 'types', 'caseStudy.ts',
);

/** `export const PUBLISHABLE_SURFACE_KEYS = ['a', 'b'] as const;` → ['a','b'] */
function backendPublishableKeys(): string[] {
  const source = fs.readFileSync(BACKEND_TYPES, 'utf8');
  const match = source.match(/PUBLISHABLE_SURFACE_KEYS\s*=\s*\[([^\]]*)\]/);
  if (!match) throw new Error(`PUBLISHABLE_SURFACE_KEYS not found in ${BACKEND_TYPES}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('the frontend surface mirror', () => {
  it('finds the backend constant at all — a green run over nothing proves nothing', () => {
    expect(backendPublishableKeys().length).toBeGreaterThan(0);
  });

  it('offers exactly the surfaces the backend will publish to', () => {
    // Order-insensitive: the backend list is ordered by when each surface went
    // live, which is not a fact this file needs to reproduce.
    expect([...PUBLISHABLE_CASE_STUDY_SURFACES].sort())
      .toEqual(backendPublishableKeys().sort());
  });

  it('gives every publishable surface an address an operator can click', () => {
    // The publish panel prints "where it appears" next to each row. A
    // publishable surface with no `liveUrl` renders a row that publishes a
    // record to somewhere the operator cannot then go and look at — which is
    // the state `training` was in before it had a page.
    for (const key of PUBLISHABLE_CASE_STUDY_SURFACES) {
      const profile = CASE_STUDY_SURFACES[key];
      expect(`${key}: ${profile.liveUrl ?? 'NO LIVE URL'}`)
        .toBe(`${key}: ${profile.liveUrl}`);
      expect(profile.liveUrl).toMatch(/^https:\/\//);
    }
  });
});
