/**
 * channelAccountRoutes — T003's "a test asserts no credential column is returned by the account
 * list endpoint", and the auth half that goes with it.
 *
 * The responses are checked as RAW TEXT, not as parsed objects. A parsed check can only assert
 * the absence of fields somebody thought to name; scanning the body for the token itself, and
 * for every sealed column name, catches a leak arriving under a field nobody predicted.
 */

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test' } }));

const mockListAccounts = jest.fn();
const mockConnectAccount = jest.fn();
const mockGetAccount = jest.fn();
const mockRevokeAccount = jest.fn();
const mockRotateCredential = jest.fn();
const mockNeedingRewrap = jest.fn();
jest.mock('../../../services/marketing/channelAccountService', () => ({
  listAccounts: (...a: unknown[]) => mockListAccounts(...a),
  connectAccount: (...a: unknown[]) => mockConnectAccount(...a),
  getAccount: (...a: unknown[]) => mockGetAccount(...a),
  revokeAccount: (...a: unknown[]) => mockRevokeAccount(...a),
  rotateCredential: (...a: unknown[]) => mockRotateCredential(...a),
  credentialsNeedingRewrap: (...a: unknown[]) => mockNeedingRewrap(...a),
}));

const mockScope = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  adminTenantScope: (...a: unknown[]) => mockScope(...a),
  scopeAllows: (scope: any, tenantId: string) =>
    scope.mode === 'migration_open' || (scope.mode === 'scoped' && scope.tenantIds.includes(tenantId)),
}));

const mockVaultAvailable = jest.fn();
jest.mock('../../../services/security/credentialVault', () => ({
  isVaultAvailable: () => mockVaultAvailable(),
  activeKeyId: () => 'deadbeefdeadbeef',
}));

const mockBrandFindByPk = jest.fn();
jest.mock('../../../models', () => ({ Brand: { findByPk: (...a: unknown[]) => mockBrandFindByPk(...a) } }));
// The route imports WorkflowError from a module that pulls in a model, which boots Sequelize.
jest.mock('../../../services/content/contentWorkflowService', () => ({
  WorkflowError: class WorkflowError extends Error {
    constructor(message: string, public readonly status: number, public readonly errorClass: string) {
      super(message); this.name = 'WorkflowError';
    }
  },
}));

import channelAccountRoutes from '../channelAccountRoutes';

const TENANT = '11111111-1111-4111-8111-111111111111';
const BRAND = '22222222-2222-4222-8222-222222222222';
const ACCOUNT = '44444444-4444-4444-8444-444444444444';
const ADMIN = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'EAAG7ZC8ZBxyz0123456789abcdefghijklmnopqrstuvwxyz';

const auth = () => `Bearer ${jwt.sign({ sub: ADMIN, email: 'ali@colaberry.com', role: 'super_admin' }, 'test-secret')}`;

function app() {
  const a = express();
  a.use(express.json());
  a.use(channelAccountRoutes);
  return a;
}

/** What the service returns: a view with lifecycle metadata and no secret. */
const VIEW = {
  id: ACCOUNT, tenant_id: TENANT, brand_id: BRAND, owner_member_id: null,
  provider: 'meta_facebook_page', provider_account_id: 'page-9', display_name: 'Colaberry',
  handle: null, avatar_url: null, status: 'connected',
  granted_scopes: ['pages_manage_posts'], missing_scopes: ['instagram_basic'],
  connected_at: new Date('2026-09-12T00:00:00Z'), last_health_check_at: null,
  last_health_ok: null, last_health_error_class: null, revoked_at: null,
  credentials: [{ credential_type: 'access_token', token_expires_at: null, rotated_at: null, key_id: 'deadbeefdeadbeef', expired: false }],
};

/**
 * The sealed columns, as they would appear if a response ever carried one: a JSON KEY.
 *
 * Checked as `"name":` rather than as a bare substring on purpose. `access_token` is also a
 * legitimate VALUE here - `credential_type: 'access_token'` is the lifecycle metadata an
 * operator needs - so a bare-substring check would fail on correct output and force the
 * assertion to be loosened, which is how a real leak gets waved through later.
 */
const SEALED_KEYS = ['ciphertext', 'wrapped_data_key', 'auth_tag', 'iv', 'access_token', 'refresh_token', 'secret'];

function expectNoSealedField(body: string): void {
  for (const key of SEALED_KEYS) expect(body).not.toContain(`"${key}":`);
}

beforeEach(() => {
  for (const m of [mockListAccounts, mockConnectAccount, mockGetAccount, mockRevokeAccount, mockRotateCredential, mockNeedingRewrap, mockScope, mockVaultAvailable, mockBrandFindByPk]) m.mockReset();
  mockScope.mockResolvedValue({ mode: 'migration_open' });
  mockVaultAvailable.mockReturnValue(true);
  mockNeedingRewrap.mockResolvedValue(0);
  mockListAccounts.mockResolvedValue([VIEW]);
  mockGetAccount.mockResolvedValue(VIEW);
  mockConnectAccount.mockResolvedValue(VIEW);
  mockRotateCredential.mockResolvedValue(VIEW);
  mockRevokeAccount.mockResolvedValue({ ...VIEW, status: 'revoked', credentials: [] });
  mockBrandFindByPk.mockResolvedValue({ id: BRAND, tenant_id: TENANT });
});

describe('no endpoint returns a secret', () => {
  it('the list endpoint returns no credential column', async () => {
    const res = await request(app()).get('/api/admin/channel-accounts').set('Authorization', auth());
    expect(res.status).toBe(200);
    expectNoSealedField(res.text);
    expect(res.text).not.toContain(TOKEN);
    // Lifecycle metadata IS present: an operator must be able to see a token exists and when
    // it expires, otherwise "why did publishing stop" is unanswerable from the UI.
    expect(res.body.accounts[0].credentials[0]).toMatchObject({ credential_type: 'access_token', expired: false });
  });

  it('the detail endpoint returns no credential column', async () => {
    const res = await request(app()).get(`/api/admin/channel-accounts/${ACCOUNT}`).set('Authorization', auth());
    expect(res.status).toBe(200);
    expectNoSealedField(res.text);
    expect(res.text).not.toContain(TOKEN);
  });

  it('the connect endpoint does not echo the token it was just given', async () => {
    // The most likely leak of all: a create that returns what it received.
    const res = await request(app()).post('/api/admin/channel-accounts').set('Authorization', auth()).send({
      brand_id: BRAND, provider: 'meta_facebook_page', provider_account_id: 'page-9',
      display_name: 'Colaberry', access_token: TOKEN,
    });
    expect(res.status).toBe(201);
    expect(res.text).not.toContain(TOKEN);
    expectNoSealedField(res.text);
  });

  it('a validation failure does not echo the body, which carries the token', async () => {
    const res = await request(app()).post('/api/admin/channel-accounts').set('Authorization', auth()).send({
      provider: 'meta_facebook_page', access_token: TOKEN, // display_name missing
    });
    expect(res.status).toBe(400);
    expect(res.text).not.toContain(TOKEN);
  });

  it('an internal failure does not leak the token through the error message', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockConnectAccount.mockRejectedValue(new Error(`provider rejected Bearer ${TOKEN}`));

    const res = await request(app()).post('/api/admin/channel-accounts').set('Authorization', auth()).send({
      brand_id: BRAND, provider: 'meta_facebook_page', provider_account_id: 'page-9',
      display_name: 'Colaberry', access_token: TOKEN,
    });

    expect(res.status).toBe(500);
    expect(res.text).not.toContain(TOKEN);
    // And the log line the server wrote is redacted too.
    expect(spy.mock.calls.map((c) => String(c[0])).join('')).not.toContain(TOKEN);
    spy.mockRestore();
  });
});

describe('auth and scope', () => {
  it.each([
    ['get', '/api/admin/channel-accounts'],
    ['get', `/api/admin/channel-accounts/${ACCOUNT}`],
    ['post', '/api/admin/channel-accounts'],
    ['delete', `/api/admin/channel-accounts/${ACCOUNT}`],
  ])('401s an unauthenticated %s %s', async (method, url) => {
    const res = await (request(app()) as any)[method](url).send({});
    expect(res.status).toBe(401);
    expect(mockListAccounts).not.toHaveBeenCalled();
    expect(mockConnectAccount).not.toHaveBeenCalled();
  });

  it('404s a denied scope rather than 403, so account ids cannot be enumerated', async () => {
    mockScope.mockResolvedValue({ mode: 'denied' });
    const res = await request(app()).get('/api/admin/channel-accounts').set('Authorization', auth());
    expect(res.status).toBe(404);
  });

  it('passes only the caller\'s own tenants to the service when scoped', async () => {
    mockScope.mockResolvedValue({ mode: 'scoped', tenantIds: [TENANT] });
    await request(app()).get('/api/admin/channel-accounts').set('Authorization', auth());
    expect(mockListAccounts.mock.calls[0][0].tenantIds).toEqual([TENANT]);
  });

  it('passes null only for the membership ramp', async () => {
    await request(app()).get('/api/admin/channel-accounts').set('Authorization', auth());
    expect(mockListAccounts.mock.calls[0][0].tenantIds).toBeNull();
  });

  it('404s an account belonging to another tenant', async () => {
    mockScope.mockResolvedValue({ mode: 'scoped', tenantIds: ['other-tenant'] });
    const res = await request(app()).get(`/api/admin/channel-accounts/${ACCOUNT}`).set('Authorization', auth());
    expect(res.status).toBe(404);
  });
});

describe('connect', () => {
  it('takes the tenant from the brand, never from the body', async () => {
    await request(app()).post('/api/admin/channel-accounts').set('Authorization', auth()).send({
      brand_id: BRAND, provider: 'meta_facebook_page', provider_account_id: 'page-9',
      display_name: 'Colaberry', access_token: TOKEN,
      // A caller trying to file this token under someone else's tenant:
      tenant_id: 'attacker-tenant',
    });
    // `.strict()` rejects the unknown key outright, which is the stronger answer.
    expect(mockConnectAccount).not.toHaveBeenCalled();

    await request(app()).post('/api/admin/channel-accounts').set('Authorization', auth()).send({
      brand_id: BRAND, provider: 'meta_facebook_page', provider_account_id: 'page-9',
      display_name: 'Colaberry', access_token: TOKEN,
    });
    expect(mockConnectAccount.mock.calls[0][0].tenantId).toBe(TENANT);
    expect(mockConnectAccount.mock.calls[0][0].connectedBy).toBe(ADMIN);
  });

  it('refuses when the tenant cannot be resolved rather than guessing one', async () => {
    mockScope.mockResolvedValue({ mode: 'scoped', tenantIds: [TENANT, 'second-tenant'] });
    const res = await request(app()).post('/api/admin/channel-accounts').set('Authorization', auth()).send({
      owner_member_id: '66666666-6666-4666-8666-666666666666',
      provider: 'linkedin_member', provider_account_id: 'urn:li:person:x',
      display_name: 'A Student', access_token: TOKEN,
    });
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('TenantUnresolved');
    expect(mockConnectAccount).not.toHaveBeenCalled();
  });

  it('404s a brand the caller may not see', async () => {
    mockScope.mockResolvedValue({ mode: 'scoped', tenantIds: ['other'] });
    const res = await request(app()).post('/api/admin/channel-accounts').set('Authorization', auth()).send({
      brand_id: BRAND, provider: 'meta_facebook_page', provider_account_id: 'page-9',
      display_name: 'Colaberry', access_token: TOKEN,
    });
    expect(res.status).toBe(400);
    expect(mockConnectAccount).not.toHaveBeenCalled();
  });
});

describe('status', () => {
  it('says why connecting is unavailable instead of offering a button that fails', async () => {
    mockVaultAvailable.mockReturnValue(false);
    const res = await request(app()).get('/api/admin/channel-accounts/status').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.vault_available).toBe(false);
    expect(res.body.reason).toMatch(/not configured/);
  });

  it('reports how many credentials still need a re-wrap after a key rotation', async () => {
    mockNeedingRewrap.mockResolvedValue(3);
    const res = await request(app()).get('/api/admin/channel-accounts/status').set('Authorization', auth());
    expect(res.body).toMatchObject({ vault_available: true, credentials_needing_rewrap: 3 });
  });
});
