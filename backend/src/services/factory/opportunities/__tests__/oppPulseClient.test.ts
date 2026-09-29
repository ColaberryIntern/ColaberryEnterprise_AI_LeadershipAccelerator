/**
 * oppPulseClient must DEGRADE DARK: return the labeled snapshot (no network) when the API key is not
 * configured, call the digest-parity best-fit endpoint with the X-API-Key header when it is, map the real
 * BonfireOpportunity shape, and fall back to the snapshot on ANY failure (incl. a 404 when BONFIRE_ENGINE
 * is off) — never throwing. The mapper asserts EXTRACTION (cents->dollars, priority, pursuit, date), not a count.
 */
import { fetchBestFitOpportunities, mapOpportunity } from '../oppPulseClient';
import { GOV_OPPORTUNITY_SNAPSHOT, SNAPSHOT_DATE } from '../govOpportunity';

const CONFIG = {
  OPPORTUNITY_PULSE_BASE: 'https://op.test',
  OPPORTUNITY_PULSE_LIST_PATH: '/api/v1/bonfire/best-fit?limit=10',
  OPPORTUNITY_PULSE_API_KEY: 'op_testkey',
};

let fetchMock: jest.Mock;
let errSpy: jest.SpyInstance;
const clearConfig = () => { for (const k of Object.keys(CONFIG)) delete (process.env as any)[k]; };
const configure = () => Object.assign(process.env, CONFIG);
const res = (ok: boolean, body: any, status = ok ? 200 : 500) => ({ ok, status, json: async () => body });

beforeEach(() => {
  fetchMock = jest.fn(); (global as any).fetch = fetchMock; clearConfig();
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { clearConfig(); jest.restoreAllMocks(); });

describe('fetchBestFitOpportunities — degrade-dark', () => {
  it('returns the labeled snapshot with NO network call when the API key is unset', async () => {
    const feed = await fetchBestFitOpportunities();
    expect(feed.source).toBe('snapshot');
    expect(feed.snapshotReason).toBe('not_configured'); // dark state, NOT a failure
    expect(feed.snapshotDate).toBe(SNAPSHOT_DATE);
    expect(feed.opportunities).toHaveLength(GOV_OPPORTUNITY_SNAPSHOT.length);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled(); // unconfigured is a deliberate dark state, not a failure
  });

  it('calls /best-fit with the X-API-Key header and maps the real Bonfire shape (allowlist, verdict, provenance)', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(res(true, { status: 'success', data: [
      { id: 'u1', externalId: 'BONF-1', title: 'AI-Assisted Digital Evidence Analysis Platform', agency: 'City of Dallas', closeDate: '2026-10-23T13:00:00.000Z', priorityScore: 79, fitScore: 80, estimatedValue: '100000000', aiCategory: 'IT Services', pursuitStatus: 'none', vetVerdict: null, sourceUrl: 'https://dallascityhall.bonfirehub.com/opportunities/1', enrichedAt: '2026-09-20T00:00:00.000Z' },
      { id: 'u2', title: 'Beta RFP', agency: 'Agency B', closeDate: '2026-11-01T00:00:00.000Z', priorityScore: 74, fitScore: 70, estimatedValue: '25000000', pursuitStatus: 'declined', vetVerdict: { status: 'no_bid', reason: 'out of domain' }, sourceUrl: 'https://y' },
    ], pagination: { total: 2, limit: 10, offset: 0 } }));
    const feed = await fetchBestFitOpportunities();
    expect(feed.source).toBe('live');
    expect(feed.snapshotReason).toBeNull();
    expect(feed.snapshotDate).toBeNull();
    expect(feed.opportunities).toHaveLength(2);
    // string cents -> dollars, provenance 'unverified' (OP sends no basis), FULL closeAt preserved + display date,
    // externalId carried, pursuitStatus preserved, vetVerdict present-but-null
    expect(feed.opportunities[0]).toMatchObject({
      uuid: 'u1', externalId: 'BONF-1', closeAt: '2026-10-23T13:00:00.000Z', closeDate: '2026-10-23',
      estimatedValue: 1000000, valueBasis: 'unverified', pursuitStatus: 'none', pursued: false,
      vetVerdict: null, vetVerdictPresent: true,
    });
    // declined stays declined (not collapsed to none); populated verdict survives; not pursued
    expect(feed.opportunities[1]).toMatchObject({ uuid: 'u2', pursuitStatus: 'declined', pursued: false });
    expect(feed.opportunities[1].vetVerdict).toMatchObject({ status: 'no_bid', reason: 'out of domain' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://op.test/api/v1/bonfire/best-fit?limit=10');
    expect((fetchMock.mock.calls[0][1] as any).headers['X-API-Key']).toBe('op_testkey');
  });

  it('degrades to the snapshot with reason source_failed on a 404 (a CONFIGURED feed that FAILED, not "not configured")', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(res(false, {}, 404));
    const feed = await fetchBestFitOpportunities();
    expect(feed.source).toBe('snapshot');
    expect(feed.snapshotReason).toBe('source_failed'); // must NOT read as not_configured
    expect(errSpy).toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0][0])).toContain('opp_pulse_engine_off_or_path');
  });

  it('degrades to the snapshot and logs on a non-404 HTTP error', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(res(false, {}, 503));
    expect((await fetchBestFitOpportunities()).source).toBe('snapshot');
    expect(String(errSpy.mock.calls[0][0])).toContain('opp_pulse_list_http');
  });

  it('retries once on a network error, then succeeds', async () => {
    configure();
    fetchMock
      .mockRejectedValueOnce(new Error('timeout'))                     // attempt 1
      .mockResolvedValueOnce(res(true, { data: [{ id: 'u9', title: 'Gamma' }] })); // attempt 2
    const feed = await fetchBestFitOpportunities();
    expect(feed.source).toBe('live');
    expect(feed.opportunities[0].uuid).toBe('u9');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the snapshot when both attempts throw', async () => {
    configure();
    fetchMock.mockRejectedValue(new Error('network'));
    expect((await fetchBestFitOpportunities()).source).toBe('snapshot');
  });

  it('falls back to the snapshot when the list shape is unexpected (not an array)', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(res(true, { weird: 'object' }));
    expect((await fetchBestFitOpportunities()).source).toBe('snapshot');
  });
});

describe('mapOpportunity', () => {
  it('drops rows missing the uuid or title anchors', () => {
    expect(mapOpportunity({ title: 'no uuid' })).toBeNull();
    expect(mapOpportunity({ uuid: 'x' })).toBeNull();
    expect(mapOpportunity(null)).toBeNull();
  });
  it('converts string cents to dollars, surfaces priorityScore, truncates the date, and reads pursuitStatus', () => {
    expect(mapOpportunity({ id: 'u', title: 't', priorityScore: 66, fitScore: 70, estimatedValue: '100000000', aiCategory: 'IT Services', closeDate: '2026-10-02T05:00:00.000Z', pursuitStatus: 'submitted' }))
      .toMatchObject({ uuid: 'u', priorityScore: 66, fitScore: 70, estimatedValue: 1000000, category: 'IT Services', closeDate: '2026-10-02', pursued: true });
  });
  it('preserves the full pursuitStatus enum — declined stays DISTINCT from none (not just via the boolean)', () => {
    expect(mapOpportunity({ id: 'a', title: 't', pursuitStatus: 'none' })).toMatchObject({ pursuitStatus: 'none', pursued: false });
    expect(mapOpportunity({ id: 'b', title: 't', pursuitStatus: 'declined' })).toMatchObject({ pursuitStatus: 'declined', pursued: false });
    expect(mapOpportunity({ id: 'c', title: 't', pursuitStatus: 'pursuing' })).toMatchObject({ pursuitStatus: 'pursuing', pursued: true });
    expect(mapOpportunity({ id: 'd', title: 't', pursuitStatus: 'submitted' })).toMatchObject({ pursuitStatus: 'submitted', pursued: true });
    // an unknown status is not silently trusted
    expect(mapOpportunity({ id: 'e', title: 't', pursuitStatus: 'weird' })).toMatchObject({ pursuitStatus: null });
  });
  it('distinguishes an ABSENT vetVerdict from a null one, and carries a populated one through', () => {
    const absent = mapOpportunity({ id: 'a', title: 't' })!;              // field not present
    expect(absent.vetVerdictPresent).toBe(false);
    expect(absent.vetVerdict).toBeNull();
    const nulled = mapOpportunity({ id: 'b', title: 't', vetVerdict: null })!; // present, unassessed
    expect(nulled.vetVerdictPresent).toBe(true);
    expect(nulled.vetVerdict).toBeNull();
    const populated = mapOpportunity({ id: 'c', title: 't', vetVerdict: { status: 'needs_review', method: 'title_regex', evidence: null } })!;
    expect(populated.vetVerdictPresent).toBe(true);
    expect(populated.vetVerdict).toMatchObject({ status: 'needs_review', method: 'title_regex', evidence: null });
  });
  it('verdict is an EXPLICIT nested allowlist — unexpected nested props are dropped; a malformed verdict is unassessed', () => {
    // only supported fields cross; an injected nested prop must not reach the browser
    const v = mapOpportunity({ id: 'a', title: 't', vetVerdict: { status: 'no_bid', label: 'Construction', reason: 'r', disqualifier: 'd', method: 'manual', evidence: 'doc §3', secret: 'LEAK', nested: { x: 1 } } })!.vetVerdict!;
    expect(v).toEqual({ status: 'no_bid', label: 'Construction', reason: 'r', disqualifier: 'd', method: 'manual', evidence: 'doc §3' });
    expect((v as any).secret).toBeUndefined();
    expect((v as any).nested).toBeUndefined();
    // malformed shapes -> null (unassessed), never a verdict/approval; vetVerdictPresent still records presence
    expect(mapOpportunity({ id: 'b', title: 't', vetVerdict: 'no_bid' })!.vetVerdict).toBeNull();
    expect(mapOpportunity({ id: 'c', title: 't', vetVerdict: ['no_bid'] })!.vetVerdict).toBeNull();
    expect(mapOpportunity({ id: 'd', title: 't', vetVerdict: { note: 'no status/label/reason' } })!.vetVerdict).toBeNull();
    expect(mapOpportunity({ id: 'e', title: 't', vetVerdict: 'no_bid' })!.vetVerdictPresent).toBe(true);
  });
  it('preserves the full close timestamp (closeAt) verbatim and never silently shifts it', () => {
    const o = mapOpportunity({ id: 'a', title: 't', closeDate: '2026-10-23T13:00:00.000Z' })!;
    expect(o.closeAt).toBe('2026-10-23T13:00:00.000Z'); // full source timestamp retained
    expect(o.closeDate).toBe('2026-10-23');             // display truncation only
  });
  it('tags a live value as unverified provenance and null-fills an empty/absent value', () => {
    expect(mapOpportunity({ uuid: 'u', title: 't', estimatedValue: '100000000' })).toMatchObject({ estimatedValue: 1000000, valueBasis: 'unverified' });
    expect(mapOpportunity({ uuid: 'u', title: 't', estimatedValue: '' })).toMatchObject({ estimatedValue: null, valueBasis: null });
  });
});
