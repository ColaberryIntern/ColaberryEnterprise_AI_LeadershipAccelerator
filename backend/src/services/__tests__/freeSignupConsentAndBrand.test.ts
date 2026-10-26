const findOrCreate = jest.fn();
const resolveContextBySourceSlug = jest.fn();
const ensureLeadTenantContext = jest.fn();
const captureSignupConsent = jest.fn();
const sendPortalWelcome = jest.fn();

jest.mock('../../models', () => ({
  Lead: { findOrCreate: (...a: unknown[]) => findOrCreate(...a) },
}));
jest.mock('../../config/env', () => ({
  env: { jwtSecret: 'test-secret', databaseUrl: 'postgres://u:p@localhost:5432/test' },
}));
jest.mock('../participantService', () => ({ signParticipantJwt: () => 'jwt' }));
jest.mock('../freeAccountRegistration', () => ({
  normalizeIdentity: (i: { full_name: string; email: string }) => ({
    full_name: i.full_name.trim(), email: i.email.trim().toLowerCase(),
  }),
  resolveFreeAccount: async () => ({
    enrollment: {
      id: 'enr-1',
      full_name: 'Dana Reyes',
      email: 'dana@example.com',
      enrollment_type: 'member',
      tier: 'guest',
      update: jest.fn(),
    },
    disposition: 'created',
  }),
}));
jest.mock('../../modules/tenancy/tenantResolver', () => ({
  resolveContextBySourceSlug: (...a: unknown[]) => resolveContextBySourceSlug(...a),
}));
jest.mock('../../modules/tenancy/leadContextService', () => ({
  ensureLeadTenantContext: (...a: unknown[]) => ensureLeadTenantContext(...a),
}));
jest.mock('../consent/captureSignupConsent', () => ({
  captureSignupConsent: (...a: unknown[]) => captureSignupConsent(...a),
  SIGNUP_CONSENT_TEXT: 'CONSENT TEXT UNDER TEST',
}));
jest.mock('../welcome/sendPortalWelcome', () => ({
  sendPortalWelcome: (...a: unknown[]) => sendPortalWelcome(...a),
}));
jest.mock('../reese/reeseWelcomeService', () => ({ maybeSendWelcomes: jest.fn() }), { virtual: true });
jest.mock('../explorerGrowth/explorerProfileAtRegistration', () => ({
  bridgeExplorerProfileAtRegistration: jest.fn(),
}));
jest.mock('../ghlService', () => ({ syncNewLeadToGhl: jest.fn(async () => undefined) }));

import { createFreeAccount } from '../freeSignupService';

/**
 * Consent and the brand relationship at portal free-signup.
 *
 * ── WHY BOTH WRITES, AND WHY THE SECOND ONE IS THE POINT ────────────────────
 *
 * `consent_records` is the audit trail: what the person agreed to, in the words
 * shown. `lead_tenant_contexts` is the thing `brandPreferenceGate` actually READS
 * before a send. Production measured 23 relationship rows against 24,915 leads,
 * which is why the gate answered `no_relationship` and cancelled 43,223 sends.
 * A consent record with no relationship row is an agreement nobody can act on.
 *
 * ── THE CASE THIS SUITE EXISTS FOR ──────────────────────────────────────────
 *
 * `growthJourney/journeyDefaults.ts` states the doctrine: when nothing resolves the
 * answer is no programme, "not 'the first brand', not 'Colaberry Training'". So an
 * UNRESOLVED slug must write no relationship and no `source_id`. Defaulting there
 * would attribute a person to a business they never touched and then let mail be
 * sent to them on the strength of it. That is the assertion that matters most here;
 * the happy path is the easy half.
 */

const BASE = { full_name: 'Dana Reyes', email: 'Dana@Example.com ', programme: 'learner' as const };
const CONTEXT = {
  tenantId: 'ten-colaberry', tenantSlug: 'colaberry',
  brandId: 'brand-training', brandSlug: 'colaberry-training',
  sourceId: 'src-training-uuid',
};

/** The object handed to `Lead.findOrCreate`, i.e. what would actually be written. */
function leadDefaults(): Record<string, unknown> {
  return (findOrCreate.mock.calls[0][0] as { defaults: Record<string, unknown> }).defaults;
}

beforeEach(() => {
  findOrCreate.mockReset();
  resolveContextBySourceSlug.mockReset();
  ensureLeadTenantContext.mockReset();
  captureSignupConsent.mockReset();
  sendPortalWelcome.mockReset();

  findOrCreate.mockResolvedValue([{ id: 42 }, true]);
  resolveContextBySourceSlug.mockResolvedValue(CONTEXT);
  ensureLeadTenantContext.mockResolvedValue({ created: true, updated: false });
  captureSignupConsent.mockResolvedValue(true);
  sendPortalWelcome.mockResolvedValue({ sent: true, skipped: false, reason: null, messageId: 'm1' });
});

describe('consent was given', () => {
  it('writes the real consent to the lead instead of the column default', async () => {
    await createFreeAccount({ ...BASE, marketingOptIn: true, sourceSlug: 'training' });
    expect(leadDefaults().consent_contact).toBe(true);
  });

  it('resolves the slug and persists the source_id, so the brand is derivable', async () => {
    await createFreeAccount({ ...BASE, marketingOptIn: true, sourceSlug: 'training' });

    expect(resolveContextBySourceSlug).toHaveBeenCalledWith('training');
    expect(leadDefaults().source_id).toBe('src-training-uuid');
  });

  it('records the consent with the wording that was shown', async () => {
    await createFreeAccount({
      ...BASE, marketingOptIn: true, sourceSlug: 'training',
      requestMeta: { ipAddress: '203.0.113.9', userAgent: 'UA/1' },
    });

    expect(captureSignupConsent.mock.calls[0][0]).toMatchObject({
      email: 'dana@example.com',
      marketingOptIn: true,
      source: 'free_signup',
      consentText: 'CONSENT TEXT UNDER TEST',
      ipAddress: '203.0.113.9',
      userAgent: 'UA/1',
    });
  });

  it('creates the brand relationship the SEND GATE reads, with consent true', async () => {
    await createFreeAccount({ ...BASE, marketingOptIn: true, sourceSlug: 'training' });

    expect(ensureLeadTenantContext).toHaveBeenCalledTimes(1);
    expect(ensureLeadTenantContext.mock.calls[0][0]).toMatchObject({
      leadId: 42,
      tenantId: 'ten-colaberry',
      brandId: 'brand-training',
      relationshipType: 'learner',
      consentContact: true,
      consentSource: 'free_signup',
      attribution: { sourceId: 'src-training-uuid' },
    });
  });
});

describe('consent was NOT given', () => {
  it('still creates the account and still sends the sign-in link', async () => {
    const r = await createFreeAccount({ ...BASE, sourceSlug: 'training' });

    expect(r.created).toBe(true);
    // The login link is transactional and owes nothing to marketing consent.
    expect(sendPortalWelcome).toHaveBeenCalledTimes(1);
  });

  it('records consent as FALSE rather than omitting the relationship', async () => {
    // The row must exist either way: the gate distinguishes `no_consent` from
    // `no_relationship`, and those lead to different actions. Absent is not false.
    await createFreeAccount({ ...BASE, sourceSlug: 'training' });

    expect(ensureLeadTenantContext.mock.calls[0][0]).toMatchObject({ consentContact: false });
    expect(leadDefaults().consent_contact).toBe(false);
  });

  it('still calls the consent recorder, which itself writes nothing on a false', async () => {
    // Deliberately not short-circuited here: `captureSignupConsent` owns the one
    // `isAffirmative` gate, and duplicating that decision is how two places start
    // disagreeing about what consent is.
    await createFreeAccount({ ...BASE, sourceSlug: 'training' });
    expect(captureSignupConsent.mock.calls[0][0]).toMatchObject({ marketingOptIn: undefined });
  });

  it('treats a non-true value as no consent', async () => {
    await createFreeAccount({
      ...BASE, sourceSlug: 'training',
      marketingOptIn: 'yes' as unknown as boolean,
    });
    expect(leadDefaults().consent_contact).toBe(false);
  });
});

describe('the slug does not resolve, which is the doctrine case', () => {
  it('writes NO brand relationship rather than defaulting to a brand', async () => {
    resolveContextBySourceSlug.mockResolvedValue(null);

    await createFreeAccount({ ...BASE, marketingOptIn: true, sourceSlug: 'unknown-slug' });

    expect(ensureLeadTenantContext).not.toHaveBeenCalled();
  });

  it('leaves source_id NULL rather than inventing attribution', async () => {
    resolveContextBySourceSlug.mockResolvedValue(null);

    await createFreeAccount({ ...BASE, marketingOptIn: true, sourceSlug: 'unknown-slug' });

    expect(leadDefaults().source_id).toBeNull();
  });

  it('still records the consent, because the agreement happened regardless', async () => {
    resolveContextBySourceSlug.mockResolvedValue(null);

    await createFreeAccount({ ...BASE, marketingOptIn: true, sourceSlug: 'unknown-slug' });

    expect(captureSignupConsent).toHaveBeenCalledTimes(1);
  });

  it('survives a resolver that throws, without failing the signup', async () => {
    resolveContextBySourceSlug.mockRejectedValue(new Error('resolver down'));

    const r = await createFreeAccount({ ...BASE, marketingOptIn: true, sourceSlug: 'training' });

    expect(r.created).toBe(true);
    expect(ensureLeadTenantContext).not.toHaveBeenCalled();
  });

  it('survives a relationship write that throws', async () => {
    ensureLeadTenantContext.mockRejectedValue(new Error('db down'));

    const r = await createFreeAccount({ ...BASE, marketingOptIn: true, sourceSlug: 'training' });

    expect(r.created).toBe(true);
  });
});

describe('no slug supplied, which is the other four callers', () => {
  it('resolves nothing, so an org invite is never stamped with a brand', async () => {
    await createFreeAccount({ ...BASE, programme: 'standard', marketingOptIn: true });

    expect(resolveContextBySourceSlug).not.toHaveBeenCalled();
    expect(ensureLeadTenantContext).not.toHaveBeenCalled();
    expect(leadDefaults().source_id).toBeNull();
  });

  it('a caller-supplied source_id still wins over the resolver', async () => {
    const explicit = '11111111-2222-3333-4444-555555555555';
    await createFreeAccount({
      ...BASE, marketingOptIn: true, sourceSlug: 'training',
      acquisition: { source_id: explicit },
    });

    expect(leadDefaults().source_id).toBe(explicit);
  });
});
