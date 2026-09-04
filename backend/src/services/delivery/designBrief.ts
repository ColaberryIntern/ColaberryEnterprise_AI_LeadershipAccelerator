/**
 * designBrief — the first arrow of §21, and the thing that stops §20's forbidden outcome.
 *
 *     Build Blueprint -> DESIGN BRIEF -> Design Generation -> Isolated Temporary Preview
 *
 * §20 asks for two or three interactive concepts that reflect the actual project - real
 * roles, real navigation, real domain content, real action labels - and then states the
 * prohibition plainly:
 *
 *     "Do not generate generic dashboard templates with renamed headers."
 *
 * That is normally a hope expressed in a prompt. It does not have to be. A concept either
 * uses the words this customer used or it does not, and that is decidable without asking a
 * model whether it did a good job.
 *
 * ## Distinctive terms are the test
 *
 * "Ralph", "Johnny", "Power BI", "SQL", "Google Sheet", "Slack" - the proper nouns and
 * acronyms a person actually said. A generic dashboard cannot contain them, because it was
 * not built for this business. A concept that mentions none of them is a renamed template
 * no matter how convincing the layout, and it is refused rather than shipped and hoped over.
 *
 * Extraction is deliberately mechanical: capitalised words that are not sentence-initial,
 * plus all-caps acronyms. No model, no judgement, reproducible from the understanding. It
 * will occasionally miss a lowercase domain word, which is the right way to be wrong here -
 * a missed term weakens the check, while a hallucinated one would fail an honest concept.
 */

import type { ProjectUnderstanding } from './projectUnderstanding';
import { itemsFor } from './projectUnderstanding';
import type { BuildBlueprint } from './buildBlueprint';

/** §20's three concepts, in its own order, with its own recommendation. */
export const CONCEPT_VARIANTS = [
  {
    key: 'operational',
    title: 'Operational',
    recommended: false,
    intent: 'The people doing the work, all day. Density over decoration; the screen they keep open.',
  },
  {
    key: 'command_center',
    title: 'Command Center',
    recommended: true,
    intent: 'One place that shows what is happening, what needs a human, and what is stuck.',
  },
  {
    key: 'executive',
    title: 'Executive / Simplified',
    recommended: false,
    intent: 'The few numbers a decision-maker checks, and nothing they would not act on.',
  },
] as const;

export type ConceptKey = (typeof CONCEPT_VARIANTS)[number]['key'];

export interface DesignBrief {
  project_title: string;
  /** Proper nouns and acronyms the customer used. The genericness test. */
  distinctive_terms: string[];
  roles: string[];
  workflows: string[];
  /** Things the system must let someone DO, phrased as the customer described them. */
  actions: string[];
  surfaces: string[];
  /** What was never discussed, so a concept does not invent it. */
  not_discussed: string[];
  concepts: Array<{ key: ConceptKey; title: string; recommended: boolean; intent: string }>;
}

/**
 * Words that look distinctive but are not: sentence-initial capitals, and the handful of
 * generic product nouns that would let a template pass the check it exists to fail.
 */
const NOT_DISTINCTIVE = new Set([
  // Sentence openers. A capitalised word at the start of a sentence is capitalised for
  // grammar, so this list is what lets the extractor read the FIRST word too — which it
  // must, because the most distinctive term in a statement is very often the name it opens
  // with ("Ralph is the keeper of the spreadsheet").
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'when', 'while', 'after', 'before', 'once',
  'this', 'that', 'these', 'those', 'there', 'here', 'then', 'so', 'because', 'since',
  'we', 'they', 'it', 'he', 'she', 'i', 'you', 'our', 'their', 'his', 'her', 'its', 'my',
  'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
  'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must', 'need', 'needs',
  'no', 'not', 'currently', 'today', 'anything', 'everything', 'nothing', 'someone',
  // Imperative openers. "Ask Ralph about it" capitalises a verb, which is indistinguishable
  // from a proper noun by capitalisation alone - and left unlisted it produced the term
  // "Ask Ralph", which no concept would ever match. This list has a floor: an unusual
  // opener will still slip through as a weak term. That direction is the safe one, since a
  // spurious term only makes the genericness check slightly easier to pass, while a MISSED
  // proper noun would fail an honest concept.
  'ask', 'run', 'runs', 'send', 'sends', 'check', 'use', 'uses', 'make', 'makes', 'keep',
  'give', 'take', 'see', 'add', 'open', 'close', 'review', 'ensure', 'track', 'manage',
  'build', 'create', 'update', 'let', 'get', 'gets', 'put', 'show', 'tell', 'find',
  // Generic product vocabulary. Present so a renamed template cannot pass the check that
  // exists to catch it.
  'system', 'systems', 'dashboard', 'dashboards', 'platform', 'application', 'app',
  'user', 'users', 'admin', 'settings', 'data', 'process', 'workflow', 'team', 'company',
  'jobs', 'job', 'report', 'reports', 'success', 'every', 'each', 'all', 'some', 'one',
]);

/**
 * Proper nouns and acronyms, in first-seen order.
 *
 * A capitalised word is only interesting when it is NOT the first word of a sentence -
 * otherwise every statement contributes its opening word and the list fills with noise
 * that any template would satisfy.
 */
export function distinctiveTerms(u: ProjectUnderstanding): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (term: string) => {
    const key = term.toLowerCase();
    if (NOT_DISTINCTIVE.has(key) || seen.has(key) || term.length < 2) return;
    seen.add(key);
    found.push(term);
  };

  u.items.forEach((item) => {
    // Split into sentences so "Ralph" in "…manager. Ralph owns it" is still caught, while
    // the first word of each sentence is skipped.
    item.value.split(/(?<=[.!?])\s+/).forEach((sentence) => {
      const words = sentence
        .trim()
        .split(/\s+/)
        .map((raw) => raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''));

      for (let i = 0; i < words.length; i += 1) {
        const word = words[i];
        if (!word) continue;

        const isAcronym = /^[A-Z]{2,}$/.test(word);
        const isProper = /^[A-Z][a-z]+$/.test(word);
        if (!isAcronym && !isProper) continue;

        // A sentence-initial word is capitalised for grammar, so it only survives on the
        // strength of the stop list above. That is what lets "Ralph is the keeper…" yield
        // Ralph while "When a job is refused…" yields nothing.
        if (NOT_DISTINCTIVE.has(word.toLowerCase())) continue;

        // "Power BI", "Google Sheet" - keep the pair, and SKIP the second word so it does
        // not also land on its own. Emitting "Power BI" alongside a bare "BI" would inflate
        // the term list with fragments that a template could match by accident.
        const next = words[i + 1];
        if (next && (/^[A-Z]{2,}$/.test(next) || /^[A-Z][a-z]+$/.test(next))) {
          add(`${word} ${next}`);
          i += 1;
          continue;
        }

        add(word);
      }
    });
  });

  return found;
}

export function buildDesignBrief(u: ProjectUnderstanding, blueprint: BuildBlueprint): DesignBrief {
  const values = (dimension: Parameters<typeof itemsFor>[1]) => itemsFor(u, dimension).map((i) => i.value);

  return {
    project_title: u.title,
    distinctive_terms: distinctiveTerms(u),
    roles: values('actors'),
    workflows: [...values('current_workflow'), ...values('approval_points')],
    actions: [...values('desired_outcome'), ...values('outputs')],
    surfaces: u.proposed_surfaces,
    not_discussed: blueprint.readiness.not_discussed,
    concepts: CONCEPT_VARIANTS.map((c) => ({ ...c })),
  };
}

/**
 * How many of this project's distinctive terms a generated concept actually uses.
 *
 * The threshold is deliberately low. A concept is a sketch, not the finished product, and
 * demanding it name every system the customer mentioned would reject good work. But zero is
 * not a sketch of THEIR business - it is a template - and one is a coincidence.
 */
export const MIN_DISTINCTIVE_TERMS = 2;

export function genericnessViolation(html: string, brief: DesignBrief): string | null {
  if (brief.distinctive_terms.length === 0) {
    // Nothing distinctive was said, so there is nothing to check against. Say so rather
    // than passing silently, because a brief with no domain vocabulary means the interview
    // did not get far enough for concepts to be worth generating at all.
    return 'the conversation produced no distinctive terms, so a concept cannot be checked for genericness';
  }

  const haystack = (html || '').toLowerCase();
  const used = brief.distinctive_terms.filter((t) => haystack.includes(t.toLowerCase()));
  const needed = Math.min(MIN_DISTINCTIVE_TERMS, brief.distinctive_terms.length);

  if (used.length < needed) {
    return `concept uses ${used.length} of this project's terms (needs ${needed}) — it is a generic template with renamed headers`;
  }

  return null;
}
