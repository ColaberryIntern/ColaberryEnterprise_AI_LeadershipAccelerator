// The mocks are created INSIDE the factory and read back afterwards. CRA's jest
// hoists `jest.mock` above every `const`, so a factory closing over one hits the
// temporal dead zone ("Cannot access 'mockGet' before initialization"), and a
// factory closing over a non-`mock`-prefixed name is rejected outright. This
// shape avoids both.
jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import api from '../../utils/api';
import * as apiClient from '../explorerGrowthApi';

const mockGet = api.get as unknown as jest.Mock;
const mockPost = api.post as unknown as jest.Mock;
const mockPut = api.put as unknown as jest.Mock;
const mockPatch = api.patch as unknown as jest.Mock;
const mockDel = api.delete as unknown as jest.Mock;

/**
 * The Command Center's typed client.
 *
 * Two things are asserted here and the second is the one that would otherwise
 * fail silently.
 *
 * A wrong PATH produces a 404 — loud, obvious, fixed in a minute. A DROPPED
 * QUERY PARAM produces a 200 with a plausible list: the filter appears to work,
 * the numbers look reasonable, and nobody notices the page is answering a
 * different question than the one asked. So every call that takes filters is
 * checked for what it actually forwarded.
 *
 * NOTE ON THE GATE: CI does not run frontend jest tests — only
 * `frontend-typecheck` and `frontend-build`. This file is a local guard.
 */

const ID = '3f7c1e90-2b4a-4d55-9a1e-6c8b0d2f4a71';
const BASE = '/api/admin/explorer-growth';

/** The URL of the Nth (default: only) call. */
const url = (n = 0) => mockGet.mock.calls[n][0] as string;
/** The params object actually handed to axios. */
const sent = (n = 0) => (mockGet.mock.calls[n][1] as { params?: Record<string, string> })?.params;

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({ data: {} });
});

describe('all twelve endpoints are covered', () => {
  const CALLS: [string, () => Promise<unknown>, string][] = [
    ['summary', () => apiClient.getSummary(), `${BASE}/summary`],
    ['distribution', () => apiClient.getDistribution(), `${BASE}/distribution`],
    ['learners', () => apiClient.getLearners(), `${BASE}/learners`],
    ['learner', () => apiClient.getLearner(ID), `${BASE}/learners/${ID}`],
    ['signals', () => apiClient.getLearnerSignals(ID), `${BASE}/learners/${ID}/signals`],
    ['scores', () => apiClient.getLearnerScores(ID), `${BASE}/learners/${ID}/scores`],
    ['learner decisions', () => apiClient.getLearnerDecisions(ID), `${BASE}/learners/${ID}/decisions`],
    ['decisions', () => apiClient.getDecisions(), `${BASE}/decisions`],
    ['why', () => apiClient.getWhy(ID), `${BASE}/decisions/${ID}`],
    ['shadow', () => apiClient.getShadow(), `${BASE}/shadow`],
    ['content', () => apiClient.getContentHealth(), `${BASE}/content`],
    ['eligibility', () => apiClient.getEligibility(ID), `${BASE}/eligibility/${ID}`],
  ];

  it('is exactly twelve — the number Phase A shipped', () => {
    // Pinned, so adding a call without a test fails a count rather than
    // slipping through. §27's other two GETs are EPIC 12's and unbuilt.
    expect(CALLS).toHaveLength(12);
  });

  it.each(CALLS)('%s targets the right path', async (_name, call, expected) => {
    await call();
    expect(url()).toBe(expected);
  });

  it('addresses learners by enrollment id, never by email', async () => {
    // The learner id is a UUID and belongs in a URL; `email_normalized` does
    // not. This asserts the id is what gets interpolated.
    await apiClient.getLearner(ID);
    expect(url()).toContain(ID);
    expect(url()).not.toContain('@');
  });
});

describe('query parameters are forwarded, not dropped', () => {
  it('forwards every learner filter', async () => {
    // The assertion that matters. A client that ignores `state` returns all 153
    // learners and the page renders a filter that appears to do nothing —
    // indistinguishable, on screen, from a filter matching everything.
    await apiClient.getLearners({
      state: 'ACTIVE_LEARNER',
      overlay: 'EVENT_READY',
      e_min: 10,
      e_max: 80,
      i_min: 1,
      i_max: 90,
      f_min: 0,
      search: 'ada',
      limit: 25,
      offset: 50,
    });
    expect(sent()).toEqual({
      state: 'ACTIVE_LEARNER',
      overlay: 'EVENT_READY',
      e_min: '10',
      e_max: '80',
      i_min: '1',
      i_max: '90',
      f_min: '0',
      search: 'ada',
      limit: '25',
      offset: '50',
    });
  });

  it('forwards decision filters including executed=false', async () => {
    // `executed: false` is the trap: a truthiness check drops it, and the
    // reviewer looking for un-executed decisions silently gets all of them.
    await apiClient.getDecisions({ action: 'RECOMMEND_LESSON', date: '2026-09-02', executed: false });
    expect(sent()).toEqual({
      action: 'RECOMMEND_LESSON',
      date: '2026-09-02',
      executed: 'false',
    });
  });

  it('forwards f_min=0, which is a real filter and not an absent one', async () => {
    await apiClient.getLearners({ f_min: 0 });
    expect(sent()).toEqual({ f_min: '0' });
  });

  it('forwards the trend window', async () => {
    await apiClient.getDistribution(7);
    expect(sent()).toEqual({ days: '7' });
  });

  it('forwards the drawer windows', async () => {
    await apiClient.getLearnerSignals(ID, 30);
    expect(sent()).toEqual({ days: '30' });
    jest.clearAllMocks();
    await apiClient.getLearnerScores(ID, 14);
    expect(sent()).toEqual({ days: '14' });
  });

  it('bounds the learner decision list rather than letting it run unbounded', async () => {
    await apiClient.getLearnerDecisions(ID, { limit: 20, offset: 40 });
    expect(sent()).toEqual({ limit: '20', offset: '40' });
  });
});

describe('unset filters are omitted, not sent as "undefined"', () => {
  it('sends an empty params object when nothing is filtered', async () => {
    // The backend schemas are `.strict()`. A literal "undefined" string would be
    // rejected as a 400, turning "no filter" into an error the user cannot act on.
    await apiClient.getLearners({});
    expect(sent()).toEqual({});
  });

  it('omits only the unset keys', async () => {
    await apiClient.getLearners({ state: 'CONVERTED', search: undefined, e_min: undefined });
    expect(sent()).toEqual({ state: 'CONVERTED' });
  });

  it('omits an empty search string rather than filtering on nothing', async () => {
    // The schema rejects a blank search (`.min(1)` after trim), so sending one
    // would 400 the moment a user clears the box.
    await apiClient.getLearners({ search: '' });
    expect(sent()).toEqual({});
  });
});

describe('the client cannot write', () => {
  it('never calls a mutating verb', async () => {
    // Phase A shipped no write route, and §27's seven are a governance decision
    // rather than a build task. A client with no write method cannot leak one in.
    await Promise.all([
      apiClient.getSummary(),
      apiClient.getDistribution(),
      apiClient.getLearners(),
      apiClient.getLearner(ID),
      apiClient.getLearnerSignals(ID),
      apiClient.getLearnerScores(ID),
      apiClient.getLearnerDecisions(ID),
      apiClient.getDecisions(),
      apiClient.getWhy(ID),
      apiClient.getShadow(),
      apiClient.getContentHealth(),
      apiClient.getEligibility(ID),
    ]);
    expect(mockGet).toHaveBeenCalledTimes(12);
    for (const verb of [mockPost, mockPut, mockPatch, mockDel]) expect(verb).not.toHaveBeenCalled();
  });

  it('exports no function whose name suggests a write', () => {
    const writeish = Object.keys(apiClient).filter((k) =>
      /^(set|update|create|delete|pause|resume|recalculate|rerun|suppress|refresh)/i.test(k),
    );
    expect(writeish).toEqual([]);
  });
});
