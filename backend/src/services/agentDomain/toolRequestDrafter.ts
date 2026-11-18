/**
 * toolRequestDrafter — AF11.12. The prompt that writes a tool request, and the normalizer that
 * turns what comes back into the shape the contract already accepts. PURE, no I/O.
 *
 * Ali told seven builders on the internship call of 17 Nov 2026: *"Click a button, and then it
 * fills out the whole request for you. And then you look at it and say, oh, yeah, this would be
 * cool, or no, go ahead and do another one, try a different one."* And, for the case where the
 * builder has no particular idea yet: *"Or you'll be able to just ask the AI to come up with one
 * randomly."* Those are the two modes below.
 *
 * ## THE DRAFTER IS NOT A SECOND DEFINITION OF "COMPLETE"
 *
 * This is the rule that shapes everything here. `toolRequestContract.ts` says presence is decided
 * in exactly one place, and `ToolRequestForm.tsx` already refuses to re-implement it, because two
 * definitions drift and the one the tests assert stops being the one the API enforces.
 *
 * A drafter is the most tempting place to break that rule: it would be easy to teach the prompt
 * which fields are mandatory, and that knowledge would be a second copy of the contract's own
 * rules, kept in prose, in a file nobody re-reads when a rule changes.
 *
 * So the prompt is built FROM `TOOL_REQUEST_DETAIL_FIELDS`, the contract's own runtime list, and
 * the field list is pinned to the interface at compile time. The prompt describes what each field
 * MEANS; it never says which are required. If a drafted request is missing something, the server
 * refuses it with the same named refusal a hand-typed one gets, and the builder fixes it in the
 * form. A draft that is refused is working as designed.
 *
 * ## A DRAFT IS A SUGGESTION, NOT A SUBMISSION
 *
 * Nothing here submits anything. The route returns a body, the form loads it into editable fields,
 * and the builder presses the same submit button they always did. Ali's own description of the
 * loop has the human reading it and asking for another one, which only works if the draft stops at
 * the form.
 *
 * ## WHY THE NORMALIZER DROPS UNKNOWN KEYS RATHER THAN PASSING THEM THROUGH
 *
 * A model asked for JSON will occasionally invent a neighbouring field. Forwarding it would push
 * an unknown key into the filing route, and `ToolRequestDetailInput` has no index signature, so
 * the failure would surface somewhere downstream rather than here. Unknown keys are dropped
 * silently and known keys are coerced to the type the contract declares, which means the drafter
 * can only ever produce a shape the contract can read.
 *
 * Three fields are optional but NOT nullable — the trap AF11.11 hit and documented. `writes`,
 * `reversible` and the narrative fields must be absent rather than null when unknown, so the
 * normalizer omits a key it cannot resolve instead of writing `null` into it.
 */
import {
  TOOL_REQUEST_DETAIL_FIELDS,
  type ToolRequestDetailField,
  type ToolRequestDetailInput,
} from './toolRequestContract';
import {
  TOOL_ENVIRONMENTS,
  TOOL_PRODUCT_STATES,
  TOOL_RUN_FREQUENCIES,
} from '../../db/ensureAgentDomainToolRequestSchema';

/** The rosters and vocabularies a draft must be written against, supplied by the caller. */
export interface DraftContext {
  /** The domain the request will be filed in. Already ownership-checked by the caller. */
  readonly domainKey: string;
  /** The agent the request is for, or null when the domain has no employee yet. */
  readonly agentId: string | null;
  readonly agentDisplayName: string | null;
  /** Capability ids the gate will accept, with their names so the model can choose meaningfully. */
  readonly capabilities: ReadonlyArray<{ capability_id: string; name: string }>;
  /** Dataset names in the catalog. The gate refuses an entry that is not one of these. */
  readonly datasets: ReadonlyArray<string>;
  /** Actor emails. `acts_on_output` must be one of these or the gate refuses it by name. */
  readonly actors: ReadonlyArray<string>;
}

/**
 * What each field is asking for, in the contract's own vocabulary.
 *
 * Deliberately a description of MEANING and never of necessity. Keyed by the contract's field
 * type, so a field added to the contract and not described here is a compile error rather than a
 * field the prompt quietly omits.
 */
const FIELD_GUIDE: Record<ToolRequestDetailField, string> = {
  agent_id: 'The agent asking. Supplied by the system; echo the value given and never invent one.',
  tool_name: 'Short lowercase identifier for the tool, words joined by underscores.',
  purpose: 'One or two sentences on what the tool is for, in the catalog\'s vocabulary.',
  reads: 'What it reads, as prose in the catalog\'s vocabulary. May be a repository, a file tree, a vendor API, not only tables.',
  produces: 'What it produces. May legitimately be empty for a read-only lookup.',
  read_datasets: 'Catalogued dataset names it reads, chosen ONLY from the list supplied. Empty is a valid answer and is the right one when it reads nothing relational.',
  capability_id: 'The capability this serves, chosen ONLY from the list supplied.',
  task_unblocked: 'The specific task that becomes possible, stated concretely.',
  task_key: 'A short lowercase slug naming that task, 3 to 48 characters, letters numbers and '
    + 'underscores. The SAME key goes on every tool this task needs, so one task of three tools '
    + 'is three requests sharing one key.',
  manual_today: 'How this is done today by hand, including roughly how long it takes.',
  acts_on_output: 'The email of the person who acts on the output. Chosen ONLY from the actor list supplied.',
  judged_threshold: 'The number that decides whether this worked.',
  judged_measured_from: 'Where that number is read from.',
  tried_in_product: `One of: ${TOOL_PRODUCT_STATES.join(', ')}. Use not_built unless the product genuinely already does this.`,
  missing_from_product: 'What the product cannot do today that makes this necessary.',
  needed_by: 'An ISO date, YYYY-MM-DD.',
  run_frequency: `One of: ${TOOL_RUN_FREQUENCIES.join(', ')}.`,
  touches: 'The blast radius: the systems or data a run could affect. This is the thing being approved.',
  environment: `One of: ${TOOL_ENVIRONMENTS.join(', ')}. Prefer sandbox for a first request.`,
  inputs: 'Arguments a run takes. An empty list is a real answer for "read today\'s snapshot".',
  writes: 'true if a run changes anything at all, false if it only reads.',
  side_effects: 'What a run changes beyond its own output. Null when it changes nothing.',
  reversible: 'true if the effect can be undone, false if it cannot.',
  reversibility_note: 'How it would be undone, or why it cannot be.',
};

const SYSTEM = [
  'You draft tool requests for AI agents inside an internal platform.',
  'A tool request explains why an agent needs a capability, what it would touch, and how anyone would know it worked.',
  'You are writing a FIRST DRAFT that a human will read and edit. Be concrete and specific.',
  'Prefer a small, single-purpose tool: one task, one tool. Do not propose something sweeping.',
  'Never invent a capability id, a dataset name or an email address. Choose only from the lists given.',
  'Respond with a single JSON object and nothing else.',
].join(' ');

/** The two modes, as Ali described them. */
export type DraftMode = 'from_intent' | 'suggest';

export interface DraftRequestArgs {
  readonly mode: DraftMode;
  /** The builder's own sentence. Required for `from_intent`, ignored for `suggest`. */
  readonly intent?: string | null;
  readonly context: DraftContext;
  /**
   * The decision verbs an option may carry, supplied by the caller rather than written here.
   * Same rule as the rosters: the vocabulary the gate will check against is the one the prompt
   * offers, or the drafter confidently produces options the gate then refuses.
   */
  readonly verbs?: ReadonlyArray<string>;
}

export interface ChatMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

function fieldBlock(): string {
  return TOOL_REQUEST_DETAIL_FIELDS
    .map((f) => `- ${f}: ${FIELD_GUIDE[f]}`)
    .join('\n');
}

function listBlock(label: string, values: ReadonlyArray<string>, empty: string): string {
  if (values.length === 0) return `${label}: ${empty}`;
  return `${label}:\n${values.map((v) => `- ${v}`).join('\n')}`;
}

/**
 * Build the messages. PURE: same inputs, same output, so the prompt itself is testable without a
 * network call and a field added to the contract provably reaches it.
 */
export function buildDraftMessages(args: DraftRequestArgs): ChatMessage[] {
  const { context: c } = args;

  const ask = args.mode === 'suggest'
    ? [
      'Propose ONE tool this agent plausibly needs, chosen from the capabilities listed below.',
      'Pick the capability whose work is most obviously manual today, and draft the request for it.',
    ].join(' ')
    : `The builder asked for this, in their own words: "${(args.intent || '').trim()}"`;

  const user = [
    ask,
    '',
    `Domain: ${c.domainKey}`,
    c.agentDisplayName ? `Agent: ${c.agentDisplayName}` : 'Agent: (this domain has no agent yet)',
    c.agentId ? `agent_id to echo: ${c.agentId}` : 'agent_id: omit it, there is no agent',
    '',
    listBlock('Capabilities you may choose from (use the id)',
      c.capabilities.map((x) => `${x.capability_id} - ${x.name}`),
      'none available, omit capability_id'),
    '',
    listBlock('Dataset names you may use in read_datasets', c.datasets,
      'none catalogued, use an empty list'),
    '',
    listBlock('Emails you may use for acts_on_output', c.actors,
      'none available, omit acts_on_output'),
    '',
    'Return a JSON object with exactly two keys: "tool_request" and "decision_package".',
    '',
    '"tool_request" has these keys, and no others:',
    fieldBlock(),
    '',
    packageBlock(args.verbs ?? []),
  ].join('\n');

  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }];
}

const STRING_FIELDS = new Set<ToolRequestDetailField>([
  'agent_id', 'tool_name', 'purpose', 'capability_id', 'task_unblocked', 'task_key', 'manual_today',
  'acts_on_output', 'judged_threshold', 'judged_measured_from', 'tried_in_product',
  'missing_from_product', 'needed_by', 'run_frequency', 'environment', 'side_effects',
  'reversibility_note',
]);
const LIST_FIELDS = new Set<ToolRequestDetailField>([
  'reads', 'produces', 'read_datasets', 'touches', 'inputs',
]);
const BOOL_FIELDS = new Set<ToolRequestDetailField>(['writes', 'reversible']);

/**
 * Coerce whatever came back into the contract's shape, dropping anything it does not recognize.
 *
 * A key is OMITTED rather than set to null when its value cannot be resolved. Three fields are
 * optional-but-not-nullable in the schema, and sending an explicit null is a shape error that
 * refuses the whole request with a message about a field the builder was never shown — the exact
 * bug AF11.11 caught before it shipped.
 */
export function normalizeDraft(raw: unknown): ToolRequestDetailInput {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out as ToolRequestDetailInput;
  const src = raw as Record<string, unknown>;

  for (const field of TOOL_REQUEST_DETAIL_FIELDS) {
    if (!(field in src)) continue;
    const v = src[field];

    if (LIST_FIELDS.has(field)) {
      // A declared-but-empty list is a real answer, so an empty array is kept.
      if (!Array.isArray(v)) continue;
      out[field] = v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
      continue;
    }

    if (BOOL_FIELDS.has(field)) {
      if (typeof v === 'boolean') out[field] = v;
      continue;
    }

    if (STRING_FIELDS.has(field)) {
      if (typeof v !== 'string') continue;
      const t = v.trim();
      if (t.length > 0) out[field] = t;
      continue;
    }
  }

  return out as ToolRequestDetailInput;
}

/**
 * AF11.13 — THE ONE BLOCK THE DRAFTER MUST NOT WRITE.
 *
 * `simulated_action`, `simulated_against` and `simulated_at` are the record of a run that actually
 * happened against real past data, shown so the result is visible BEFORE a grant exists. A model
 * asked to fill them in will produce a fluent description of a run nobody performed, and that is
 * fabricated evidence sitting in the one block whose entire job is to be evidence.
 *
 * So the drafter leaves them empty. The package is then legitimately not ready for a human, the
 * readiness gate says so by name, and somebody has to go and actually run the thing. That refusal
 * is the feature working, not an edge case to code around.
 */
export const BLOCKS_THE_DRAFTER_MUST_NOT_WRITE = [
  'simulated_action', 'simulated_against', 'simulated_at',
] as const;

/** What a drafted package may contain: the eight blocks that are argument rather than evidence. */
const PACKAGE_GUIDE: ReadonlyArray<[string, string]> = [
  ['executive_summary', 'Three sentences: what is being asked, what it costs, what happens if you say nothing.'],
  ['problem', 'The problem as a cost being paid TODAY, not as an idea. Name the hours or the misses.'],
  ['key_findings', 'A list of {finding, source}. Each finding measured, each source saying where the number came from. Never invent a number: if you have none, say what is not known and give the source as the place it would be found.'],
  ['options', 'At least two real ones, as {key, summary, what_happens, verb}. key is A, B or C. "Do it" and "do not" is not two options. Name the cheap one as cheap.'],
  ['recommendation', 'The key of one option: A, B or C. Nothing else.'],
  ['recommendation_reason', 'One sentence saying why that one.'],
  ['impact', 'What changes if it works, in hours, dollars or risk, and who notices.'],
  ['risk_can_break', 'A list of what this can break.'],
  ['risk_cannot_break', 'A list of what it is incapable of breaking. This is what makes the risk bounded rather than vague.'],
  ['steps_that_follow', 'The ordered steps after a yes, written BEFORE the decision so a yes is a yes to a known sequence.'],
];

/**
 * The package half of the prompt.
 *
 * Built as a separate block of the same single request rather than a second model call: the
 * argument should be reasoned from the same material as the request, and two calls would let the
 * two disagree about what is being asked for.
 */
function packageBlock(verbs: ReadonlyArray<string>): string {
  return [
    'Also write the case for deciding it, as "decision_package", with these keys:',
    ...PACKAGE_GUIDE.map(([k, v]) => `- ${k}: ${v}`),
    '',
    `The "verb" on each option must be one of: ${verbs.join(', ')}.`,
    '',
    'DO NOT write simulated_action, simulated_against or simulated_at. Those record a run that '
    + 'really happened against real data, and you have not run anything. Leave them out entirely. '
    + 'A human will run it and fill them in.',
  ].join('\n');
}

/**
 * Coerce a drafted package into the shape the package contract reads, and STRIP the evidence
 * blocks whatever the model did.
 *
 * The prompt tells it not to write them. This enforces it, because a prompt is a request and a
 * normalizer is a guarantee, and the thing being guaranteed is that no fabricated simulation ever
 * reaches the row. If the model writes one anyway it is dropped here without comment.
 */
export function normalizePackageDraft(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;

  const str = (k: string) => {
    const v = src[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  };
  const strList = (k: string) => {
    const v = src[k];
    if (!Array.isArray(v)) return;
    out[k] = v.filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim()).filter((x) => x.length > 0);
  };

  str('executive_summary');
  str('problem');
  str('recommendation');
  str('recommendation_reason');
  str('impact');
  strList('risk_can_break');
  strList('risk_cannot_break');
  strList('steps_that_follow');

  if (Array.isArray(src.key_findings)) {
    out.key_findings = src.key_findings
      .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
      .map((f) => ({
        finding: typeof f.finding === 'string' ? f.finding.trim() : '',
        source: typeof f.source === 'string' ? f.source.trim() : '',
      }))
      .filter((f) => f.finding.length > 0);
  }

  if (Array.isArray(src.options)) {
    out.options = src.options
      .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object')
      .map((o) => ({
        key: typeof o.key === 'string' ? o.key.trim().toUpperCase() : '',
        summary: typeof o.summary === 'string' ? o.summary.trim() : '',
        what_happens: typeof o.what_happens === 'string' ? o.what_happens.trim() : '',
        verb: typeof o.verb === 'string' ? o.verb.trim() : '',
      }))
      .filter((o) => o.key.length > 0);
  }

  // The guarantee. Never carried through, no matter what came back.
  for (const blocked of BLOCKS_THE_DRAFTER_MUST_NOT_WRITE) delete out[blocked];

  return out;
}

/**
 * A title for the parent change request, since a tool request is filed on one.
 *
 * Derived from the draft rather than asked for separately: the contract has no `title` field, and
 * adding one to the prompt would put a field in the drafter that the contract does not have.
 */
export function draftTitle(detail: ToolRequestDetailInput, max: number): string {
  const name = (detail.tool_name || '').trim();
  const purpose = (detail.purpose || '').trim();
  const base = name && purpose ? `${name}: ${purpose}` : name || purpose || 'Tool request';
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
}
