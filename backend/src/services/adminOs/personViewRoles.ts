/**
 * T211 — which person view is CANONICAL, declared as a value so it can be tested.
 *
 * WHY THIS EXISTS. There are three read-side person views and they key on
 * different identifiers — gap A4 showing up on the read side:
 *
 *   adminOs/personProfileService      the enrollment, gated by lifecycle stage
 *   growthJourney/personJourneyService  lead_id, via personScopeWhere(ctx, leadId)
 *   growthJourney/personChainService    buildPersonChain hops
 *
 * Retiring any of them is out of scope — each has consumers. But a person who
 * resolves differently depending on which view an operator opened is not a
 * trustworthy Phase 3 input, so each view now DECLARES its role and a tripwire
 * holds the invariants.
 *
 * WHY A DECLARED VALUE RATHER THAN A COMMENT. An earlier wording asked each view
 * to document "either that it delegates OR what different question it answers".
 * That is an unfalsifiable "or" — any view satisfies it by saying something. A
 * declared enum with a checker cannot be satisfied by prose.
 *
 * THE THREE FAILURE MODES this is built to catch, each with its own control in
 * the test suite:
 *   1. A FOURTH view appears and declares nothing.
 *   2. TWO views both claim 'canonical'.
 *   3. A view claims 'delegates' without actually calling the canonical one.
 */

export type PersonViewRole =
  /** The one assembler. Every other view either delegates to it or answers a different question. */
  | 'canonical'
  /** Calls the canonical assembler rather than re-deriving a person. Must actually do so. */
  | 'delegates'
  /** Answers a DIFFERENT question, so it is not a competing profile. */
  | 'answers';

export interface PersonViewDeclaration {
  /** Repo-relative module path, so a violation names a file. */
  module: string;
  role: PersonViewRole;
  /** Required for 'delegates': the module whose source must appear in this one. */
  delegatesTo?: string;
  /** Required for 'answers': the different question, in one line. */
  answers?: string;
}

/**
 * The declared views. Each module also exports its own `PERSON_VIEW_ROLE`, and a
 * test asserts the two agree — so this list cannot drift from the modules it
 * describes without failing.
 */
export const PERSON_VIEWS: readonly PersonViewDeclaration[] = [
  {
    module: 'backend/src/services/adminOs/personProfileService.ts',
    role: 'canonical',
  },
  {
    module: 'backend/src/services/growthJourney/personJourneyService.ts',
    role: 'answers',
    answers: 'What has the growth journey DECIDED for this lead — classifications, '
      + 'decisions and handoffs keyed on lead_id, not who the person is.',
  },
  {
    module: 'backend/src/services/growthJourney/personChainService.ts',
    role: 'answers',
    answers: 'Is this person\'s identity CHAIN intact — which hops are linked, which '
      + 'are unavailable and why, not what the person\'s evidence says.',
  },
];

/**
 * Check the invariants. Returns a list of violations; empty means sound.
 *
 * Pure, and takes its inputs so a test can drive every failure mode without
 * touching the repo: `discovered` is the set of person-view modules found by a
 * scan, and `sourceOf` reads a module's text.
 */
/**
 * Block and line comments out, code in. Exported so a test can control it in
 * both directions — a stripper that ate the whole file would make every
 * delegation look like a lie, and one that stripped nothing would make every
 * lie look like a delegation.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

export function checkPersonViewRoles(
  declared: readonly PersonViewDeclaration[],
  discovered: readonly string[],
  sourceOf: (module: string) => string,
): string[] {
  const violations: string[] = [];

  const canonical = declared.filter((d) => d.role === 'canonical');
  if (canonical.length !== 1) {
    violations.push(
      `expected exactly one 'canonical' person view, found ${canonical.length}`
      + (canonical.length ? `: ${canonical.map((c) => c.module).join(', ')}` : ''),
    );
  }

  for (const d of discovered) {
    if (!declared.some((x) => x.module === d)) {
      violations.push(`undeclared person view: ${d}`);
    }
  }

  for (const d of declared) {
    if (d.role === 'delegates') {
      if (!d.delegatesTo) {
        violations.push(`${d.module} claims 'delegates' without naming a target`);
        continue;
      }
      // The target's basename must appear in the delegating module's CODE.
      //
      // COMMENTS ARE STRIPPED FIRST, and that is not a detail: the first version
      // of this check passed for both 'answers' views, because the docblocks I
      // had just written say "adminOs/personProfileService is the canonical
      // assembler". The checker was reading my own prose. A view could have
      // claimed to delegate and satisfied the guard with a sentence.
      const target = d.delegatesTo.split('/').pop()!.replace(/\.ts$/, '');
      if (!stripComments(sourceOf(d.module)).includes(target)) {
        violations.push(`${d.module} claims 'delegates' but never references ${target}`);
      }
    }
    if (d.role === 'answers' && !d.answers) {
      violations.push(`${d.module} claims 'answers' without saying what question`);
    }
  }

  return violations;
}
