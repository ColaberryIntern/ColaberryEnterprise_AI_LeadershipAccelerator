/**
 * A section refusal must NOT raise a toast, and every other 4xx must.
 *
 * Mihret Netsereab, 2 Nov 2026, screenshotted /admin/dashboard under a scoped role: ten red
 * banners, all of them "You do not have access to this section", stacked over every tile.
 *
 * Nothing was broken. That page fires thirteen requests in one `Promise.allSettled` and correctly
 * renders nothing for the ones a scoped role cannot see. The wall came from the response
 * interceptor, which raised a global toast for every 4xx carrying a server message, so the one
 * case where a 403 is the system working as designed was reported ten times as a failure.
 *
 * THE TEST THAT CARRIES THE WEIGHT is "ten refusals in one page load raise ZERO toasts": the
 * single-refusal case passes even if the suppression is keyed on something that happens to be
 * true once, and ten-at-once is the shape she actually hit.
 */

import { setGlobalErrorHandler } from '../api';

/**
 * Drive the interceptor through axios's own handler rather than re-implementing it.
 *
 * Re-stating the branch logic in the test would mean the test agrees with itself and says nothing
 * about the shipped code. `api.interceptors.response.handlers[0].rejected` IS the function the
 * module installed.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../api').default;

type Rejected = (error: unknown) => Promise<unknown>;
const rejected: Rejected = api.interceptors.response.handlers[0].rejected;

function refuse(status: number, data: unknown, url = '/api/admin/leads/stats') {
  return rejected({ response: { status, data }, config: { url, method: 'get' } }).catch(() => undefined);
}

const SECTION_403 = {
  error: 'You do not have access to this section.',
  code: 'section_not_permitted',
};

let toasts: string[];
let debugSpy: jest.SpyInstance;

beforeEach(() => {
  toasts = [];
  setGlobalErrorHandler((m: string) => { toasts.push(m); });
  debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  localStorage.clear();
});

afterEach(() => {
  debugSpy.mockRestore();
  setGlobalErrorHandler(null as unknown as (m: string) => void);
});

describe('a section refusal is the system working, not a failure to report', () => {
  it('raises NO toast for a 403 carrying the section code', async () => {
    await refuse(403, SECTION_403);
    expect(toasts).toEqual([]);
  });

  it('TEN refusals in one page load raise ZERO toasts, which is the reported shape', async () => {
    // Her dashboard: thirteen requests, about ten refused. One suppressed refusal proves little;
    // ten is the wall she photographed.
    const paths = [
      '/api/admin/stats', '/api/admin/cohorts', '/api/admin/opportunities/summary',
      '/api/admin/opportunities/forecast', '/api/admin/leads/stats', '/api/admin/pipeline/stats',
      '/api/admin/dashboard/campaign-activity', '/api/admin/scheduler/status',
      '/api/admin/admissions/stats', '/api/admin/dashboard/campaign-performance',
    ];
    await Promise.all(paths.map((p) => refuse(403, SECTION_403, p)));
    expect(toasts).toEqual([]);
  });

  it('still records each one in the console, so a blank page stays diagnosable', async () => {
    await refuse(403, SECTION_403, '/api/admin/pipeline/stats');
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(String(debugSpy.mock.calls[0][0])).toContain('/api/admin/pipeline/stats');
  });

  it('matches on the CODE, not on the sentence', async () => {
    // An English string is not an interface. A 403 worded identically but carrying no code is a
    // different thing and must still be reported.
    await refuse(403, { error: 'You do not have access to this section.' });
    expect(toasts).toEqual(['You do not have access to this section.']);
  });
});

describe('every other failure still reaches the person', () => {
  it('toasts a plain 403 that is not a section refusal', async () => {
    await refuse(403, { error: 'This agent is not in your reporting chain.' });
    expect(toasts).toEqual(['This agent is not in your reporting chain.']);
  });

  it('toasts a 400', async () => {
    await refuse(400, { error: 'Those tool details belong on a tool request.' });
    expect(toasts).toEqual(['Those tool details belong on a tool request.']);
  });

  it('toasts a 404', async () => {
    await refuse(404, { error: 'Not found.' });
    expect(toasts).toEqual(['Not found.']);
  });

  it('toasts a 429 with its own wording', async () => {
    await refuse(429, { error: 'nope' });
    expect(toasts).toEqual(['Too many requests. Please wait a moment.']);
  });

  it('toasts a 500 without leaking the server message', async () => {
    await refuse(500, { error: 'Sequelize connection pool exhausted at line 41' });
    expect(toasts).toEqual(['Something went wrong. Please try again.']);
  });

  it('does not suppress the section code on a status that is not 403', async () => {
    // The code alone must not become a blanket mute: a 500 carrying it is still a real failure.
    await refuse(500, SECTION_403);
    expect(toasts).toEqual(['Something went wrong. Please try again.']);
  });

  it('still reports a 403 whose code is something else entirely', async () => {
    await refuse(403, { error: 'Refused.', code: 'some_other_reason' });
    expect(toasts).toEqual(['Refused.']);
  });
});
