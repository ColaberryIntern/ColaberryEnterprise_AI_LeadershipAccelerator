/**
 * toolRequestDecisionContract — the four verbs Ali can act with, and every reason one is refused.
 *
 * AF11.3. Ali, 3 Nov 2026: *"I should have the ability to review, approve, deny or grant access
 * to their agent the tool."*
 *
 * ## Pure, and it grants nothing
 *
 * This decides whether a decision MAY STAND. It writes nothing, reads no database, and names no
 * tool grant: `assign_existing_tool` raises the INTENT and AF11.4 performs the write. The ticket
 * is explicit that a grant and an autonomy level are two decisions and must never be one click,
 * so nothing here can express an autonomy level at all.
 *
 * ## Two different checks, both required
 *
 * `resolveRecordedHumans` establishes that somebody is a REAL PERSON. The approver set decides
 * WHICH of those people may settle a tool grant. Ali's ruling of 4 Nov 2026 makes the second one
 * a configuration of one — *"only Ali approves a tool grant, for now"* — and the word "for now"
 * is why it arrives as configuration rather than as a literal in this file.
 *
 * ## The refusal this ticket was corrected about
 *
 * The obvious answer is "refuse the four-hour timer", and that is necessary and **not
 * sufficient**. `system:auto_approve_timeout` is already refused three separate ways by
 * `NON_HUMAN_APPROVER`. The identity that actually walks through is **`unknown`**:
 * `approvalRequestController` resolves its actor as `req.admin?.email || 'unknown'` and
 * `isNonHumanIdentity('unknown')` returns FALSE, so a denylist reads it as a person. That is why
 * the positive roster is the real gate here and the denylist is only the first of two.
 */

import { humanityCheck } from './promotionIdentity';

/** The verbs, and nothing else is a decision. */
export const TOOL_REQUEST_VERBS = Object.freeze([
  /** The tool does not exist and should. Leaves the request open until it is usable (AF11.5). */
  'approve_to_build',
  /** Refused, with a reason. A denial with no reason teaches nothing and cannot be appealed. */
  'deny',
  /** The AF11.2 match was right. Raises the intent; AF11.4 performs the grant. */
  'assign_existing_tool',
  /** Names the field that is missing or too vague, so the loop is specific. */
  'send_back',
  /**
   * AF11.8. The capability comes off the board, and there is nothing to appeal.
   *
   * Ali, 16 Nov 2026, on the answer space: *"make the answer for the human go with option A, B, C
   * or Nothing."* The ticket is explicit that this is **not deny-with-a-reason** — a denial says
   * no to a proposal and invites a better one, where Nothing says the capability itself should
   * not exist. Collapsing them would lose the only distinction that matters afterwards: whether
   * anybody should try again.
   *
   * It is therefore the one verb that requires no words. `deny` without a reason is still refused
   * by `chk_adtrd_verb_carries_its_words`, and that asymmetry IS the difference between them.
   */
  'nothing',
] as const);

/**
 * What a human may answer with, as opposed to what an agent may offer.
 *
 * `nothing` is in here and is never in a package's option list: see
 * `ensureToolRequestPackageSchema.ts` for why an option the agent has to remember to include is
 * an option it can leave out.
 */
export const DECISION_ANSWERS = Object.freeze(['A', 'B', 'C', 'nothing'] as const);
export type DecisionAnswer = typeof DECISION_ANSWERS[number];

/**
 * AF11.8. How long Ali's standing instructions may be.
 *
 * They are injected into the assembled system prompt on every run of the capability, beside the
 * persona, the platform safety rules and whatever context the turn needs, so the bound is about
 * what fits there rather than what fits in a column. 2000 characters is roughly the worked
 * example in the ticket twenty times over.
 */
export const STANDING_INSTRUCTIONS_MAX = 2000;

export type ToolRequestVerb = typeof TOOL_REQUEST_VERBS[number];

export type DecisionRefusal =
  | 'verb_unknown'
  | 'not_a_tool_request'
  | 'request_already_decided'
  | 'decider_roster_absent'
  | 'decider_not_recorded'
  | 'decider_is_non_human'
  | 'decider_not_an_approver'
  | 'proposer_cannot_decide'
  | 'deny_reason_missing'
  | 'send_back_field_missing'
  | 'send_back_field_unknown'
  | 'assigned_tool_missing'
  | 'assigned_tool_unknown'
  // AF11.8 — answering with one of the options the request itself carried
  | 'chosen_option_unknown'
  | 'chosen_option_not_offered'
  | 'chosen_option_verb_mismatch'
  | 'nothing_needs_its_own_answer'
  | 'option_chosen_on_a_request_with_no_package'
  | 'standing_instructions_have_no_agent'
  | 'standing_instructions_too_long';

export interface DecisionIssue {
  readonly rule: DecisionRefusal;
  readonly detail: string;
}

/**
 * The fields a send-back may name.
 *
 * An allowlist, so "send back for detail" cannot degrade into "needs more detail". These are the
 * six groups AF11.1 captures, by their own column names, which is what makes the intern's next
 * action obvious rather than a guess.
 */
export const SEND_BACK_FIELDS: ReadonlyArray<string> = Object.freeze([
  'tool_name', 'purpose', 'reads', 'produces',
  'capability_id', 'task_unblocked', 'task_key', 'manual_today',
  'needed_by', 'run_frequency',
  'touches', 'inputs',
  'writes', 'side_effects', 'reversible', 'reversibility_note',
]);

export interface ProposedDecision {
  readonly verb?: string | null;
  /** AF11.8. The option chosen: `A`, `B`, `C`, or `nothing`. */
  readonly chosen_option?: string | null;
  /**
   * AF11.8. Ali's own rules for how the agent should behave when this capability runs.
   *
   * Not gated here beyond its length, and that is deliberate: this is the one field on a decision
   * whose content is the decider's judgement rather than a value a contract can check. The
   * service attaches it to the CAPABILITY as a manager directive, in the same transaction as the
   * decision, and refuses the whole decision if it cannot.
   */
  readonly standing_instructions?: string | null;
  /** Mandatory on `deny`. */
  readonly reason?: string | null;
  /** Mandatory on `send_back`, and must be one of `SEND_BACK_FIELDS`. */
  readonly missing_field?: string | null;
  /** Mandatory on `assign_existing_tool`, and must be a tool the catalog really has. */
  readonly assigned_tool_name?: string | null;
}

export interface AcceptedDecision {
  readonly verb: ToolRequestVerb;
  readonly decided_by_identity: string;
  readonly reason: string | null;
  readonly missing_field: string | null;
  readonly assigned_tool_name: string | null;
  /**
   * AF11.8. WHICH of the options the request carried was chosen, or `nothing`.
   *
   * `null` when the decision was not made by choosing one. That is not a legacy hole: `deny` is
   * never an option an agent may offer, so denying is always a decision with no chosen option,
   * and a request that carries no package has no options to choose from at all.
   */
  readonly chosen_option: DecisionAnswer | null;
}

/** One option a package offered, as the gate needs it: the letter and what it would do. */
export interface OfferedOption {
  readonly key: string;
  readonly verb: string;
}

export interface GateDecisionArgs {
  readonly proposed: ProposedDecision;
  /** The acting person's email, from the verified token. Never from a payload. */
  readonly decidedBy: string;
  /** `kind` on the parent request. Only a `tool` request takes these verbs. */
  readonly requestKind: string;
  /** The parent's current status. Only an undecided request can be decided. */
  readonly requestStatus: string;
  /** Who filed it. The intern proposes; the intern must not approve. */
  readonly proposedByIdentity: string;
  /** From `resolveRecordedHumans`. Empty is refused as its own reason, never as a pass. */
  readonly recordedHumans: ReadonlyArray<string>;
  /**
   * Who may settle a tool grant. CONFIGURATION, not a literal: Ali's ruling says "for now", and a
   * hardcoded identity is how a temporary decision becomes permanent.
   */
  readonly approverSet: ReadonlyArray<string>;
  /** Tool names the catalog really has, for `assign_existing_tool`. */
  readonly knownToolNames?: ReadonlyArray<string>;
  /**
   * AF11.8. The options the request's own package offered, supplied by the caller from the
   * package row. Absent or empty means the request carries no package.
   *
   * Supplied rather than read, like every other roster here, so the gate stays a pure function of
   * its inputs. Unlike the other rosters, an EMPTY one is not automatically a refusal: a request
   * with no package can still be denied or sent back, which are decisions about the request
   * rather than choices among its options. It only refuses an attempt to CHOOSE A LETTER, because
   * a letter with no list behind it names nothing.
   */
  readonly offeredOptions?: ReadonlyArray<OfferedOption>;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const lower = (v: unknown): string => text(v).toLowerCase();

/** Judge a proposed decision. Returns EVERY reason it is refused, not just the first. */
export function gateToolRequestDecision(args: GateDecisionArgs): DecisionIssue[] {
  const issues: DecisionIssue[] = [];
  const { proposed } = args;

  const verb = text(proposed.verb) as ToolRequestVerb;
  const verbIsKnown = (TOOL_REQUEST_VERBS as ReadonlyArray<string>).includes(verb);
  if (!verbIsKnown) {
    issues.push({
      rule: 'verb_unknown',
      detail: `"${proposed.verb ?? ''}" is not one of ${TOOL_REQUEST_VERBS.join(', ')}.`,
    });
  }

  if (args.requestKind !== 'tool') {
    issues.push({
      rule: 'not_a_tool_request',
      detail: 'These four verbs belong to a tool request. A change request is decided the way it '
        + 'always was.',
    });
  }

  if (args.requestStatus !== 'submitted') {
    issues.push({
      rule: 'request_already_decided',
      detail: `This request is ${args.requestStatus}. A second decision does not replace the `
        + 'first; it would overwrite a record of who decided what.',
    });
  }

  // WHO. The denylist is the first of two gates and the roster is what actually establishes a
  // person, because `isNonHumanIdentity('unknown')` returns false and `unknown` is exactly what
  // the approval controller writes when it cannot resolve anybody.
  const humans = humanityCheck(args.recordedHumans);
  const decider = lower(args.decidedBy);

  if (!humans.hasRoster) {
    issues.push({
      rule: 'decider_roster_absent',
      detail: 'There is no record of who is a real person, so no decision can be attributed. '
        + 'Refusing rather than falling back to the weaker test.',
    });
  } else if (humans.isNotHuman(args.decidedBy)) {
    // One branch, two distinct reasons, because "a machine" and "a stranger" need different
    // sentences and a reader of the log needs to tell them apart.
    const machineShaped = humanityCheck([]).isNotHuman(args.decidedBy);
    issues.push(machineShaped
      ? {
        rule: 'decider_is_non_human',
        detail: `"${args.decidedBy}" is a machine identity. The four-hour auto-approve timer `
          + 'cannot settle a tool grant.',
      }
      : {
        rule: 'decider_not_recorded',
        detail: `"${args.decidedBy}" does not resolve to anybody we hold a record for.`,
      });
  }

  // Ali's ruling. A real person who is not on the approver set still may not decide this.
  const approvers = args.approverSet.map(lower).filter((a) => a.length > 0);
  if (approvers.length === 0) {
    issues.push({
      rule: 'decider_not_an_approver',
      detail: 'No approver is configured, so nobody may settle a tool grant. An empty approver '
        + 'set refuses everybody rather than permitting anybody.',
    });
  } else if (!decider || !approvers.includes(decider)) {
    issues.push({
      rule: 'decider_not_an_approver',
      detail: `"${args.decidedBy}" is not one of the configured approvers for a tool grant. `
        + 'Owner ruling, 4 Nov 2026.',
    });
  }

  // The intern proposes; the intern must not approve. Checked INDEPENDENTLY of the approver set,
  // so that widening the set later cannot accidentally let somebody approve their own request.
  if (decider && decider === lower(args.proposedByIdentity)) {
    issues.push({
      rule: 'proposer_cannot_decide',
      detail: 'The person who filed a request cannot decide it.',
    });
  }

  // WHAT EACH VERB REQUIRES.
  if (verb === 'deny' && !text(proposed.reason)) {
    issues.push({
      rule: 'deny_reason_missing',
      detail: 'A denial needs a reason. Without one the intern learns nothing and cannot appeal.',
    });
  }

  if (verb === 'send_back') {
    const field = text(proposed.missing_field);
    if (!field) {
      issues.push({
        rule: 'send_back_field_missing',
        detail: 'A send-back must name the field that is missing or too vague, so the loop is '
          + 'specific rather than "needs more detail".',
      });
    } else if (!SEND_BACK_FIELDS.includes(field)) {
      issues.push({
        rule: 'send_back_field_unknown',
        detail: `"${field}" is not a field of a tool request. Name one of: `
          + `${SEND_BACK_FIELDS.join(', ')}.`,
      });
    }
  }

  if (verb === 'assign_existing_tool') {
    const tool = text(proposed.assigned_tool_name);
    if (!tool) {
      issues.push({
        rule: 'assigned_tool_missing',
        detail: 'Assigning an existing tool must name which one.',
      });
    } else if (!(args.knownToolNames ?? []).includes(tool)) {
      issues.push({
        rule: 'assigned_tool_unknown',
        detail: `The catalog has no tool called "${tool}". A tool cannot be created from this `
          + 'screen: registration is compiled into the backend.',
      });
    }
  }

  // AF11.8 — THE ANSWER IS ONE OF THE OPTIONS THE REQUEST CARRIED ---------------------------
  //
  // Ali, 16 Nov 2026: *"make the answer for the human go with option A, B, C or Nothing."* The
  // verb stops being something chosen in the console and becomes the CONSEQUENCE of a chosen
  // option. Both are still recorded, because the log has to answer "what was decided" and "what
  // did that do" separately, and the rules below are what keep the two honest about each other.
  const chosen = text(proposed.chosen_option);
  const offered = args.offeredOptions ?? [];

  if (chosen) {
    if (!(DECISION_ANSWERS as ReadonlyArray<string>).includes(chosen)) {
      issues.push({
        rule: 'chosen_option_unknown',
        detail: `"${chosen}" is not an answer. It has to be one of: ${DECISION_ANSWERS.join(', ')}.`,
      });
    } else if (chosen !== 'nothing') {
      // A letter only means something against a list. No package, no letters.
      if (offered.length === 0) {
        issues.push({
          rule: 'option_chosen_on_a_request_with_no_package',
          detail: 'This request carries no decision package, so it offers no options to choose '
            + 'from. It can still be denied or sent back.',
        });
      } else {
        const match = offered.find((o) => text(o.key).toUpperCase() === chosen.toUpperCase());
        if (!match) {
          issues.push({
            rule: 'chosen_option_not_offered',
            detail: `This request does not offer an option ${chosen}. It offers `
              + `${offered.map((o) => text(o.key)).join(', ')}.`,
          });
        } else if (verbIsKnown && text(match.verb) !== verb) {
          // THE ONE THAT MATTERS. Choosing option B and recording `approve_to_build` when B said
          // `assign_existing_tool` would write a log in which Ali approved a build he never
          // chose. The option is what he read; the verb is only its consequence.
          issues.push({
            rule: 'chosen_option_verb_mismatch',
            detail: `Option ${chosen} is "${text(match.verb)}", but this decision records `
              + `"${verb}". The verb has to be what the chosen option said it would do.`,
          });
        }
      }
    }
  }

  // `nothing` and its answer move together, in both directions. The storage constraint
  // `chk_adtrd_nothing_is_its_own_answer` enforces the same pair, so a caller that skips this
  // contract still cannot write a row where they disagree.
  if (verb === 'nothing' && chosen !== 'nothing') {
    issues.push({
      rule: 'nothing_needs_its_own_answer',
      detail: 'Answering Nothing is recorded as Nothing. It is not a denial and carries no '
        + 'reason, because there is nothing to appeal.',
    });
  }
  // Length only. The content is Ali's judgement, and the one bound worth keeping is that a
  // standing instruction has to fit in a system prompt beside everything else that goes there.
  const standing = text(proposed.standing_instructions);
  if (standing.length > STANDING_INSTRUCTIONS_MAX) {
    issues.push({
      rule: 'standing_instructions_too_long',
      detail: `Standing instructions can be at most ${STANDING_INSTRUCTIONS_MAX} characters. `
        + 'They go in front of the agent on every run of this capability, beside everything else '
        + 'it has to hold.',
    });
  }

  if (chosen === 'nothing' && verbIsKnown && verb !== 'nothing') {
    issues.push({
      rule: 'nothing_needs_its_own_answer',
      detail: `Answering Nothing cannot also do "${verb}". Nothing means the capability comes `
        + 'off the board.',
    });
  }

  return issues;
}

export type DecisionVerdict =
  | { readonly ok: true; readonly decision: AcceptedDecision }
  | { readonly ok: false; readonly issues: DecisionIssue[] };

/**
 * Gate, then build the decision. Never partially.
 *
 * The returned record carries only what a decision IS: the verb, the person, and the words that
 * verb requires. No autonomy level, no granted tool list, no agent row — because a decision
 * object that could express those is one refactor away from performing them.
 */
export function acceptToolRequestDecision(args: GateDecisionArgs): DecisionVerdict {
  const issues = gateToolRequestDecision(args);
  if (issues.length > 0) return { ok: false, issues };

  const verb = text(args.proposed.verb) as ToolRequestVerb;
  return {
    ok: true,
    decision: {
      verb,
      decided_by_identity: text(args.decidedBy),
      reason: verb === 'deny' ? text(args.proposed.reason) : (text(args.proposed.reason) || null),
      missing_field: verb === 'send_back' ? text(args.proposed.missing_field) : null,
      assigned_tool_name: verb === 'assign_existing_tool'
        ? text(args.proposed.assigned_tool_name)
        : null,
      // AF11.8. Normalised to the uppercase letter the package uses, so `a` and `A` are one
      // answer in the log rather than two. `nothing` stays lowercase because it is a word and
      // not a label, and the storage constraint spells it that way.
      chosen_option: normalizeAnswer(args.proposed.chosen_option),
    },
  };
}

/**
 * The answer as it gets stored, or null when the decision was not made by choosing one.
 *
 * Exported so the console and the tests use the same normalisation the write does. Anything the
 * gate has already refused cannot reach here, so this is a narrowing rather than a second check.
 */
export function normalizeAnswer(value: unknown): DecisionAnswer | null {
  const v = text(value);
  if (!v) return null;
  if (v.toLowerCase() === 'nothing') return 'nothing';
  const upper = v.toUpperCase();
  return (DECISION_ANSWERS as ReadonlyArray<string>).includes(upper)
    ? (upper as DecisionAnswer)
    : null;
}

/**
 * What a verb means for the parent request's status.
 *
 * `send_back` deliberately leaves it `submitted`: the request is still live and the intern is
 * expected to edit it, which is the whole point of sending it back rather than denying it.
 * Expressed here rather than at the call site so there is one answer to "what does this verb do
 * to the row".
 */
export function statusAfter(verb: ToolRequestVerb): 'submitted' | 'approved' | 'declined' {
  switch (verb) {
    case 'deny': return 'declined';
    // AF11.8. Nothing SETTLES the request — the capability comes off the board — so the parent
    // leaves `submitted`, the same as a denial. What distinguishes the two is not the parent's
    // status but the decision row: `deny` carries a reason and `nothing` carries none, and
    // `declined_reason` on the parent stays null here for exactly that reason. A reader asking
    // "can this be appealed" reads the verb, which is why the verb exists.
    case 'nothing': return 'declined';
    case 'send_back': return 'submitted';
    case 'approve_to_build':
    case 'assign_existing_tool':
      return 'approved';
    default:
      // FAIL CLOSED. This used to be `default: return 'approved'` with the two approving verbs
      // falling through to it, which meant any verb added later silently APPROVED the request —
      // and AF11.8 added one. Leaving it `submitted` grants nothing and settles nothing, so a
      // verb somebody forgets to map here shows up as a request that will not close rather than
      // as a grant nobody made.
      return 'submitted';
  }
}
