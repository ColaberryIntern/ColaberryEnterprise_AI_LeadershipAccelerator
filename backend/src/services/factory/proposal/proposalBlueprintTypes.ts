/**
 * proposalBlueprintTypes — the shared, dependency-free TYPES for a contract's proposal blueprint (P2).
 *
 * A blueprint is the quoted, cited rulebook the Proposal Studio derives from the stored solicitation ZIP: how it is
 * scored (Section M), how it must be submitted (Section L mechanics), which forms are required (including the Texas
 * forms rules engine), and which addenda must be acknowledged. EVERY rule carries the literal source `quote` it came
 * from and the `sourceFile` it was found in — the same never-fabricate rail the requirement extractor holds
 * (verifyQuotes): a rule whose quote is not literally present in the source is dropped and counted, never shown.
 *
 * This module is pure types only (no runtime, no imports with side effects) so both the Sequelize model
 * (models/GovProposalBlueprint.ts, which stores a Blueprint as jsonb) and the pure builder
 * (services/factory/proposal/buildProposalBlueprint.ts) depend on it without a cycle.
 */
import type { AwardBasis, EvaluationFactor } from './evaluationCriteria';

/** How badly a missing/violated rule hurts: `fatal` blocks export whatever the score; `curable` is fixable; `info`
 *  is advisory. Mirrors the research's fatal-vs-curable distinction. */
export type RuleSeverity = 'fatal' | 'curable' | 'info';

/** The Texas buyer classes the forms engine keys on. `other` = out-of-scope buyer (non-Texas / unknown). */
export type TexasBuyerType = 'state_agency' | 'university' | 'local_government' | 'other';

/**
 * The detected US jurisdiction (state) of the buyer, with the literal source `quote` it was read from. `state` is
 * null when no state could be determined from the solicitation text. This gates whether the Texas forms rules engine
 * applies at all — a non-Texas jurisdiction must never be assessed against Texas statutes.
 */
export interface Jurisdiction {
  state: string | null;
  quote: string | null;
}

/**
 * Whether a state-specific forms rulebook was loaded for this jurisdiction. Today only the Texas rulebook exists, so
 * a non-Texas (or undetermined) jurisdiction reports `loaded:false` with an explanatory note; the UI then lists only
 * the forms the solicitation itself names, never invented state rules.
 */
export interface StateFormsStatus {
  state: string | null;
  loaded: boolean;
  note: string | null;
}

/**
 * One blueprint rule — a Section L submission-mechanic, an addendum to acknowledge, or any other extracted
 * obligation. `key` is a stable machine key (e.g. `page_limit`, `min_font`, `page_size`, `file_format`,
 * `section_order`, `file_naming`, `copies`, `submission_method`, `due_datetime`). `value` is the normalized
 * value a downstream check reads (P3 format check reads page_limit/min_font/page_size/section_order/file_naming).
 */
export interface BlueprintRule {
  key: string;
  value: string;
  /** The VERBATIM source snippet this rule was read from — verified literally present, else the rule is dropped. */
  quote: string;
  /** The file the quote was found in. */
  sourceFile: string;
  /** 1-based page, when the extractor knows it. */
  page?: number;
  severity: RuleSeverity;
}

/** A required form's disposition. `at_award` = required but due with the signed contract, not the proposal.
 *  `needs_input` = a trigger input was unknown, so the engine refuses to guess (never a silent false). */
export type FormDisposition = 'required' | 'not_required' | 'needs_input' | 'at_award';

/**
 * A form the solicitation (or the Texas rules engine) requires. Texas-engine forms carry a statute `citation` and a
 * `triggerReason`; solicitation-named forms also carry the `quote`/`sourceFile` they were named in.
 */
export interface RequiredForm {
  key: string;
  label: string;
  disposition: FormDisposition;
  /** Why the engine reached this disposition (the trigger inputs or the solicitation naming). */
  triggerReason: string;
  /** When the form is due. `at_award` forms are required but not at submission. */
  timing: 'with_proposal' | 'at_award' | 'unknown';
  severity: RuleSeverity;
  /** Statute / authority citation (Texas engine) — from RESEARCH.md. */
  citation: string;
  /** Present when the form was literally named in the solicitation text. */
  quote?: string;
  sourceFile?: string;
}

/** How the solicitation is scored (Section M), reused from the deterministic evaluationCriteria detector. */
export interface BlueprintScoring {
  basis: AwardBasis | null;
  basisQuote: string | null;
  totalPoints: number | null;
  factors: EvaluationFactor[];
}

/** An elimination-risk flag carried into the blueprint (a requirement whose own text says missing it rejects the bid). */
export interface BlueprintEliminationRisk {
  statement: string;
  quote: string;
  sourceFile: string;
}

/**
 * The complete blueprint for one contract version. Stored as `blueprint_json` on `gov_proposal_blueprints`.
 * Every array may be empty (a non-scored or sparse solicitation), never null.
 */
export interface ProposalBlueprint {
  /** Section L submission mechanics + any other extracted obligations, each quoted + cited. */
  rules: BlueprintRule[];
  /** Required forms (solicitation-named + Texas rules engine). */
  forms: RequiredForm[];
  /** Section M scoring. */
  scoring: BlueprintScoring;
  /** Addenda/amendments to acknowledge (rule-shaped, quoted). */
  addenda: BlueprintRule[];
  /** Elimination-risk requirements surfaced from the source. */
  eliminationRisks: BlueprintEliminationRisk[];
  /** The Texas buyer type the forms engine keyed on (null when not determinable / out of scope). */
  buyerType: TexasBuyerType | null;
  /** The detected buyer jurisdiction (state) + the quote it came from. Always set by the builder. */
  jurisdiction?: Jurisdiction;
  /** Whether a state forms rulebook was applied (Texas only today), else the explanatory note. Always set by the builder. */
  stateFormsStatus?: StateFormsStatus;
  /** How many candidate rules were DROPPED because their quote was not literally present (never fabricate). */
  droppedRuleCount: number;
  /** The source files analyzed (names), for provenance. */
  sourceFiles: string[];
  /** ISO timestamp the blueprint was built (injected `now`, so the builder stays pure/deterministic in tests). */
  generatedAt: string;
}
