import { genericConnectNotice } from '../AdminBrandsPage';

/**
 * The sentence an operator reads the moment a network sends them back - the one point where
 * they learn whether connecting worked. Each outcome must say what happened and what to do.
 */

const q = (s: string) => new URLSearchParams(s);

describe('after a network sends the browser back', () => {
  it('says nothing when the query carries no outcome', () => {
    expect(genericConnectNotice(q(''))).toBeNull();
    expect(genericConnectNotice(q('linkedin=connected'))).toBeNull();
  });

  it('success names the network, counts the accounts, and does not overpromise', () => {
    const n = genericConnectNotice(q('connected=meta&brand=b&count=3'))!;
    expect(n.tone).toBe('success');
    expect(n.text).toContain('Facebook & Instagram connected: 3 accounts');
    // Connecting is not posting; the notice must not imply posts now go out on their own.
    expect(n.text).toMatch(/publish by hand/);
  });

  it('one account is "1 account"', () => {
    expect(genericConnectNotice(q('connected=x&count=1'))!.text).toContain('X connected: 1 account added');
  });

  it.each([
    ['cancelled', /cancelled before finishing\. Nothing was saved/],
    ['StateExpired', /ten minutes/],
    ['StateConnectorMismatch', /could not be verified/],
    ['NoAccountsFound', /choose the pages or accounts/],
    ['ProviderNotConfigured', /not set up on this server/],
    ['VaultUnavailable', /Nothing was connected/],
    ['SomethingNew', /\(SomethingNew\)/],
  ])('%s explains itself', (reason, pattern) => {
    const n = genericConnectNotice(q(`connect_error=${reason}&connector=tiktok`))!;
    expect(n.tone).toBe('danger');
    expect(n.text).toMatch(pattern);
  });

  it('an error with no known network still reads as a sentence', () => {
    const n = genericConnectNotice(q('connect_error=UnknownConnector'))!;
    expect(n.text).toBe('The connection failed (UnknownConnector). Start it again from this page.');
    expect(n.text).not.toMatch(/The The/);
  });
});
