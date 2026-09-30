/**
 * The trusted discovery→canonical mapping. Canonical ids come ONLY from the v2 list and are NEVER derived from a
 * title/id: a row without a valid `op:gov:<hex>` is dropped. Unconfigured/unavailable degrades dark and reports
 * the gap so the UI can surface it instead of fabricating a start.
 */
import { fetchGovOpportunityCandidatesV2 } from '../opListClient';

const res = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let prevBase: string | undefined; let prevKey: string | undefined;
beforeEach(() => {
  prevBase = process.env.OPPORTUNITY_PULSE_V2_BASE; prevKey = process.env.OPPORTUNITY_PULSE_API_KEY;
  (global as any).fetch = jest.fn();
});
afterEach(() => {
  const restore = (k: string, v: string | undefined) => { if (v === undefined) delete (process.env as any)[k]; else (process.env as any)[k] = v; };
  restore('OPPORTUNITY_PULSE_V2_BASE', prevBase); restore('OPPORTUNITY_PULSE_API_KEY', prevKey);
  jest.restoreAllMocks();
});
const configure = () => { process.env.OPPORTUNITY_PULSE_V2_BASE = 'https://op.example'; process.env.OPPORTUNITY_PULSE_API_KEY = 'op_k'; };

it('unconfigured → not_configured, no candidates, no fetch', async () => {
  delete process.env.OPPORTUNITY_PULSE_V2_BASE; delete process.env.OPPORTUNITY_PULSE_API_KEY;
  const r = await fetchGovOpportunityCandidatesV2();
  expect(r.available).toBe(false);
  expect(r.reason).toBe('not_configured');
  expect((global.fetch as jest.Mock)).not.toHaveBeenCalled();
});

it('configured + 200 → candidates carrying real canonical ids (sends X-API-Key)', async () => {
  configure();
  const data = [
    { canonicalOpportunityId: 'op:gov:0000000000000000000000000000aaaa', notice: { title: 'A', noticeType: { value: 'solicitation' } }, publisher: { leadBuyer: { name: 'City' } } },
    { canonicalOpportunityId: 'op:gov:0000000000000000000000000000bbbb', title: 'B', agency: 'County' },
  ];
  (global.fetch as jest.Mock).mockResolvedValue(res(200, { status: 'success', data, meta: {} }));
  const r = await fetchGovOpportunityCandidatesV2();
  expect(r.available).toBe(true);
  expect(r.candidates.map((c) => c.canonicalOpportunityId)).toEqual([
    'op:gov:0000000000000000000000000000aaaa', 'op:gov:0000000000000000000000000000bbbb',
  ]);
  expect(r.candidates[0].title).toBe('A');
  expect((global.fetch as jest.Mock).mock.calls[0][1].headers['X-API-Key']).toBe('op_k');
});

it('DROPS any row without a valid canonical id — never derived from a title/id', async () => {
  configure();
  const data = [
    { title: 'No canonical here', id: 42 },
    { canonicalOpportunityId: 'gov-not-canonical', title: 'wrong shape' },
    { canonicalOpportunityId: 'op:gov:0000000000000000000000000000aaaa', title: 'ok' },
  ];
  (global.fetch as jest.Mock).mockResolvedValue(res(200, { data }));
  const r = await fetchGovOpportunityCandidatesV2();
  expect(r.candidates).toHaveLength(1);
  expect(r.candidates[0].canonicalOpportunityId).toBe('op:gov:0000000000000000000000000000aaaa');
});

it('HTTP error → source_failed', async () => {
  configure();
  (global.fetch as jest.Mock).mockResolvedValue(res(500, { status: 'error' }));
  const r = await fetchGovOpportunityCandidatesV2();
  expect(r.available).toBe(false);
  expect(r.reason).toBe('source_failed');
});

it('malformed body (no array) → source_failed', async () => {
  configure();
  (global.fetch as jest.Mock).mockResolvedValue(res(200, { status: 'success', data: { not: 'an array' } }));
  const r = await fetchGovOpportunityCandidatesV2();
  expect(r.available).toBe(false);
  expect(r.reason).toBe('source_failed');
});

it('network error → source_failed (never throws)', async () => {
  configure();
  (global.fetch as jest.Mock).mockRejectedValue(new Error('down'));
  const r = await fetchGovOpportunityCandidatesV2();
  expect(r.available).toBe(false);
  expect(r.reason).toBe('source_failed');
});
