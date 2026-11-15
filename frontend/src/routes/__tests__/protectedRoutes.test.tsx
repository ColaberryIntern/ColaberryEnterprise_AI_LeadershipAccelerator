/**
 * protectedRoutes.test.tsx — routes that this redesign is not allowed to move.
 *
 * WHY THIS FILE EXISTS. The v5 site restructure (docs/enterprise-site-v5/)
 * merges, replaces and redirects a lot of the marketing tree. Two surfaces are
 * explicitly out of its scope, and both were given as instructions rather than
 * inferred:
 *
 *   /proof   Ali, 2026-11-15: "Make sure you don't copy over Proof page".
 *            The v5 model happens to agree ("Keep as is, per your instruction"),
 *            but the model is not the authority here; the instruction is.
 *
 *   /pricing Ali, 2026-11-15, setting the adoption scope: the whole site map
 *            EXCEPT pricing. PR #4043 deliberately kept the license ladder on
 *            that page, because `pricing.team` and `pricing.department` are
 *            approved in the claims registry for '/pricing' ONLY -- naming that
 *            route is what makes them publishable. A redesign that quietly
 *            retired the page would take approved, governed prices off the site
 *            as a side effect.
 *
 * A comment saying "do not touch /proof" does not fail a build. This does.
 *
 * It asserts against the ROUTE TABLE rather than a rendered page, deliberately:
 * these two pages reach the network and the claims registry, so rendering them
 * here would test the harness more than the routing. What can actually regress
 * is the route entry -- deleted, renamed, or quietly turned into a <Navigate>
 * -- and that is exactly what this reads.
 */

import fs from 'fs';
import path from 'path';

const APP = fs.readFileSync(
  path.join(__dirname, '..', '..', 'App.tsx'),
  'utf8',
);

/** The JSX for one route path, if it is declared at all. */
function routeLine(routePath: string): string | undefined {
  const re = new RegExp(`<Route\\s+path="${routePath}"[^>]*/>`, 'm');
  return (APP.match(re) || [])[0];
}

describe('routes the v5 restructure must not move', () => {
  it('/proof is still declared', () => {
    expect(routeLine('proof')).toBeDefined();
  });

  it('/proof still renders the published records, and is not a redirect', () => {
    const line = routeLine('proof')!;
    // StoriesV2 took over /proof on 2026-09-04 and is the published-records index.
    expect(line).toContain('StoriesV2');
    expect(line).not.toContain('Navigate');
  });

  it('/pricing is still declared', () => {
    expect(routeLine('pricing')).toBeDefined();
  });

  it('/pricing still renders the pricing page, and is not a redirect', () => {
    const line = routeLine('pricing')!;
    expect(line).toContain('PricingV2');
    expect(line).not.toContain('Navigate');
  });

  it('neither page has been merged into the demo-pilot conversion page', () => {
    // /contact and /lab ARE being folded into one conversion page by this
    // restructure. These two are not, and must never appear in that merge.
    expect(routeLine('proof')).not.toContain('demo-pilot');
    expect(routeLine('pricing')).not.toContain('demo-pilot');
  });
});
