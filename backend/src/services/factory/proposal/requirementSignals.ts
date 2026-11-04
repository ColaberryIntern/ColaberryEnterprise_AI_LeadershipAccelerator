/**
 * requirementSignals — how a solicitation sentence is categorised. PURE, no I/O, no model.
 *
 * ## Why this is its own module
 *
 * These signals were born inside `govRequirementItems.ts`, which imports types from
 * `proposalExtractor.ts`. The extractor now needs to categorise too — it is the place that
 * decides what `kind` a requirement is stored with — so importing them back would make
 * `proposalExtractor -> govRequirementItems -> proposalExtractor`. CLAUDE.md forbids that by
 * name and prescribes the fix verbatim: *"A imports B imports A is a code smell that signals a
 * missing third module C that both depend on."* This is C.
 *
 * The move itself changed nothing: the regexes, the precedence order and the `'rule'` default
 * arrived byte-identical, and `govRequirementItems.test.ts` passed unchanged as proof.
 *
 * ONE SIGNAL WAS ADDED AFTERWARDS, and is called out here rather than buried in a diff.
 * `SIGNALS.submit` matched "proposal must **include**" and "submitted **with**", but not
 * "Proposals must be **submitted no later than** 5:00 p.m." — the archetypal submission
 * deadline. It fell through every category to the `'rule'` default and was stored as
 * `compliance` instead of `administrative`, which puts a filing deadline in the wrong half of a
 * compliance matrix. The added alternative is
 * `proposals? (must|shall|should|are required to|are to) be (submitted|received|delivered)`.
 * The existing suite still passes, so the change is additive rather than a reinterpretation.
 *
 * ## Why rule-based rather than a model call
 *
 * The categorisation decides what a requirement IS, and a person has to be able to ask "why is
 * this one administrative" and get a checkable answer. A model call here would reintroduce
 * exactly the unauditable classification that left 858 of 864 production rows reading
 * `compliance/must` — a classifier with one output class is not classifying.
 */

/** The four things a solicitation sentence can be asking of a bidder. */
export type ReqItemCategory = 'submit' | 'rule' | 'scope' | 'after_award';

// Category signals. Deliberately word-boundary anchored and specific; precedence resolves overlaps.
const SIGNALS: Record<ReqItemCategory, RegExp> = {
  // An obligation you must SUBMIT as part of the proposal package.
  submit: /\b(proposal\s+(?:must|shall|should)\s+(?:include|contain)|proposals?\s+(?:must|shall|should|are\s+required\s+to|are\s+to)\s+be\s+(?:submitted|received|delivered)|submit(?:ted)?\s+(?:with|as\s+part\s+of|the\s+following|a\s+|three|two|one)|include\s+(?:in|with)\s+(?:the|your)\s+(?:proposal|response|submittal|submission)|cover\s+letter|letter\s+of\s+transmittal|transmittal\s+letter|completed?\s+(?:form|the\s+attached)|\breferences\b|past\s+performance|pricing\s+(?:sheet|schedule|form|proposal)|fee\s+schedule|cost\s+proposal|technical\s+(?:proposal|approach)|compliance\s+matrix|w-?9|certificat(?:e|ion)\s+of)\b/i,
  // A post-award, ongoing obligation (not part of building the bid).
  after_award: /\b(upon\s+award|after\s+award|post[-\s]?award|once\s+awarded|during\s+the\s+(?:contract|term|engagement|project)|contract\s+term|warranty\s+period|ongoing\s+(?:support|maintenance)|maintenance\s+and\s+support|service\s+level\s+agreement|\bslas?\b|renewal|for\s+the\s+(?:duration|term)\s+of|annually|per\s+year)\b/i,
  // A compliance rule / legal term you must obey.
  rule: /\b(insurance|bond(?:ed|ing)?|licen[cs]e?d?|comply|compliance|indemnif|liabilit|confidential|non[-\s]?disclosure|terms\s+and\s+conditions|prevailing\s+wage|equal\s+(?:employment\s+)?opportunity|non[-\s]?collusion|certify\s+that|shall\s+not|must\s+not|prohibited|conflict\s+of\s+interest|background\s+check|data\s+privacy|HIPAA|SOC\s*2|FERPA)\b/i,
  // What the buyer is buying - the system/services to deliver.
  scope: /\b(system|software|platform|application|integrat|interface|implement|develop|module|dashboard|\bAPI\b|migrat|hosting|host(?:ed|ing)?|work\s+order|asset\s+management|\bGIS\b|geographic\s+information|reporting\s+(?:system|module|tool)|data\s+(?:migration|conversion|warehouse)|functionalit|configure|deploy)(?:e|es|s|ed|ing|ion|ions|y|ies|ment|ments)?\b/i,
};

// Precedence: the more SPECIFIC category wins over the catch-alls, by first match, not by hit count -
// `scope` is full of common words (system/support/host) and would otherwise out-vote a clear `submit` or
// `after_award` signal. "The proposal must include ... the system" is a submit, not a scope.
const PRECEDENCE: ReqItemCategory[] = ['submit', 'after_award', 'rule', 'scope'];

/** Classify one requirement's text into a category by precedence (first match wins), so a strong submit or
 *  after-award signal beats incidental scope keywords. No signal at all -> 'rule' (a generic obligation you
 *  must follow; never a build story by default). */
export function classifyRequirementCategory(text: string): ReqItemCategory {
  for (const cat of PRECEDENCE) {
    if (SIGNALS[cat].test(text)) return cat;
  }
  return 'rule';
}
