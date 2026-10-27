// The parameter is DECLARED, not decorative. `jest.fn(async () => ...)` has an empty call
// tuple, so reading `mock.calls[0][0]` is `TS2493: Tuple type '[]' of length '0' has no element
// at index '0'` — which ts-jest happily transpiles past (isolatedModules does not typecheck) and
// `scripts/checkTestTypecheck.js` then catches in CI. Caught here exactly that way.
const mockSeedAgentIdentity = jest.fn(async (_config: SeedConfig) => ({
  adminUserId: 'au-1',
  enrollmentId: 'en-1',
  communityMemberId: 'cm-1',
  aiAgentId: 'ag-1',
}));
const mockFindByPk = jest.fn();

jest.mock('../agentBlueprint/agentIdentitySeed', () => ({
  seedAgentIdentity: (config: SeedConfig) => mockSeedAgentIdentity(config),
  getAgentEnrollmentId: jest.fn(),
  getAgentAdminUserId: jest.fn(),
  getAgentId: jest.fn(),
  __resetAgentIdentityCacheForTests: jest.fn(),
}));
jest.mock('../../models/AiAgent', () => ({ findByPk: (...a: unknown[]) => mockFindByPk(...(a as [])) }));

import { ORG_MEMBER } from '../agentBlueprint/ticketCreatorIdentitySeed';
import { seedMayaIdentity, MAYA_EMAIL, MAYA_AGENT_NAME, MAYA_DISPLAY_NAME } from '../mayaIdentitySeed';

/**
 * Maya's identity seed.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * PR #3399 registered Maya with no identity. Verified in production on 2026-10-27: Reese and
 * Dara each have a linked AdminUser and a reports_to that resolves to a real human; Maya had
 * `NO_ADMINUSER` and both reports_to columns null, which is why her dashboard rendered empty.
 *
 * ── WHAT THIS SUITE DELIBERATELY DOES NOT TEST ──────────────────────────────
 *
 * The identity LINKAGE itself (Enrollment -> CommunityMember -> AdminUser, the reports_to
 * self-heal). That lives in the generic `agentBlueprint/agentIdentitySeed.ts` and is shared
 * verbatim with Reese, Dara and the ten domain agents. Re-testing it here would be testing
 * someone else's module through a thin wrapper. What IS Maya-specific, and therefore what is
 * tested, is the CONFIG this wrapper hands it — every field of which is a real decision that
 * can be wrong.
 */

type SeedConfig = {
  agentName: string;
  email: string;
  displayName: string;
  role?: string;
  communityRole?: string;
  enrollmentDefaults: Record<string, unknown>;
  pilotCohortGate?: boolean;
  reportsToOrgMemberId?: string;
  reportsToAgentName?: string;
};

function configPassed(): SeedConfig {
  return mockSeedAgentIdentity.mock.calls[0][0];
}

beforeEach(() => {
  mockSeedAgentIdentity.mockClear();
  mockFindByPk.mockReset();
  mockFindByPk.mockResolvedValue({ record_kind: null, update: jest.fn() });
});

describe('the instrument itself', () => {
  it('actually drives the generic seeder, so the assertions below are not vacuous', async () => {
    await seedMayaIdentity();
    expect(mockSeedAgentIdentity).toHaveBeenCalledTimes(1);
  });
});

describe('happy path: the config Maya hands the generic seeder', () => {
  it('identifies her by the three name/email fields the seeder keys on', async () => {
    await seedMayaIdentity();
    expect(configPassed()).toMatchObject({
      agentName: 'Maya',
      email: 'maya@colaberry.com',
      displayName: 'Maya',
    });
  });

  it('exports those same constants, since email IS the idempotency key downstream', async () => {
    // Enrollment and AdminUser are both findOrCreate'd on `email`. A typo here does not fail —
    // it silently seeds a SECOND identity on the next boot, which is the expensive failure.
    expect(MAYA_EMAIL).toBe('maya@colaberry.com');
    expect(MAYA_AGENT_NAME).toBe('Maya');
    expect(MAYA_DISPLAY_NAME).toBe('Maya');
  });

  it('carries the same honest enrollment placeholders Reese and Dara use', async () => {
    await seedMayaIdentity();
    expect(configPassed().enrollmentDefaults).toEqual({
      company: 'Colaberry',
      payment_status: 'paid',
      payment_method: 'invoice',
      payment_mode: 'live',
      enrollment_type: 'standard',
      portal_enabled: false,
    });
  });
});

describe('boundary: the two fields where Maya follows Dara and NOT Reese', () => {
  it("is communityRole 'staff', because she has no student surface", async () => {
    // Reese is 'mentor' — he has a real student DM surface. Maya's surface is prospective
    // members on the public site, which is not a student surface. Getting this wrong puts her
    // in the People panel as a mentor to students she has never met.
    await seedMayaIdentity();
    expect(configPassed().communityRole).toBe('staff');
    expect(configPassed().communityRole).not.toBe('mentor');
  });

  it('leaves the pilot-cohort gate off, because nothing here is proactive', async () => {
    await seedMayaIdentity();
    expect(configPassed().pilotCohortGate).toBe(false);
  });
});

describe('reports_to: exactly one, resolving to a real human on the first hop', () => {
  it('passes the org-member form and NEVER both forms', async () => {
    // `seedAgentIdentity()` throws "must provide exactly one of reportsToOrgMemberId or
    // reportsToAgentName" before writing anything. Passing both or neither is a boot-time
    // failure, caught here instead.
    await seedMayaIdentity();
    const cfg = configPassed();
    // TAIWO, assigned by Ali on 2026-10-27, and the same owner `AdmissionsConversionArchitect`
    // already reports to in production. Pinned to the named constant rather than the UUID so a
    // change of owner is a one-line edit here and nowhere else; pinned at all because this is
    // an assignment decision, which no test can derive and a refactor must not quietly move.
    expect(cfg.reportsToOrgMemberId).toBe(ORG_MEMBER.TAIWO);
    expect(cfg.reportsToOrgMemberId).not.toBe(ORG_MEMBER.ALI);
    expect(cfg.reportsToAgentName).toBeUndefined();
    expect(Boolean(cfg.reportsToOrgMemberId) !== Boolean(cfg.reportsToAgentName)).toBe(true);
  });

  it('reports to a human directly, not through another agent', async () => {
    // Reese routes through a DISABLED `workforce_intelligence_engine`, which is his own
    // documented gap. `resolveReportsToHuman()` fails CLOSED (returns null) on a broken chain,
    // so a shorter chain is a correctness property, not a style preference.
    await seedMayaIdentity();
    expect(configPassed().reportsToAgentName).toBeUndefined();
  });
});

describe('post-seed self-heal of record_kind and department', () => {
  it('sets both when both are null, in ONE update so a boot cannot land half of them', async () => {
    const update = jest.fn();
    mockFindByPk.mockResolvedValue({ record_kind: null, department: null, update });

    await seedMayaIdentity();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ record_kind: 'employee', department: 'admissions' });
  });

  it('heals ONLY the null one when the other is already set', async () => {
    const update = jest.fn();
    mockFindByPk.mockResolvedValue({ record_kind: 'behavior', department: null, update });

    await seedMayaIdentity();

    // The payload must not carry record_kind at all — not even the same value. An
    // unconditional write would relabel a row a human or another migration classified.
    expect(update).toHaveBeenCalledWith({ department: 'admissions' });
  });

  it('IDEMPOTENCY: writes nothing at all when both are already set', async () => {
    const update = jest.fn();
    mockFindByPk.mockResolvedValue({ record_kind: 'employee', department: 'admissions', update });

    await seedMayaIdentity();

    // This seed runs on EVERY boot, so the steady state has to be zero writes.
    expect(update).not.toHaveBeenCalled();
  });

  it('IDEMPOTENCY: a second run writes nothing further once the first healed', async () => {
    const update = jest.fn();
    mockFindByPk
      .mockResolvedValueOnce({ record_kind: null, department: null, update })
      .mockResolvedValueOnce({ record_kind: 'employee', department: 'admissions', update });

    await seedMayaIdentity();
    await seedMayaIdentity();

    expect(update).toHaveBeenCalledTimes(1);
  });

  it("department is 'admissions', a value production already uses", async () => {
    // Not invented: 14 agents carry exactly this department today. A fabricated value would
    // render as a real-looking department that means nothing.
    const update = jest.fn();
    mockFindByPk.mockResolvedValue({ record_kind: 'employee', department: null, update });

    await seedMayaIdentity();

    expect((update.mock.calls[0][0] as { department: string }).department).toBe('admissions');
  });
});

describe('failure path', () => {
  it('does not throw when the AiAgent row cannot be re-read after seeding', async () => {
    mockFindByPk.mockResolvedValue(null);
    await expect(seedMayaIdentity()).resolves.toMatchObject({ aiAgentId: 'ag-1' });
  });

  it('returns the generic seeder ids unchanged, so callers get the real identity', async () => {
    await expect(seedMayaIdentity()).resolves.toEqual({
      adminUserId: 'au-1',
      enrollmentId: 'en-1',
      communityMemberId: 'cm-1',
      aiAgentId: 'ag-1',
    });
  });
});

describe('governance: seeding an identity must not enable her', () => {
  it('writes nothing to `enabled`, on any path', async () => {
    const update = jest.fn();
    mockFindByPk.mockResolvedValue({ record_kind: null, update });

    await seedMayaIdentity();

    // Three of her ten tools reach a real stranger (document email, SMS, Synthflow voice call),
    // so build-platform-agent/SKILL.md's governance checklist puts flipping `enabled` behind
    // Ali's explicit sign-off. Giving her an identity is not that sign-off.
    for (const call of update.mock.calls) {
      expect(Object.keys(call[0] as object)).not.toContain('enabled');
    }
    const cfg = configPassed() as unknown as Record<string, unknown>;
    expect(Object.keys(cfg)).not.toContain('enabled');
  });
});
