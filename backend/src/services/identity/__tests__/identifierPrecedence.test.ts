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

  /**
   * Asserted against the REAL `subjectRefOf` too, because the acceptance says
   * "the existing resolverS agree" — plural.
   *
   * Attempt 1 asserted these two prefixes "by shape", i.e. against the new
   * module's own logic, which is tautological for exactly the two prefixes the
   * `anchorFromSubjectRef` gap makes load-bearing. The stated reason — that
   * importing `inputs.ts` pulls the models index and the classification graph —
   * is literally true and turned out not to be prohibitive: it imports and runs,
   * it is just slow. An excuse, not a constraint.
   */
  it.each([
    [{ org_member_id: 'om-1' }, 'org_member:om-1'],
    [{ visitor_id: 'vis-1' }, 'visitor:vis-1'],
    [{ org_member_id: 'om-1', lead_id: 7 }, 'lead:7'],
    [{ visitor_id: 'vis-1', enrollment_id: 'enr-1' }, 'enrollment:enr-1'],
  ])('agrees with classification/inputs.subjectRefOf for %j', (view, expected) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- heavy import, kept local
    const { subjectRefOf } = require('../../growthJourney/classification/inputs');
    const v = view as Record<string, unknown>;
    expect(subjectRefOf(v)).toBe(expected);
    expect(subjectRefFrom({
      enrollmentId: v.enrollment_id as string | undefined,
      leadId: v.lead_id as number | undefined,
      orgMemberId: v.org_member_id as string | undefined,
      visitorId: v.visitor_id as string | undefined,
    })).toBe(expected);
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

  /**
   * THREE sanctioned builders, and the third one was missing until a verifier
   * found this suite RED at the delivered commit.
   *
   * `git grep` searches only TRACKED files. This suite was run while
   * `identifierPrecedence.ts` was still untracked, so the scan could not see the
   * very module it ships with — and that module builds `enrollment:${...}` and
   * `lead:${...}`, so it matches this pattern and belongs here. The moment
   * `git add` ran, the tripwire went red.
   *
   * The lesson is about the ORDER of verification, not this list: stage the files
   * BEFORE running any suite whose assertions shell out to `git`.
   */
  const SANCTIONED_BUILDERS = [
    'backend/src/models/GrowthJourneyEnrollment.ts',
    'backend/src/services/growthJourney/classification/inputs.ts',
    'backend/src/services/identity/identifierPrecedence.ts',
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

  /**
   * Files that build an `enrollment:`-PREFIXED string that is NOT a subject key.
   *
   * Both construct COMPOUND IDEMPOTENCY keys — `enrollment:<id>:signal:<type>`
   * and `enrollment:<id>:<kind>` — which share the prefix and nothing else.
   *
   * They are CLASSIFIED rather than excluded by narrowing the pattern. Tightening
   * the regex to dodge them (a subject ref has no second colon) would also stop
   * the scan seeing the next genuine constructor that happens to be compound, and
   * weakening a pattern to make a tripwire pass is how it comes to protect
   * nothing. This mirrors how the free-account enumeration records
   * `paymentSyncService` as REPORTING though it is a writer: the classification
   * is the scanner's, and what matters is that the file is accounted for.
   */
  const NOT_SUBJECT_KEYS = [
    'backend/src/services/reese/reeseAutonomousOutreachService.ts',
    'backend/src/services/reese/reeseWelcomeService.ts',
    // `uuid5('org_member:<org>:<email>')` -- a UUID-v5 DERIVATION NAME, not a subject key. The
    // string exists only to be hashed into a deterministic id and is never stored, looked up or
    // compared as a reference; it is the same compound shape as the two entries above, sharing the
    // prefix and nothing else.
    //
    // CLASSIFIED rather than dodged, per this block's own rule: narrowing the pattern to miss a
    // v5 derivation name would also stop the scan seeing the next genuine constructor that happens
    // to look like one. Added by the Agent Factory run (CC-20261006-a4k7), whose author did not
    // know this tripwire existed until it fired -- which is the tripwire working.
    'backend/src/scripts/seedAgentDomainIdentityPrereqs.js',
  ];

  it('names every non-test file that constructs a subject key', () => {
    expect(constructors()).toEqual(
      [...SANCTIONED_BUILDERS, ...LITERAL_CONSTRUCTORS, ...NOT_SUBJECT_KEYS].sort(),
    );
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
