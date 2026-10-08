/**
 * T209 + T210 — the Explorer stage, and the conversion defect fixed before
 * anything is expanded.
 *
 * THE DEFECT, in one line of SQL that appeared in two files:
 *     WHEN e.email IS NOT NULL THEN 'enrolled_student'
 * The existence of an enrollments row made a person an enrolled student, so every
 * free AI Explorer was represented as converted. These tests are named for that
 * failure so a regression says what broke.
 */
import * as fs from 'fs';
import * as path from 'path';
import { LIFECYCLE, LIFECYCLE_STAGES, LifecycleStage } from '../lifecycle';
import { canSeeStage } from '../personScope';
import { MGMT_ROLE_DEFS } from '../../access/mgmtRoles';
import { POST_CONVERSION_STAGES } from '../panels/acquisitionPanels';
import { modeForStage } from '../strategyBriefService';
import {
  ENROLLMENT_FACTS_JOIN,
  ENROLLMENT_FACTS_SQL,
  HAS_PROGRAM_ACCESS_SQL,
  IS_CONVERTED_SQL,
  STAGE_CASE_SQL,
  hasProgramAccess,
  isConverted,
} from '../conversionState';

const sectionsFor = (role: keyof typeof MGMT_ROLE_DEFS) =>
  MGMT_ROLE_DEFS[role].sections as readonly string[];

const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('T209 — the Explorer stage the vocabulary was missing', () => {
  it('exists in the canonical list, between applicant and enrolled_student', () => {
    expect(LIFECYCLE_STAGES).toContain('explorer');
    expect(LIFECYCLE_STAGES.indexOf('explorer' as LifecycleStage))
      .toBe(LIFECYCLE_STAGES.indexOf('applicant') + 1);
    expect(LIFECYCLE_STAGES.indexOf('explorer' as LifecycleStage))
      .toBe(LIFECYCLE_STAGES.indexOf('enrolled_student') - 1);
  });

  it('leaves the nine pre-existing stages present and in their original order', () => {
    // The position of the new stage is a decision; reordering the others is not.
    const existing = [
      'anonymous_visitor', 'identified_visitor', 'lead', 'applicant',
      'enrolled_student', 'active_learner', 'graduate', 'lapsed', 'returning_customer',
    ];
    expect(LIFECYCLE_STAGES.filter((s) => s !== 'explorer')).toEqual(existing);
    expect(LIFECYCLE_STAGES).toHaveLength(10);
  });

  it('carries a definition and is joinable today, unlike the aspirational stages', () => {
    expect(LIFECYCLE.explorer.stage).toBe('explorer');
    expect(LIFECYCLE.explorer.joinable_today).toBe(true);
    expect(LIFECYCLE.explorer.evidence).toMatch(/enrollment_type/);
  });
});

describe('T209 — role visibility for the new stage, asserted explicitly', () => {
  it('shows Explorers to Admissions and Revenue', () => {
    expect(canSeeStage(sectionsFor('admissions'), 'explorer')).toBe(true);
    expect(canSeeStage(sectionsFor('revenue'), 'explorer')).toBe(true);
  });

  it('hides Explorers from Support, Program and mentors, who deal with students', () => {
    // This is the access CONSEQUENCE of the fix, chosen rather than inherited: a
    // free account is not a student, so the student-facing roles stop seeing them.
    //
    // `curriculum` was MISSING here until a verifier's mutation survived: adding
    // 'explorer' to the `program` section stayed contiguous (so the contiguity
    // test could not catch it) and nothing else asserted it, while this test's
    // own title claimed Program was covered. The title promised more than the
    // assertions delivered — the exact defect class this phase keeps finding.
    expect(canSeeStage(sectionsFor('support'), 'explorer')).toBe(false);
    expect(canSeeStage(sectionsFor('mentor'), 'explorer')).toBe(false);
    expect(canSeeStage(sectionsFor('curriculum'), 'explorer')).toBe(false);
  });

  it('names the section each of those roles holds, so the mapping is not assumed', () => {
    // The role→section indirection is why the gap above was invisible: the
    // contiguity test guards SECTIONS, and this asserts which section each
    // student-facing role actually holds.
    expect(sectionsFor('curriculum')).toContain('program');
    expect(sectionsFor('mentor')).toContain('career_review');
    expect(sectionsFor('support')).toContain('students');
  });

  it('still gives the owner every stage, including the new one', () => {
    for (const stage of LIFECYCLE_STAGES) {
      expect(canSeeStage(sectionsFor('owner'), stage)).toBe(true);
    }
  });
});

describe('T210 — a free Explorer is NOT converted merely because an enrollment row exists', () => {
  it('does not treat an unpaid Explorer as converted', () => {
    // THE REGRESSION TEST. 260 production rows on 2026-10-07 are explorer rows
    // with payment_status 'pending'.
    const freeExplorer = { has_paid_enrollment: false, has_paid_subscription: false };
    expect(isConverted(freeExplorer)).toBe(false);
    expect(hasProgramAccess(freeExplorer)).toBe(false);
  });

  it('does treat a paid learner as converted, so the fix does not disable the feature', () => {
    expect(isConverted({ has_paid_enrollment: true, has_paid_subscription: false })).toBe(true);
    expect(isConverted({ has_paid_enrollment: false, has_paid_subscription: true })).toBe(true);
  });

  it('does not count an admin-granted comp seat as a conversion', () => {
    // Subscription.ts:13-17 — "Free Access, full program access at $0, never
    // billed". customerFactFor had no comp term at all before T210.
    const comped = {
      has_paid_enrollment: false, has_paid_subscription: false, has_comp_seat: true,
    };
    expect(isConverted(comped)).toBe(false);
  });

  it('DOES give that comp seat program access, which is a different question', () => {
    // The two questions are one git grep apart. Conflating them would either
    // count a granted seat as revenue, or strip a granted seat of its access.
    const comped = {
      has_paid_enrollment: false, has_paid_subscription: false, has_comp_seat: true,
    };
    expect(hasProgramAccess(comped)).toBe(true);
    expect(isConverted(comped)).toBe(false);
  });

  it('excludes comp from the SQL aggregate too, not only from the TS predicate', () => {
    // A mutation found this unasserted: deleting `AND s.plan <> 'comp'` from the
    // SQL left all 89 tests green, so the two expressions of one rule could
    // disagree about comp while each looked correct on its own. The SQL half is
    // the half that decides what an operator sees on the roster.
    expect(ENROLLMENT_FACTS_SQL).toContain("s.plan <> 'comp'");
    expect(ENROLLMENT_FACTS_SQL).toContain("s.plan = 'comp'");
    // Two distinct aggregates, so a comp seat is visible as access without
    // being counted as revenue.
    expect(ENROLLMENT_FACTS_SQL).toContain('AS has_paid_subscription');
    expect(ENROLLMENT_FACTS_SQL).toContain('AS has_comp_seat');
  });

  it('treats a guest-tier row as unconverted even when payment_status says paid', () => {
    // paid-but-guest is the incoherence T206 prevents going forward. The fact
    // aggregate requires tier <> 'guest', so the SQL cannot read it as converted.
    expect(IS_CONVERTED_SQL).not.toMatch(/has_comp_seat/);
    expect(src('conversionState.ts')).toContain("e.payment_status = 'paid' AND e.tier <> 'guest'");
  });
});

describe('T210 — the stage derivation, and the exact literal that caused the defect', () => {
  it('no longer stages a person on row existence alone', () => {
    expect(STAGE_CASE_SQL).not.toContain("WHEN e.email IS NOT NULL THEN 'enrolled_student'");
  });

  it('requires program access for enrolled_student, and checks it before explorer', () => {
    const access = STAGE_CASE_SQL.indexOf(HAS_PROGRAM_ACCESS_SQL);
    const explorer = STAGE_CASE_SQL.indexOf('e.has_explorer');
    expect(access).toBeGreaterThan(-1);
    expect(explorer).toBeGreaterThan(-1);
    // A paid Explorer must read as a student, not as an Explorer, so the
    // access branch has to come first.
    expect(access).toBeLessThan(explorer);
  });

  it('keeps lapsed ahead of everything, so withdrawn-but-paid is not a current student', () => {
    const lapsed = STAGE_CASE_SQL.indexOf("'lapsed'");
    expect(lapsed).toBeGreaterThan(-1);
    expect(lapsed).toBeLessThan(STAGE_CASE_SQL.indexOf("'enrolled_student'"));
  });

  it('leaves an unpaid non-Explorer account holder to fall through to lead/applicant', () => {
    // An org teammate or an AI Flotation prospect has a free account, not a
    // programme. Staging them 'explorer' would undo what T207 protected.
    const explorerBranch = STAGE_CASE_SQL.indexOf('e.has_explorer');
    expect(STAGE_CASE_SQL.indexOf("'applicant'")).toBeGreaterThan(explorerBranch);
    expect(STAGE_CASE_SQL.indexOf("ELSE 'lead'")).toBeGreaterThan(explorerBranch);
  });
});

describe('T210 — drift tripwires: one definition, two importers', () => {
  it('has no second copy of the stage CASE in either consumer', () => {
    for (const file of ['peopleService.ts', 'personProfileService.ts']) {
      const text = src(file);
      expect(text).toContain('STAGE_CASE_SQL');
      // The defect literal must not reappear anywhere, in either file.
      expect(text).not.toContain("WHEN e.email IS NOT NULL THEN 'enrolled_student'");
      // Nor a hand-rolled stage CASE of its own.
      expect(text).not.toMatch(/WHEN\s+e\.status\s*=\s*'withdrawn'\s+THEN\s+'lapsed'/);
    }
  });

  it('has exactly one definition of conversion, and it is the shared one', () => {
    // subjectResolver must not restate the rule; it imports it.
    const resolver = src('../growthJourney/subjectResolver.ts');
    expect(resolver).toContain('isConverted');
    expect(resolver).toContain("from '../adminOs/conversionState'");
    // The pre-T210 subscription lookup had no plan term. Assert the comp term is
    // present on the query, so a revert of just that clause is caught.
    expect(resolver).toContain("plan: { [Op.ne]: 'comp' }");
  });

  it('keeps both consumers deriving the facts from the shared aggregate', () => {
    for (const file of ['peopleService.ts', 'personProfileService.ts']) {
      expect(src(file)).toContain('ENROLLMENT_FACTS_SQL');
      expect(src(file)).toContain('ENROLLMENT_FACTS_JOIN');
    }
  });
});

describe('T210 — the strategy-brief mode change, which is the operator-visible consequence', () => {
  /**
   * T210 acceptance 7, which the first attempt MISSED ENTIRELY — and it is the
   * most visible effect of the whole fix. `strategyBriefService.ts` had no test
   * file at all, so this was untested rather than untestable.
   *
   * Before: a free Explorer was staged `enrolled_student`, so a rep opening
   * their brief was told there is NOTHING TO SELL. For ~260 production rows on
   * 2026-10-07, the brief actively argued against the conversation the whole
   * Explorer Growth programme exists to have.
   */
  it('gives an Explorer a SALES brief, not a coaching one', () => {
    const m = modeForStage('explorer');
    expect(m.mode).toBe('sales');
    // The reason, not just the enum: the framing is what a rep actually reads.
    expect(m.reason).toContain('have not enrolled');
  });

  it('still gives a paid learner the COACHING brief, so the fix did not invert it', () => {
    const m = modeForStage('enrolled_student');
    expect(m.mode).toBe('coaching');
    expect(m.reason).toContain('nothing to sell');
  });

  it('leaves every other stage mapping untouched', () => {
    expect(modeForStage('lapsed').mode).toBe('winback');
    expect(modeForStage('lead').mode).toBe('sales');
    expect(modeForStage('applicant').mode).toBe('sales');
    for (const stage of ['active_learner', 'graduate', 'returning_customer']) {
      expect(modeForStage(stage).mode).toBe('coaching');
    }
  });
});

describe('T210 — one DELIBERATE asymmetry, named rather than left to be discovered', () => {
  /**
   * `past_due` is treated differently by the two halves of the conversion rule,
   * and a verifier was right that leaving it unstated was the same split-brain
   * T210 set out to remove.
   *
   *   SQL  (`ENROLLMENT_FACTS_JOIN`): status IN ('active','past_due')
   *   TS   (`customerFactFor`):       status: 'active' only
   *
   * Both are defensible and the difference is intentional. The STAGE must keep a
   * card-failure student in the programme — demoting them to `explorer` mid-dunning
   * would strip their curriculum over a billing retry. The CUSTOMER FACT is a
   * revenue question, and a pre-existing named test pins it to `'active'` alone.
   * Unifying them would overturn that deliberate decision for no benefit, so the
   * asymmetry is pinned here instead of being quietly inherited.
   */
  it('counts past_due as program access in the SQL half', () => {
    expect(ENROLLMENT_FACTS_JOIN).toContain("status IN ('active','past_due')");
  });

  it('does NOT count past_due in the TS customer fact, and that is on purpose', () => {
    const resolver = src('../growthJourney/subjectResolver.ts');
    expect(resolver).toContain("status: 'active', plan: { [Op.ne]: 'comp' }");
    expect(resolver).not.toContain("'past_due'");
  });

  it('records the asymmetry in the module itself, not only here', () => {
    // So a reader of the code finds it, not just a reader of the tests.
    expect(src('conversionState.ts')).toContain('DELIBERATE ASYMMETRY');
  });
});

describe('T210 — the four suppressed fields, and who they are suppressed for', () => {
  it('suppresses intent only at post-conversion stages, which explorer is NOT', () => {
    // The downstream effect of the defect, and it ran backwards: a free Explorer
    // staged enrolled_student had their intent and temperature HIDDEN — the very
    // people whose intent matters most. Ali's rule was "if they are enrolled,
    // hide their current intent"; an Explorer is not enrolled.
    expect(POST_CONVERSION_STAGES).not.toContain('explorer');
    expect(POST_CONVERSION_STAGES).toContain('enrolled_student');
  });

  it('names all four fields the profile service suppresses', () => {
    const profile = src('personProfileService.ts');
    for (const field of [
      'row.temperature = null',
      'row.temperatureUpdatedAt = null',
      'row.leadScore = null',
      'profile.journey.intentScore = null',
    ]) {
      expect(profile).toContain(field);
    }
  });

  it('gates all four on the same POST_CONVERSION_STAGES list', () => {
    // The KPI and the panel must obey one rule, or the header contradicts the
    // panel below it.
    const profile = src('personProfileService.ts');
    const gates = profile.match(/POST_CONVERSION_STAGES\.includes\(person\.stage\)/g) ?? [];
    expect(gates).toHaveLength(2);
  });
});
