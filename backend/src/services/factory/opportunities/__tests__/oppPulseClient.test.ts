/**
 * oppPulseClient must DEGRADE DARK: return the labeled snapshot (no network) when Opportunity Pulse is not
 * configured, map a live response tolerantly when it is, and fall back to the snapshot on ANY failure —
 * never throwing. The mapper asserts EXTRACTION of field-name variants, not just a count.
 */
import { fetchBestFitOpportunities, mapOpportunity } from '../oppPulseClient';
import { GOV_OPPORTUNITY_SNAPSHOT, SNAPSHOT_DATE } from '../govOpportunity';

const CONFIG = {
  OPPORTUNITY_PULSE_BASE: 'https://op.test',
  OPPORTUNITY_PULSE_LIST_PATH: '/api/v1/bonfire/opportunities',
  OP_ADMIN_EMAIL: 'admin@test',
  OP_ADMIN_PASSWORD: 'secret',
};

let fetchMock: jest.Mock;
let errSpy: jest.SpyInstance;
const clearConfig = () => { for (const k of Object.keys(CONFIG)) delete (process.env as any)[k]; };
const configure = () => Object.assign(process.env, CONFIG);
const res = (ok: boolean, body: any) => ({ ok, json: async () => body });

beforeEach(() => {
  fetchMock = jest.fn(); (global as any).fetch = fetchMock; clearConfig();
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { clearConfig(); jest.restoreAllMocks(); });

describe('fetchBestFitOpportunities — degrade-dark', () => {
  it('returns the labeled snapshot with NO network call when unconfigured', async () => {
    const feed = await fetchBestFitOpportunities();
    expect(feed.source).toBe('snapshot');
    expect(feed.snapshotDate).toBe(SNAPSHOT_DATE);
    expect(feed.opportunities).toHaveLength(GOV_OPPORTUNITY_SNAPSHOT.length);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled(); // unconfigured is a deliberate dark state, not a failure
  });

  it('maps a live Bonfire response — real shape (id/priorityScore/fitScore/estimatedValue cents/pursuitStatus/aiCategory)', async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(res(true, { data: { accessToken: 'tok' } })) // login
      .mockResolvedValueOnce(res(true, { data: [                          // list — real BonfireOpportunity rows
        { id: 'u1', title: 'AI-Assisted Digital Evidence Analysis Platform', agency: 'City of Dallas', closeDate: '2026-10-23', priorityScore: 79, fitScore: 80, estimatedValue: 100000000, aiCategory: 'IT Services', pursuitStatus: 'none', sourceUrl: 'https://dallascityhall.bonfirehub.com/opportunities/1' },
        // variant field-names + pursuing status; value in cents as a string
        { uuid: 'u2', name: 'Beta RFP', agencyName: 'Agency B', deadline: '2026-11-01', score: '77', value: '25000000', pursuitStatus: 'pursuing', url: 'https://y' },
      ] }));
    const feed = await fetchBestFitOpportunities();
    expect(feed.source).toBe('live');
    expect(feed.snapshotDate).toBeNull();
    expect(feed.opportunities).toHaveLength(2);
    // cents -> dollars ($1.0M), priority badge surfaced, sector tag, not pursued
    expect(feed.opportunities[0]).toMatchObject({ uuid: 'u1', title: 'AI-Assisted Digital Evidence Analysis Platform', agency: 'City of Dallas', closeDate: '2026-10-23', priorityScore: 79, fitScore: 80, estimatedValue: 1000000, category: 'IT Services', pursued: false, sourceUrl: 'https://dallascityhall.bonfirehub.com/opportunities/1' });
    // pursuitStatus 'pursuing' -> pursued true; 25000000 cents -> $250k
    expect(feed.opportunities[1]).toMatchObject({ uuid: 'u2', title: 'Beta RFP', agency: 'Agency B', closeDate: '2026-11-01', fitScore: 77, estimatedValue: 250000, pursued: true });
    expect(fetchMock.mock.calls[0][0]).toBe('https://op.test/api/v1/auth/login');
  });

  it('falls back to the snapshot when login fails, and LOGS the degradation (never silent on the live path)', async () => {
    configure();
    fetchMock.mockResolvedValue(res(false, {}));
    expect((await fetchBestFitOpportunities()).source).toBe('snapshot');
    expect(errSpy).toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0][0])).toContain('opp_pulse_login_failed');
  });

  it('retries login once, then succeeds', async () => {
    configure();
    fetchMock
      .mockRejectedValueOnce(new Error('timeout'))                        // login attempt 1
      .mockResolvedValueOnce(res(true, { data: { accessToken: 'tok' } })) // login attempt 2
      .mockResolvedValueOnce(res(true, [{ uuid: 'u9', title: 'Gamma' }]));// list (bare array)
    const feed = await fetchBestFitOpportunities();
    expect(feed.source).toBe('live');
    expect(feed.opportunities[0].uuid).toBe('u9');
  });

  it('falls back to the snapshot when the list call throws', async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(res(true, { data: { accessToken: 'tok' } }))
      .mockRejectedValueOnce(new Error('network'));
    expect((await fetchBestFitOpportunities()).source).toBe('snapshot');
  });

  it('falls back to the snapshot when the list shape is unexpected (not an array)', async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(res(true, { data: { accessToken: 'tok' } }))
      .mockResolvedValueOnce(res(true, { weird: 'object' }));
    expect((await fetchBestFitOpportunities()).source).toBe('snapshot');
  });
});

describe('mapOpportunity', () => {
  it('drops rows missing the uuid or title anchors', () => {
    expect(mapOpportunity({ title: 'no uuid' })).toBeNull();
    expect(mapOpportunity({ uuid: 'x' })).toBeNull();
    expect(mapOpportunity(null)).toBeNull();
  });
  it('coerces numeric strings and null-fills unknowns', () => {
    expect(mapOpportunity({ uuid: 'u', title: 't', fitScore: '90', value: '', agency: undefined }))
      .toMatchObject({ uuid: 'u', title: 't', fitScore: 90, estimatedValue: null, agency: '' });
  });
  it('converts the cents value to dollars, surfaces priorityScore, and derives pursued from pursuitStatus', () => {
    expect(mapOpportunity({ id: 'u', title: 't', priorityScore: 66, fitScore: 70, estimatedValue: 100000000, aiCategory: 'IT Services', pursuitStatus: 'submitted' }))
      .toMatchObject({ uuid: 'u', priorityScore: 66, fitScore: 70, estimatedValue: 1000000, category: 'IT Services', pursued: true });
    // 'none' -> not pursued; no value -> null
    expect(mapOpportunity({ id: 'v', title: 't2', pursuitStatus: 'none' }))
      .toMatchObject({ uuid: 'v', pursued: false, estimatedValue: null });
  });
});
