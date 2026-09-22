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

  it('maps a live response, tolerating field-name variants, when configured', async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(res(true, { data: { accessToken: 'tok' } })) // login
      .mockResolvedValueOnce(res(true, { data: [                          // list
        { uuid: 'u1', title: 'Alpha RFP', agency: 'Agency A', close_date: '2027-01-15', fit: 82, estimatedValue: 500000, bonfire: 'https://x.bonfirehub.com/opportunities/1' },
        { id: 'u2', name: 'Beta RFP', agencyName: 'Agency B', deadline: '2027-02-01', score: '77', value: '250000', url: 'https://y' },
      ] }));
    const feed = await fetchBestFitOpportunities();
    expect(feed.source).toBe('live');
    expect(feed.snapshotDate).toBeNull();
    expect(feed.opportunities).toHaveLength(2);
    expect(feed.opportunities[0]).toMatchObject({ uuid: 'u1', title: 'Alpha RFP', agency: 'Agency A', closeDate: '2027-01-15', fitScore: 82, estimatedValue: 500000, sourceUrl: 'https://x.bonfirehub.com/opportunities/1' });
    expect(feed.opportunities[1]).toMatchObject({ uuid: 'u2', title: 'Beta RFP', agency: 'Agency B', closeDate: '2027-02-01', fitScore: 77, estimatedValue: 250000, sourceUrl: 'https://y' });
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
});
