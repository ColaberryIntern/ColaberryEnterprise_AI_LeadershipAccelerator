import * as fs from 'fs';
import * as path from 'path';
import {
  MEASURE_MAPPINGS,
  ENGAGEMENT_SOURCE_TYPE,
  MATURITY_CEILING_TODAY,
  PUBLISHABLE_FROM,
  engagementSeed,
  assertPilotCannotReachPublishable,
  assertDeclinedMeasureCannotBePublished,
  assertNoSelfAttestedVerification,
  assertCaveatsTravelWithTheNumber,
  assertSeedCannotBecomeUnpublishable,
  assertSeedFailsClosed,
} from '../pilotCaseStudyPolicy';

/**
 * C8.7's three acceptance criteria, as assertions: reuse the existing engine, respect the
 * publish maturity ladder, and require explicit approval before naming a customer.
 *
 * Several of these read the ENGINE's own source rather than restating what it does. That
 * is deliberate: a policy file describing a gate it cannot see would drift the first time
 * somebody changed the gate, and the drift would be silent.
 */
const CASE_STUDY = path.join(__dirname, '..', '..', 'caseStudy');
const SBP = path.join(__dirname, '..', '..', 'sbp');
const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');

describe('the ladder is respected, not routed around', () => {
  it('keeps a pilot below the publishable rung', () => {
    expect(() => assertPilotCannotReachPublishable()).not.toThrow();
    expect(MATURITY_CEILING_TODAY).toBe('capability_demonstration');
    expect(PUBLISHABLE_FROM).toBe('operational_result');
  });

  it('agrees with the engine about which rung publishes', () => {
    // Read from the gate rather than restated here, so the two cannot drift apart.
    const rule = read(CASE_STUDY, 'caseStudyPublishMaturityRule.ts');
    expect(rule).toMatch(
      new RegExp(`PUBLISHABLE_FROM:\\s*CaseStudyMaturity\\s*=\\s*'${PUBLISHABLE_FROM}'`),
    );
  });

  it('agrees with the engine that the publishable rung is currently unreachable', () => {
    // The whole design rests on this. If the measurement-definition concept ever lands,
    // this test fails and the design must be revisited rather than silently outdated.
    const foundation = read(SBP, 'caseStudyFoundation.ts');
    expect(foundation).toMatch(/operational_result\s+UNREACHABLE here/);
    expect(foundation).toMatch(/No approved measurement definitions exist/);
  });
});

describe('the measure C7.6 declined cannot come back as a published claim', () => {
  it('refuses to mark it publishable', () => {
    const declined = assertDeclinedMeasureCannotBePublished();
    expect(declined.measure).toMatch(/Business outcome/i);
    expect(declined.publishable).toBe(false);
  });

  it('gives it NO verification class at all', () => {
    // A class would make it read as a figure not yet checked, rather than one never
    // taken. C7.6 declined to measure it; there is nothing to classify.
    const declined = MEASURE_MAPPINGS.find((m) => m.attribution === 'declined')!;
    expect(declined.verification).toBeNull();
  });

  it('is the only declined measure, and the other four are mapped', () => {
    expect(MEASURE_MAPPINGS).toHaveLength(5);
    expect(MEASURE_MAPPINGS.filter((m) => m.attribution === 'declined')).toHaveLength(1);
    for (const m of MEASURE_MAPPINGS.filter((x) => x.attribution !== 'declined')) {
      expect(m.verification).not.toBeNull();
    }
  });

  it('marks exactly one measure strong, and it is the commit record', () => {
    const strong = MEASURE_MAPPINGS.filter((m) => m.attribution === 'strong');
    expect(strong).toHaveLength(1);
    expect(strong[0].verification).toEqual({ class: 'verified', method: 'repo' });
  });
});

describe('the caveat travels with the number', () => {
  it('gives every partial or weak measure an inline caveat', () => {
    // C7.6's publication rule: in the sentence carrying the number, not a footnote.
    expect(assertCaveatsTravelWithTheNumber()).toBe(3);
  });

  it('leaves the strong measure unhedged, because hedging it would be false modesty', () => {
    const strong = MEASURE_MAPPINGS.find((m) => m.attribution === 'strong')!;
    expect(strong.inlineCaveat).toBeNull();
  });

  it('does not publish the weak internal-verification measure', () => {
    // 1,624 partial and 715 not verified, none fully verified. It may inform a draft.
    const weak = MEASURE_MAPPINGS.find((m) => /Internal verification/i.test(m.measure))!;
    expect(weak.publishable).toBe(false);
    expect(weak.why).toMatch(/NONE is fully verified/);
  });
});

describe('self-attestation can never be verified', () => {
  it('maps no measure to verified-by-self', () => {
    expect(() => assertNoSelfAttestedVerification()).not.toThrow();
  });

  it('matches the gate, which refuses that pair rather than discounting it', () => {
    const rules = read(CASE_STUDY, 'caseStudyPublishRules.ts');
    expect(rules).toMatch(/self_attested_verification/);
  });
});

describe('the seed fails closed, and cannot become permanently unpublishable', () => {
  it('never sets project_id', () => {
    // THE TRAP. project_id activates a maturity rule that cannot be satisfied, so the
    // record would be worse than blocked: it would be blocked forever.
    expect(() => assertSeedCannotBecomeUnpublishable()).not.toThrow();
    expect(engagementSeed().projectId).toBeNull();
  });

  it('is born hidden, unconsented, private and draft', () => {
    expect(() => assertSeedFailsClosed()).not.toThrow();
    expect(engagementSeed()).toMatchObject({
      organizationIdentityMode: 'hidden',
      organizationNamingConsent: false,
      visibility: 'private',
      status: 'draft',
    });
  });

  it('uses a source type the engine already knows', () => {
    // Criterion 1, reuse: 'engagement' is already in the union and had no writer.
    const types = read(__dirname, '..', '..', '..', 'types', 'caseStudy.ts');
    expect(types).toMatch(
      new RegExp(`CaseStudySourceType[^;]*'${ENGAGEMENT_SOURCE_TYPE}'`),
    );
  });

  it('agrees with the engine that the maturity rule is a no-op without a foundation', () => {
    // This is what makes "do not set project_id" a design and not a dodge: the rule is
    // deliberately scoped to student projects, and an engagement is not one.
    const rule = read(CASE_STUDY, 'caseStudyPublishMaturityRule.ts');
    expect(rule).toMatch(/foundation/);
  });
});

describe('what a delivery may export is an allowlist, not a filter', () => {
  it('matches the existing delivery adapter rather than inventing a second list', () => {
    const mod = read(__dirname, '..', '..', '..', 'modules', 'delivery', 'caseStudy.ts');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EXPORTABLE_FACTS } = require('../pilotCaseStudyPolicy');
    for (const fact of EXPORTABLE_FACTS) expect(mod).toContain(`'${fact}'`);
  });

  it('exports no money, contract value or builder assessment', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EXPORTABLE_FACTS } = require('../pilotCaseStudyPolicy');
    for (const fact of EXPORTABLE_FACTS as string[]) {
      expect(fact).not.toMatch(/price|value|cost|revenue|saving|roi|assessment|rating/i);
    }
  });
});
