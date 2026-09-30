/**
 * T226 — an engine-level routing failure during ingest is LOGGED with its
 * class and never loses the lead. Before this, the ingest wrapped
 * `evaluateAndDispatch` in an empty `catch {}`: every remaining rule for that
 * lead was dropped with no line anywhere.
 *
 * Also pins that the ingest now passes the source's tenant/brand and a
 * brand slug through to the engine (T226 facts), fail-soft when unresolved.
 */
const rawUpdate = jest.fn();
const leadUpdate = jest.fn();
const dispatch = jest.fn();
const resolveContextBySourceSlug = jest.fn();

jest.mock('../../models', () => ({
  RawLeadPayload: { create: async () => ({ id: 'raw-9', update: (...a: unknown[]) => rawUpdate(...a) }) },
  LeadSource: { findOne: async () => ({ id: 'src-1', slug: 'ai-flotation', is_active: true, hmac_secret: null, tenant_id: 't-af', brand_id: 'b-af' }) },
  EntryPoint: { findOne: async () => ({ id: 'ep-1', slug: 'workflow_intake', entry_type: null }) },
  FormDefinition: { findOne: async () => ({ field_map: { email: 'email', name: 'name' }, required_fields: ['email'] }) },
  Lead: {},
}));
jest.mock('../leadService', () => ({
  createLead: async () => ({ lead: { id: 501, email: 'person@example.com', update: (...a: unknown[]) => leadUpdate(...a) }, isDuplicate: false }),
}));
jest.mock('../leads/prospectAccount', () => ({ ensureProspectAccount: async () => ({}) }));
jest.mock('../activityService', () => ({ logActivity: async () => ({}) }));
jest.mock('../../modules/tenancy/leadContextService', () => ({ ensureLeadTenantContext: async () => ({ created: true }) }));
jest.mock('../../modules/tenancy/tenantResolver', () => ({ resolveContextBySourceSlug: (...a: unknown[]) => resolveContextBySourceSlug(...a) }));
jest.mock('../routingEngineService', () => ({ evaluateAndDispatch: (...a: unknown[]) => dispatch(...a) }));

import { handleIngest } from '../leadIngestionService';

const req = () => ({
  sourceSlug: 'ai-flotation',
  entrySlug: 'workflow_intake',
  headers: {},
  rawBody: { email: 'person@example.com', name: 'A Person' },
  remoteIp: '127.0.0.1',
});

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  rawUpdate.mockReset().mockResolvedValue({});
  leadUpdate.mockReset().mockResolvedValue({});
  dispatch.mockReset().mockResolvedValue([]);
  resolveContextBySourceSlug.mockReset().mockResolvedValue({ brandSlug: 'ai-flotation', brandId: 'b-af', tenantId: 't-af' });
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('routing failure never loses the lead', () => {
  it('a throwing engine → response still accepted, raw row accepted, one structured log line with error_class', async () => {
    dispatch.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const res = await handleIngest(req());
    expect(res).toMatchObject({ success: true, status: 'accepted', httpStatus: 200, leadId: 501, rawPayloadId: 'raw-9' });
    expect(rawUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted', resulting_lead_id: 501 }));

    const lines = errorSpy.mock.calls.map((c) => String(c[0]));
    const line = lines.find((l) => l.includes('routing_dispatch_failed'));
    expect(line).toBeDefined();
    const parsed = JSON.parse(line!);
    expect(parsed).toMatchObject({ event: 'routing_dispatch_failed', raw_payload_id: 'raw-9', source_slug: 'ai-flotation' });
    expect(typeof parsed.error_class).toBe('string');
    expect(parsed.error_class.length).toBeGreaterThan(0);
  });

  it('the log line carries no person identifier', async () => {
    dispatch.mockRejectedValue(new Error('boom person@example.com'));
    await handleIngest(req());
    const line = errorSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('routing_dispatch_failed'))!;
    expect(line).not.toContain('@');
    expect(line).not.toContain('A Person');
  });

  it('control: with a healthy engine, no routing_dispatch_failed line is written', async () => {
    await handleIngest(req());
    expect(errorSpy.mock.calls.map((c) => String(c[0])).some((l) => l.includes('routing_dispatch_failed'))).toBe(false);
  });
});

describe('brand facts reach the engine', () => {
  it('passes the source tenant/brand ids and the resolved brand slug', async () => {
    await handleIngest(req());
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 501 }),
      expect.objectContaining({ raw_payload_id: 'raw-9', source_slug: 'ai-flotation', entry_slug: 'workflow_intake', tenant_id: 't-af', brand_id: 'b-af', brand_slug: 'ai-flotation' }),
    );
  });

  it('a failing or empty slug resolution passes null, never throws, never blocks routing', async () => {
    resolveContextBySourceSlug.mockRejectedValue(new Error('resolver down'));
    await handleIngest(req());
    expect(dispatch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ brand_slug: null }));
    resolveContextBySourceSlug.mockResolvedValue(null);
    await handleIngest(req());
    expect(dispatch).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ brand_slug: null }));
  });
});
