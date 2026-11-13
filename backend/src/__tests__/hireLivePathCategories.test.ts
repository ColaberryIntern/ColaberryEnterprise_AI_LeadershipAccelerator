import fs from 'fs';
import path from 'path';
import { categorizePagePath } from '../services/visitorTrackingService';

/**
 * hire.refactored.ai: what the browser REPORTS, not what is on disk.
 *
 * `brandPageCategories.test.ts` walks the pages on disk, so it checks `/talent/record` and
 * `/schedule`, the two shells. Nobody ever visits those: nginx serves them under the live
 * paths `/talent/<slug>/`, `/talent/<slug>/schedule/` and `/case-studies/<slug>/`, and the
 * tracker sends `location.pathname`. On production on 2026-11-13, 1,708 profile, booking and
 * case-study views had been recorded and none was categorised. This file pins the live paths,
 * and ties them to the nginx routes that create them, so a renamed route fails here first.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const NGINX = path.join(REPO_ROOT, 'nginx', 'hire-refactored.conf');

describe('hire.refactored.ai live paths carry a meaning', () => {
  it.each([
    ['/talent/kesetebirhan-delele/', 'case_studies'],
    ['/talent/kesetebirhan-delele', 'case_studies'],
    ['/talent/ann-lee/schedule/', 'contact'],
    ['/talent/ann-lee/schedule?from=card', 'contact'],
    ['/case-studies/claims-triage-copilot/', 'case_studies'],
    ['/intro/', 'contact'],
    ['/', 'homepage'],
  ])('%s is %s', (live, category) => {
    expect(categorizePagePath(live, 'refactored')).toBe(category);
  });

  it('the shells still answer for a direct hit', () => {
    expect(categorizePagePath('/talent/record/', 'refactored')).toBe('case_studies');
    expect(categorizePagePath('/schedule/', 'refactored')).toBe('contact');
  });

  it('a booking is not swallowed by the broader profile prefix', () => {
    // The whole point of the pattern rule: a prefix would file the strongest intent on the
    // site as a profile view.
    expect(categorizePagePath('/talent/a/schedule', 'refactored')).not.toBe('case_studies');
  });

  it('claims nothing that is not a live Hire route', () => {
    expect(categorizePagePath('/talentpool', 'refactored')).toBe('other');
    expect(categorizePagePath('/talent/a/schedule/extra', 'refactored')).toBe('case_studies');
    expect(categorizePagePath('/x/talent/a/schedule', 'refactored')).toBe('other');
  });

  it('without the brand, Colaberry\'s own map still applies and is unchanged', () => {
    expect(categorizePagePath('/talent/ann-lee/', undefined)).toBe('other');
    expect(categorizePagePath('/stories/x', undefined)).toBe('case_studies');
  });

  it('the nginx routes these rules mirror still exist', () => {
    const conf = fs.readFileSync(NGINX, 'utf8');
    expect(conf).toContain('location ^~ /talent/');
    expect(conf).toContain('location ~ ^/talent/[^/]+/schedule/?$');
    expect(conf).toContain('location ^~ /case-studies/');
  });
});
