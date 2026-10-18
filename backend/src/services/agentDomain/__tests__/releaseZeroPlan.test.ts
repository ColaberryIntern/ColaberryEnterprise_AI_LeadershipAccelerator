/**
 * AF3.1 — Release Zero derives ten agents, and none of them may be alive.
 *
 * ## What is actually being protected
 *
 * R0 creates a real staff identity in production: four rows, a real `AdminUser` with the same
 * model human staff use. The ticket is blunt about the risk - "an agent created enabled, or with
 * tools granted, or above observe, is a live actor nobody approved."
 *
 * So the invariants are tested on the OUTPUT of the derivation rather than on the constants that
 * feed it. A test that reads `RELEASE_ZERO.enabled` proves the constant is false; a test that
 * reads `deriveDomainAgent(k).registryEntry.enabled` proves what would actually be written, and
 * catches a derivation that overrides the constant on its way past.
 *
 * `assertReleaseZeroSafe` exists for the same reason and is tested here against deliberately
 * corrupted plans - a guard nobody has watched fail is not a guard.
 */
const plan = require('../../../../../scripts/agentFactory/releaseZeroPlan.js');

const { DOMAIN_PROFILES, deriveDomainAgent, assertReleaseZeroSafe } = plan;
const KEYS: string[] = Object.keys(DOMAIN_PROFILES);

describe('AF3.1 Release Zero covers the ten domains', () => {
  it('knows exactly ten domains', () => {
    expect(KEYS).toHaveLength(10);
  });

  it('matches the domain keys the registry provisioned', () => {
    // If these drift, an intern's domain silently has no agent plan and R0 skips them.
    expect([...KEYS].sort()).toEqual([
      'admissions', 'curriculum', 'executive', 'internship', 'learner_success',
      'marketing', 'platform', 'product_experience', 'sales', 'website',
    ]);
  });

  it('derives a distinct agent name and email per domain', () => {
    const names = KEYS.map((k) => deriveDomainAgent(k).registryEntry.agent_name);
    const emails = KEYS.map((k) => deriveDomainAgent(k).config.email);
    expect(new Set(names).size).toBe(KEYS.length);
    expect(new Set(emails).size).toBe(KEYS.length);
  });

  it('keys the email on the DOMAIN, not the display name', () => {
    // The email is the idempotency key everything downstream resolves on. A display name is the
    // sort of thing somebody renames, and a renamed idempotency key creates a second identity.
    expect(deriveDomainAgent('product_experience').config.email)
      .toBe('product-experience-agent@colaberry.com');
  });

  it('refuses an unknown domain instead of inventing one', () => {
    expect(() => deriveDomainAgent('not_a_domain')).toThrow(/Unknown domain/);
  });
});

describe('AF3.1 no derived agent is alive', () => {
  it.each(KEYS)('%s is created disabled, observe-only, with no tools', (key) => {
    const r = deriveDomainAgent(key).registryEntry;
    expect(r.enabled).toBe(false);
    expect(r.autonomy_level).toBe('observe');
    expect(r.tools_granted).toEqual([]);
    expect(r.reports_to_id).toBeNull();
  });

  it.each(KEYS)('%s passes the Release Zero assertion', (key) => {
    expect(assertReleaseZeroSafe(deriveDomainAgent(key))).toBe(true);
  });
});

describe('AF3.1 the guard actually fires', () => {
  // A guard nobody has watched fail is not a guard. Each of these is the specific mistake the
  // ticket names as the way R0 turns into a live actor nobody approved.
  const corrupt = (key: string, patch: Record<string, unknown>) => {
    const p = deriveDomainAgent(key);
    Object.assign(p.registryEntry, patch);
    return p;
  };

  it('refuses an agent created ENABLED', () => {
    expect(() => assertReleaseZeroSafe(corrupt('marketing', { enabled: true })))
      .toThrow(/enabled must be false/);
  });

  it('refuses an autonomy level above observe', () => {
    expect(() => assertReleaseZeroSafe(corrupt('marketing', { autonomy_level: 'act' })))
      .toThrow(/autonomy_level must be "observe"/);
  });

  it('refuses any granted tool', () => {
    expect(() => assertReleaseZeroSafe(corrupt('marketing', { tools_granted: ['send_email'] })))
      .toThrow(/tools_granted must be empty/);
  });

  it('refuses a reporting line, which is AF4.3 and not R0', () => {
    expect(() => assertReleaseZeroSafe(corrupt('marketing', { reports_to_id: 'someone' })))
      .toThrow(/sets no reporting line/);
  });

  it('names EVERY violation at once, not just the first', () => {
    // Fixing one and re-running to discover the next is how the third one ships.
    try {
      assertReleaseZeroSafe(corrupt('marketing', {
        enabled: true, autonomy_level: 'act', tools_granted: ['x'], reports_to_id: 'y',
      }));
      throw new Error('expected the assertion to throw');
    } catch (e: any) {
      expect(e.message).toMatch(/enabled must be false/);
      expect(e.message).toMatch(/autonomy_level must be "observe"/);
      expect(e.message).toMatch(/tools_granted must be empty/);
      expect(e.message).toMatch(/sets no reporting line/);
    }
  });
});
