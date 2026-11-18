/**
 * capabilityInstructionContract — AF11.14. What a set of standing instructions must satisfy
 * before it is recorded, and what "in force" means. PURE, no I/O.
 *
 * Ali, 16 Nov 2026: *"when approving the functionality, I should be able to add my details of how
 * the agent should work and respond."*
 *
 * ## WHY THIS IS A CONTRACT AND NOT A LENGTH CHECK
 *
 * The grant is what the agent is HANDED. A rule that is not in the grant is not in what the agent
 * received, so "never publish without a person" written in a Basecamp comment is a note about a
 * constraint rather than a constraint. That is the whole point of the feature, and it means the
 * failure mode worth refusing is not a long string: it is an instruction that was recorded
 * against nobody, or against a capability that does not exist, and therefore reaches no agent
 * while looking on screen exactly like one that does.
 *
 * Every refusal is NAMED, in the same `{ rule, detail }` shape the rest of this subtree uses, so
 * one portal renderer handles them and the rule codes are stable for tests.
 *
 * ## CLEARED IS A VALUE, NOT AN ABSENCE
 *
 * An empty instruction is allowed and means "these were deliberately removed". It is recorded as
 * a row with an author and a timestamp, because the fact that a rule used to be in force and was
 * taken away is worth more than the silence that would replace it. `isCleared` is the reader for
 * that state; `NO_INSTRUCTIONS_RECORDED` is the different state where nobody ever set any.
 */

export interface InstructionIssue {
  readonly rule: string;
  readonly detail: string;
}

export type InstructionRefusal =
  | 'instructions_too_long'
  | 'instruction_actor_missing'
  | 'instruction_capability_missing'
  | 'instruction_agent_missing';

/**
 * The ceiling. Generous, because this is a standing brief and not a label, and because a limit
 * that bites is a limit somebody works around by writing the real rule somewhere the agent
 * cannot read.
 */
export const INSTRUCTIONS_MAX = 8000;

export interface InstructionInput {
  readonly agentId?: string | null;
  readonly capabilityId?: string | null;
  readonly instructions?: string | null;
  readonly setByIdentity?: string | null;
}

export interface AcceptedInstruction {
  readonly agentId: string;
  readonly capabilityId: string;
  /** Trimmed. May be the empty string, which means cleared. */
  readonly instructions: string;
  readonly setByIdentity: string;
}

export type InstructionVerdict =
  | { readonly ok: true; readonly value: AcceptedInstruction }
  | { readonly ok: false; readonly issues: ReadonlyArray<InstructionIssue> };

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Accept or refuse, naming every problem rather than the first.
 *
 * The actor is taken from the VERIFIED caller by the route and passed in, never read from the
 * request body — the same rule `toolRequestConversationRoutes.ts` states for message authorship.
 * It is still checked here, because a contract that trusts its caller is a contract that stops
 * being a contract the first time a new caller appears.
 */
export function acceptInstruction(input: InstructionInput): InstructionVerdict {
  const issues: InstructionIssue[] = [];

  const agentId = text(input.agentId);
  const capabilityId = text(input.capabilityId);
  const setByIdentity = text(input.setByIdentity);
  // NOT trimmed to empty and then rejected: empty is legal and means cleared.
  const instructions = typeof input.instructions === 'string' ? input.instructions.trim() : '';

  if (!agentId) {
    issues.push({
      rule: 'instruction_agent_missing',
      detail: 'Instructions have to be about a particular agent.',
    });
  }
  if (!capabilityId) {
    issues.push({
      rule: 'instruction_capability_missing',
      detail: 'Instructions attach to a capability, so name which one.',
    });
  }
  if (!setByIdentity) {
    issues.push({
      rule: 'instruction_actor_missing',
      // This refusal exists because an unattributed instruction changes production behaviour with
      // nobody on record as having asked for it.
      detail: 'We could not tell who is setting these, so they were not recorded.',
    });
  }
  if (instructions.length > INSTRUCTIONS_MAX) {
    issues.push({
      rule: 'instructions_too_long',
      detail: `Keep standing instructions under ${INSTRUCTIONS_MAX} characters. `
        + `That is ${instructions.length}.`,
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { agentId, capabilityId, instructions, setByIdentity } };
}

/** One recorded entry, as stored. */
export interface InstructionEntry {
  readonly instructions: string;
  readonly set_by_identity: string;
  readonly created_at: string;
}

/**
 * What is in force, given the log for one capability, newest first.
 *
 * Three states, and collapsing any two of them loses something a reader needs:
 *
 *   - `null` — nobody has ever set instructions. The agent is under no standing brief.
 *   - a CLEARED entry — somebody removed them, and we can say who and when.
 *   - an entry with text — that text is in force.
 */
export function inForce(entries: ReadonlyArray<InstructionEntry>): InstructionEntry | null {
  return entries.length > 0 ? entries[0] : null;
}

/** True when the latest entry deliberately removed the instructions. */
export function isCleared(entry: InstructionEntry | null): boolean {
  return entry !== null && entry.instructions.trim().length === 0;
}

/**
 * The sentence a surface shows when there is no standing brief, said so that "nobody set any"
 * never reads as "none apply".
 */
export const NO_INSTRUCTIONS_RECORDED =
  'No standing instructions have been set for this capability.';

export const INSTRUCTIONS_CLEARED =
  'The standing instructions for this capability were removed.';
