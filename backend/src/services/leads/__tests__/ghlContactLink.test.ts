import { locationIdFromApiKey, ghlContactUrl } from '../ghlContactLink';

const resolveGhlAccountForSource = jest.fn();
jest.mock('../ghlAccountRouting', () => ({
  resolveGhlAccountForSource: (...a: unknown[]) => resolveGhlAccountForSource(...a),
}));

/**
 * A link to the WRONG sub-account is worse than no link.
 *
 * GHL answers a contact id that is not in the requested location with an empty record rather than
 * an error, so a wrong link does not look broken - it looks like the person is not in the CRM.
 * An operator checking whether somebody was synced would conclude they were not, which is the
 * exact question this link exists to answer. So every "we cannot say" path below returns null,
 * and the UI shows nothing.
 */

/** A v1 key is a JWT; only the payload matters here, so the signature is a placeholder. */
function keyFor(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return `header.${b64}.signature`;
}

const SCHOOL = 'ttBtJmxoLwjf18lIvvVD';
const CORY = 'JFWwp8q7l6T12NWTIOKG';

beforeEach(() => jest.clearAllMocks());

describe('reading the location out of a key', () => {
  it('returns the location the key is scoped to', () => {
    expect(locationIdFromApiKey(keyFor({ location_id: SCHOOL, version: 1 }))).toBe(SCHOOL);
  });

  it('returns null rather than a guess for anything unreadable', () => {
    for (const bad of [null, undefined, '', 'not-a-jwt', 'only.two', keyFor({ version: 1 })]) {
      expect(locationIdFromApiKey(bad as string)).toBeNull();
    }
  });

  it('rejects a location that is not shaped like an id', () => {
    // A payload claiming something odd must not be interpolated into a URL.
    expect(locationIdFromApiKey(keyFor({ location_id: '../../evil' }))).toBeNull();
    expect(locationIdFromApiKey(keyFor({ location_id: 42 }))).toBeNull();
  });
});

describe('the contact URL follows the routing, not a hardcoded account', () => {
  it('points a training lead at the school location', async () => {
    resolveGhlAccountForSource.mockResolvedValue({
      status: 'ready',
      account: { apiKey: keyFor({ location_id: SCHOOL }), accountKey: 'school_of_data_analytics' },
    });

    const url = await ghlContactUrl('free_signup', '6NtBjNn8kjgKGMx5cIxc');
    expect(url).toBe(`https://app.gohighlevel.com/v2/location/${SCHOOL}/contacts/detail/6NtBjNn8kjgKGMx5cIxc`);
  });

  it('points another brand at the default location', async () => {
    resolveGhlAccountForSource.mockResolvedValue({
      status: 'ready',
      account: { apiKey: keyFor({ location_id: CORY }), accountKey: 'default' },
    });

    const url = await ghlContactUrl('ai-flotation', '6NtBjNn8kjgKGMx5cIxc');
    expect(url).toContain(`/location/${CORY}/`);
    expect(url).not.toContain(SCHOOL);
  });

  it('asks routing about the lead\'s own source', async () => {
    resolveGhlAccountForSource.mockResolvedValue({ status: 'no_credentials' });
    await ghlContactUrl('popup', '6NtBjNn8kjgKGMx5cIxc');
    expect(resolveGhlAccountForSource).toHaveBeenCalledWith('popup');
  });
});

describe('what it refuses to link to', () => {
  const ready = {
    status: 'ready',
    account: { apiKey: keyFor({ location_id: SCHOOL }), accountKey: 'school_of_data_analytics' },
  };

  it('no contact id means no link - the person was never synced', async () => {
    resolveGhlAccountForSource.mockResolvedValue(ready);
    expect(await ghlContactUrl('free_signup', null)).toBeNull();
    expect(await ghlContactUrl('free_signup', '')).toBeNull();
  });

  it('a withheld or unconfigured account means no link', async () => {
    // These are the states the routing layer uses to protect against misfiling. A link here
    // would contradict the sync's own decision not to write the contact.
    for (const status of ['unconfigured', 'no_credentials', 'routes_unreadable']) {
      resolveGhlAccountForSource.mockResolvedValue({ status });
      // eslint-disable-next-line no-await-in-loop
      expect(await ghlContactUrl('free_signup', '6NtBjNn8kjgKGMx5cIxc')).toBeNull();
    }
  });

  it('a key with no readable location means no link', async () => {
    resolveGhlAccountForSource.mockResolvedValue({
      status: 'ready', account: { apiKey: 'garbage', accountKey: 'default' },
    });
    expect(await ghlContactUrl('free_signup', '6NtBjNn8kjgKGMx5cIxc')).toBeNull();
  });

  it('never interpolates a contact id that is not shaped like one', async () => {
    resolveGhlAccountForSource.mockResolvedValue(ready);
    expect(await ghlContactUrl('free_signup', '../../../settings')).toBeNull();
    expect(await ghlContactUrl('free_signup', 'short')).toBeNull();
  });

  it('does not put the api key anywhere in the url', async () => {
    resolveGhlAccountForSource.mockResolvedValue(ready);
    const url = await ghlContactUrl('free_signup', '6NtBjNn8kjgKGMx5cIxc');
    expect(url).not.toContain('header.');
    expect(url).not.toContain('signature');
  });
});
