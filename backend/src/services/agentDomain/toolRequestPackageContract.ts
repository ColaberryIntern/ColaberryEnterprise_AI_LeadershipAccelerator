/**
 * toolRequestPackageContract — the ten blocks an agent must bring before a human is asked anything.
 * PURE, no I/O.
 *
 * AF11.8. Ali, 16 Nov 2026:
 *
 * > *"Any request from agent to human must come with all the pieces, meaning the problem, possible
 * > solutions, recommendation, possible impact, Executive Summary, key findings, risk assessment,
 * > simulate actions etc... We should know the steps that are going to be followed and make the
 * > answer for the human go with option A, B, C or Nothing. Once the human decides, the work is
 * > done and reported on. This is the script that all agents must follow should they need to
 * > interact with a human."*
 *
 * ## THE RULE UNDERNEATH ALL TEN
 *
 * **A request from an agent may not create work for the person receiving it.** If reading it means
 * going to look something up, the agent has not finished its job. Every refusal below is a place
 * where an incomplete package would have sent Ali somewhere else, and that is the test to apply
 * when deciding whether a future block belongs here.
 *
 * ## A BOUNCE IS NOT A REFUSAL, and that distinction drives the whole module
 *
 * `toolRequestContract.ts` refuses a filing: no detail, no request. This gate does something
 * different. The ticket's words are *"A request missing one does not reach Ali; it bounces to the
 * agent naming the block"* — the request still exists, it is simply not in front of a human yet.
 *
 * So nothing here throws and nothing here writes. `gateToolRequestPackage` answers one question —
 * is this ready for a human — and the caller decides what that means: the queue leaves it out of
 * Ali's list, and the agent gets back the named blocks. A package can be rewritten and re-gated
 * any number of times, which is exactly what a bounce is for.
 *
 * ## Why the checks are not all in the table
 *
 * Six of them are: `ensureToolRequestPackageSchema.ts` carries the structural ones, so a row that
 * breaks them cannot exist even if a future caller skips this file. The rest are here because
 * PostgreSQL answers `cannot use subquery in check constraint` and because a constraint violation
 * is a 500 with a constraint name in it, where a bounce needs to name a BLOCK in words the agent
 * that wrote it can act on. Measured on pg15, 17 Nov 2026: the six that are expressible are in
 * the table, and they were each proven to reject what they name before this file was written.
 *
 * ## What is deliberately NOT checked, and why
 *
 *   - **`impact` is not required to carry a number.** The ticket says *"in hours, dollars or
 *     risk"*, and risk is legitimately qualitative: "this can publish to the public internet" is
 *     a complete answer with no quantity in it. Requiring a figure would teach agents to invent
 *     one, which is worse than prose. `judged_threshold` on the AF11.7 detail IS number-checked,
 *     because that field's whole job is to be measurable; this one's is not.
 *   - **Nothing checks that the simulation is TRUE.** This file can require that one was run and
 *     against what; it cannot know whether it happened. `simulated_at` is the handle a reader has
 *     on that, which is why it is a timestamp rather than a sentence.
 *   - **No block is checked for quality.** A three-word executive summary passes. The gate is a
 *     floor, not a review, and the approver is still the reader.
 */

import {
  PACKAGE_OPTION_KEYS,
  PACKAGE_RECOMMENDATIONS,
  type PackageOptionKey,
  type PackageRecommendation,
} from '../../db/ensureToolRequestPackageSchema';
import { TOOL_REQUEST_VERBS } from './toolRequestDecisionContract';

/** Shaped like every other gate in this subtree, so one renderer serves them all. */
export interface PackageIssue {
  readonly rule: PackageRefusal;
  readonly detail: string;
  /** Which of the ten blocks bounced, so the agent is told the block and not only the field. */
  readonly block: PackageBlock;
}

/**
 * The ten blocks, by the ticket's own names.
 *
 * Exported because the bounce message, the console and the tests all have to agree about what a
 * block is called. A block named in three places in three ways is a block nobody can grep for.
 */
export const PACKAGE_BLOCKS = [
  'executive_summary',
  'problem',
  'key_findings',
  'possible_solutions',
  'recommendation',
  'possible_impact',
  'risk_assessment',
  'simulated_action',
  'steps_that_follow',
  'the_answer',
] as const;
export type PackageBlock = typeof PACKAGE_BLOCKS[number];

export type PackageRefusal =
  // 1, 2
  | 'executive_summary_missing'
  | 'problem_missing'
  // 3
  | 'key_findings_missing'
  | 'key_finding_has_no_source'
  // 4 and 10 — one list, see the schema header
  | 'options_missing'
  | 'only_one_option'
  | 'too_many_options'
  | 'option_keys_out_of_order'
  | 'option_is_a_refusal'
  | 'option_verb_unknown'
  | 'option_not_described'
  // 5
  | 'recommendation_missing'
  | 'recommendation_unknown'
  | 'recommendation_not_on_the_list'
  | 'recommendation_reason_missing'
  // 6
  | 'impact_missing'
  // 7
  | 'risk_can_break_missing'
  | 'risk_cannot_break_missing'
  // 8
  | 'simulated_action_missing'
  | 'simulated_against_missing'
  | 'simulated_at_missing'
  | 'simulated_at_not_a_time'
  | 'simulated_in_the_future'
  // 9
  | 'steps_that_follow_missing';

/** One of the agent's proposed options. `verb` is what choosing it would actually do. */
export interface PackageOptionInput {
  readonly key?: string | null;
  readonly summary?: string | null;
  readonly what_happens?: string | null;
  readonly verb?: string | null;
}

export interface PackageOption {
  readonly key: PackageOptionKey;
  readonly summary: string;
  readonly what_happens: string;
  readonly verb: string;
}

/** One measured finding, and where the number came from. */
export interface PackageFindingInput {
  readonly finding?: string | null;
  readonly source?: string | null;
}

export interface PackageFinding {
  readonly finding: string;
  readonly source: string;
}

export interface ToolRequestPackageInput {
  readonly executive_summary?: string | null;
  readonly problem?: string | null;
  readonly key_findings?: ReadonlyArray<PackageFindingInput>;
  readonly options?: ReadonlyArray<PackageOptionInput>;
  readonly recommendation?: string | null;
  readonly recommendation_reason?: string | null;
  readonly impact?: string | null;
  readonly risk_can_break?: ReadonlyArray<string>;
  readonly risk_cannot_break?: ReadonlyArray<string>;
  readonly simulated_action?: string | null;
  readonly simulated_against?: string | null;
  /** ISO 8601. A timestamp rather than a sentence, so "when" can be compared and gone stale. */
  readonly simulated_at?: string | null;
  readonly steps_that_follow?: ReadonlyArray<string>;
}

export interface ToolRequestPackage {
  readonly executive_summary: string;
  readonly problem: string;
  readonly key_findings: ReadonlyArray<PackageFinding>;
  readonly options: ReadonlyArray<PackageOption>;
  readonly recommendation: PackageRecommendation;
  readonly recommendation_reason: string;
  readonly impact: string;
  readonly risk_can_break: ReadonlyArray<string>;
  readonly risk_cannot_break: ReadonlyArray<string>;
  readonly simulated_action: string;
  readonly simulated_against: string;
  readonly simulated_at: string;
  readonly steps_that_follow: ReadonlyArray<string>;
}

export interface GatePackageArgs {
  readonly input: ToolRequestPackageInput;
  /**
   * The clock, passed in rather than read, so "was this simulated in the future" is testable
   * without freezing time globally. Every other gate in this subtree takes its rosters the same
   * way and for the same reason: a pure function of its inputs.
   */
  readonly now: Date;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.map((x) => text(x)).filter((x) => x.length > 0) : null;

/**
 * Judge a package. Returns EVERY block that bounced, not just the first.
 *
 * All of them, because a bounce that names one block per round trip turns a ten-block script into
 * ten round trips, and an agent that has to ask ten times has created exactly the work for the
 * human this whole contract exists to prevent.
 */
export function gateToolRequestPackage(args: GatePackageArgs): PackageIssue[] {
  const p = args.input;
  const issues: PackageIssue[] = [];
  const add = (rule: PackageRefusal, block: PackageBlock, detail: string): void => {
    issues.push({ rule, block, detail });
  };

  // 1. EXECUTIVE SUMMARY ------------------------------------------------------------------
  if (!text(p.executive_summary)) {
    add('executive_summary_missing', 'executive_summary',
      'Three sentences: what this is, what is being asked, and what happens next.');
  }

  // 2. THE PROBLEM ------------------------------------------------------------------------
  if (!text(p.problem)) {
    add('problem_missing', 'problem',
      'State the problem as a cost being paid right now, not as an idea. '
      + 'If nothing is being paid, there is nothing to decide.');
  }

  // 3. KEY FINDINGS -----------------------------------------------------------------------
  //
  // The source is the half that matters. A finding with no source is the thing that sends the
  // reader off to go and check it, which is the one rule the whole script rests on.
  const findings = Array.isArray(p.key_findings) ? p.key_findings : null;
  if (!findings || findings.filter((f) => text(f?.finding)).length === 0) {
    add('key_findings_missing', 'key_findings',
      'Give at least one measured finding, with where the number came from.');
  } else {
    const unsourced = findings.filter((f) => text(f?.finding) && !text(f?.source));
    if (unsourced.length > 0) {
      add('key_finding_has_no_source', 'key_findings',
        `These findings do not say where the number came from: `
        + `${unsourced.map((f) => text(f.finding)).join('; ')}. `
        + 'A number the reader has to go and verify is work you have handed back to them.');
    }
  }

  // 4 and 10. THE OPTIONS, which are also the answer --------------------------------------
  const rawOptions = Array.isArray(p.options) ? p.options : null;
  const options = rawOptions?.filter((o) => text(o?.key)) ?? null;
  if (!options || options.length === 0) {
    add('options_missing', 'possible_solutions',
      'Give at least two real options. Nothing is always available as an answer and is never '
      + 'one of yours, so declining does not count as the second.');
  } else if (options.length === 1) {
    add('only_one_option', 'possible_solutions',
      'One option is not a choice. Give a second real one: a smaller version, a different tool, '
      + 'or a cheaper way to get the same result. "Do it" and "do not" is not two options.');
  } else if (options.length > PACKAGE_OPTION_KEYS.length) {
    add('too_many_options', 'possible_solutions',
      `At most ${PACKAGE_OPTION_KEYS.length} options, A to C. More than that moves the analysis `
      + 'back onto the reader, which is the one thing this format exists to prevent.');
  }

  if (options && options.length > 0) {
    // Keys must be A, B, C in order. Not cosmetic: the decision records a key, and a package whose
    // keys are B and D makes "choose A, B, C or Nothing" a sentence that does not match the page.
    const keys = options.map((o) => text(o.key).toUpperCase());
    const expected = PACKAGE_OPTION_KEYS.slice(0, keys.length);
    if (keys.join(',') !== expected.join(',')) {
      add('option_keys_out_of_order', 'the_answer',
        `Label the options ${expected.join(', ')} in that order. These are labelled `
        + `${keys.join(', ')}, and the answer is recorded as a letter.`);
    }
    for (const o of options) {
      const verb = text(o.verb);
      if (!verb) {
        add('option_verb_unknown', 'possible_solutions',
          `Option ${text(o.key)} does not say what choosing it would do.`);
      } else if (verb === 'deny') {
        // THE TICKET'S SENTENCE, enforced: declining is already guaranteed by Nothing.
        add('option_is_a_refusal', 'possible_solutions',
          `Option ${text(o.key)} is a refusal, which is not a solution. `
          + 'Nothing is always available to the decider, so an option that only declines is the '
          + 'answer they already had.');
      } else if (!TOOL_REQUEST_VERBS.some((v) => v === verb)) {
        add('option_verb_unknown', 'possible_solutions',
          `Option ${text(o.key)} says it would "${verb}", which is not something a decision can `
          + `do. It has to be one of: ${TOOL_REQUEST_VERBS.filter((v) => v !== 'deny').join(', ')}.`);
      }
      if (!text(o.summary) || !text(o.what_happens)) {
        add('option_not_described', 'possible_solutions',
          `Option ${text(o.key)} needs a one-line summary and a line on what happens if it is `
          + 'chosen. An unlabelled option cannot be weighed against another.');
      }
    }
  }

  // 5. RECOMMENDATION ---------------------------------------------------------------------
  const recommendation = text(p.recommendation);
  if (!recommendation) {
    add('recommendation_missing', 'recommendation',
      'Name the option you recommend. An agent that lays out options and will not say which one '
      + 'has handed the thinking back.');
  } else if (!PACKAGE_RECOMMENDATIONS.some((r) => r === recommendation)) {
    add('recommendation_unknown', 'recommendation',
      `A recommendation has to be one of: ${PACKAGE_RECOMMENDATIONS.join(', ')}.`);
  } else if (recommendation !== 'nothing' && options) {
    const keys = options.map((o) => text(o.key).toUpperCase());
    if (!keys.includes(recommendation.toUpperCase())) {
      add('recommendation_not_on_the_list', 'recommendation',
        `You recommend ${recommendation}, which is not one of the options you offered `
        + `(${keys.join(', ') || 'none'}).`);
    }
  }
  if (!text(p.recommendation_reason)) {
    add('recommendation_reason_missing', 'recommendation',
      'One line on why that one. Not a paragraph, and not nothing.');
  }

  // 6. POSSIBLE IMPACT --------------------------------------------------------------------
  if (!text(p.impact)) {
    add('impact_missing', 'possible_impact',
      'Say what this is worth, in hours, dollars or risk.');
  }

  // 7. RISK ASSESSMENT — both halves ------------------------------------------------------
  //
  // "What it CANNOT break" is required, and it is the half people leave out. A risk section that
  // only lists dangers tells the reader how worried to be and not how worried to stop being, and
  // the boundary is usually the thing that makes an approval possible at all.
  if ((list(p.risk_can_break) ?? []).length === 0) {
    add('risk_can_break_missing', 'risk_assessment',
      'List what this can break. "Nothing" is not an answer; every tool that acts can break '
      + 'something, and a tool that truly cannot is a read.');
  }
  if ((list(p.risk_cannot_break) ?? []).length === 0) {
    add('risk_cannot_break_missing', 'risk_assessment',
      'List what this is incapable of breaking. This is the half that makes the other half '
      + 'believable, and it is the part an approver uses to say yes.');
  }

  // 8. SIMULATED ACTION -------------------------------------------------------------------
  //
  // The ticket: *"what it would have done, run against real past data, before it is allowed to do
  // anything."* Three facts, because "we simulated it" with no data named and no date is a claim
  // rather than evidence.
  if (!text(p.simulated_action)) {
    add('simulated_action_missing', 'simulated_action',
      'Say what this would have done, run against real past data, before it is allowed to do '
      + 'anything at all.');
  }
  if (!text(p.simulated_against)) {
    add('simulated_against_missing', 'simulated_action',
      'Name the real past data it was run against. A simulation against nothing in particular is '
      + 'a claim, not evidence.');
  }
  const simulatedAt = text(p.simulated_at);
  if (!simulatedAt) {
    add('simulated_at_missing', 'simulated_action',
      'Say when the simulation was run. A result with no date cannot be known to be stale.');
  } else {
    const when = new Date(simulatedAt);
    if (Number.isNaN(when.getTime())) {
      add('simulated_at_not_a_time', 'simulated_action',
        'When the simulation ran has to be a date and time, like 2026-11-16T14:00:00Z.');
    } else if (when.getTime() > args.now.getTime()) {
      // Not pedantry. A future timestamp is the signature of a simulation block filled in from a
      // template rather than from a run, and that is the one block whose whole value is that it
      // actually happened.
      add('simulated_in_the_future', 'simulated_action',
        'The simulation is dated in the future, so it has not been run.');
    }
  }

  // 9. THE STEPS THAT FOLLOW --------------------------------------------------------------
  if ((list(p.steps_that_follow) ?? []).length === 0) {
    add('steps_that_follow_missing', 'steps_that_follow',
      'List the steps that follow a yes, written before the decision, so approving is approving a '
      + 'known sequence rather than an intention.');
  }

  return issues;
}

/** Which of the ten blocks bounced, in the ticket's order, de-duplicated. */
export function bouncedBlocks(issues: ReadonlyArray<PackageIssue>): PackageBlock[] {
  const hit = new Set(issues.map((i) => i.block));
  return PACKAGE_BLOCKS.filter((b) => hit.has(b));
}

/** Is this package ready to be put in front of a human? */
export function isReadyForAHuman(issues: ReadonlyArray<PackageIssue>): boolean {
  return issues.length === 0;
}

export type AcceptedPackage =
  | { readonly ok: true; readonly value: ToolRequestPackage }
  | { readonly ok: false; readonly issues: PackageIssue[] };

/**
 * Gate it and, on a pass, hand back the NARROWED value.
 *
 * The caller never re-reads the raw input after this, for the reason `toolRequestContract.ts`
 * records: a caller that gated and then persisted the input could still write a trimmed-to-nothing
 * string, because the gate and the write would be reading two different objects.
 */
export function acceptToolRequestPackage(args: GatePackageArgs): AcceptedPackage {
  const issues = gateToolRequestPackage(args);
  if (issues.length > 0) return { ok: false, issues };

  const p = args.input;
  return {
    ok: true,
    value: {
      executive_summary: text(p.executive_summary),
      problem: text(p.problem),
      key_findings: (p.key_findings ?? [])
        .filter((f) => text(f?.finding))
        .map((f) => ({ finding: text(f.finding), source: text(f.source) })),
      options: (p.options ?? [])
        .filter((o) => text(o?.key))
        .map((o) => ({
          key: text(o.key).toUpperCase() as PackageOptionKey,
          summary: text(o.summary),
          what_happens: text(o.what_happens),
          verb: text(o.verb),
        })),
      recommendation: text(p.recommendation) as PackageRecommendation,
      recommendation_reason: text(p.recommendation_reason),
      impact: text(p.impact),
      risk_can_break: list(p.risk_can_break) ?? [],
      risk_cannot_break: list(p.risk_cannot_break) ?? [],
      simulated_action: text(p.simulated_action),
      simulated_against: text(p.simulated_against),
      // Normalised to ISO, so two packages written by two agents sort against each other.
      simulated_at: new Date(text(p.simulated_at)).toISOString(),
      steps_that_follow: list(p.steps_that_follow) ?? [],
    },
  };
}
