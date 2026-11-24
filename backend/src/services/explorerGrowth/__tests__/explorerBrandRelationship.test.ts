import fs from 'fs';
import path from 'path';

/**
 * T206 - the Explorer BRAND RELATIONSHIP, written at registration.
 *
 * THE DEFECT, MEASURED ON PRODUCTION rather than inferred. On 2026-11-24 there were
 * 1,247 `explorer_journey_profiles` and 26 of them had no `lead_tenant_contexts` row.
 * Every one of the 26 was created on 2026-11-23 or 2026-11-24, which is to say: every
 * Explorer who registered after the one-off backfill, and none who registered before
 * it. 25 arrived through the `open_house` door and 1 through `ccpp_winback`, and all 26
 * had a `lead_id`, so the row was simply never written. The backfill fixed history and
 * left the door alone.
 *
 * WHAT THESE TESTS DRIVE. `leadContextService` and `explorerIdentity` are mocked, which
 * makes the writer's CONTRACT observable: which ids it writes, and with what consent.
 * The models are mocked too, so the second describe can drive the REAL bridge and the
 * REAL relationship module together and prove the wiring on the executed path rather
 * than asserting that a mock of the writer was called.
 */

const profileFindByPk = jest.fn();
const profileCreate = jest.fn();
const profileUpdate = jest.fn();
const enrollmentFindByPk = jest.fn();
const leadFindOne = jest.fn();

jest.mock('../../../models', () => ({
  Enrollment: { findByPk: (...a: unknown[]) => enrollmentFindByPk(...a) },
  Lead: {
    findOne: (...a: unknown[]) => leadFindOne(...a),
    // `findLeadByEmail` matches on `lower(email)` through Sequelize's own helpers, so the
    // mock must carry them or the real bridge throws a TypeError that its own catch
    // swallows, surfacing as "the write was never attempted" with nothing logged.
    sequelize: {
      where: (...a: unknown[]) => ({ where: a }),
      fn: (...a: unknown[]) => ({ fn: a }),
      col: (...a: unknown[]) => ({ col: a }),
    },
  },
  ExplorerJourneyProfile: {
    findByPk: (...a: unknown[]) => profileFindByPk(...a),
    create: (...a: unknown[]) => profileCreate(...a),
  },
  CommunityMember: {},
}));

const resolveExplorerBrandContext = jest.fn();
jest.mock('../../explorerIdentity', () => ({
  resolveExplorerBrandContext: (...a: unknown[]) => resolveExplorerBrandContext(...a),
}));

const ensureLeadTenantContext = jest.fn();
jest.mock('../../../modules/tenancy/leadContextService', () => ({
  ensureLeadTenantContext: (...a: unknown[]) => ensureLeadTenantContext(...a),
}));

import { ensureExplorerBrandRelationship } from '../explorerBrandRelationship';
import { bridgeExplorerProfileAtRegistration } from '../explorerProfileAtRegistration';

const BRAND = { tenantId: 'ten-colaberry', brandId: 'brand-training' };

describe('T206 - the writer records the relationship, and records it under the right tenant', () => {
  beforeEach(() => {
    // Implementations are set AFTER clearing, never in the factory above.
    // `clearAllMocks` removes implementations as well as calls, so a
    // `mockResolvedValue` declared once in a factory survives exactly one test
    // and then returns undefined, which fails as "cannot read properties of
    // undefined" several lines away from the cause.
    jest.clearAllMocks();
    resolveExplorerBrandContext.mockResolvedValue(BRAND);
    ensureLeadTenantContext.mockResolvedValue({ created: true, updated: false });
  });

  it('writes the row and reports it created', async () => {
    await expect(ensureExplorerBrandRelationship(77, 'enroll_explorer')).resolves.toBe('created');
    expect(ensureLeadTenantContext).toHaveBeenCalledTimes(1);
  });

  it('carries the tenant AND brand id from the SAME resolution', async () => {
    await ensureExplorerBrandRelationship(77, 'enroll_explorer');

    // The pair is the point. A row keyed on the right brand under the wrong tenant
    // is the failure mode `resolveExplorerBrandContext` exists to make impossible,
    // and it would be invisible to a test that only checked the brand.
    expect(ensureLeadTenantContext).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 77,
        tenantId: 'ten-colaberry',
        brandId: 'brand-training',
        relationshipType: 'learner',
      }),
    );
  });

  /**
   * THE LOAD-BEARING SAFETY TEST.
   *
   * `brandPreferenceGate` blocks a `consent_contact: false` row as `no_consent`
   * exactly as it blocks a missing row as `no_relationship`. So consent false is
   * what makes this write send-neutral rather than merely cautious: it cannot move
   * anybody from blocked to allowed. If a later edit ever passes a real consent
   * value through here, this goes red, which is the only thing standing between a
   * bookkeeping fix and 1,200 people becoming contactable.
   */
  it('NEVER grants consent, and names no consent source', async () => {
    await ensureExplorerBrandRelationship(77, 'enroll_explorer');

    const [payload] = ensureLeadTenantContext.mock.calls[0];
    expect(payload.consentContact).toBe(false);
    expect(payload.consentSource).toBeNull();
  });

  it('reports an existing row as existed, not created, so a re-run is visible as a no-op', async () => {
    ensureLeadTenantContext.mockResolvedValue({ created: false, updated: false });

    await expect(ensureExplorerBrandRelationship(77, 'enroll_explorer')).resolves.toBe('existed');
  });

  it('writes NOTHING when Explorer’s brand cannot be resolved, and says so', async () => {
    resolveExplorerBrandContext.mockResolvedValue(null);

    await expect(ensureExplorerBrandRelationship(77, 'enroll_explorer'))
      .resolves.toBe('skipped_unresolved_brand');
    // Not merely "returned a label": nothing may be inserted under a guessed tenant.
    expect(ensureLeadTenantContext).not.toHaveBeenCalled();
  });
});

describe('T206 - a relationship failure never fails a registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveExplorerBrandContext.mockResolvedValue(BRAND);
  });

  it('resolves to failed instead of throwing when the write throws', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    ensureLeadTenantContext.mockRejectedValue(new Error('db down'));

    // Not `.rejects`. The point is that it RESOLVES: a signup must survive this.
    await expect(ensureExplorerBrandRelationship(77, 'enroll_explorer')).resolves.toBe('failed');

    spy.mockRestore();
  });

  it('logs by error CLASS, with the lead id and no address anywhere in the line', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    ensureLeadTenantContext.mockRejectedValue(new TypeError('boom'));

    await ensureExplorerBrandRelationship(77, 'enroll_explorer');

    expect(spy).toHaveBeenCalledTimes(1);
    const [, payload] = spy.mock.calls[0];
    expect(payload).toMatchObject({ error_class: 'TypeError', lead_id: 77, entry_point: 'enroll_explorer' });
    // The PII bar: an id is not PII, an email is. No `@` in any logged payload.
    expect(JSON.stringify(spy.mock.calls[0])).not.toContain('@');

    spy.mockRestore();
  });
});

describe('T206 - the registration bridge actually reaches it', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveExplorerBrandContext.mockResolvedValue(BRAND);
    ensureLeadTenantContext.mockResolvedValue({ created: true, updated: false });
    enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'Maya@Example.com ' });
    leadFindOne.mockResolvedValue({ id: 77 });
    profileFindByPk.mockResolvedValue(null);
    profileCreate.mockResolvedValue({});
    profileUpdate.mockResolvedValue({});
  });

  it('writes the relationship for the lead the bridge resolved, on the real path', async () => {
    // The REAL bridge and the REAL relationship module. Only the models, the brand
    // resolver and the context writer are mocked, so this fails if the wiring is
    // removed, if the wrong id is passed, or if the call is made conditional on
    // something that is false in production.
    await expect(bridgeExplorerProfileAtRegistration('enr-1', 'enroll_explorer')).resolves.toBe(true);

    expect(ensureLeadTenantContext).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 77, tenantId: 'ten-colaberry', brandId: 'brand-training' }),
    );
  });

  it.each([
    ['no lead matches the address', () => leadFindOne.mockResolvedValue(null)],
    ['the enrollment has no address at all', () => enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: '' })],
  ])('writes NO relationship when %s, because there is no lead to key it on', async (_label, arrange) => {
    arrange();

    await bridgeExplorerProfileAtRegistration('enr-1', 'enroll_explorer');

    // `lead_tenant_contexts` is keyed on the lead. A row without one is unkeyed, and
    // the synthetic daily smoke-test Explorer arrives here by exactly this route.
    expect(ensureLeadTenantContext).not.toHaveBeenCalled();
  });

  it('still reports the registration bridged when the relationship write fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    ensureLeadTenantContext.mockRejectedValue(new Error('db down'));

    // The profile is what `resolved` reports. A bookkeeping failure must not change it,
    // or a relationship outage would start looking like a registration outage.
    await expect(bridgeExplorerProfileAtRegistration('enr-1', 'enroll_explorer')).resolves.toBe(true);

    spy.mockRestore();
  });
});

describe('T206 - the writer is on the registration path, so it is held to the no-send bar', () => {
  /**
   * A SOURCE-TEXT SCAN, declared as such. The behavioural no-send guarantee for this
   * path lives in `explorerProfileAtRegistration.test.ts`, where the real bridge runs
   * with the senders spied. This adds the one thing that suite cannot give: the new
   * file is now ON that path, so it must be unable to acquire a sender later.
   *
   * Comments are stripped before scanning. This module's header explains, truthfully,
   * why the write is send-neutral, and a scan that reads prose would find the word
   * "send" in that explanation and fail while the code was clean.
   */
  const stripComments = (src: string): string =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // `[^\r\n]*` rather than `.*`: JS `.` does not match a carriage return and these
      // files are checked out CRLF here, so `.*` strips nothing and the guard reads
      // green while scanning the prose it was meant to remove.
      .replace(/\/\/[^\r\n]*/g, ' ');

  it('the comment stripper strips prose and keeps code', () => {
    const sample = "const a = 1; // nodemailer here\n/* nodemailer here too */\nconst b = 2;";
    const out = stripComments(sample);
    expect(out).not.toContain('nodemailer');
    expect(out).toContain('const a = 1;');
    expect(out).toContain('const b = 2;');
  });

  it('contains no sender token in its CODE', () => {
    const src = stripComments(
      fs.readFileSync(path.join(__dirname, '..', 'explorerBrandRelationship.ts'), 'utf8'),
    );

    for (const forbidden of ['mandrill', 'axios', 'nodemailer', 'twilio', 'sendMail', 'sendEmail', 'fetch(']) {
      expect(src.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // POSITIVE CONTROL: the stripped source still holds a token it must hold, so a path
    // typo or an over-eager stripper cannot make this pass against empty text.
    expect(src).toContain('ensureLeadTenantContext');
  });
});
