const m = { receipts: jest.fn(), outcomes: jest.fn(), rates: jest.fn(), handoffCount: jest.fn(), outcomeCount: jest.fn() };

jest.mock('../../../models', () => ({
  GrowthJourneyExecution: { findAndCountAll: (...a: unknown[]) => m.receipts(...a) },
  GrowthJourneyOutcome: { findAndCountAll: (...a: unknown[]) => m.outcomes(...a), count: (...a: unknown[]) => m.outcomeCount(...a) },
  GrowthJourneyHandoff: { count: (...a: unknown[]) => m.handoffCount(...a) },
}));
jest.mock('../outcomes/handoffRatesQuery', () => ({
  loadHandoffRates: (...a: unknown[]) => m.rates(...a),
  DEFAULT_RATES_WINDOW_DAYS: 30,
}));

import { Op } from 'sequelize';
import { DEFAULT_PAGE, MAX_PAGE, MAX_RATE_HANDOFFS, MAX_RATE_OUTCOMES, readOutcomes, readRates, readReceipts, WINDOW_TOO_LARGE } from '../performance/performanceReads';

/**
 * T606 — the three list reads and the rates roll-up.
 *
 * The properties, in the order they would hurt if wrong:
 *
 *   1. NO PERSON'S WORDS LEAVE. The projection is column by column, `metadata`
 *      is never requested, and `status_reason` goes through `safeField` - an
 *      adversarial reason carrying an address becomes `redacted` and the row
 *      says so. This is the privacy property the plan named.
 *   2. BOUNDED. Every list read caps `limit` at 100, floors `offset` at 0, and
 *      answers with a `total` from `count` rather than by loading the rest.
 *   3. THE SCOPE IS THE CALLER'S. An empty scope reads nothing WITHOUT a query.
 */

const BRAND_A = 'brand-a';
const BRAND_B = 'brand-b';
const AT = new Date('2026-09-28T12:00:00Z');

const receiptRow = (over: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    id: 'e1', brand_id: BRAND_A, program_id: 'p1', channel: 'email', action_type: 'SEND_EMAIL',
    status: 'completed', status_reason: 'sent', campaign_key: 'explorer_activation_restart',
    created_at: AT, updated_at: AT, ...over,
  };
  return { get: (k: string) => values[k] };
};
const outcomeRow = (over: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    id: 'o1', brand_id: BRAND_A, subject_ref: 'lead:123', outcome_type: 'reply', source: 'interaction_outcomes',
    occurred_at: AT, handoff_id: 'h1', decision_id: 'd1', ...over,
  };
  return { get: (k: string) => values[k] };
};

beforeEach(() => {
  jest.clearAllMocks();
  m.receipts.mockResolvedValue({ rows: [], count: 0 });
  m.outcomes.mockResolvedValue({ rows: [], count: 0 });
  m.rates.mockResolvedValue({ all: { handoffs: 0 }, by_queue: {} });
  m.handoffCount.mockResolvedValue(0);
  m.outcomeCount.mockResolvedValue(0);
});

describe('receipts: scalars, and the reason through safeField', () => {
  it('projects column by column, never a spread, and stamps the timestamps as ISO', async () => {
    m.receipts.mockResolvedValue({ rows: [receiptRow()], count: 1 });
    const page = await readReceipts({ brandIds: [BRAND_A] });
    expect(page.rows).toEqual([{
      id: 'e1', brand_id: BRAND_A, program_id: 'p1', channel: 'email', action_type: 'SEND_EMAIL',
      status: 'completed', status_reason: 'sent', status_reason_redacted: false,
      campaign_key: 'explorer_activation_restart',
      created_at: '2026-09-28T12:00:00.000Z', updated_at: '2026-09-28T12:00:00.000Z',
    }]);
    expect(page).toMatchObject({ total: 1, limit: DEFAULT_PAGE, offset: 0 });
  });

  it('an adversarial status_reason carrying an address is REDACTED, and the row says so', async () => {
    // A bounce message is the realistic case: the transport hands back the recipient's own address.
    m.receipts.mockResolvedValue({ rows: [receiptRow({ status_reason: 'bounced: 550 no mailbox for ali@colaberry.com' })], count: 1 });
    const page = await readReceipts({ brandIds: [BRAND_A] });
    expect(page.rows[0].status_reason).toBe('redacted');
    expect(page.rows[0].status_reason_redacted).toBe(true);
    expect(JSON.stringify(page)).not.toContain('@');
  });

  it('a null reason reads `unknown`, not an empty string or a null', async () => {
    m.receipts.mockResolvedValue({ rows: [receiptRow({ status_reason: null })], count: 1 });
    expect((await readReceipts({ brandIds: [BRAND_A] })).rows[0]).toMatchObject({ status_reason: 'unknown', status_reason_redacted: false });
  });

  it('never asks for a JSONB column or the lead id', async () => {
    await readReceipts({ brandIds: [BRAND_A] });
    const [query] = m.receipts.mock.calls[0] as [{ attributes: string[] }];
    for (const banned of ['metadata', 'evidence', 'payload', 'selected_content', 'lead_id', 'subject_ref', 'control_ids']) {
      expect(query.attributes).not.toContain(banned);
    }
    expect(query.attributes).toEqual(['id', 'brand_id', 'program_id', 'channel', 'action_type', 'status', 'status_reason', 'campaign_key', 'created_at', 'updated_at']);
  });

  it('filters by status, channel and programme, always inside the brand scope', async () => {
    await readReceipts({ brandIds: [BRAND_A, BRAND_B], programId: 'p1', status: 'blocked', channel: 'email' });
    const [query] = m.receipts.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(query.where.brand_id).toEqual({ [Op.in]: [BRAND_A, BRAND_B] });
    expect(query.where).toMatchObject({ program_id: 'p1', status: 'blocked', channel: 'email' });
  });
});

describe('outcomes: scalars only, and no metadata at all', () => {
  it('projects the eight scalars the plan named', async () => {
    m.outcomes.mockResolvedValue({ rows: [outcomeRow()], count: 1 });
    const page = await readOutcomes({ brandIds: [BRAND_A] });
    expect(page.rows).toEqual([{
      id: 'o1', brand_id: BRAND_A, subject_ref: 'lead:123', outcome_type: 'reply',
      source: 'interaction_outcomes', occurred_at: '2026-09-28T12:00:00.000Z', handoff_id: 'h1', decision_id: 'd1',
    }]);
  });

  it('never asks for metadata or value - the JSONB is where a reply\'s words end up', async () => {
    await readOutcomes({ brandIds: [BRAND_A] });
    const [query] = m.outcomes.mock.calls[0] as [{ attributes: string[] }];
    expect(query.attributes).toEqual(['id', 'brand_id', 'subject_ref', 'outcome_type', 'source', 'occurred_at', 'handoff_id', 'decision_id']);
    for (const banned of ['metadata', 'value', 'lead_id', 'source_ref']) expect(query.attributes).not.toContain(banned);
  });

  it('even with an address in the row\'s metadata, nothing reaches the answer', async () => {
    // The mock returns a row whose `get('metadata')` WOULD hand back an address; the projection
    // never asks for it, so the property holds by construction rather than by scrubbing.
    m.outcomes.mockResolvedValue({ rows: [outcomeRow({ metadata: { reply_body: 'call me at ali@colaberry.com' } })], count: 1 });
    expect(JSON.stringify(await readOutcomes({ brandIds: [BRAND_A] }))).not.toContain('@');
  });

  it('is brand-scoped and takes its own two filters; no programme column exists on the table', async () => {
    await readOutcomes({ brandIds: [BRAND_A], programId: 'p1', outcomeType: 'contact_blocked', source: 'growth_journey_executions' });
    const [query] = m.outcomes.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(query.where.brand_id).toEqual({ [Op.in]: [BRAND_A] });
    expect(query.where).toMatchObject({ outcome_type: 'contact_blocked', source: 'growth_journey_executions' });
    expect(query.where.program_id).toBeUndefined();
  });
});

describe('bounded, always', () => {
  it.each([
    [undefined, DEFAULT_PAGE],
    [1, 1],
    [100, 100],
    [101, MAX_PAGE],
    [10_000, MAX_PAGE],
    [0, 1],
    [-5, 1],
    [25.9, 25],
  ])('a limit of %s is applied as %s, on both list reads', async (asked, applied) => {
    await readReceipts({ brandIds: [BRAND_A], limit: asked as number | undefined });
    await readOutcomes({ brandIds: [BRAND_A], limit: asked as number | undefined });
    expect((m.receipts.mock.calls[0][0] as { limit: number }).limit).toBe(applied);
    expect((m.outcomes.mock.calls[0][0] as { limit: number }).limit).toBe(applied);
  });

  it('floors the offset at zero and takes whole rows', async () => {
    await readReceipts({ brandIds: [BRAND_A], offset: -3 });
    expect((m.receipts.mock.calls[0][0] as { offset: number }).offset).toBe(0);
    m.receipts.mockClear();
    await readReceipts({ brandIds: [BRAND_A], offset: 7.9 });
    expect((m.receipts.mock.calls[0][0] as { offset: number }).offset).toBe(7);
  });

  it('reports the total from count, so a page can say 25 of 312 without loading 312', async () => {
    m.receipts.mockResolvedValue({ rows: [receiptRow()], count: 312 });
    const page = await readReceipts({ brandIds: [BRAND_A], limit: 25 });
    expect(page).toMatchObject({ total: 312, limit: 25, offset: 0 });
    expect(page.rows).toHaveLength(1);
  });

  it('orders newest first with the id as the tiebreak, so a page is stable', async () => {
    await readReceipts({ brandIds: [BRAND_A] });
    await readOutcomes({ brandIds: [BRAND_A] });
    expect((m.receipts.mock.calls[0][0] as { order: unknown }).order).toEqual([['created_at', 'DESC'], ['id', 'ASC']]);
    expect((m.outcomes.mock.calls[0][0] as { order: unknown }).order).toEqual([['occurred_at', 'DESC'], ['id', 'ASC']]);
  });
});

describe('an empty scope reads nothing, without a query', () => {
  it.each([
    ['receipts', readReceipts, () => m.receipts],
    ['outcomes', readOutcomes, () => m.outcomes],
  ])('%s', async (_label, read, spy) => {
    const page = await (read as typeof readReceipts)({ brandIds: [] });
    expect(page).toEqual({ rows: [], total: 0, limit: DEFAULT_PAGE, offset: 0 });
    expect(spy()).not.toHaveBeenCalled();
  });

  it('and the paging it reports back is the paging it was asked for', async () => {
    expect(await readOutcomes({ brandIds: [], limit: 50, offset: 100 })).toEqual({ rows: [], total: 0, limit: 50, offset: 100 });
  });
});

describe('rates: Phase 4\'s computation, per brand, and bounded before it runs', () => {
  it('COUNTS BOTH of Phase 4\'s reads first, each on that read\'s own predicate', async () => {
    // Phase 4 reads handoffs by `created_at` in [from, to) and outcomes by `occurred_at` in
    // [from, to]. A count on any other predicate measures a different set from the one that would
    // be loaded, so the gate would not be a gate.
    m.handoffCount.mockResolvedValue(12);
    m.outcomeCount.mockResolvedValue(40);
    m.rates.mockResolvedValue({ all: { handoffs: 12 }, by_queue: {} });
    const result = await readRates({ brandIds: [BRAND_A], windowDays: 30, asOf: AT });
    const [handoffQuery] = m.handoffCount.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(handoffQuery.where.brand_id).toBe(BRAND_A);
    const created = handoffQuery.where.created_at as Record<symbol, Date>;
    expect(created[Op.gte]).toEqual(new Date('2026-08-29T12:00:00Z'));
    expect(created[Op.lt]).toEqual(AT);
    const [outcomeQuery] = m.outcomeCount.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(outcomeQuery.where.brand_id).toBe(BRAND_A);
    const occurred = outcomeQuery.where.occurred_at as Record<symbol, Date>;
    expect(occurred[Op.gte]).toEqual(new Date('2026-08-29T12:00:00Z'));
    expect(occurred[Op.lte]).toEqual(AT);
    expect(result.brands[0]).toMatchObject({ brand_id: BRAND_A, capped: false, handoffs_in_window: 12, outcomes_in_window: 40 });
    expect(result.brands[0].rates).not.toBeNull();
  });

  it('counts the window it was ASKED for, not a default one - at 365 days too', async () => {
    // The agreement between the count and the read has to hold at every window, not just the
    // default: a count pinned to 30 days would wave a brand through and then load a year.
    m.handoffCount.mockResolvedValue(1);
    m.outcomeCount.mockResolvedValue(1);
    m.rates.mockResolvedValue({ all: { handoffs: 1 }, by_queue: {} });
    await readRates({ brandIds: [BRAND_A], windowDays: 365, asOf: AT });
    const yearAgo = new Date('2025-09-28T12:00:00Z');
    const created = (m.handoffCount.mock.calls[0][0] as { where: { created_at: Record<symbol, Date> } }).where.created_at;
    const occurred = (m.outcomeCount.mock.calls[0][0] as { where: { occurred_at: Record<symbol, Date> } }).where.occurred_at;
    expect(created[Op.gte]).toEqual(yearAgo);
    expect(created[Op.lt]).toEqual(AT);
    expect(occurred[Op.gte]).toEqual(yearAgo);
    expect(occurred[Op.lte]).toEqual(AT);
    expect(m.rates).toHaveBeenCalledWith({ brandId: BRAND_A, asOf: AT, windowDays: 365 });
  });

  it('a brand over the cap is REFUSED with its reason - never a rate over a truncated sample', async () => {
    // A rate computed over the newest N handoffs is a different number wearing the same name, which
    // is the defect the registry exists to prevent. So the answer is null with `window_too_large`.
    m.handoffCount.mockResolvedValue(MAX_RATE_HANDOFFS + 1);
    m.outcomeCount.mockResolvedValue(7);
    const result = await readRates({ brandIds: [BRAND_A], windowDays: 365, asOf: AT });
    expect(result.brands[0]).toEqual({
      brand_id: BRAND_A, rates: null, capped: true,
      handoffs_in_window: MAX_RATE_HANDOFFS + 1, outcomes_in_window: 7, reason: WINDOW_TOO_LARGE,
    });
    // And neither of Phase 4's unbounded row reads is reached for that brand.
    expect(m.rates).not.toHaveBeenCalled();
    expect(result.max_handoffs_per_brand).toBe(MAX_RATE_HANDOFFS);
    expect(result.max_outcomes_per_brand).toBe(MAX_RATE_OUTCOMES);
  });

  it('a brand UNDER the handoff cap but over the OUTCOME cap is refused too', async () => {
    // The two are not proportional: an outcome is written on every send, reply, disposition,
    // appointment and pipeline advance, and for subjects with no handoff at all. Bounding only the
    // handoffs would leave the heavier read - the one carrying `metadata` - wide open.
    m.handoffCount.mockResolvedValue(10);
    m.outcomeCount.mockResolvedValue(MAX_RATE_OUTCOMES + 1);
    const result = await readRates({ brandIds: [BRAND_A], windowDays: 365, asOf: AT });
    expect(result.brands[0]).toEqual({
      brand_id: BRAND_A, rates: null, capped: true,
      handoffs_in_window: 10, outcomes_in_window: MAX_RATE_OUTCOMES + 1, reason: WINDOW_TOO_LARGE,
    });
    expect(m.rates).not.toHaveBeenCalled();
  });

  it('exactly at the OUTCOME cap still computes', async () => {
    m.outcomeCount.mockResolvedValue(MAX_RATE_OUTCOMES);
    m.rates.mockResolvedValue({ all: { handoffs: 1 }, by_queue: {} });
    expect((await readRates({ brandIds: [BRAND_A], windowDays: 365, asOf: AT })).brands[0].capped).toBe(false);
    expect(m.rates).toHaveBeenCalledTimes(1);
  });

  it('the cap is per brand: one brand over it does not stop the others', async () => {
    m.handoffCount.mockImplementation(async ({ where }: { where: { brand_id: string } }) => (where.brand_id === BRAND_A ? MAX_RATE_HANDOFFS + 5 : 3));
    m.rates.mockResolvedValue({ all: { handoffs: 3 }, by_queue: {} });
    const result = await readRates({ brandIds: [BRAND_A, BRAND_B], windowDays: 365, asOf: AT });
    expect(result.brands.map((b) => [b.brand_id, b.capped])).toEqual([[BRAND_A, true], [BRAND_B, false]]);
    expect(m.rates).toHaveBeenCalledTimes(1);
    expect(m.rates).toHaveBeenCalledWith({ brandId: BRAND_B, asOf: AT, windowDays: 365 });
  });

  it('exactly at the cap still computes - the refusal is strictly over it', async () => {
    m.handoffCount.mockResolvedValue(MAX_RATE_HANDOFFS);
    m.rates.mockResolvedValue({ all: { handoffs: MAX_RATE_HANDOFFS }, by_queue: {} });
    expect((await readRates({ brandIds: [BRAND_A], windowDays: 365, asOf: AT })).brands[0].capped).toBe(false);
    expect(m.rates).toHaveBeenCalledTimes(1);
  });

  it('asks once per brand in scope, with the window, and keeps the brands apart', async () => {
    m.handoffCount.mockResolvedValue(1);
    m.rates.mockImplementation(async ({ brandId }: { brandId: string }) => ({ all: { handoffs: brandId === BRAND_A ? 10 : 2 }, by_queue: {} }));
    const result = await readRates({ brandIds: [BRAND_A, BRAND_B], windowDays: 14, asOf: AT });
    expect(m.rates).toHaveBeenCalledTimes(2);
    expect(result.brands.map((b) => [b.brand_id, (b.rates!.all as unknown as { handoffs: number }).handoffs])).toEqual([[BRAND_A, 10], [BRAND_B, 2]]);
    expect(result.window_days).toBe(14);
  });

  it('an empty scope asks nothing - not even the counts - and returns no brands', async () => {
    expect(await readRates({ brandIds: [], windowDays: 30 })).toEqual({
      brands: [], window_days: 30,
      max_handoffs_per_brand: MAX_RATE_HANDOFFS, max_outcomes_per_brand: MAX_RATE_OUTCOMES,
    });
    expect(m.handoffCount).not.toHaveBeenCalled();
    expect(m.outcomeCount).not.toHaveBeenCalled();
    expect(m.rates).not.toHaveBeenCalled();
  });
});
