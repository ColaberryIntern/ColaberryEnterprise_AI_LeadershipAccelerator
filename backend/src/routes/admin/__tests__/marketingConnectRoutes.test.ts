/**
 * Starting a connection, and the list of networks the Brands page shows.
 *
 * The start endpoint is where the admin's session is checked and signed into the state, so its
 * obligations are the gates: auth, the network name, the brand's tenant scope, and "not set up
 * yet" said as 503 with the network's name rather than a crash.
 */

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['test', 'secret', 'connect'].join('-');
jest.mock('../../../config/env', () => ({ env: { jwtSecret: ['test', 'secret', 'connect'].join('-'), nodeEnv: 'test' } }));

const mockBrandFindByPk = jest.fn();
jest.mock('../../../models', () => ({ Brand: { findByPk: (...a: unknown[]) => mockBrandFindByPk(...a) } }));
const mockScope = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  adminTenantScope: (...a: unknown[]) => mockScope(...a),
  scopeAllows: (scope: { mode: string; tenantIds?: string[] }, tenantId: string) =>
    scope.mode !== 'scoped' || (scope.tenantIds ?? []).includes(tenantId),
}));

import marketingConnectRoutes from '../marketingConnectRoutes';
import { decodeState, pkceChallenge, pkceVerifier } from '../../../services/marketing/oauth/oauthState';

const ADMIN = '7865c726-ea85-4ed3-bbd7-8413e334ecad';
const BRAND = '280162e1-3e36-434a-a23c-342545777e1b';
const token = () => jwt.sign({ sub: ADMIN, email: 'ali@colaberry.com', role: 'super_admin' }, SECRET);

const SAVED = { ...process.env };
function app() {
  const a = express();
  a.use(express.json());
  a.use(marketingConnectRoutes);
  return a;
}
const start = (connector: string, body: unknown = { brand_id: BRAND }) =>
  request(app()).post(`/api/admin/marketing/connect/${connector}`).set('Authorization', `Bearer ${token()}`).send(body as object);

beforeEach(() => {
  process.env = {
    ...SAVED,
    JWT_SECRET: SECRET,
    MARKETING_OAUTH_BASE_URL: 'https://www.refactored.ai',
    META_APP_ID: '1234567890',
    META_APP_SECRET: ['meta', 'value'].join('-'),
    X_OAUTH_CLIENT_ID: 'x-client',
    X_OAUTH_CLIENT_SECRET: ['x', 'value'].join('-'),
    LINKEDIN_CLIENT_ID: 'li-client',
    LINKEDIN_CLIENT_SECRET: ['li', 'value'].join('-'),
    LINKEDIN_REDIRECT_URI: 'https://www.refactored.ai/api/marketing/linkedin/callback',
  };
  delete process.env.TIKTOK_CLIENT_KEY;
  delete process.env.TIKTOK_CLIENT_SECRET;
  mockBrandFindByPk.mockReset().mockResolvedValue({ id: BRAND, tenant_id: 'tenant-1' });
  mockScope.mockReset().mockResolvedValue({ mode: 'migration_open' });
});
afterAll(() => { process.env = SAVED; });

describe('the gates', () => {
  it('401 without a session', async () => {
    const res = await request(app()).post('/api/admin/marketing/connect/meta').send({ brand_id: BRAND });
    expect(res.status).toBe(401);
    expect(mockBrandFindByPk).not.toHaveBeenCalled();
  });

  it('404 for a network that does not exist', async () => {
    const res = await start('myspace');
    expect(res.status).toBe(404);
    expect(res.body.error_class).toBe('UnknownConnector');
  });

  it('400 for a brand id that is not a UUID', async () => {
    expect((await start('meta', { brand_id: 'nope' })).status).toBe(400);
  });

  it('a brand outside the caller\'s tenants reads as not found, never as forbidden', async () => {
    mockScope.mockResolvedValue({ mode: 'scoped', tenantIds: ['someone-else'] });
    const res = await start('meta');
    expect(res.status).toBe(404);
    expect(res.body.error_class).toBe('NotFound');
  });

  it('503 naming the network when this server is not set up for it', async () => {
    const res = await start('tiktok');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error_class: 'ProviderNotConfigured', error: expect.stringContaining('TikTok') });
  });
});

describe('starting a connection', () => {
  it('returns the network\'s authorize URL, carrying a state signed for THIS network, brand and admin', async () => {
    const res = await start('meta');
    expect(res.status).toBe(200);
    const url = new URL(res.body.url);
    expect(url.host).toBe('www.facebook.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://www.refactored.ai/api/marketing/oauth/meta/callback');
    const payload = decodeState(url.searchParams.get('state')!, 'meta');
    expect(payload).toMatchObject({ connector: 'meta', brandId: BRAND, adminId: ADMIN });
  });

  it('for X, the challenge in the URL matches the verifier the callback will derive', async () => {
    const url = new URL((await start('x')).body.url);
    const payload = decodeState(url.searchParams.get('state')!, 'x');
    expect(url.searchParams.get('code_challenge')).toBe(pkceChallenge(pkceVerifier(payload.nonce)));
  });

  it('linkedin goes through the existing LinkedIn flow and its registered callback', async () => {
    const url = new URL((await start('linkedin')).body.url);
    expect(url.host).toBe('www.linkedin.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://www.refactored.ai/api/marketing/linkedin/callback');
  });
});

describe('the network list', () => {
  it('lists all six, with configured flags and missing variable names - never values', async () => {
    const res = await request(app()).get('/api/admin/marketing/connectors').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.connectors.map((c: any) => [c.key, c]));
    expect(Object.keys(byKey)).toEqual(['linkedin', 'linkedin_org', 'meta', 'youtube', 'tiktok', 'x']);
    expect(byKey.meta.configured).toBe(true);
    expect(byKey.tiktok).toMatchObject({ configured: false, missing_env: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'] });
    expect(JSON.stringify(res.body)).not.toContain(process.env.META_APP_SECRET!);
  });

  it('401 without a session', async () => {
    expect((await request(app()).get('/api/admin/marketing/connectors')).status).toBe(401);
  });
});
