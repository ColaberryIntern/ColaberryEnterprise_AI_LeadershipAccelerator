/**
 * T208 — a test per level, agreement with the existing builders, and a tripwire
 * that does NOT claim a number it cannot defend.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { subjectRef } from '../../../models/GrowthJourneyEnrollment';
import {
  IDENTIFIER_PRECEDENCE,
  SUBJECT_REF_PREFIXES,
  anchorFromRef,
  identifyingLevel,
  mayDeriveCommercialFacts,
  subjectRefFrom,
} from '../identifierPrecedence';

const REPO = path.join(__dirname, '..', '..', '..', '..', '..');

describe('T208 — one test per level', () => {
  it('level 1: an enrolment identifies a journey participant, and outranks a lead', () => {
    expect(identifyingLevel({ enrollmentId: 'enr-1', leadId: 7 })).toBe('enrollment_id');
    expect(subjectRefFrom({ enrollmentId: 'enr-1', leadId: 7 })).toBe('enrollment:enr-1');
  });

  it('level 2: a lead identifies a commercial relationship', () => {
    expect(identifyingLevel({ leadId: 7 })).toBe('lead_id');
    expect(subjectRefFrom({ leadId: 7 })).toBe('lead:7');
  });

  it('level 2: lead id ZERO is a real id, not an absent one', () => {
    // `if (anchor.leadId)` would drop it. The existing builder documents this
    // trap and a test already pins it there; re-pinned here because this module
    // is the one a future caller will copy.
    expect(identifyingLevel({ leadId: 0 })).toBe('lead_id');
    expect(subjectRefFrom({ leadId: 0 })).toBe('lead:0');
  });

  it('level 3: normalised email is the join key of last resort, and is NOT a ref', () => {
    expect(identifyingLevel({ emailNormalized: 'a@example.test' })).toBe('email_normalized');
    // An address is a join key, never an identity to write rows against.
    expect(subjectRefFrom({ emailNormalized: 'a@example.test' })).toBeNull();
  });

  it('level 4: a fingerprint identifies, but only as a fingerprint', () => {
    expect(identifyingLevel({ visitorId: 'vis-1' })).toBe('visitor_fingerprint');
    expect(subjectRefFrom({ visitorId: 'vis-1' })).toBe('visitor:vis-1');
  });

  it('nothing identifies an empty anchor, rather than defaulting to a placeholder', () => {
    expect(identifyingLevel({})).toBeNull();
    expect(subjectRefFrom({})).toBeNull();
    expect(identifyingLevel({ enrollmentId: null, leadId: null, visitorId: null })).toBeNull();
  });

  it('declares the four levels in strongest-first order', () => {
    expect(IDENTIFIER_PRECEDENCE).toEqual([
      'enrollment_id', 'lead_id', 'email_normalized', 'visitor_fingerprint',
    ]);
  });
});

describe('T208 — the pre-registration-only rule, enforced where it can be true', () => {
  it('refuses commercial facts for a fingerprint-only anchor', () => {
    expect(mayDeriveCommercialFacts({ visitorId: 'vis-1' })).toBe(false);
  });

  it('allows them once any stronger anchor is present', () => {
    expect(mayDeriveCommercialFacts({ visitorId: 'vis-1', leadId: 7 })).toBe(true);
    expect(mayDeriveCommercialFacts({ enrollmentId: 'enr-1' })).toBe(true);
    expect(mayDeriveCommercialFacts({ emailNormalized: 'a@example.test' })).toBe(true);
  });

  it('refuses them for no anchor at all', () => {
    expect(mayDeriveCommercialFacts({})).toBe(false);
  });
});

describe('T208 — the existing builders agree with the shared one', () => {
  /**
   * Asserted against the REAL `subjectRef`, not a restatement of its logic. If it
   * is changed, this fails — the contract is agreement, not similarity.
   */
  it.each([
    [{ enrollmentId: 'enr-1', leadId: 7 }, 'enrollment:enr-1'],
    [{ enrollmentId: 'enr-1' }, 'enrollment:enr-1'],
    [{ leadId: 7 }, 'lead:7'],
    [{ leadId: 0 }, 'lead:0'],
    [{}, null],
  ])('agrees with models/GrowthJourneyEnrollment.subjectRef for %j', (anchor, expected) => {
    const a = anchor as { enrollmentId?: string; leadId?: number };
    expect(subjectRef({ enrollmentId: a.enrollmentId, leadId: a.leadId })).toBe(expected);
    expect(subjectRefFrom(a)).toBe(expected);
  });

  it('extends it with the two prefixes inputs.subjectRefOf adds, and no more', () => {
    // `subjectRefOf` is not imported: it pulls the models index and the
    // classification graph with it. Its two extra cases are asserted by shape
    // here, and the allowlist tripwire below is what catches a fifth.
    expect(subjectRefFrom({ orgMemberId: 'om-1' })).toBe('org_member:om-1');
    expect(subjectRefFrom({ visitorId: 'vis-1' })).toBe('visitor:vis-1');
    // Enrollment and lead still win over both, so the shared key cannot change
    // for any subject the other builders already key.
    expect(subjectRefFrom({ orgMemberId: 'om-1', leadId: 7 })).toBe('lead:7');
    expect(subjectRefFrom({ visitorId: 'vis-1', enrollmentId: 'enr-1' })).toBe('enrollment:enr-1');
  });
});

describe('T208 — the inverse, and the gap it deliberately does not close', () => {
  it.each([
    ['enrollment:enr-1', { enrollmentId: 'enr-1' }],
    ['lead:7', { leadId: 7 }],
    ['lead:0', { leadId: 0 }],
    ['org_member:om-1', { orgMemberId: 'om-1' }],
    ['visitor:vis-1', { visitorId: 'vis-1' }],
  ])('round-trips %s', (ref, expected) => {
    expect(anchorFromRef(ref)).toEqual(expected);
    expect(subjectRefFrom(anchorFromRef(ref)!)).toBe(ref);
  });

  it('refuses a malformed ref rather than guessing', () => {
    expect(anchorFromRef('')).toBeNull();
    expect(anchorFromRef('enrollment')).toBeNull();
    expect(anchorFromRef('enrollment:')).toBeNull();
    expect(anchorFromRef(':enr-1')).toBeNull();
    expect(anchorFromRef('person:1')).toBeNull();
    // A lead id must be numeric; `lead:abc` is not a lead.
    expect(anchorFromRef('lead:abc')).toBeNull();
  });

  it('RECORDS that decisionService.anchorFromSubjectRef parses only two of four', () => {
    // Not a bug in this module — a known defect in the nightly runner, pinned so
    // it is a recorded limitation rather than a surprise. Every `org_member:` and
    // `visitor:` classification is reported as an unanchored_ref skip and is
    // permanently undecidable. Fixing it changes which subjects the runner
    // decides for, which is outside T208's scope.
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'growthJourney', 'decisionService.ts'), 'utf8',
    );
    const fn = src.slice(src.indexOf('export function anchorFromSubjectRef'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain("kind === 'lead'");
    expect(body).toContain("kind === 'enrollment'");
    expect(body).not.toContain("kind === 'org_member'");
    expect(body).not.toContain("kind === 'visitor'");
    // And the shared inverse DOES handle them, so adopting it is the fix.
    expect(anchorFromRef('org_member:om-1')).not.toBeNull();
    expect(anchorFromRef('visitor:vis-1')).not.toBeNull();
  });
});

describe('T208 — the tripwire: every file that builds a subject key is accounted for', () => {
  /**
   * SCOPED TO AN ALLOWLIST, NOT TO A COUNT OF "REGIMES".
   *
   * Asserting "exactly five identifier regimes exist in backend/src" would be
   * FALSE — `modules/identity/platformIdentityService` is a sixth with live
   * runtime readers (`adminScopeBridge`, `deliveryClientAuthRoutes`,
   * `leadConversion`), and `inboxCase/identityResolver` a seventh that resolves
   * display names. A tripwire asserting a false number gets deleted rather than
   * honoured, so this asserts what IS true and IS the risk: which files may
   * construct a subject key, each carrying a determination.
   *
   * The pattern excludes `email:` deliberately. `adminOs/mandrillMessageContent.ts`
   * builds `email:<address>` as a MANDRILL SEARCH QUERY, not an identity. The
   * first draft of this scan flagged it, and the tempting fix was to widen the
   * allowlist — which is how a tripwire comes to protect nothing.
   */
  const REF_PATTERN = '`(lead|enrollment|org_member|visitor):\\$\\{';

  const gitGrep = (args: string[]): string => {
    try {
      return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' });
    } catch {
      return '';   // git grep exits 1 on no matches
    }
  };

  const constructors = (): string[] => gitGrep(['grep', '-l', '-E', REF_PATTERN, '--', 'backend/src'])
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/__tests__|\.test\./.test(f))
    .sort();

  /** Two SANCTIONED builders. */
  const SANCTIONED_BUILDERS = [
    'backend/src/models/GrowthJourneyEnrollment.ts',
    'backend/src/services/growthJourney/classification/inputs.ts',
  ];

  /**
   * Five files that build the key as a LITERAL instead of through a builder.
   * This is the disagreement T208 exists to declare: the journey pipeline WRITES
   * enrollment-preferred keys, and these READ (or write) lead-only ones, so a
   * learner's rows can be stored under `enrollment:<uuid>` and looked up under
   * `lead:<id>` and reported absent.
   */
  const LITERAL_CONSTRUCTORS = [
    'backend/src/scripts/growthJourneyClassifyDryRun.ts',
    'backend/src/services/growthJourney/outcomes/outcomeNormalizer.ts',
    'backend/src/services/growthJourney/personChainService.ts',
    'backend/src/services/growthJourney/personJourneyService.ts',
    'backend/src/services/growthJourney/replyHandoffHook.ts',
  ];

  it('names every non-test file that constructs a subject key', () => {
    expect(constructors()).toEqual([...SANCTIONED_BUILDERS, ...LITERAL_CONSTRUCTORS].sort());
  });

  it('the positive control: the scan really does see a known constructor', () => {
    // Without this, the assertion above would also pass if git grep returned
    // nothing and the allowlist happened to be empty.
    const found = constructors();
    expect(found).toContain('backend/src/models/GrowthJourneyEnrollment.ts');
    expect(found.length).toBeGreaterThan(SANCTIONED_BUILDERS.length);
  });

  it('finds no fifth identity prefix, with `person:` as the live decoy', () => {
    // A `persons` spine exists in a migration with zero application readers
    // (Phase 6's target). If anything starts keying on it, this fails.
    expect(gitGrep(['grep', '-n', '-E', '`person:\\$\\{', '--', 'backend/src']).trim()).toBe('');
    expect([...SUBJECT_REF_PREFIXES]).toEqual(['enrollment', 'lead', 'org_member', 'visitor']);
  });
});
