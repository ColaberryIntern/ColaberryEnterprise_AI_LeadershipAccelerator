/**
 * POST /api/admin/content: `created_by` is the admin's id, never the email.
 *
 * `content_items.created_by` is a UUID column. The route wrote `req.admin.email` into it, so
 * "Create draft" - the composer's first click - was a 500 for every operator on production
 * (`invalid input syntax for type uuid: "ali@colaberry.com"`, found 2026-09-11 while running
 * the live journey). Nothing caught it: the unit tests mocked the model, and the dev
 * screenshots rendered the empty form without submitting it. This test asserts the value
 * handed to the model, which is the thing the database rejects.
 */

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test', publicAppUrl: 'https://enterprise.colaberry.ai' } }));

const mockCreate = jest.fn();
const mockBrandFindByPk = jest.fn();
jest.mock('../../../models', () => ({
  ContentItem: { create: (...a: unknown[]) => mockCreate(...a) },
  Brand: { findByPk: (...a: unknown[]) => mockBrandFindByPk(...a) },
}));
// The route file imports the model module for its status list; that module boots Sequelize.
jest.mock('../../../models/ContentItem', () => ({
  CONTENT_ITEM_STATUSES: ['idea', 'draft', 'ready_for_review', 'changes_requested', 'approved', 'scheduled', 'publishing', 'published', 'validation_failed', 'publish_failed', 'partially_published', 'archived'],
}));
jest.mock('../../../models/BrandGovernanceRule', () => ({ __esModule: true, default: {} }));
jest.mock('../../../services/launchSafety', () => ({ isKillSwitchActive: jest.fn(async () => false) }));
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  adminTenantScope: jest.fn(async () => ({ mode: 'migration_open' })),
  scopeAllows: () => true,
}));

import contentComposerRoutes from '../contentComposerRoutes';

const ADMIN_ID = '7865c726-ea85-4ed3-bbd7-8413e334ecad';
const BRAND_ID = '280162e1-3e36-434a-a23c-342545777e1b';
const token = () => jwt.sign({ sub: ADMIN_ID, email: 'ali@colaberry.com', role: 'super_admin' }, 'test-secret');

function app() {
  const a = express();
  a.use(express.json());
  a.use(contentComposerRoutes);
  return a;
}

beforeEach(() => {
  mockCreate.mockReset().mockImplementation(async (values: Record<string, unknown>) => ({ id: 'ci-1', ...values }));
  mockBrandFindByPk.mockReset().mockResolvedValue({ id: BRAND_ID, tenant_id: 'tenant-1' });
});

describe('POST /api/admin/content', () => {
  it('writes the admin id into created_by, not the email', async () => {
    const res = await request(app())
      .post('/api/admin/content')
      .set('Authorization', `Bearer ${token()}`)
      .send({ brand_id: BRAND_ID, title: 'Free AI class', canonical_body: 'Join us Thursday.' });
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const values = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(values.created_by).toBe(ADMIN_ID);
    expect(values.created_by).not.toMatch(/@/);
    expect(values.tenant_id).toBe('tenant-1'); // from the brand, never the body
  });

  it('401s without a session', async () => {
    const res = await request(app()).post('/api/admin/content').send({ brand_id: BRAND_ID, title: 'x' });
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
