/**
 * T211 — the role tripwire, with a positive control for EACH of its three
 * failure modes, plus the evidence-package additions.
 *
 * The tripwire exists because an earlier wording asked each view to document
 * "either that it delegates OR what different question it answers" — an
 * unfalsifiable "or" that any view satisfies by saying something. A declared
 * enum with a checker cannot be satisfied by prose.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  PERSON_VIEWS,
  PersonViewDeclaration,
  checkPersonViewRoles,
  stripComments,
} from '../personViewRoles';

const REPO = path.join(__dirname, '..', '..', '..', '..', '..');
const readModule = (m: string): string => fs.readFileSync(path.join(REPO, m), 'utf8');
const declaredModules = PERSON_VIEWS.map((v) => v.module);

describe('T211 — the real declaration is sound', () => {
  it('has exactly one canonical view and no violations', () => {
    expect(checkPersonViewRoles(PERSON_VIEWS, declaredModules, readModule)).toEqual([]);
  });

  it('names personProfileService as the canonical assembler', () => {
    const canonical = PERSON_VIEWS.filter((v) => v.role === 'canonical');
    expect(canonical).toHaveLength(1);
    expect(canonical[0].module).toBe('backend/src/services/adminOs/personProfileService.ts');
  });

  it('every declared module exports a PERSON_VIEW_ROLE matching its declaration', () => {
    // This is what stops the list drifting from the modules it describes: the
    // declaration and the module have to agree, in both directions.
    for (const view of PERSON_VIEWS) {
      const src = readModule(view.module);
      expect(src).toContain(`export const PERSON_VIEW_ROLE = '${view.role}' as const;`);
    }
  });

  it('every view that answers a different question says WHAT question', () => {
    for (const view of PERSON_VIEWS.filter((v) => v.role === 'answers')) {
      expect(view.answers && view.answers.length).toBeGreaterThan(20);
    }
  });
});

describe('T211 — failure mode 1: a FOURTH view appears undeclared', () => {
  it('flags a discovered module that nothing declares', () => {
    const violations = checkPersonViewRoles(
      PERSON_VIEWS,
      [...declaredModules, 'backend/src/services/adminOs/personFourthView.ts'],
      readModule,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('undeclared person view');
    expect(violations[0]).toContain('personFourthView.ts');
  });

  it('the scan that feeds it really finds the three views in the repo', () => {
    // The control. Without this, failure mode 1 would also "pass" if the
    // discovery scan returned nothing and there were never anything to declare.
    // EXCLUDES TESTS by pathspec: this file contains the literal too, and the
    // scan matched itself on the first run — the fourth time in this phase that
    // a guard has read its own source.
    const found = execFileSync('git', [
      'grep', '-l', 'export const PERSON_VIEW_ROLE', '--', 'backend/src',
      ':!backend/src/**/__tests__/**',
    ], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean).sort();
    expect(found).toEqual([...declaredModules].sort());
  });
});

describe('T211 — failure mode 2: TWO views claim canonical', () => {
  it('flags a second canonical claim', () => {
    const twoCanonical: PersonViewDeclaration[] = [
      ...PERSON_VIEWS.filter((v) => v.role !== 'answers'),
      { module: 'backend/src/services/growthJourney/personChainService.ts', role: 'canonical' },
    ];
    const violations = checkPersonViewRoles(twoCanonical, [], readModule);
    expect(violations.some((v) => v.includes('exactly one'))).toBe(true);
    expect(violations.some((v) => v.includes('found 2'))).toBe(true);
  });

  it('flags ZERO canonical claims too, not just too many', () => {
    const noneCanonical = PERSON_VIEWS.map((v) => ({ ...v, role: 'answers' as const, answers: v.answers ?? 'x'.repeat(30) }));
    const violations = checkPersonViewRoles(noneCanonical, [], readModule);
    expect(violations.some((v) => v.includes('found 0'))).toBe(true);
  });
});

describe('T211 — failure mode 3: a view claims to delegate without delegating', () => {
  it('flags a delegates claim whose target never appears in the source', () => {
    const lying: PersonViewDeclaration[] = [
      ...PERSON_VIEWS.filter((v) => v.role === 'canonical'),
      {
        // personChainService does NOT reference personProfileService.
        module: 'backend/src/services/growthJourney/personChainService.ts',
        role: 'delegates',
        delegatesTo: 'backend/src/services/adminOs/personProfileService.ts',
      },
    ];
    const violations = checkPersonViewRoles(lying, [], readModule);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('never references personProfileService');
  });

  it('accepts a delegates claim whose target IS referenced — the two-way control', () => {
    // Without this the test above would also pass if `sourceOf` returned empty
    // strings and every delegation looked like a lie.
    const honest: PersonViewDeclaration[] = [
      ...PERSON_VIEWS.filter((v) => v.role === 'canonical'),
      {
        // personProfileService genuinely references personTimelineService.
        module: 'backend/src/services/adminOs/personProfileService.ts',
        role: 'delegates',
        delegatesTo: 'backend/src/services/adminOs/personTimelineService.ts',
      },
    ];
    // Two canonical claims are a separate violation here; filter to the
    // delegation finding, which must be absent.
    const violations = checkPersonViewRoles(honest, [], readModule);
    expect(violations.filter((v) => v.includes('never references'))).toEqual([]);
  });

  it('flags a delegates claim with no target named at all', () => {
    const noTarget: PersonViewDeclaration[] = [
      ...PERSON_VIEWS.filter((v) => v.role === 'canonical'),
      { module: 'backend/src/services/growthJourney/personChainService.ts', role: 'delegates' },
    ];
    expect(checkPersonViewRoles(noTarget, [], readModule)[0])
      .toContain("claims 'delegates' without naming a target");
  });
});

describe('T211 — the comment stripper the delegation check depends on', () => {
  it('strips comments but keeps code — both directions', () => {
    const src = readModule('backend/src/services/growthJourney/personChainService.ts');
    const stripped = stripComments(src);
    // The docblock I wrote names the canonical module; the CODE does not. That
    // mention is precisely what made the delegation check vacuous at first: the
    // checker was reading my own prose as evidence of delegation.
    expect(src).toContain('personProfileService');
    expect(stripped).not.toContain('personProfileService');
    // and it did not eat the file
    expect(stripped).toContain('export async function buildPersonChain');
  });
});

describe('T211 — the evidence package additions', () => {
  it('reads the GHL contact id, which no person view did before', () => {
    const src = readModule('backend/src/services/adminOs/panels/acquisitionPanels.ts');
    expect(src).toContain('ghl_contact_id AS "ghlContactId"');
    expect(src).toContain('ghlContactId: string | null;');
  });

  it('degrades a missing GHL id to null rather than throwing', () => {
    // The column is selected unconditionally and typed nullable; a lead with no
    // linkage yields null. Asserted on the type and the absence of any
    // non-null assertion or throw around it.
    const src = readModule('backend/src/services/adminOs/panels/acquisitionPanels.ts');
    expect(src).not.toMatch(/ghlContactId!/);
    expect(src).not.toMatch(/throw[^\n]*ghl/i);
  });

  it('surfaces Explorer E/I/F, and as null rather than zeros when unscored', () => {
    const src = readModule('backend/src/services/adminOs/panels/explorerPanel.ts');
    expect(src).toContain('e_score');
    expect(src).toContain('i_score');
    expect(src).toContain('f_score');
    // The honest-absence rule: no snapshot => null, never a 0/0/0 reading.
    expect(src).toContain('if (enrollmentIds.length === 0) return null;');
    expect(src).toContain('if (!row) return null;');
  });

  it('takes the NEWEST Explorer snapshot, so an old state cannot be shown as current', () => {
    const src = readModule('backend/src/services/adminOs/panels/explorerPanel.ts');
    expect(src).toContain('ORDER BY as_of_date DESC');
    expect(src).toContain('LIMIT 1');
  });

  it('is assembled by the CANONICAL view, not a competing one', () => {
    // Ali's constraint: do not create a second competing sales profile. The new
    // evidence hangs off the canonical assembler.
    const src = readModule('backend/src/services/adminOs/personProfileService.ts');
    expect(src).toContain('loadExplorerScore(enrollmentIds)');
    expect(src).toContain("export const PERSON_VIEW_ROLE = 'canonical' as const;");
  });
});

describe('T211 — chronology is preserved as ORDER, not as counts', () => {
  it('orders the timeline by time, and says so in SQL', () => {
    const src = readModule('backend/src/services/adminOs/personTimelineService.ts');
    expect(src).toContain('ORDER BY max(occurred_at) DESC');
  });

  it('carries page_events with its own timestamp, so the website journey is a sequence', () => {
    // Scenario 7's substrate: pre-registration page events, keyed to the lead
    // once identity resolution has linked them.
    const src = readModule('backend/src/services/adminOs/personTimelineService.ts');
    expect(src).toContain('page_events');
    expect(src).toContain('WHERE pe.lead_id IN (:leadIds)');
  });
});

jest.setTimeout(120000);

describe('T211 — the same person resolves to the same identity through all three views', () => {
  /**
   * The acceptance criterion attempt 1 did not have a test for at all, and it
   * is the phase's fifth checkpoint question: a person who resolves differently
   * depending on which view an operator opened is not a trustworthy input.
   *
   * Asserted through T208's shared precedence, which is the one definition all
   * three are supposed to agree with — not by re-implementing a fourth answer
   * here, which would be the very thing T211 forbids.
   */
  it('gives one subject key for one anchor, whichever view asks', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- heavy graph, kept local
    const { subjectRefFrom, identifyingLevel } = require('../../identity/identifierPrecedence');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { subjectRef } = require('../../../models/GrowthJourneyEnrollment');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { subjectRefOf } = require('../../growthJourney/classification/inputs');

    const anchor = { enrollmentId: 'enr-1', leadId: 7 };
    const view = { enrollment_id: 'enr-1', lead_id: 7 };

    // The shared precedence, the models builder and the classification builder
    // must all name the same person the same way.
    expect(subjectRefFrom(anchor)).toBe('enrollment:enr-1');
    expect(subjectRef(anchor)).toBe('enrollment:enr-1');
    expect(subjectRefOf(view)).toBe('enrollment:enr-1');
    expect(identifyingLevel(anchor)).toBe('enrollment_id');
  });

  it('still agrees when only the WEAKER anchor is present', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { subjectRefFrom } = require('../../identity/identifierPrecedence');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { subjectRef } = require('../../../models/GrowthJourneyEnrollment');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { subjectRefOf } = require('../../growthJourney/classification/inputs');

    expect(subjectRefFrom({ leadId: 7 })).toBe('lead:7');
    expect(subjectRef({ leadId: 7 })).toBe('lead:7');
    expect(subjectRefOf({ lead_id: 7 })).toBe('lead:7');
  });

  it('declares exactly one canonical view, so there is one answer to prefer', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PERSON_VIEWS } = require('../personViewRoles');
    expect(PERSON_VIEWS.filter((v: { role: string }) => v.role === 'canonical')).toHaveLength(1);
  });

  /**
   * ── ATTEMPT 3: NO VIEW MAY SPELL AN IDENTITY FOR ITSELF ─────────────────────
   *
   * The three tests above assert that three ID BUILDERS agree. A verifier
   * pointed out that none of the three VIEWS calls any of them, and found the
   * reason: `personChainService` carried its own local
   * `` const subjectRefOf = (leadId) => `lead:${leadId}` `` — a FOURTH
   * re-implementation, in the very file T211 edited to declare that this view
   * does not compete with the canonical one.
   *
   * Two things were wrong, and they need different fixes:
   *
   *   1. THE CODE. That local spelling is now `subjectRefFrom({ leadId })`, so
   *      the spelling has one definition instead of four. The behavioural kill
   *      for it lives where the view's own harness is:
   *      `growthJourney/__tests__/personChainService.test.ts` pins
   *      `ref: \`lead:${LEAD}\`` on the journey and outcomes hops, so changing
   *      the spelling fails named tests there. That suite is part of T211's
   *      evidence set for exactly this reason — the verifier's M16 "survived"
   *      only because its safety scope excluded the suite that pins it.
   *
   *   2. THE RE-INTRODUCTION. Nothing stopped a fifth copy being written
   *      tomorrow. This test is that tripwire: a view may CONSTRUCT a subject
   *      ref only if it imports the shared builder. It reads stripped code, so
   *      the docblock above — which contains the literal on purpose — cannot
   *      satisfy or trip it, and it carries a positive control, because a scan
   *      that finds nothing is indistinguishable from a scan that cannot see.
   */
  it('no person view spells a subject ref itself unless it imports the one builder', () => {
    const PREFIX_LITERAL = /[`'"](?:enrollment|lead|org_member|visitor):(?:\$\{|'|"|\s*\+)/;

    for (const view of PERSON_VIEWS) {
      const code = stripComments(readModule(view.module));
      if (PREFIX_LITERAL.test(code)) {
        expect(code).toContain('identifierPrecedence');
      }
    }

    // POSITIVE CONTROL. The pattern must actually fire on a planted literal,
    // or the loop above is a no-op that passes whatever the views contain.
    expect('const r = `lead:${leadId}`;').toMatch(PREFIX_LITERAL);
    expect("const r = 'enrollment:' + id;").toMatch(PREFIX_LITERAL);
    // NEGATIVE CONTROL. It must not fire on ordinary code, or every view would
    // be forced to import the builder and the check would mean nothing.
    expect('const r = buildChain(leadId);').not.toMatch(PREFIX_LITERAL);
  });

  it('the chain view really does import the shared builder — the two-way control', () => {
    // Without this, the test above passes while `personChainService` constructs
    // nothing and imports nothing, which is also how it would look if the
    // stripper had eaten the file.
    const code = stripComments(
      readModule('backend/src/services/growthJourney/personChainService.ts'),
    );
    expect(code).toContain('identifierPrecedence');
    expect(code).toContain('subjectRefFrom({ leadId })');
    expect(code).toContain('export async function buildPersonChain');
  });
});
