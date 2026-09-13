/**
 * channelAccountService — T003's three "done when" guarantees, plus the failure paths.
 *
 * The assertions that matter most are the negative ones: no secret in a list response, no
 * secret in a log line, and no plaintext fallback when the vault is unavailable. A credential
 * store is judged by what it refuses to do.
 */

const mockAccount = { findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), create: jest.fn() };
const mockCredential = { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), destroy: jest.fn(), count: jest.fn() };

jest.mock('../../../models', () => ({
  ChannelAccount: mockAccount,
  ConnectorCredential: mockCredential,
}));

import { randomBytes } from 'crypto';
import {
  connectAccount,
  listAccounts,
  getAccessToken,
  revokeAccount,
  rotateCredential,
  credentialsNeedingRewrap,
} from '../channelAccountService';
import { MASTER_KEY_ENV } from '../../security/credentialVault';
import { WorkflowError } from '../../content/contentWorkflowService';

// Generated, not a literal: a base64 key in a source file is indistinguishable from a real
// leaked one to a scanner, and the tests depend on nothing about its value.
const KEY = randomBytes(32).toString('base64');
const TOKEN = ['EAA', 'G7ZC8ZBxyz0123456789', 'abcdefghijklmnopqrstuvwxyz'].join('');
const TENANT = '11111111-1111-4111-8111-111111111111';
const BRAND = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';

/** A stand-in row that behaves like a Sequelize instance for the fields this service touches. */
function fakeAccount(over: Record<string, unknown> = {}) {
  const row: any = {
    id: 'acc-1', tenant_id: TENANT, brand_id: BRAND, owner_member_id: null,
    provider: 'meta_facebook_page', provider_account_id: 'page-9', display_name: 'Colaberry',
    handle: null, avatar_url: null, status: 'connected', granted_scopes: [], missing_scopes: [],
    connected_at: new Date('2026-09-12T00:00:00Z'), last_health_check_at: null,
    last_health_ok: null, last_health_error_class: null, revoked_at: null, revoked_by: null,
    metadata: {}, ...over,
  };
  row.update = jest.fn(async (patch: Record<string, unknown>) => { Object.assign(row, patch); return row; });
  return row;
}

const storedCredentials: any[] = [];

beforeEach(() => {
  process.env[MASTER_KEY_ENV] = KEY;
  storedCredentials.length = 0;
  for (const m of [mockAccount, mockCredential]) for (const fn of Object.values(m)) (fn as jest.Mock).mockReset();

  mockAccount.findOne.mockResolvedValue(null);
  mockAccount.create.mockImplementation(async (values: any) => fakeAccount(values));
  mockCredential.findOne.mockImplementation(async ({ where }: any) =>
    storedCredentials.find((c) => c.channel_account_id === where.channel_account_id && c.credential_type === where.credential_type) ?? null);
  mockCredential.create.mockImplementation(async (values: any) => {
    const row = { ...values, update: jest.fn(async (p: any) => { Object.assign(row, p); return row; }) };
    storedCredentials.push(row);
    return row;
  });
  mockCredential.findAll.mockImplementation(async () => storedCredentials);
  mockCredential.destroy.mockImplementation(async () => { const n = storedCredentials.length; storedCredentials.length = 0; return n; });
});

const CONNECT = {
  tenantId: TENANT, brandId: BRAND, provider: 'meta_facebook_page', providerAccountId: 'page-9',
  displayName: 'Colaberry', accessToken: TOKEN, grantedScopes: ['pages_manage_posts'],
  missingScopes: ['instagram_basic'], connectedBy: 'admin-1',
};

describe('connect', () => {
  it('seals the token: the stored row contains no readable secret', async () => {
    await connectAccount(CONNECT);
    expect(storedCredentials).toHaveLength(1);
    const row = storedCredentials[0];
    expect(JSON.stringify(row)).not.toContain(TOKEN);
    expect(row.ciphertext).toBeTruthy();
    expect(row.key_id).toMatch(/^[0-9a-f]{16}$/);
    // The account row itself must hold nothing secret at all.
    expect(JSON.stringify(mockAccount.create.mock.calls[0][0])).not.toContain(TOKEN);
  });

  it('returns a view with lifecycle metadata and no secret anywhere in it', async () => {
    const view = await connectAccount({ ...CONNECT, tokenExpiresAt: new Date('2026-10-01T00:00:00Z') });
    const asText = JSON.stringify(view);
    expect(asText).not.toContain(TOKEN);
    expect(asText).not.toContain('ciphertext');
    expect(asText).not.toContain('wrapped_data_key');
    expect(view.credentials).toEqual([
      expect.objectContaining({ credential_type: 'access_token', expired: false }),
    ]);
    expect(view.missing_scopes).toEqual(['instagram_basic']);
  });

  it('stores a refresh token as its own row, because its lifetime differs', async () => {
    await connectAccount({ ...CONNECT, refreshToken: 'refresh-abcdefghijklmnop' });
    expect(storedCredentials.map((c) => c.credential_type).sort()).toEqual(['access_token', 'refresh_token']);
    expect(JSON.stringify(storedCredentials)).not.toContain('refresh-abcdefghijklmnop');
  });

  it('reconnecting the same provider account updates it rather than creating a duplicate', async () => {
    const existing = fakeAccount();
    mockAccount.findOne.mockResolvedValue(existing);
    await connectAccount(CONNECT);
    expect(mockAccount.create).not.toHaveBeenCalled();
    expect(existing.update).toHaveBeenCalled();
  });

  it('REFUSES to store anything when the vault is unavailable', async () => {
    delete process.env[MASTER_KEY_ENV];
    await expect(connectAccount(CONNECT)).rejects.toMatchObject({ status: 503, errorClass: 'VaultUnavailable' });
    // The whole point: no account row, no credential row, no plaintext anywhere.
    expect(mockAccount.create).not.toHaveBeenCalled();
    expect(storedCredentials).toHaveLength(0);
  });

  it('requires exactly one owner', async () => {
    await expect(connectAccount({ ...CONNECT, brandId: null, ownerMemberId: null }))
      .rejects.toMatchObject({ status: 400, errorClass: 'ValidationError' });
    await expect(connectAccount({ ...CONNECT, ownerMemberId: MEMBER }))
      .rejects.toMatchObject({ status: 400, errorClass: 'ValidationError' });
  });

  it('accepts a person-owned account, which is what student posting needs', async () => {
    const view = await connectAccount({ ...CONNECT, brandId: null, ownerMemberId: MEMBER });
    expect(view.owner_member_id).toBe(MEMBER);
    expect(view.brand_id).toBeNull();
  });

  it('logs the connection without the token in the log line', async () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await connectAccount(CONNECT);
    const lines = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).toContain('account_connected');
    expect(lines).not.toContain(TOKEN);
    spy.mockRestore();
  });
});

describe('read back', () => {
  it('round-trips the token through getAccessToken', async () => {
    await connectAccount(CONNECT);
    mockAccount.findByPk.mockResolvedValue(fakeAccount());
    await expect(getAccessToken('acc-1')).resolves.toBe(TOKEN);
  });

  it('marks the account needs_reconnect when a row cannot be opened, rather than failing silently', async () => {
    await connectAccount(CONNECT);
    const account = fakeAccount();
    mockAccount.findByPk.mockResolvedValue(account);
    // Simulate a row altered in the database.
    const raw = Buffer.from(storedCredentials[0].ciphertext, 'base64');
    raw[0] ^= 0x01;
    storedCredentials[0].ciphertext = raw.toString('base64');

    await expect(getAccessToken('acc-1')).rejects.toMatchObject({ errorClass: 'CredentialTampered' });
    expect(account.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'needs_reconnect',
      last_health_ok: false,
      last_health_error_class: 'CredentialTampered',
    }));
  });

  it('refuses a revoked account', async () => {
    mockAccount.findByPk.mockResolvedValue(fakeAccount({ status: 'revoked', revoked_at: new Date() }));
    await expect(getAccessToken('acc-1')).rejects.toMatchObject({ status: 409, errorClass: 'AccountRevoked' });
  });

  it('says CredentialMissing rather than returning an empty token', async () => {
    mockAccount.findByPk.mockResolvedValue(fakeAccount());
    await expect(getAccessToken('acc-1')).rejects.toMatchObject({ errorClass: 'CredentialMissing' });
  });

  it('404s an unknown account', async () => {
    mockAccount.findByPk.mockResolvedValue(null);
    await expect(getAccessToken('nope')).rejects.toBeInstanceOf(WorkflowError);
  });
});

describe('list', () => {
  it('never returns a secret column for any account', async () => {
    await connectAccount(CONNECT);
    mockAccount.findAll.mockResolvedValue([fakeAccount()]);

    const views = await listAccounts({ tenantIds: [TENANT] });

    const asText = JSON.stringify(views);
    expect(asText).not.toContain(TOKEN);
    for (const key of ['ciphertext', 'iv', 'auth_tag', 'wrapped_data_key']) {
      expect(asText).not.toContain(key);
    }
    expect(views[0].credentials[0].credential_type).toBe('access_token');
  });

  it('flags an expired token in the view so the operator sees why publishing stopped', async () => {
    await connectAccount({ ...CONNECT, tokenExpiresAt: new Date('2020-01-01T00:00:00Z') });
    mockAccount.findAll.mockResolvedValue([fakeAccount()]);
    const [view] = await listAccounts({ tenantIds: [TENANT] });
    expect(view.credentials[0].expired).toBe(true);
  });


  it('returns nothing for an empty tenant allow-list instead of reading every tenant', async () => {
    // A denied scope must never widen into an unfiltered read.
    await expect(listAccounts({ tenantIds: [] })).resolves.toEqual([]);
    expect(mockAccount.findAll).not.toHaveBeenCalled();
  });

  it('applies no tenant filter only when the caller passes null, the membership ramp case', async () => {
    mockAccount.findAll.mockResolvedValue([]);
    await listAccounts({ tenantIds: null });
    expect(mockAccount.findAll.mock.calls[0][0].where.tenant_id).toBeUndefined();
  });
  it('returns an empty list without querying credentials when there are no accounts', async () => {
    mockAccount.findAll.mockResolvedValue([]);
    await expect(listAccounts({ tenantIds: [TENANT] })).resolves.toEqual([]);
    expect(mockCredential.findAll).not.toHaveBeenCalled();
  });
});

describe('rotate and revoke', () => {
  it('rotation replaces the secret and clears a needs_reconnect state', async () => {
    await connectAccount(CONNECT);
    const account = fakeAccount({ status: 'needs_reconnect' });
    mockAccount.findByPk.mockResolvedValue(account);

    await rotateCredential('acc-1', 'access_token', 'EAAnewtoken0123456789abcdefghij');

    expect(storedCredentials).toHaveLength(1); // replaced, not accumulated
    expect(storedCredentials[0].rotated_at).toBeInstanceOf(Date);
    expect(account.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'connected' }));
    await expect(getAccessToken('acc-1')).resolves.toBe('EAAnewtoken0123456789abcdefghij');
  });

  it('revoke destroys every secret but keeps the account row for published history', async () => {
    await connectAccount({ ...CONNECT, refreshToken: 'refresh-abcdefghijklmnop' });
    const account = fakeAccount();
    mockAccount.findByPk.mockResolvedValue(account);

    const view = await revokeAccount('acc-1', 'admin-1');

    expect(mockCredential.destroy).toHaveBeenCalledWith({ where: { channel_account_id: 'acc-1' } });
    expect(storedCredentials).toHaveLength(0);
    expect(view.credentials).toEqual([]);
    expect(account.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked', revoked_by: 'admin-1' }));
  });
});

describe('rotation reporting', () => {
  it('counts rows not on the active master key', async () => {
    mockCredential.count.mockResolvedValue(4);
    await expect(credentialsNeedingRewrap(TENANT)).resolves.toBe(4);
    expect(mockCredential.count.mock.calls[0][0].where.tenant_id).toBe(TENANT);
  });

  it('reports zero rather than querying when no key is configured', async () => {
    delete process.env[MASTER_KEY_ENV];
    await expect(credentialsNeedingRewrap()).resolves.toBe(0);
    expect(mockCredential.count).not.toHaveBeenCalled();
  });
});
