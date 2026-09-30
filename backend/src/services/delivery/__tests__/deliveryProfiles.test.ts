/**
 * Gate 13 — Delivery Profiles (Government / Regulated).
 *
 * Two properties carry this gate: **a profile never claims compliance**, and **a baseline
 * requirement can be waived but never silently dropped**. Both are asserted against the
 * actual tables and resolution output rather than trusted from a comment.
 */

import {
  COMPLIANCE_DISCLAIMER,
  DELIVERY_PROFILES,
  DELIVERY_PROFILE_KEYS,
  GOVERNMENT_BASELINE_CATEGORIES,
  PROFILE_COMPLIANCE_CLAIM,
  PROFILE_INJECTIONS,
  assertNoComplianceClaim,
  isDeliveryProfileKey,
} from '../../../modules/delivery/deliveryProfiles';
import {
  resolveProfile,
  specializationEvidenceFor,
  type ContractRequirement,
} from '../profileResolution';

const GOV = 'government_public_sector';

// ---------------------------------------------------------------------------
// Profile definitions
// ---------------------------------------------------------------------------

describe('delivery profiles', () => {
  it('declares the master plan’s three initial profiles', () => {
    expect([...DELIVERY_PROFILE_KEYS].sort()).toEqual([
      'commercial_standard',
      'government_public_sector',
      'internal_tool',
    ]);
  });

  it('declares the seven things a profile injects', () => {
    expect(PROFILE_INJECTIONS).toHaveLength(7);
  });

  it('the government profile carries all twelve baseline categories', () => {
    expect(GOVERNMENT_BASELINE_CATEGORIES).toHaveLength(12);
    for (const category of GOVERNMENT_BASELINE_CATEGORIES) {
      expect(DELIVERY_PROFILES[GOV].requirementCategories).toContain(category);
    }
  });

  it('every profile is versioned and states its intent', () => {
    for (const key of DELIVERY_PROFILE_KEYS) {
      const p = DELIVERY_PROFILES[key];
      expect(p.version).toBeGreaterThanOrEqual(1);
      expect(p.intent.length).toBeGreaterThan(20);
    }
  });

  it('the internal-tool profile is lighter but NOT empty', () => {
    // "Internal" lowers the ceremony, not the floor — an internal tool that mishandles
    // staff data is still a breach.
    const internal = DELIVERY_PROFILES.internal_tool;
    expect(internal.requirementCategories.length).toBeGreaterThan(0);
    expect(internal.requirementCategories).toContain('security');
    expect(internal.requirementCategories.length).toBeLessThan(
      DELIVERY_PROFILES[GOV].requirementCategories.length,
    );
  });

  it('every profile protects at least one category from silent removal', () => {
    for (const key of DELIVERY_PROFILE_KEYS) {
      expect(DELIVERY_PROFILES[key].nonWaivableWithoutRecord.length).toBeGreaterThan(0);
    }
  });

  it('rejects an unknown profile key', () => {
    expect(isDeliveryProfileKey('defense_classified')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The compliance claim guard
// ---------------------------------------------------------------------------

describe('compliance claims', () => {
  it('a profile’s only legal compliance claim is none', () => {
    expect(PROFILE_COMPLIANCE_CLAIM).toBe('none');
    expect(COMPLIANCE_DISCLAIMER).toMatch(/not a certification/i);
  });

  it('refuses conformance claims against named standards', () => {
    for (const text of [
      'This delivery is FedRAMP compliant.',
      'Our platform is Section 508 compliant.',
      'The system meets NIST 800-53.',
      'SOC 2 certified delivery process.',
    ]) {
      expect(assertNoComplianceClaim(text).length).toBeGreaterThan(0);
    }
  });

  it('refuses a universal compliance claim', () => {
    expect(assertNoComplianceClaim('Our profiles are fully compliant.').length).toBeGreaterThan(0);
  });

  it('permits accurate description of what we examine', () => {
    // The negative control. A guard that flagged every mention of a standard would make it
    // impossible to write an honest scope statement, and would be routed around.
    const honest =
      'The government profile examines accessibility, security and records retention. ' +
      'It does not certify conformance, and WCAG determinations are made by assessors.';
    expect(assertNoComplianceClaim(honest)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Resolution: pinning
// ---------------------------------------------------------------------------

describe('profile resolution — pinning', () => {
  it('resolves a correctly pinned profile', () => {
    const result = resolveProfile({ profileKey: GOV, pinnedVersion: 1 });
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.profile.requirementCategories).toHaveLength(12);
      expect(result.profile.complianceClaim).toBe('none');
      expect(result.profile.disclaimer).toBe(COMPLIANCE_DISCLAIMER);
    }
  });

  it('REFUSES a version mismatch rather than quietly using the current baseline', () => {
    // Silently upgrading a pinned engagement is exactly the drift the pin prevents, and it
    // would be invisible because the result would look perfectly reasonable.
    const result = resolveProfile({ profileKey: GOV, pinnedVersion: 99 });
    expect(result.resolved).toBe(false);
    expect(result.issues.map((i) => i.rule)).toContain('profile_version_mismatch');
  });

  it('refuses an unknown profile', () => {
    const result = resolveProfile({ profileKey: 'made_up', pinnedVersion: 1 });
    expect(result.resolved).toBe(false);
    expect(result.issues.map((i) => i.rule)).toContain('unknown_profile');
  });
});

// ---------------------------------------------------------------------------
// Resolution: add, tighten, waive
// ---------------------------------------------------------------------------

describe('profile resolution — contract requirements', () => {
  const waiver = (over: Partial<ContractRequirement> = {}): ContractRequirement => ({
    operation: 'waive',
    category: 'accessibility',
    detail: 'Internal-facing admin console only',
    waiverReason: 'Console is used solely by three named staff with agency-issued devices.',
    waiverApprovedByIdentityId: 'lead-1',
    ...over,
  });

  it('adds a contract-specific category', () => {
    const result = resolveProfile({
      profileKey: GOV,
      pinnedVersion: 1,
      contractRequirements: [
        { operation: 'add', category: 'bilingual_content', detail: 'English and Spanish' },
      ],
    });
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.profile.requirementCategories).toContain('bilingual_content');
      expect(result.profile.contractAdditions).toHaveLength(1);
    }
  });

  it('keeps the whole baseline when a contract only adds', () => {
    const result = resolveProfile({
      profileKey: GOV,
      pinnedVersion: 1,
      contractRequirements: [{ operation: 'add', category: 'bilingual_content', detail: 'x' }],
    });
    if (result.resolved) {
      for (const c of GOVERNMENT_BASELINE_CATEGORIES) {
        expect(result.profile.requirementCategories).toContain(c);
      }
    } else {
      throw new Error('expected resolution');
    }
  });

  it('records a tighten, and flags one against a category the profile lacks', () => {
    const result = resolveProfile({
      profileKey: GOV,
      pinnedVersion: 1,
      contractRequirements: [
        { operation: 'tighten', category: 'security', detail: 'FIPS-validated crypto only' },
        { operation: 'tighten', category: 'uptime_sla', detail: '99.9%' },
      ],
    });
    expect(result.resolved).toBe(true);
    expect(result.issues.map((i) => i.rule)).toContain('tighten_of_absent_category');
  });

  it('REFUSES a waiver with no reason', () => {
    const result = resolveProfile({
      profileKey: GOV,
      pinnedVersion: 1,
      contractRequirements: [waiver({ waiverReason: 'n/a' })],
    });
    expect(result.resolved).toBe(false);
    expect(result.issues.map((i) => i.rule)).toContain('waiver_reason_required');
  });

  it('REFUSES a waiver with no named approver', () => {
    const result = resolveProfile({
      profileKey: GOV,
      pinnedVersion: 1,
      contractRequirements: [waiver({ waiverApprovedByIdentityId: null })],
    });
    expect(result.resolved).toBe(false);
    expect(result.issues.map((i) => i.rule)).toContain('waiver_approver_required');
  });

  it('allows a properly recorded waiver — and makes it LOUD', () => {
    // A public body can genuinely waive a requirement. What it cannot do is discover
    // afterwards that nobody recorded it.
    const result = resolveProfile({
      profileKey: GOV,
      pinnedVersion: 1,
      contractRequirements: [waiver()],
    });
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.profile.requirementCategories).not.toContain('accessibility');
      expect(result.profile.waivers).toEqual([
        {
          category: 'accessibility',
          reason: 'Console is used solely by three named staff with agency-issued devices.',
          approvedByIdentityId: 'lead-1',
        },
      ]);
    }
    expect(result.issues.map((i) => i.rule)).toContain('baseline_category_waived');
  });

  it('never drops a category without recording a waiver for it', () => {
    // The structural property: resolved categories plus waived categories always account
    // for the entire baseline.
    const result = resolveProfile({
      profileKey: GOV,
      pinnedVersion: 1,
      contractRequirements: [waiver(), waiver({ category: 'availability' })],
    });
    if (!result.resolved) throw new Error('expected resolution');

    const accounted = new Set([
      ...result.profile.requirementCategories,
      ...result.profile.waivers.map((w) => w.category),
    ]);
    for (const c of GOVERNMENT_BASELINE_CATEGORIES) {
      expect(accounted.has(c)).toBe(true);
    }
  });

  it('resolves cleanly with no contract requirements at all', () => {
    const result = resolveProfile({ profileKey: 'commercial_standard', pinnedVersion: 1 });
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.profile.waivers).toEqual([]);
      expect(result.profile.contractAdditions).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Specialization evidence
// ---------------------------------------------------------------------------

describe('government specialization evidence', () => {
  const resolved = () => {
    const r = resolveProfile({ profileKey: GOV, pinnedVersion: 1 });
    if (!r.resolved) throw new Error('expected resolution');
    return r.profile;
  };

  it('accepted government work is eligible', () => {
    const evidence = specializationEvidenceFor(resolved(), true);
    expect(evidence.eligible).toBe(true);
    expect(evidence.waivedCategoryCount).toBe(0);
  });

  it('unaccepted work is not', () => {
    expect(specializationEvidenceFor(resolved(), false).eligible).toBe(false);
  });

  it('a commercial profile does not evidence government specialization', () => {
    const r = resolveProfile({ profileKey: 'commercial_standard', pinnedVersion: 1 });
    if (!r.resolved) throw new Error('expected resolution');
    expect(specializationEvidenceFor(r.profile, true).eligible).toBe(false);
  });

  it('carries the waived count, because it changes what the claim means', () => {
    // "Delivered a government project" and "delivered one with four baseline categories
    // waived" describe different amounts of demonstrated experience.
    const r = resolveProfile({
      profileKey: GOV,
      pinnedVersion: 1,
      contractRequirements: [
        {
          operation: 'waive',
          category: 'accessibility',
          detail: 'x',
          waiverReason: 'Console is used solely by three named staff on agency devices.',
          waiverApprovedByIdentityId: 'lead-1',
        },
      ],
    });
    if (!r.resolved) throw new Error('expected resolution');
    const evidence = specializationEvidenceFor(r.profile, true);
    expect(evidence.eligible).toBe(true);
    expect(evidence.waivedCategoryCount).toBe(1);
    expect(evidence.reason).toMatch(/1 waived/);
  });
});
