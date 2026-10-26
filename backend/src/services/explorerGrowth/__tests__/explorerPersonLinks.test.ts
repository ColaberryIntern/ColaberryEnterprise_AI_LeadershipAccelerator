const mockUrl = jest.fn();
jest.mock('../../leads/ghlContactLink', () => ({ ghlContactUrl: (...a: unknown[]) => mockUrl(...a) }));
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
// eslint-disable-next-line import/first
import { withGhlUrls, withPersonLinks } from '../explorerPersonLinks';

/**
 * Every learner row carries the 360 and GHL links (2026-10-26). The GHL URL is the routed builder's answer (the right sub-account) or
 * null: never guessed, and a CRM failure never empties the table.
 */
beforeEach(() => { mockUrl.mockReset(); mockQuery.mockReset(); });
const URL = 'https://app.gohighlevel.com/v2/location/LOC12345/contacts/detail/CONTACT123';

describe('withGhlUrls (queries that already joined the lead)', () => {
  it('builds the URL from the lead source and contact id, and drops the raw columns', async () => {
    mockUrl.mockResolvedValue(URL);
    const [row] = await withGhlUrls([{ enrollment_id: 'e1', ghl_contact_id: 'CONTACT123', lead_source: 'colaberry_training' }]);
    expect(mockUrl).toHaveBeenCalledWith('colaberry_training', 'CONTACT123');
    expect(row).toEqual({ enrollment_id: 'e1', ghl_url: URL });
  });
  it('no contact id: no link and no lookup', async () => {
    const [row] = await withGhlUrls([{ enrollment_id: 'e1', ghl_contact_id: null, lead_source: null }]);
    expect(row.ghl_url).toBeNull();
    expect(mockUrl).not.toHaveBeenCalled();
  });
  it('the builder saying "unknown" (no key for that account) stays null', async () => {
    mockUrl.mockResolvedValue(null);
    expect((await withGhlUrls([{ enrollment_id: 'e1', ghl_contact_id: 'CONTACT123', lead_source: 'x' }]))[0].ghl_url).toBeNull();
  });
  it('a CRM failure leaves every link null and keeps the rows', async () => {
    mockUrl.mockRejectedValue(new Error('settings down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const rows = await withGhlUrls([{ enrollment_id: 'e1', ghl_contact_id: 'CONTACT123', lead_source: 'x' }, { enrollment_id: 'e2', ghl_contact_id: null, lead_source: null }]);
    expect(rows.map((r) => [r.enrollment_id, r.ghl_url])).toEqual([['e1', null], ['e2', null]]);
    expect(String(spy.mock.calls[0][0])).toContain('ghl_contact_links_unavailable');
    spy.mockRestore();
  });
});

describe('withPersonLinks (rows that only carry the enrollment)', () => {
  it('adds the lead id and the GHL URL from one batched lookup', async () => {
    mockQuery.mockResolvedValue([{ enrollment_id: 'e1', lead_id: '42', ghl_contact_id: 'CONTACT123', source: 's' }]);
    mockUrl.mockResolvedValue(URL);
    const rows = await withPersonLinks([{ enrollment_id: 'e1', email: 'a@example.com' }, { enrollment_id: 'e9', email: 'b@example.com' }]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({ ids: ['e1', 'e9'] });
    expect(rows).toEqual([
      { enrollment_id: 'e1', email: 'a@example.com', lead_id: 42, ghl_url: URL },
      { enrollment_id: 'e9', email: 'b@example.com', lead_id: null, ghl_url: null },
    ]);
  });
  it('an empty page makes no query', async () => {
    expect(await withPersonLinks([])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
