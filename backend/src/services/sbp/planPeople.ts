/**
 * planPeople — who a plan names: the roles its stories serve, and who (if anyone)
 * can let a guardrail through.
 *
 * Its own module because two stages need the same answer: `scopeAgents` decides
 * which guardrails make an agent wait for a person, and `planDocument` tells the
 * student's Command Center which guardrails are approvals. Two copies of that
 * judgement would disagree the first time one of them changed. PURE: no I/O.
 */
import type { PlanAgent, PlanStory } from './planContract';

/**
 * Roles the student's own stories are written for ("As a <role>, I want …").
 *
 * A named person counts too: a plan grounded in the student's words writes
 * "As Dana, I want …", and ShiftFill's Command Center left Dana, the person
 * five stories serve, off its Users tab because only "As a/an" matched.
 * The system itself is not a role, however it is spelled.
 */
export function rolesFrom(stories: readonly PlanStory[]): string[] {
  const roles = stories
    .map((s) => s.narrative.match(/^\s*As\s+(?:an?\s+|the\s+)?([^,]{2,40}),/i)?.[1]?.trim())
    .filter((x): x is string => Boolean(x))
    .filter((r) => !/^(?:the\s+)?(?:system|platform|agent|ai)$/i.test(r));
  return [...new Set(roles)].slice(0, 12);
}

export type GuardrailKind = 'approval' | 'hard_rule';

const APPROVAL_WORDS = /\b(?:approv\w*|review\w*|sign(?:s|ed)?[\s-]?off|confirm\w*|authori[sz]\w*)\b/i;
/** A capitalised name right after the word that hands the decision to someone. */
const NAMED_APPROVER = /\b(?:by|for|without|until|from|unless)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/;

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Does a guardrail have a person who can let it through, and who?
 *
 * "Never offer a shift past 40 hours without Dana approving overtime" is an
 * approval point with an approver; "never text a hygienist on approved leave"
 * is a hard rule that nobody overrides, and "approved" there describes the
 * leave, not a gate. A Command Center that showed both as approval gates with
 * the approver blank (ShiftFill, 2026-11-20) was asking a question the plan had
 * already answered. Read from the statement only; a role is preferred over a
 * guess so "the scheduler" wins when it is named.
 */
export function guardrailGate(statement: string, roles: readonly string[]): { kind: GuardrailKind; approver: string | null } {
  // "approved leave" / "approved list": an adjective about something else.
  const gateText = statement.replace(/\bapproved\s+(?!by\b)\w+/gi, '');
  if (!APPROVAL_WORDS.test(gateText)) return { kind: 'hard_rule', approver: null };
  const lower = statement.toLowerCase();
  const role = roles.find((r) => new RegExp(`\\b${escapeRegex(r.toLowerCase())}\\b`).test(lower));
  const named = statement.match(NAMED_APPROVER)?.[1] ?? null;
  return { kind: 'approval', approver: role ?? named };
}

const NAMED = /^\s*As\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),/;
const TITLED = /^\s*As\s+(an?|the)\s+([^,]{2,40}),/i;
const SYSTEM_ROLE = /^(?:system|platform|agent|ai)$/i;

/**
 * One person, one name: when the stories serve a named person and one of them
 * swaps in a job title the student never used, the title becomes the person.
 *
 * ShiftFill v4 (2026-11-20): seventeen stories said "As Dana" and STORY-017
 * said "As a scheduler, … alert the scheduler". Nobody in the student's words
 * is a scheduler, so the Command Center listed a third user who does not exist
 * and an escalation path to nobody. The story prompt already asks for this;
 * the model did not do it in one release of five, so it is enforced here.
 *
 * Deliberately narrow:
 *  - only when the stories name exactly ONE person (two named people means a
 *    title could belong to either, and guessing would be inventing);
 *  - only for a title that appears NOWHERE in `sourceText` (the student's brief
 *    and the requirements). "As a hygienist" survives because hygienists are in
 *    the student's words; a title the student used is a real role;
 *  - "As a system" / "As the platform" is not a user and also becomes the
 *    person, since the system cannot want anything.
 * PURE. Stories it does not change come back as the same objects.
 */
export function adoptNamedPerson(stories: readonly PlanStory[], sourceText: string): PlanStory[] {
  const names = new Set(stories.map((s) => s.narrative.match(NAMED)?.[1]).filter((x): x is string => Boolean(x)));
  if (names.size !== 1) return [...stories];
  const person = [...names][0];
  const source = sourceText.toLowerCase();
  return stories.map((s) => {
    const m = s.narrative.match(TITLED);
    if (!m) return s;
    const title = m[2].trim();
    const singular = title.toLowerCase().replace(/s$/, '');
    if (!SYSTEM_ROLE.test(title) && new RegExp(`\\b${escapeRegex(singular)}`).test(source)) return s;
    const anyTitle = new RegExp(`\\b(?:an?|the)\\s+${escapeRegex(title)}\\b`, 'gi');
    const swap = (t: string) => t.replace(anyTitle, person);
    return {
      ...s,
      narrative: s.narrative.replace(TITLED, `As ${person},`),
      title: swap(s.title),
      acceptance: s.acceptance.map(swap),
      failure_paths: (s.failure_paths ?? []).map(swap),
      task_guidance: swap(s.task_guidance ?? ''),
    };
  });
}

/**
 * Move hard rules out of an agent's `approval_gates` into `hard_rules`.
 *
 * Gates are stored as "REQ-008 — <statement>", so the statement is what follows
 * the first dash. Never touches `autonomy_level`: an agent that waited for a
 * person keeps waiting until someone decides otherwise, because raising an
 * agent's autonomy is not a call a renderer gets to make. Returns new objects;
 * an agent with nothing to move comes back unchanged.
 */
export function separateHardRules(agents: readonly PlanAgent[], roles: readonly string[]): PlanAgent[] {
  return agents.map((a) => {
    const gates = a.approval_gates ?? [];
    const statementOf = (g: string) => g.split(/\s[—–-]\s/).slice(1).join(' — ') || g;
    const moved = gates.filter((g) => guardrailGate(statementOf(g), roles).kind === 'hard_rule');
    if (!moved.length) return a;
    const rules = [...new Set([...(a.hard_rules ?? []), ...moved])];
    return { ...a, approval_gates: gates.filter((g) => !moved.includes(g)), hard_rules: rules };
  });
}
