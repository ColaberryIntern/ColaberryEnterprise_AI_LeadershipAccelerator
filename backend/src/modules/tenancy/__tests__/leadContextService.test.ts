const contextFindOne = jest.fn();
const contextCreate = jest.fn();
const contextFindAll = jest.fn();

jest.mock('../../../models', () => ({
  LeadTenantContext: {
    findOne: (...a: unknown[]) => contextFindOne(...a),
    create: (...a: unknown[]) => contextCreate(...a),
    findAll: (...a: unknown[]) => contextFindAll(...a),
  },
}));

import {
  ensureLeadTenantContext,
  getAuthorizedLeadContexts,
  hasBrandRelationship,
} from '../leadContextService';

const LEAD_ID = 4242;
const CPN_TENANT = '11111111-1111-4111-8111-111111111111';
const CPN_BRAND = '22222222-2222-4222-8222-222222222222';
const FLOTATION_TENANT = '33333333-3333-4333-8333-333333333333';
const SOURCE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOURCE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SESSION_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Minimal stand-in for a persisted row: records the patch its update() received. */
function existingContext(overrides: Record<string, unknown> = {}) {
  const update = jest.fn();
  const row: Record<string, unknown> = {
    id: 'ctx-1',
    lead_id: LEAD_ID,
    tenant_id: CPN_TENANT,
    brand_id: CPN_BRAND,
    organization_id: null,
    relationship_type: 'scholarship_prospect',
    status: 'active',
    pipeline_stage: 'inquiry',
    lead_temperature: null,
    consent_contact: false,
    first_source_id: SOURCE_A,
    first_entry_point_id: null,
    first_visitor_id: null,
    first_session_id: SESSION_A,
    first_campaign_id: null,
    first_campaign_lead_id: null,
    first_touch_at: new Date('2026-01-01T00:00:00Z'),
    last_source_id: SOURCE_A,
    last_session_id: SESSION_A,
    update,
    ...overrides,
  };
  return { row, update };
}

beforeEach(() => {
  [contextFindOne, contextCreate, contextFindAll].forEach((m) => m.mockReset());
  contextCreate.mockImplementation(async (values: Record<string, unknown>) => ({
    id: 'ctx-new',
    ...values,
  }));
});

describe('ensureLeadTenantContext — creation', () => {
  it('creates a context stamped with first AND last touch when none exists', async () => {
    contextFindOne.mockResolvedValue(null);
    const at = new Date('2026-08-21T10:00:00Z');

    const result = await ensureLeadTenantContext({
      leadId: LEAD_ID,
      tenantId: CPN_TENANT,
      brandId: CPN_BRAND,
      relationshipType: 'scholarship_prospect',
      attribution: { sourceId: SOURCE_A, sessionId: SESSION_A, occurredAt: at },
    });

    expect(result.created).toBe(true);
    const values = contextCreate.mock.calls[0][0];
    expect(values.first_source_id).toBe(SOURCE_A);
    expect(values.first_touch_at).toBe(at);
    expect(values.last_source_id).toBe(SOURCE_A);
    expect(values.last_touch_at).toBe(at);
  });

  it('defaults consent to false — a new brand relationship never inherits consent', async () => {
    contextFindOne.mockResolvedValue(null);

    await ensureLeadTenantContext({
      leadId: LEAD_ID,
      tenantId: FLOTATION_TENANT,
      brandId: CPN_BRAND,
      relationshipType: 'b2b_build_prospect',
    });

    const values = contextCreate.mock.calls[0][0];
    expect(values.consent_contact).toBe(false);
    expect(values.consent_at).toBeNull();
  });

  it('records consent with its source when the form actually granted it', async () => {
    contextFindOne.mockResolvedValue(null);

    await ensureLeadTenantContext({
      leadId: LEAD_ID,
      tenantId: CPN_TENANT,
      brandId: CPN_BRAND,
      relationshipType: 'scholarship_prospect',
      consentContact: true,
      consentSource: 'scholarship_interest_form',
    });

    const values = contextCreate.mock.calls[0][0];
    expect(values.consent_contact).toBe(true);
    expect(values.consent_source).toBe('scholarship_interest_form');
    expect(values.consent_at).toBeInstanceOf(Date);
  });
});

describe('ensureLeadTenantContext — first touch is write-once', () => {
  it('never overwrites a first-touch field that is already set', async () => {
    const { row, update } = existingContext();
    contextFindOne.mockResolvedValue(row);

    await ensureLeadTenantContext({
      leadId: LEAD_ID,
      tenantId: CPN_TENANT,
      brandId: CPN_BRAND,
      relationshipType: 'scholarship_prospect',
      attribution: { sourceId: SOURCE_B, sessionId: SESSION_B },
    });

    const patch = update.mock.calls[0][0];
    expect(patch).not.toHaveProperty('first_source_id');
    expect(patch).not.toHaveProperty('first_session_id');
    expect(patch).not.toHaveProperty('first_touch_at');
  });

  it('fills a first-touch field that is still null — completion is not overwriting', async () => {
    const { row, update } = existingContext({ first_campaign_id: null });
    contextFindOne.mockResolvedValue(row);
    const campaignId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    await ensureLeadTenantContext({
      leadId: LEAD_ID,
      tenantId: CPN_TENANT,
      brandId: CPN_BRAND,
      relationshipType: 'scholarship_prospect',
      attribution: { campaignId },
    });

    expect(update.mock.calls[0][0].first_campaign_id).toBe(campaignId);
  });

  it('always advances last touch', async () => {
    const { row, update } = existingContext();
    contextFindOne.mockResolvedValue(row);

    await ensureLeadTenantContext({
      leadId: LEAD_ID,
      tenantId: CPN_TENANT,
      brandId: CPN_BRAND,
      relationshipType: 'scholarship_prospect',
      attribution: { sourceId: SOURCE_B, sessionId: SESSION_B },
    });

    const patch = update.mock.calls[0][0];
    expect(patch.last_source_id).toBe(SOURCE_B);
    expect(patch.last_session_id).toBe(SESSION_B);
    expect(patch.last_touch_at).toBeInstanceOf(Date);
  });
});

describe('ensureLeadTenantContext — idempotency', () => {
  it('reuses the existing row rather than creating a second relationship', async () => {
    const { row } = existingContext();
    contextFindOne.mockResolvedValue(row);

    const result = await ensureLeadTenantContext({
      leadId: LEAD_ID,
      tenantId: CPN_TENANT,
      brandId: CPN_BRAND,
      relationshipType: 'scholarship_prospect',
    });

    expect(result.created).toBe(false);
    expect(contextCreate).not.toHaveBeenCalled();
  });

  it('reports a replayed identical call as not-updated', async () => {
    const { row } = existingContext();
    contextFindOne.mockResolvedValue(row);

    const result = await ensureLeadTenantContext({
      leadId: LEAD_ID,
      tenantId: CPN_TENANT,
      brandId: CPN_BRAND,
      relationshipType: 'scholarship_prospect',
      pipelineStage: 'inquiry',
      attribution: { sourceId: SOURCE_A, sessionId: SESSION_A },
    });

    // last_touch_at moves on every call; on its own that is not a meaningful change.
    expect(result.updated).toBe(false);
  });

  it('never silently revokes consent when a later form omits the checkbox', async () => {
    const { row, update } = existingContext({ consent_contact: true });
    contextFindOne.mockResolvedValue(row);

    await ensureLeadTenantContext({
      leadId: LEAD_ID,
      tenantId: CPN_TENANT,
      brandId: CPN_BRAND,
      relationshipType: 'scholarship_prospect',
      consentContact: false,
    });

    expect(update.mock.calls[0][0]).not.toHaveProperty('consent_contact');
  });
});

describe('getAuthorizedLeadContexts — cross-tenant confidentiality', () => {
  const cpnRow = { tenant_id: CPN_TENANT, brand_id: CPN_BRAND };
  const flotationRow = { tenant_id: FLOTATION_TENANT, brand_id: 'other' };

  beforeEach(() => {
    contextFindAll.mockResolvedValue([cpnRow, flotationRow]);
  });

  it('hides another tenant’s relationship from a tenant-scoped operator', async () => {
    const visible = await getAuthorizedLeadContexts(LEAD_ID, [CPN_TENANT], false);
    expect(visible).toEqual([cpnRow]);
  });

  it('returns nothing for an operator with no memberships', async () => {
    expect(await getAuthorizedLeadContexts(LEAD_ID, [], false)).toEqual([]);
  });

  it('returns every relationship to the platform superadmin', async () => {
    const visible = await getAuthorizedLeadContexts(LEAD_ID, [], true);
    expect(visible).toHaveLength(2);
  });
});

describe('hasBrandRelationship', () => {
  it('is true when a context row exists', async () => {
    contextFindOne.mockResolvedValue({ id: 'ctx-1' });
    expect(await hasBrandRelationship(LEAD_ID, CPN_TENANT, CPN_BRAND)).toBe(true);
  });

  it('is false when it does not', async () => {
    contextFindOne.mockResolvedValue(null);
    expect(await hasBrandRelationship(LEAD_ID, CPN_TENANT, CPN_BRAND)).toBe(false);
  });
});
