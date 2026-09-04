/**
 * `GET /api/admin/visitors/live` must answer `{ visitors, count }`.
 *
 * It returned a bare array, and the only consumer has always read
 * `res.data.visitors`. `undefined || []` is not an error in JavaScript, so the
 * admin table rendered its empty state — "No visitors currently on the site" —
 * against a live database, and did so convincingly enough to survive months of
 * being looked at.
 *
 * The envelope is asserted here rather than in the page because a shape this
 * cheap to break deserves a server-side test: the next person to "simplify"
 * this handler back to `res.json(live)` gets a red build instead of a dashboard
 * that lies quietly.
 */

const getLiveVisitors = jest.fn();
const countLiveVisitors = jest.fn();

jest.mock('../../services/visitorAnalyticsService', () => ({
  listVisitors: jest.fn(),
  getVisitorStats: jest.fn(),
  getLiveVisitors: (...a: unknown[]) => getLiveVisitors(...a),
  countLiveVisitors: (...a: unknown[]) => countLiveVisitors(...a),
  getVisitorTrend: jest.fn(),
  getVisitorProfile: jest.fn(),
}));
jest.mock('../../services/behavioralSignalService', () => ({
  getVisitorSignals: jest.fn(),
  getVisitorSignalSummary: jest.fn(),
  getSignalDefinitions: jest.fn(),
}));
jest.mock('../../services/intentScoringService', () => ({
  getHighIntentVisitors: jest.fn(),
  getIntentScoreForVisitor: jest.fn(),
  getIntentDistribution: jest.fn(),
}));
jest.mock('../../services/chatService', () => ({
  listConversations: jest.fn(),
  getConversationDetail: jest.fn(),
  getChatStats: jest.fn(),
}));
jest.mock('../../models', () => ({
  Visitor: {},
  VisitorSession: {},
  PageEvent: {},
  IntentScore: {},
  Lead: {},
}));

import { Request, Response, NextFunction } from 'express';
import { handleGetLiveVisitors } from '../adminVisitorController';

function mockRes() {
  const json = jest.fn();
  return { res: { json } as unknown as Response, json };
}

const next = jest.fn() as unknown as NextFunction;

beforeEach(() => {
  jest.clearAllMocks();
});

const ROW = { id: 'visitor-1', session_id: 'session-1', fingerprint: 'abc123' };

it('wraps the rows in { visitors, count } rather than returning a bare array', async () => {
  getLiveVisitors.mockResolvedValueOnce([ROW]);
  countLiveVisitors.mockResolvedValueOnce(1);
  const { res, json } = mockRes();

  await handleGetLiveVisitors({ query: {} } as unknown as Request, res, next);

  const payload = json.mock.calls[0][0];
  expect(Array.isArray(payload)).toBe(false);
  expect(payload.visitors).toEqual([ROW]);
  expect(payload.count).toBe(1);
});

it('reports the true live count, not the truncated list length', async () => {
  // The list is capped at the page size; the count is not. Deriving one from the
  // other is exactly the bug that makes a busy site look like it plateaued.
  getLiveVisitors.mockResolvedValueOnce(new Array(50).fill(ROW));
  countLiveVisitors.mockResolvedValueOnce(63);
  const { res, json } = mockRes();

  await handleGetLiveVisitors({ query: { limit: '50' } } as unknown as Request, res, next);

  const payload = json.mock.calls[0][0];
  expect(payload.visitors).toHaveLength(50);
  expect(payload.count).toBe(63);
});

it('clamps a hostile limit instead of passing it to the database', async () => {
  getLiveVisitors.mockResolvedValueOnce([]);
  countLiveVisitors.mockResolvedValueOnce(0);
  const { res } = mockRes();

  await handleGetLiveVisitors({ query: { limit: '100000' } } as unknown as Request, res, next);

  expect(getLiveVisitors).toHaveBeenCalledWith(200, false);
});

it('falls back to the default when limit is not a number', async () => {
  getLiveVisitors.mockResolvedValueOnce([]);
  countLiveVisitors.mockResolvedValueOnce(0);
  const { res } = mockRes();

  await handleGetLiveVisitors({ query: { limit: 'all' } } as unknown as Request, res, next);

  expect(getLiveVisitors).toHaveBeenCalledWith(50, false);
});

describe('bot filtering', () => {
  it('excludes bots by default — "who is on the site" is a question about people', async () => {
    getLiveVisitors.mockResolvedValueOnce([]);
    countLiveVisitors.mockResolvedValueOnce(0);
    const { res, json } = mockRes();

    await handleGetLiveVisitors({ query: {} } as unknown as Request, res, next);

    expect(getLiveVisitors).toHaveBeenCalledWith(50, false);
    expect(countLiveVisitors).toHaveBeenCalledWith(false);
    expect(json.mock.calls[0][0].includeBots).toBe(false);
  });

  it('includes them on ?includeBots=true', async () => {
    getLiveVisitors.mockResolvedValueOnce([ROW]);
    countLiveVisitors.mockResolvedValueOnce(1);
    const { res, json } = mockRes();

    await handleGetLiveVisitors({ query: { includeBots: 'true' } } as unknown as Request, res, next);

    expect(getLiveVisitors).toHaveBeenCalledWith(50, true);
    expect(countLiveVisitors).toHaveBeenCalledWith(true);
    expect(json.mock.calls[0][0].includeBots).toBe(true);
  });

  /**
   * The list and the count must be filtered the same way, always. A headline of
   * 12 above a table of 3 is the exact defect class this dashboard just came out
   * of, so the two calls are asserted to agree rather than merely both existing.
   */
  it('passes the same bot setting to the list and the count', async () => {
    getLiveVisitors.mockResolvedValueOnce([]);
    countLiveVisitors.mockResolvedValueOnce(0);
    const { res } = mockRes();

    await handleGetLiveVisitors({ query: { includeBots: 'true' } } as unknown as Request, res, next);

    expect(getLiveVisitors.mock.calls[0][1]).toBe(countLiveVisitors.mock.calls[0][0]);
  });

  it('treats any value other than the literal "true" as off', async () => {
    getLiveVisitors.mockResolvedValueOnce([]);
    countLiveVisitors.mockResolvedValueOnce(0);
    const { res } = mockRes();

    await handleGetLiveVisitors({ query: { includeBots: '1' } } as unknown as Request, res, next);

    expect(getLiveVisitors).toHaveBeenCalledWith(50, false);
  });
});

it('forwards a query failure to the error handler rather than sending an empty list', async () => {
  // An empty 200 here is indistinguishable from "nobody is on the site", which
  // is how a broken dashboard reads as a quiet one.
  const boom = new Error('connection terminated');
  getLiveVisitors.mockRejectedValueOnce(boom);
  countLiveVisitors.mockResolvedValueOnce(0);
  const { res, json } = mockRes();
  const nextFn = jest.fn();

  await handleGetLiveVisitors({ query: {} } as unknown as Request, res, nextFn as unknown as NextFunction);

  expect(json).not.toHaveBeenCalled();
  expect(nextFn).toHaveBeenCalledWith(boom);
});
