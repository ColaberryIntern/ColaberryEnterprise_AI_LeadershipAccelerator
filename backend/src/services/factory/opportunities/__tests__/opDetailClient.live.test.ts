/**
 * The LIVE OP v2 detail adapter, against the verified producer contract (OP PR #3): reads `.data`, binds the
 * HONEST `meta.sourceSnapshotVersion`, validates the pinned Zod schema at the boundary, and classifies every
 * failure/edge — auth, not-found, rate-limit/5xx, malformed, canonical mismatch, degraded, snapshot-unrecorded,
 * timeout. It NEVER returns a fixture (this file configures a live base). OP #3 is UNDEPLOYED, so this is verified
 * against the contract with a mocked fetch — NOT proof of live integration.
 */
import { resolveGovOpportunityDetail } from '../opDetailClient';

const CANON = 'op:gov:0000000000000000000000000000aaaa';

const validData = (over: any = {}) => ({
  schemaVersion: 'gov-opportunity.v1',
  canonicalOpportunityId: CANON,
  sourceSnapshotVersion: 1, // data's is defaulted — NOT authoritative
  sourceSystem: 'opportunity-pulse', sourceRecordId: '1',
  notice: {}, publisher: {}, deadline: {}, value: {},
  documents: { coverage: 'complete', counts: { listed: 1, downloaded: 1, parsed: 1, inaccessible: 0 }, items: [{ docId: 'D1', filename: 's.pdf', role: 'solicitation', retrieval: { status: 'downloaded' } }] },
  requirements: [], timestamps: {}, sourceAssessment: { legacyVerdict: null }, companyQualification: null,
  ...over,
});
const envelope = (data: any, metaVersion: number | null) => ({ status: 'success', message: 'Success', code: 200, data, diagnostics: [{}], meta: { schemaVersion: 'gov-opportunity.v1', sourceSnapshotVersion: metaVersion } });
const res = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

let prevBase: string | undefined; let prevKey: string | undefined; let prevEnv: string | undefined;
beforeEach(() => {
  prevBase = process.env.OPPORTUNITY_PULSE_V2_BASE; prevKey = process.env.OPPORTUNITY_PULSE_API_KEY; prevEnv = process.env.NODE_ENV;
  process.env.OPPORTUNITY_PULSE_V2_BASE = 'https://op.example';
  process.env.OPPORTUNITY_PULSE_API_KEY = 'op_testkey';
  (global as any).fetch = jest.fn();
});
afterEach(() => {
  const restore = (k: string, v: string | undefined) => { if (v === undefined) delete (process.env as any)[k]; else (process.env as any)[k] = v; };
  restore('OPPORTUNITY_PULSE_V2_BASE', prevBase); restore('OPPORTUNITY_PULSE_API_KEY', prevKey); restore('NODE_ENV', prevEnv);
  jest.restoreAllMocks();
});

it('200 valid → available, binds the HONEST meta.sourceSnapshotVersion (not data\'s default)', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(res(200, envelope(validData({ sourceSnapshotVersion: 1 }), 7)));
  const r = await resolveGovOpportunityDetail(CANON);
  expect(r.state).toBe('available');
  expect(r.sourceSnapshotVersion).toBe(7);        // honest meta value, not data's 1
  expect(r.snapshotRecorded).toBe(true);
  expect(r.isFixture).toBe(false);
  // sends X-API-Key to the v2 detail path
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain(`/api/v2/gov-opportunities/${CANON}`);
  expect(init.headers['X-API-Key']).toBe('op_testkey');
});

it('200 with data.sourceAvailability degraded → degraded (blocks approval)', async () => {
  const data = validData({ sourceAvailability: { status: 'degraded', servingLastKnownSnapshot: true } });
  (global.fetch as jest.Mock).mockResolvedValue(res(200, envelope(data, 3)));
  expect((await resolveGovOpportunityDetail(CANON)).state).toBe('degraded');
});

it('200 with meta.sourceSnapshotVersion null → snapshot_unrecorded', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(res(200, envelope(validData(), null)));
  const r = await resolveGovOpportunityDetail(CANON);
  expect(r.state).toBe('snapshot_unrecorded');
  expect(r.snapshotRecorded).toBe(false);
});

it('401 and 403 → auth_failed', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(res(401, { status: 'error', message: 'Invalid token.', code: 401 }));
  expect((await resolveGovOpportunityDetail(CANON)).state).toBe('auth_failed');
  (global.fetch as jest.Mock).mockResolvedValue(res(403, { status: 'error', message: 'Forbidden', code: 403 }));
  expect((await resolveGovOpportunityDetail(CANON)).state).toBe('auth_failed');
});

it('404 not_found → unavailable', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(res(404, { status: 'error', message: 'No such government opportunity.', code: 404, errorCode: 'not_found' }));
  expect((await resolveGovOpportunityDetail(CANON)).state).toBe('unavailable');
});

it('429 and 500 → unavailable', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(res(429, { status: 'error', message: 'Too many requests', code: 429 }));
  expect((await resolveGovOpportunityDetail(CANON)).state).toBe('unavailable');
  (global.fetch as jest.Mock).mockResolvedValue(res(500, { status: 'error', message: 'Failed', code: 500, errorCode: 'internal_error' }));
  expect((await resolveGovOpportunityDetail(CANON)).state).toBe('unavailable');
});

it('malformed .data (fails the pinned Zod schema) → malformed (never approvable)', async () => {
  const bad = validData(); delete (bad as any).documents.items; // items is required by the boundary validator
  (global.fetch as jest.Mock).mockResolvedValue(res(200, envelope(bad, 2)));
  expect((await resolveGovOpportunityDetail(CANON)).state).toBe('malformed');
});

it('canonical mismatch (data id ≠ requested) → malformed', async () => {
  const other = validData({ canonicalOpportunityId: 'op:gov:0000000000000000000000000000bbbb' });
  (global.fetch as jest.Mock).mockResolvedValue(res(200, envelope(other, 2)));
  expect((await resolveGovOpportunityDetail(CANON)).state).toBe('malformed');
});

it('missing .data → malformed', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(res(200, { status: 'success', code: 200, meta: {} }));
  expect((await resolveGovOpportunityDetail(CANON)).state).toBe('malformed');
});

it('network error retries once, then → unavailable (never a fixture)', async () => {
  (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
  const r = await resolveGovOpportunityDetail(CANON);
  expect(r.state).toBe('unavailable');
  expect(r.isFixture).toBe(false);
  expect((global.fetch as jest.Mock).mock.calls.length).toBe(2); // one retry
});

it('LIVE path is used even in production (and returns no fixture)', async () => {
  (process.env as any).NODE_ENV = 'production';
  (global.fetch as jest.Mock).mockResolvedValue(res(200, envelope(validData(), 4)));
  const r = await resolveGovOpportunityDetail(CANON);
  expect(r.state).toBe('available');
  expect(r.isFixture).toBe(false);
});
