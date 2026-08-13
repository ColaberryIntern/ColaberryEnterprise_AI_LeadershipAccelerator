/**
 * claimsRegistry.test.ts
 *
 * This registry is the mechanism that stops unverified claims and unbuilt
 * capability reaching a customer-facing page, so the tests assert the guarantee
 * itself — not just that the functions run.
 *
 * Covers, per CLAUDE.md's mandatory test types: happy path, failure path,
 * boundary cases, and idempotency.
 */
import {
  CLAIMS,
  getClaim,
  isPublishable,
  isApprovedForRoute,
  publicClaim,
  blockedClaims,
  requiresSampleLabel,
  type Claim,
} from '../claimsRegistry';

describe('claimsRegistry — registry integrity', () => {
  it('has no duplicate keys', () => {
    const keys = CLAIMS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every claim an owner and a verification date', () => {
    CLAIMS.forEach((c) => {
      expect(c.owner.trim()).not.toHaveLength(0);
      expect(c.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('requires every claim to explain its evidence, including the absence of it', () => {
    CLAIMS.forEach((c) => {
      expect(c.evidenceSource.trim().length).toBeGreaterThan(10);
    });
  });

  it('leaves no publishable route on a blocked claim', () => {
    CLAIMS.filter((c) => c.verification === 'DO_NOT_PUBLISH').forEach((c) => {
      expect(c.approvedRoutes).toHaveLength(0);
    });
  });
});

describe('publicClaim — the publish gate (happy path)', () => {
  it('returns the wording for a verified, live, approved claim', () => {
    expect(publicClaim('anthropic.capability')).toBe('We build on Claude and Claude Code.');
  });

  it('returns live-verified pricing', () => {
    expect(publicClaim('pricing.individual.annual')).toBe('$149/month, billed annually');
  });
});

describe('publicClaim — the publish gate (failure paths)', () => {
  it('blocks an unverified partner designation', () => {
    expect(publicClaim('anthropic.partner')).toBeNull();
  });

  it('blocks the credential wording the code itself concedes is exam prep', () => {
    expect(publicClaim('credential.cca')).toBeNull();
  });

  it('offers a safe, accurate alternative for that credential', () => {
    expect(publicClaim('credential.cca.safe')).toContain('certification preparation');
  });

  it('blocks track-record figures that are still unevidenced', () => {
    // "5,000+ careers launched" survived measurement badly: CCPP shows 8,588
    // enrolled, 2,844 certified and 691 hired, so the outcome wording overstates
    // by roughly an order of magnitude. Superseded, not repaired.
    expect(publicClaim('trackrecord.careers')).toBeNull();
    expect(publicClaim('trackrecord.wageimpact')).toBeNull();
  });

  it('publishes track-record figures once measured, with the method in the wording', () => {
    // Verified 2026-08-13 by read-only query against CCPP dbo.ADF_ClassSignups.
    expect(publicClaim('trackrecord.students')).toContain('8,588');
    expect(publicClaim('trackrecord.students')).toContain('students');
    expect(publicClaim('trackrecord.certified')).toContain('2,844');
    // Earliest class StartDate 2012-04-07, enrolments in every year since.
    expect(publicClaim('trackrecord.since2012')).toContain('2012');
  });

  it('states a counting method rather than an unqualified total', () => {
    // The defect in the old claim was not the number, it was that "careers
    // launched" named no method. Each replacement says what it counts.
    expect(publicClaim('trackrecord.students')).toMatch(/students/i);
    expect(publicClaim('trackrecord.certified')).toMatch(/certified/i);
  });

  it('blocks the retired $4,500 price', () => {
    expect(publicClaim('pricing.retired.4500')).toBeNull();
  });

  it("blocks the repo's $1,788 price, which is not on the live site", () => {
    expect(publicClaim('pricing.repo.1788')).toBeNull();
  });

  it('blocks fabricated case studies, testimonials and third-party brands', () => {
    expect(publicClaim('casestudy.fabricated')).toBeNull();
    expect(publicClaim('testimonial.undisclosed')).toBeNull();
    expect(publicClaim('thirdparty.networks')).toBeNull();
  });

  it('returns null for an unknown key rather than throwing', () => {
    expect(publicClaim('does.not.exist')).toBeNull();
  });
});

describe('the capability gate is independent of the verification gate', () => {
  it('blocks a TRUE claim about an UNBUILT surface', () => {
    const claim = getClaim('surface.fourview.console') as Claim;
    // the sentence is accurate about the intended product...
    expect(claim.verification).toBe('VERIFIED');
    // ...but the thing does not exist, so it must not ship
    expect(claim.capability).toBe('unbuilt');
    expect(publicClaim('surface.fourview.console')).toBeNull();
  });

  it('blocks every other unbuilt surface too', () => {
    expect(publicClaim('surface.opportunity.lab')).toBeNull();
    expect(publicClaim('surface.proof.room')).toBeNull();
  });

  it('allows verified claims about surfaces that do exist', () => {
    expect(publicClaim('surface.readiness.rollup')).not.toBeNull();
    expect(publicClaim('surface.free.workspace')).not.toBeNull();
  });
});

describe('route scoping', () => {
  it('honours a wildcard', () => {
    expect(isApprovedForRoute(getClaim('anthropic.capability') as Claim, '/anything')).toBe(true);
  });

  it('permits an explicitly approved route', () => {
    expect(publicClaim('pricing.team', '/pricing')).toBe('Team — $1,200');
  });

  it('blocks a route that was not approved', () => {
    expect(publicClaim('pricing.team', '/')).toBeNull();
  });
});

describe('boundary cases', () => {
  it('treats an empty approvedRoutes list as unpublishable even when verified', () => {
    const synthetic: Claim = {
      key: 'synthetic.empty',
      publicWording: 'x',
      verification: 'VERIFIED',
      capability: 'live',
      evidenceSource: 'synthetic fixture for the boundary case',
      owner: 'test',
      lastVerifiedAt: '2026-08-07',
      approvedRoutes: [],
      requiresSampleLabel: false,
    };
    expect(isPublishable(synthetic)).toBe(false);
  });

  it('permits ILLUSTRATIVE claims, which exist to be labelled rather than hidden', () => {
    const synthetic: Claim = {
      key: 'synthetic.illustrative',
      publicWording: 'x',
      verification: 'ILLUSTRATIVE',
      capability: 'live',
      evidenceSource: 'synthetic fixture',
      owner: 'test',
      lastVerifiedAt: '2026-08-07',
      approvedRoutes: ['*'],
      requiresSampleLabel: true,
    };
    expect(isPublishable(synthetic)).toBe(true);
  });

  it('reports sample-label requirements, defaulting false for unknown keys', () => {
    expect(requiresSampleLabel('surface.readiness.rollup')).toBe(true);
    expect(requiresSampleLabel('company.name')).toBe(false);
    expect(requiresSampleLabel('nope')).toBe(false);
  });
});

describe('idempotency', () => {
  it('returns the same result across repeated calls', () => {
    const a = publicClaim('pricing.free');
    const b = publicClaim('pricing.free');
    expect(a).toBe(b);
    expect(publicClaim('anthropic.partner')).toBeNull();
    expect(publicClaim('anthropic.partner')).toBeNull();
  });

  it('does not mutate the registry when resolving claims', () => {
    const before = JSON.stringify(CLAIMS);
    publicClaim('pricing.free');
    publicClaim('anthropic.partner');
    blockedClaims();
    expect(JSON.stringify(CLAIMS)).toBe(before);
  });
});

describe('blockedClaims — the audit surface', () => {
  it('lists every barred claim with a reason attached', () => {
    const blocked = blockedClaims();
    expect(blocked.length).toBeGreaterThan(0);
    blocked.forEach((c) => expect(c.evidenceSource.length).toBeGreaterThan(10));
  });

  it('includes the highest-exposure items found by the audit', () => {
    const keys = blockedClaims().map((c) => c.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'anthropic.partner',
        'credential.cca',
        'casestudy.fabricated',
        'surface.fourview.console',
        'pricing.repo.1788',
      ]),
    );
  });
});
