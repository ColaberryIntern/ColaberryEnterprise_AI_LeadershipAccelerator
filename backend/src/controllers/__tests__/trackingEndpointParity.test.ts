const findOrCreateVisitor = jest.fn();
const getOrCreateSession = jest.fn();
const recordPageEvent = jest.fn();
const resolveIdentity = jest.fn();

jest.mock('../../services/visitorTrackingService', () => ({
  // Keep the REAL `categorizePagePath`. Categorisation is what makes a
  // `/stories` hit legible to the six downstream consumers, so stubbing it
  // would hide the very defect this build exists to fix. Only the functions
  // that touch the database are replaced.
  ...jest.requireActual('../../services/visitorTrackingService'),
  findOrCreateVisitor: (...a: unknown[]) => findOrCreateVisitor(...a),
  getOrCreateSession: (...a: unknown[]) => getOrCreateSession(...a),
  recordPageEvent: (...a: unknown[]) => recordPageEvent(...a),
  resolveIdentity: (...a: unknown[]) => resolveIdentity(...a),
}));

jest.mock('../../services/behavioralSignalService', () => ({ detectSessionSignals: jest.fn(() => Promise.resolve([])) }));
jest.mock('../../services/intentScoringService', () => ({ computeIntentScore: jest.fn(() => Promise.resolve()) }));
jest.mock('../../services/behavioralTriggerService', () => ({ evaluateVisitorForTriggers: jest.fn(() => Promise.resolve()) }));
jest.mock('../../services/governanceService', () => ({ logAgentExecution: jest.fn(() => Promise.resolve()) }));
jest.mock('../../utils/piiRedaction', () => ({ redactForLogs: (v: unknown) => v }));
jest.mock('../../config/env', () => ({ env: { enableVisitorTracking: true } }));
jest.mock('../../modules/tenancy/tenantResolver', () => ({
  resolvePublicContext: jest.fn(() => Promise.resolve({ context: null, path: 'unresolved' })),
}));
jest.mock('../../models', () => ({
  Visitor: { findByPk: jest.fn(() => Promise.resolve(null)) },
  Lead: { findOne: jest.fn(() => Promise.resolve(null)) },
}));

import { handleTrackBatch, handleTrackEvent } from '../trackingController';

/**
 * `/api/t/event` and `/api/t/batch` must reach the SAME verdict (T019 AC4, D-3).
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. `handleTrackBatch` never called the
 * validator. It checked the fingerprint and the array length and then wrote
 * whatever it was handed, while `handleTrackEvent` 400d anything outside the
 * allowlist. That is not a tidiness problem, because the CLIENT DOES NOT CHOOSE
 * ITS ENDPOINT DELIBERATELY: `frontend/src/utils/tracker.ts` sends to
 * `/api/t/event` when exactly one event is queued at flush time and to
 * `/api/t/batch` when two or more are. Queue depth is a function of how fast
 * the visitor clicked relative to a 5-second timer. So an unallowlisted event
 * survived or died at random, and an allowlist omission would have been found
 * as "the numbers look a bit low" rather than as a 400.
 *
 * These tests drive the same payload through both handlers and assert on what
 * actually reached `recordPageEvent`, which is the only question that matters:
 * whether the row exists.
 */

const VALID_CASE_STUDY_EVENT = {
  event_type: 'case_study_view',
  page_url: 'https://enterprise.colaberry.ai/stories/claims-triage-copilot',
  page_path: '/stories/claims-triage-copilot',
  event_data: { slug: 'claims-triage-copilot', industry: 'Insurance' },
};

const UNKNOWN_EVENT = {
  event_type: 'case_study_hover',
  page_url: 'https://enterprise.colaberry.ai/stories',
  page_path: '/stories',
};

function mockRes() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; },
    end() { return res; },
  };
  return res;
}

async function viaEventEndpoint(event: Record<string, unknown>) {
  const res = mockRes();
  await handleTrackEvent({ body: { fingerprint: 'fp-1', ...event }, ip: '1.2.3.4' } as any, res, jest.fn());
  return res;
}

async function viaBatchEndpoint(...events: Record<string, unknown>[]) {
  const res = mockRes();
  await handleTrackBatch({ body: { fingerprint: 'fp-1', events }, ip: '1.2.3.4' } as any, res, jest.fn());
  return res;
}

beforeEach(() => {
  [findOrCreateVisitor, getOrCreateSession, recordPageEvent, resolveIdentity].forEach((m) => m.mockReset());
  findOrCreateVisitor.mockResolvedValue('visitor-1');
  getOrCreateSession.mockResolvedValue('session-1');
  recordPageEvent.mockResolvedValue(undefined);
});

describe('a valid Case Study event survives on BOTH endpoints (AC4)', () => {
  it('/api/t/event records it', async () => {
    const res = await viaEventEndpoint(VALID_CASE_STUDY_EVENT);
    expect(res.statusCode).toBe(200);
    expect(recordPageEvent).toHaveBeenCalledTimes(1);
    expect(recordPageEvent.mock.calls[0][0].event_type).toBe('case_study_view');
  });

  it('/api/t/batch records it', async () => {
    const res = await viaBatchEndpoint(VALID_CASE_STUDY_EVENT);
    expect(res.statusCode).toBe(200);
    expect(recordPageEvent).toHaveBeenCalledTimes(1);
    expect(recordPageEvent.mock.calls[0][0].event_type).toBe('case_study_view');
  });

  it('both categorise /stories/:slug as case_studies, reviving the dead consumers', async () => {
    await viaEventEndpoint(VALID_CASE_STUDY_EVENT);
    const fromEvent = recordPageEvent.mock.calls[0][0].page_category;
    recordPageEvent.mockClear();
    await viaBatchEndpoint(VALID_CASE_STUDY_EVENT);
    const fromBatch = recordPageEvent.mock.calls[0][0].page_category;

    expect(fromEvent).toBe('case_studies');
    expect(fromBatch).toBe('case_studies');
  });

  it('both persist event_data rather than dropping it', async () => {
    await viaEventEndpoint(VALID_CASE_STUDY_EVENT);
    expect(recordPageEvent.mock.calls[0][0].event_data).toEqual(VALID_CASE_STUDY_EVENT.event_data);
    recordPageEvent.mockClear();
    await viaBatchEndpoint(VALID_CASE_STUDY_EVENT);
    expect(recordPageEvent.mock.calls[0][0].event_data).toEqual(VALID_CASE_STUDY_EVENT.event_data);
  });
});

describe('an unknown event type is refused on BOTH endpoints (AC4)', () => {
  it('/api/t/event 400s and writes nothing', async () => {
    const res = await viaEventEndpoint(UNKNOWN_EVENT);
    expect(res.statusCode).toBe(400);
    expect(recordPageEvent).not.toHaveBeenCalled();
  });

  it('/api/t/batch of one 400s with the identical message and writes nothing', async () => {
    // A batch of one is the exact case the buffer-size race produces, so here
    // the two endpoints must agree byte for byte, not merely in outcome.
    const viaEvent = await viaEventEndpoint(UNKNOWN_EVENT);
    recordPageEvent.mockClear();
    const viaBatch = await viaBatchEndpoint(UNKNOWN_EVENT);

    expect(viaBatch.statusCode).toBe(viaEvent.statusCode);
    expect(viaBatch.body).toEqual(viaEvent.body);
    expect(recordPageEvent).not.toHaveBeenCalled();
  });

  it('a malformed body is refused the same way on both', async () => {
    const bad = { ...UNKNOWN_EVENT, event_type: 'pageview', page_path: undefined };
    const viaEvent = await viaEventEndpoint(bad);
    const viaBatch = await viaBatchEndpoint(bad);
    expect(viaEvent.statusCode).toBe(400);
    expect(viaBatch.statusCode).toBe(400);
    expect(viaBatch.body).toEqual(viaEvent.body);
  });

  it('an over-long fingerprint is refused the same way on both', async () => {
    const res = mockRes();
    await handleTrackEvent({ body: { fingerprint: 'x'.repeat(65), ...VALID_CASE_STUDY_EVENT } } as any, res, jest.fn());
    const batchRes = mockRes();
    await handleTrackBatch({ body: { fingerprint: 'x'.repeat(65), events: [VALID_CASE_STUDY_EVENT] } } as any, batchRes, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(batchRes.body).toEqual(res.body);
  });
});

describe('a mixed batch drops only the bad element', () => {
  it('records the valid events and reports the rejected count', async () => {
    // Rejecting the whole request would discard up to 49 good events to punish
    // one bad one - trading a validation gap for data loss.
    const res = await viaBatchEndpoint(VALID_CASE_STUDY_EVENT, UNKNOWN_EVENT, {
      event_type: 'case_study_cta_click',
      page_url: 'https://enterprise.colaberry.ai/stories/a',
      page_path: '/stories/a',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.events_recorded).toBe(2);
    expect(res.body.events_rejected).toBe(1);
    expect(recordPageEvent.mock.calls.map((c) => c[0].event_type)).toEqual([
      'case_study_view',
      'case_study_cta_click',
    ]);
  });

  it('does not let a rejected FIRST element poison the session context', async () => {
    // `firstEvent.page_url` seeds session creation. Reading it from the raw
    // array would hand `getOrCreateSession` a URL from an event that was
    // refused.
    await viaBatchEndpoint(UNKNOWN_EVENT, VALID_CASE_STUDY_EVENT);
    expect(getOrCreateSession.mock.calls[0][1].page_url).toBe(VALID_CASE_STUDY_EVENT.page_url);
  });
});
