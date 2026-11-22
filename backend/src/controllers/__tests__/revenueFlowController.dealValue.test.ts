const mockConfirm = jest.fn();
const mockHistory = jest.fn();

jest.mock('../../services/revenueFlow/enterpriseDealValueService', () => {
  class DealValueRejected extends Error {
    constructor(m: string) { super(m); this.name = 'DealValueRejected'; }
  }
  return {
    DealValueRejected,
    confirmDealValue: (...a: any[]) => mockConfirm(...a),
    getDealValueHistory: (...a: any[]) => mockHistory(...a),
  };
});
// Mocked only to keep this suite about the enterprise write. The board and the government
// price have their own coverage and loading them here would pull every flow module in.
jest.mock('../../services/revenueFlow/revenueFlowService', () => ({
  getRevenueFlowBoard: jest.fn(),
  DEFAULT_WINDOW_DAYS: 180,
}));
jest.mock('../../services/revenueFlow/govBidValueService', () => ({
  BidValueRejected: class extends Error {},
  confirmBidValue: jest.fn(),
  getBidValueHistory: jest.fn(),
}));

import { handleConfirmDealValue, handleGetDealValueHistory } from '../revenueFlowController';
import { DealValueRejected } from '../../services/revenueFlow/enterpriseDealValueService';

/**
 * R23 Phase 3 — the HTTP boundary's own acceptance.
 *
 * This is the first test at this layer on this surface: R16 shipped the government price with
 * a tested service and a tested panel and NOTHING between them, so every rail that lives in
 * the controller was unverified. The rails here are the two that cannot be recovered from
 * once a wrong row is written:
 *
 * 1. **A monthly retainer cannot arrive as a total contract value.** The service's input is a
 *    discriminated union and TypeScript enforces it for in-process callers, but a request body
 *    is `any`, so the types stop at the controller door. If the schema let both amount fields
 *    through as optional, `{ valueKind: 'monthly_retainer', dealValueCents: 450000 }` would
 *    reach a service whose own types say that object cannot exist. Middlesex would be filed at
 *    $4,500 instead of $54,000.
 * 2. **`confirmedBy` comes from the session and cannot be supplied.** It is the whole
 *    difference between a confirmation and a string, on a pipeline run by an AI end to end.
 */

const INTAKE = 'f7b2c4e1-3a5d-4b8c-9e0f-1a2b3c4d5e6f';

function res() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
}

/** An authenticated admin request, which is what every route on this surface carries. */
const req = (body: any, user: any = { email: 'ali@colaberry.com' }) => ({ body, user }) as any;

const BASIS = 'SOW dated 2026-12-02, $4,500 per month for 12 months, countersigned by their COO.';

const goodRetainer = {
  enterpriseIntakeId: INTAKE,
  valueKind: 'monthly_retainer',
  monthlyFeeCents: 450_000,
  periodMonths: 12,
  valueBasis: BASIS,
  basisSource: 'statement_of_work',
};

const goodTotal = {
  enterpriseIntakeId: INTAKE,
  valueKind: 'total_contract',
  dealValueCents: 5_400_000,
  valueBasis: BASIS,
  basisSource: 'signed_agreement',
};

const storedValue = (over: any = {}) => ({
  id: 'v1',
  enterpriseIntakeId: INTAKE,
  dealValueCents: 5_400_000,
  currency: 'USD',
  periodMonths: 12,
  valueBasis: BASIS,
  basisSource: 'statement_of_work',
  confirmedBy: 'ali@colaberry.com',
  confirmedAt: '2026-11-21T22:00:00.000Z',
  supersededAt: null,
  supersededById: null,
  notes: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue({ value: storedValue(), superseded: null });
  mockHistory.mockResolvedValue([]);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('a monthly retainer cannot be posted as a total, and vice versa', () => {
  it('refuses a retainer that carries dealValueCents instead of a monthly fee', async () => {
    const r = res();
    await handleConfirmDealValue(req({
      ...goodTotal, valueKind: 'monthly_retainer', periodMonths: 12,
    }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    // Refused BEFORE the service, which is the point: the service would have had to trust it.
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('refuses a total-contract deal that smuggles in a monthly fee', async () => {
    const r = res();
    await handleConfirmDealValue(req({ ...goodTotal, monthlyFeeCents: 450_000 }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    // `.strict()` is what catches this. Without it the field would be stripped silently and
    // the deal recorded as a $54,000 total - right here, by accident, with no error anywhere.
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('refuses a retainer with no term, because it has no total', async () => {
    const { periodMonths, ...noTerm } = goodRetainer;
    const r = res();
    await handleConfirmDealValue(req(noTerm), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('refuses a retainer whose term is zero or negative', async () => {
    for (const periodMonths of [0, -3]) {
      const r = res();
      await handleConfirmDealValue(req({ ...goodRetainer, periodMonths }), r);
      expect(r.status).toHaveBeenCalledWith(400);
    }
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('refuses an unrecognized valueKind rather than defaulting to one', async () => {
    const r = res();
    await handleConfirmDealValue(req({ ...goodTotal, valueKind: 'retainer' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('refuses a body with no valueKind at all', async () => {
    const { valueKind, ...noKind } = goodTotal;
    const r = res();
    await handleConfirmDealValue(req(noKind), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('passes a valid retainer through UNMULTIPLIED, so the service owns the arithmetic', async () => {
    const r = res();
    await handleConfirmDealValue(req(goodRetainer), r);
    expect(r.status).toHaveBeenCalledWith(201);
    const sent = mockConfirm.mock.calls[0][0];
    expect(sent.valueKind).toBe('monthly_retainer');
    expect(sent.monthlyFeeCents).toBe(450_000);
    expect(sent.periodMonths).toBe(12);
    // The controller must NOT compute the total. One place does that multiplication, and
    // two places doing it is how the two answers start disagreeing.
    expect(sent.dealValueCents).toBeUndefined();
  });

  it('passes a valid total-contract deal through as a total', async () => {
    const r = res();
    await handleConfirmDealValue(req(goodTotal), r);
    expect(r.status).toHaveBeenCalledWith(201);
    const sent = mockConfirm.mock.calls[0][0];
    expect(sent.valueKind).toBe('total_contract');
    expect(sent.dealValueCents).toBe(5_400_000);
    expect(sent.monthlyFeeCents).toBeUndefined();
  });
});

describe('the figure is a named person\'s claim', () => {
  it('takes confirmedBy from the session', async () => {
    const r = res();
    await handleConfirmDealValue(req(goodTotal, { email: 'ram@colaberry.com' }), r);
    expect(mockConfirm.mock.calls[0][0].confirmedBy).toBe('ram@colaberry.com');
  });

  it('REFUSES a body that tries to supply confirmedBy, rather than ignoring it', async () => {
    const r = res();
    await handleConfirmDealValue(
      req({ ...goodTotal, confirmedBy: 'someone.else@example.com' }),
      r,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('refuses the write outright when the request carries no identity', async () => {
    const r = res();
    // Built without `req()` on purpose. Passing `undefined` as its second argument triggers
    // the DEFAULT parameter and hands back an authenticated request, so the first version of
    // this test asserted 401 against a request that carried Ali's identity, and failed with
    // a 201. A helper whose default can impersonate a signed-in admin has no business
    // constructing the anonymous case.
    await handleConfirmDealValue({ body: goodTotal } as any, r);
    expect(r.status).toHaveBeenCalledWith(401);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].error_class).toBe('AuthError');
  });

  it('accepts an admin identity as well as a user one', async () => {
    const r = res();
    const request: any = { body: goodTotal, admin: { email: 'admin@colaberry.com' } };
    await handleConfirmDealValue(request, r);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(mockConfirm.mock.calls[0][0].confirmedBy).toBe('admin@colaberry.com');
  });
});

describe('a first value and a revision are different answers', () => {
  it('201 when nothing was priced before', async () => {
    const r = res();
    await handleConfirmDealValue(req(goodTotal), r);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.json.mock.calls[0][0].data.superseded).toBeNull();
  });

  it('200 and the prior value when this replaces one', async () => {
    mockConfirm.mockResolvedValue({
      value: storedValue({ id: 'v2', dealValueCents: 6_000_000 }),
      superseded: storedValue({ id: 'v1', supersededAt: '2026-11-22T00:00:00.000Z' }),
    });
    const r = res();
    await handleConfirmDealValue(req(goodTotal), r);
    expect(r.status).toHaveBeenCalledWith(200);
    // The old number travels back, so the caller can show the revision as a revision.
    expect(r.json.mock.calls[0][0].data.superseded.dealValueCents).toBe(5_400_000);
  });
});

describe('a refused value explains itself', () => {
  it('surfaces the service\'s own message as a 400, not a 500', async () => {
    mockConfirm.mockRejectedValue(new DealValueRejected(
      'valueBasis must be at least 25 characters, and must be something another person '
      + 'could check.',
    ));
    const r = res();
    await handleConfirmDealValue(req(goodTotal), r);
    expect(r.status).toHaveBeenCalledWith(400);
    const payload = r.json.mock.calls[0][0];
    expect(payload.error_class).toBe('ValidationError');
    // The message is the useful part: it says what a usable basis looks like.
    expect(payload.error).toContain('at least 25 characters');
  });

  it('a genuine failure is a 500 that does not leak the internals', async () => {
    mockConfirm.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const r = res();
    await handleConfirmDealValue(req(goodTotal), r);
    expect(r.status).toHaveBeenCalledWith(500);
    expect(r.json.mock.calls[0][0].error).not.toContain('connection terminated');
  });
});

describe('the value history', () => {
  it('reads the history for a well-formed intake id', async () => {
    mockHistory.mockResolvedValue([storedValue()]);
    const r = res();
    await handleGetDealValueHistory({ params: { enterpriseIntakeId: INTAKE } } as any, r);
    expect(mockHistory).toHaveBeenCalledWith(INTAKE);
    expect(r.json.mock.calls[0][0].data).toHaveLength(1);
  });

  it('refuses an id that is not a uuid instead of querying with it', async () => {
    const r = res();
    await handleGetDealValueHistory({ params: { enterpriseIntakeId: 'all' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockHistory).not.toHaveBeenCalled();
  });
});
