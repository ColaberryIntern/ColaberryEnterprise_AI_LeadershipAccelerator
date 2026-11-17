/**
 * toolRequestContract — AF11.1. What a tool request must say before anybody is asked to decide it.
 * PURE, no I/O.
 *
 * Ali, 3 Nov 2026: *"the tool request needs to be much more extensive. I should have all the
 * details to understand the who what when where how as it pertains to what they need the tool
 * for."* The six groups below are that sentence turned into a contract. Each field is here because
 * its absence forces a question back to the intern at the exact moment the approver is deciding
 * whether an agent may start acting on real systems.
 *
 * ## Every refusal is NAMED
 *
 * `gateToolRequest` returns `{ rule, detail }` issues, the same shape
 * `gateAgentChangeRequest` returns, so one portal renderer handles both and the rule code is
 * stable for tests. A generic 400 tells an intern their request was rejected; a rule code and a
 * sentence tell them which field to go and fill in.
 *
 * ## The rosters are SUPPLIED BY THE CALLER, and an absent roster is a refusal
 *
 * `knownCapabilityIds` and `ownedAgentIds` come in as arguments rather than being read here. That
 * keeps this module pure and testable, and it copies the rule `agentChangeRequest.ts` arrived at
 * the hard way: *"the approver must appear on a roster the CALLER supplies from its own records. An
 * absent roster is a refusal, never a pass."* An empty roster here is `capability_roster_absent` or
 * `agent_roster_absent` — never a silent accept, which is how a check becomes decorative while its
 * tests stay green.
 *
 * ## Where the capability reference resolves, which is not where it looks like it resolves
 *
 * The 443 capabilities are JSON FILES under `services/agentDomain/capabilities/`, loaded by
 * `capabilityRecord.ts`. `models/Capability.ts` is a DIFFERENT table — the BPOS and student-project
 * one, keyed on `project_id`, with no draft-or-confirmed pair anywhere in its three status columns.
 * Resolving a tool request against that table would be a wrong-table error that still passes a
 * test. The caller passes ids from `allCapabilities()`; a test pins that.
 *
 * ## Two rules deliberately NOT written, because the data says they would be false
 *
 *   - **`produces` is not required to be non-empty.** Several real registered tools legitimately
 *     produce nothing — `TOOL_CAPABILITIES` in `services/reese/agentToolCapabilities.ts` has
 *     `produces: []` on four of them, all read-only lookups. Requiring it would refuse requests
 *     for tools the catalog already contains. The rule that IS enforced is that a tool must read
 *     something or produce something, because one that does neither does nothing.
 *   - **`inputs` is not required to be non-empty either**, for the same reason: "read today's
 *     snapshot" needs no arguments. What IS required is that the field be DECLARED. An empty array
 *     is an answer; an absent key is a question nobody asked.
 *
 * ## The dataset scope, added 14 Nov 2026, and why it is a NEW FIELD rather than a stricter `reads`
 *
 * Ali: *"there are a lot of agents that will need access to certain data. They will need to get
 * access to it, see it, understand and build based on that data. How can we add this to our tool
 * proposal process to make it much easier to request data sets that they need for their tools."*
 * His rule for the scope itself was that **sandbox-wide read is fine, and only production has to
 * be narrowed**.
 *
 * The obvious implementation is to require every `reads` entry to name a catalogued dataset. That
 * would be wrong, and the production data says so: of the 118 distinct read verbs declared across
 * the capability records, **24% are not relational at all** — the repository, a file tree, a
 * headless browser, a vendor API. Tightening `reads` would refuse correct requests for tools the
 * catalog already contains, which is exactly the failure the two unwritten rules above avoid.
 *
 * So `reads` keeps its meaning — prose, in the catalog's own vocabulary — and `read_datasets`
 * arrives beside it carrying the picker's output: names that exist in `dataset_registry`. Two
 * fields, because they answer two questions, and a single field that tried to answer both would
 * have to be loose enough to accept "the repo" and strict enough to reject `leadz`.
 *
 * The rules, in order of how often they will fire:
 *
 *   - `read_datasets` must be DECLARED in both environments, empty or not. Same reason as `inputs`.
 *   - Every entry must be in the catalog, in BOTH environments. `leadz` is a typo on sandbox too,
 *     and accepting it there would mean the first time anybody finds out is the production request.
 *   - On PRODUCTION only, a request that reads something must say which datasets. This is the half
 *     of Ali's rule that has teeth: sandbox grants are wide on purpose, production ones are not.
 *
 * ## `environment` had to be invented before any of that could be checked
 *
 * A tool request had no environment field. The closest candidate was `touches`, the free-text
 * blast-radius list, and keying a grant rule off prose would mean the rule's answer depended on
 * how somebody phrased a line. `TOOL_ENVIRONMENTS` in the schema module is the enum; it is a risk
 * input, like `run_frequency`, not a note.
 *
 * Both tables this change touches were EMPTY in production when it was written — zero tool request
 * details, zero grants — so a newly required field refuses no request anybody has filed.
 *
 * ## AF11.7 — the three questions this contract did not ask, and the one-tool rule
 *
 * Everything above answers *who, what, what for, when, where and how*. It does not answer **whether
 * the thing should be built at all**, and that is the gap Ali named on 16 Nov 2026, looking at the
 * design-token drift capability sitting live on seven builders' boards:
 *
 * > *"what good is judging 50 colors and why are we judging them - are we replacing them? What's
 * > the goal here - it's not clearly defined... That sounds like a waste of time. Also I need to
 * > approve these functionalities because I'm seeing that people are proposing things we don't even
 * > need."*
 *
 * Measured against main on 16 Nov 2026, that capability would list 1,571 distinct colors outside
 * the approved palette across 3,088 styled files. It passed every field above. It had no named
 * reader, no threshold, and a product feature nobody had tried. Three fields close that, and each
 * one is here because its absence is what let that capability through:
 *
 *   1. **`acts_on_output`** — the PERSON, resolved against a roster the caller supplies.
 *      `task_unblocked` already names the work, and work can sit unowned forever. See
 *      `actorRoster.ts` for why free text and roles are both refused.
 *
 *   2. **`judged_threshold` and `judged_measured_from`** — a number, and the thing the system
 *      ALREADY records that will produce it. Ali's worked example for the landing-page capability:
 *      *"a draft is good if Sohail publishes it with fewer than three edits, target 7 of the next
 *      10"* — measurable from the revision count `landingPageRoutes.ts` already stores.
 *
 *   3. **`tried_in_product`** — has the builder done this by hand, in the product? Three states, and
 *      the state decides the PATH rather than annotating it. Only `not_built` is a build request;
 *      the other two are refused here with the route they belong on.
 *
 * ### Why `tried_in_product` refuses rather than records
 *
 * Sarbjit's "draft a landing page from a brief" is the worked case and it is `used_by_hand`:
 * `backend/src/routes/admin/landingPageRoutes.ts` already exposes eight endpoints — create,
 * suggest-name, revise, patch, preview, publish, unpublish, list. **AF11.2's duplicate check does
 * not catch it**, because that check compares a request against REGISTERED TOOLS and this
 * capability exists as a product feature no agent has been granted. So the one check that looks
 * like it would have caught the most expensive mistake in the request path — paying to build
 * something we already own — structurally cannot.
 *
 * A field that merely recorded the answer would leave the routing to whoever read it. Refusing
 * means a request for a feature that exists cannot reach the build queue at all, and the refusal
 * carries the route: AF11.4's assign-existing-tool path for a grant, or the product itself.
 *
 * ### The one-tool rule is a RELEASE rule, not a design opinion
 *
 * Ali, 16 Nov 2026: *"The ones early just be one tool task and then after we have a good amount of
 * tools, then we can have task that can use multiple tools."* One job, one judgment, one grant to
 * unpick if it goes wrong. Several ENDPOINTS of one tool are fine and always were — what is refused
 * is a name that enumerates two tools. The detector is deliberately crude and its boundary is
 * documented at `namesMoreThanOneTool` below, because the catalog's own vocabulary is snake_case
 * (`read_learner_context`, `flag_curriculum_content_gaps`) and a separator with SPACES around it is
 * not part of it.
 */

import {
  TOOL_ENVIRONMENTS,
  TOOL_PRODUCT_STATES,
  TOOL_RUN_FREQUENCIES,
  type ToolEnvironment,
  type ToolProductState,
  type ToolRunFrequency,
} from '../../db/ensureAgentDomainToolRequestSchema';

/** Shaped exactly like `AgentChangeRequestIssue`, so one renderer serves both gates. */
export interface ToolRequestIssue {
  rule: ToolRequestRefusal;
  detail: string;
}

export type ToolRequestRefusal =
  // The pairing between a request and its detail, checked before any field is looked at
  | 'tool_request_detail_missing'
  | 'tool_request_on_a_change'
  | 'duplicate_open_request'
  // WHO
  | 'agent_missing'
  | 'agent_roster_absent'
  | 'agent_not_yours'
  | 'domain_missing'
  // WHAT
  | 'tool_name_missing'
  | 'purpose_missing'
  | 'more_than_one_tool'
  | 'reads_undeclared'
  | 'produces_undeclared'
  | 'reads_and_produces_both_empty'
  // WHO ACTS ON IT — AF11.7, field 1
  | 'acts_on_output_missing'
  | 'actor_roster_absent'
  | 'acts_on_output_not_a_person'
  // HOW IT WILL BE JUDGED — AF11.7, field 2
  | 'judged_threshold_missing'
  | 'judged_threshold_has_no_number'
  | 'judged_measured_from_missing'
  // ALREADY DONE BY HAND — AF11.7, field 3. The last two are ROUTES, not faults.
  | 'tried_in_product_missing'
  | 'tried_in_product_unknown'
  | 'feature_exists_request_a_grant'
  | 'feature_exists_use_it_first'
  | 'missing_from_product_missing'
  // WHICH DATA
  | 'read_datasets_undeclared'
  | 'dataset_roster_absent'
  | 'read_datasets_not_catalogued'
  | 'production_reads_unscoped'
  // WHAT FOR
  | 'capability_missing'
  | 'capability_roster_absent'
  | 'capability_not_found'
  | 'task_unblocked_missing'
  | 'manual_today_missing'
  // WHEN
  | 'needed_by_missing'
  | 'needed_by_not_a_date'
  | 'run_frequency_missing'
  | 'run_frequency_unknown'
  // WHERE
  | 'touches_missing'
  | 'environment_missing'
  | 'environment_unknown'
  // HOW
  | 'inputs_undeclared'
  | 'writes_undeclared'
  | 'side_effects_missing'
  | 'reversibility_undeclared';

/**
 * What arrives over the wire: every field optional, so the gate can name the missing one.
 *
 * There is no `domain_key` here on purpose. The domain is already on the parent change request,
 * where it has been ownership-checked, and accepting a second copy from the wire would let the two
 * disagree. `GateToolRequestArgs.domainKey` carries the authoritative one.
 */
export interface ToolRequestDetailInput {
  readonly agent_id?: string | null;
  readonly tool_name?: string | null;
  readonly purpose?: string | null;
  readonly reads?: ReadonlyArray<string>;
  readonly produces?: ReadonlyArray<string>;
  readonly read_datasets?: ReadonlyArray<string>;
  readonly capability_id?: string | null;
  readonly task_unblocked?: string | null;
  readonly manual_today?: string | null;
  // AF11.7. `acts_on_output` is an EMAIL, which is the identity currency every other table in this
  // subtree already uses. A second spelling of a person is a second thing to keep in agreement.
  readonly acts_on_output?: string | null;
  readonly judged_threshold?: string | null;
  readonly judged_measured_from?: string | null;
  readonly tried_in_product?: string | null;
  readonly missing_from_product?: string | null;
  readonly needed_by?: string | null;
  readonly run_frequency?: string | null;
  readonly touches?: ReadonlyArray<string>;
  readonly environment?: string | null;
  readonly inputs?: ReadonlyArray<string>;
  readonly writes?: boolean;
  readonly side_effects?: string | null;
  readonly reversible?: boolean | null;
  readonly reversibility_note?: string | null;
}

/**
 * The same thing once the gate has passed it: nothing optional that the gate required.
 *
 * `tool_name`, `reads` and `produces` carry the catalog's own field names on purpose, so a request
 * and a registered tool are described in one vocabulary and AF11.2 can compare them without a
 * translation layer. `purpose` has NO counterpart in the catalog today — `ToolCapability` is
 * `{ reads, produces }` and nothing else — so it is net-new here rather than borrowed.
 */
export interface ToolRequestDetail {
  readonly agent_id: string;
  readonly domain_key: string;
  readonly tool_name: string;
  readonly purpose: string;
  readonly reads: ReadonlyArray<string>;
  readonly produces: ReadonlyArray<string>;
  readonly read_datasets: ReadonlyArray<string>;
  readonly capability_id: string;
  readonly task_unblocked: string;
  readonly manual_today: string;
  /**
   * AF11.7. The email of the person who will act on this tool's output, in the ROSTER's spelling
   * rather than the one that was typed — so the approver reads a record rather than a guess at one.
   */
  readonly acts_on_output: string;
  readonly judged_threshold: string;
  readonly judged_measured_from: string;
  /**
   * Always `not_built` on an accepted request. The other two states are real answers and the gate
   * refuses them with the route they belong on, so a request that reaches storage has asserted that
   * the product cannot do this yet. The enum keeps all three because the GATE has to recognize all
   * three in order to route them.
   */
  readonly tried_in_product: ToolProductState;
  readonly missing_from_product: string;
  readonly needed_by: string;
  readonly run_frequency: ToolRunFrequency;
  readonly touches: ReadonlyArray<string>;
  readonly environment: ToolEnvironment;
  readonly inputs: ReadonlyArray<string>;
  readonly writes: boolean;
  readonly side_effects: string | null;
  readonly reversible: boolean | null;
  readonly reversibility_note: string | null;
}

/**
 * The two pairing refusals, as constants rather than sentences the service composes.
 *
 * They live here with the rest of the vocabulary so that every refusal an intern can receive is
 * enumerated in one file. A sentence written at the call site is a sentence no test can find.
 */
export const TOOL_REQUEST_DETAIL_MISSING: ToolRequestIssue = {
  rule: 'tool_request_detail_missing',
  detail: 'A tool request needs its details: who, what, what for, when, where and how.',
};

export const TOOL_REQUEST_ON_A_CHANGE: ToolRequestIssue = {
  rule: 'tool_request_on_a_change',
  detail: 'Those tool details belong on a tool request, not on a change request.',
};

export const DUPLICATE_OPEN_REQUEST: ToolRequestIssue = {
  rule: 'duplicate_open_request',
  detail: 'You already have a request open for that tool on that agent. '
    + 'It is waiting to be decided rather than lost.',
};

export interface GateToolRequestArgs {
  readonly detail: ToolRequestDetailInput;
  /**
   * The parent request's own `domain_key`, already checked against the requester's domains by the
   * service. Passed in rather than read off the payload so there is one copy of this fact.
   */
  readonly domainKey: string;
  /** Capability ids from `allCapabilities()`. Empty is a refusal, not a pass. */
  readonly knownCapabilityIds: ReadonlyArray<string>;
  /** `agent_id` of every domain the requester owns. Empty is a refusal, not a pass. */
  readonly ownedAgentIds: ReadonlyArray<string>;
  /**
   * Table names from `dataset_registry`, via `datasetCatalog.loadDatasetCatalog`. 633 of them in
   * production on 14 Nov 2026.
   *
   * Empty is `dataset_roster_absent` and refuses the request, the same position the other two
   * rosters take. The reason is sharper here than it looks: if an unreadable catalog waved a
   * request through, the FIRST production tool request filed during a metadata outage would be
   * the one that got an unchecked scope — a check that is decorative precisely when it matters.
   *
   * The roster is only consulted when the request actually names a dataset, so a builder filing a
   * request for a tool that reads no database is never blocked by the catalog being unavailable.
   */
  readonly knownDatasets: ReadonlyArray<string>;
  /**
   * AF11.7. Emails from `actorRoster.loadActorRoster` — 50 `admin_users` plus 37 `org_members` in
   * production on 16 Nov 2026.
   *
   * Empty is `actor_roster_absent` and refuses, the position all four rosters take here. Unlike
   * `knownDatasets` this roster is consulted WHENEVER a name is given, because every request must
   * name somebody: there is no honest version of a tool whose output nobody reads.
   */
  readonly knownActorEmails: ReadonlyArray<string>;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.map((x) => text(x)).filter((x) => x.length > 0) : null;

/** `YYYY-MM-DD`, and a real calendar day: `2026-02-31` matches the pattern and is not a date. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
function isCalendarDay(v: string): boolean {
  if (!ISO_DAY.test(v)) return false;
  const parsed = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}

/**
 * Number words, so a threshold written the way people write it is not refused.
 *
 * Ali's own worked example is *"fewer than three edits, target 7 of the next 10"* — one quantity
 * spelled and two in digits. A digits-only check would have refused the first half of the sentence
 * that defines what this field is for.
 *
 * `all`, `every` and `always` are DELIBERATELY ABSENT. They are quantifiers, not quantities, and
 * including them would wave through *"accurate all of the time"* — which is the shape of the
 * non-answer this rule exists to catch, wearing a number word.
 */
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'fifteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety', 'hundred', 'thousand', 'half', 'none',
] as const;

/**
 * Does this read as a threshold rather than an adjective?
 *
 * ## What this check actually proves, stated rather than implied
 *
 * It proves a QUANTITY is present and that the sentence says more than the quantity. That is
 * NECESSARY and it is not SUFFICIENT: *"it reads 5 tables"* contains a number and is not a
 * threshold, and no regex is going to tell the difference. The claim this function makes is the
 * narrow one, and the approver still reads the sentence.
 *
 * Why that is worth shipping anyway: the failure it closes is the one that actually happened.
 * *"The output is accurate"* is what a field like this collects when nothing stops it, and it is
 * what the design-token capability offered — a sentence that cannot be wrong, which is the same as
 * a sentence that cannot be checked. A field that refuses every answer containing no number
 * refuses that whole class, and the residue is a wrong threshold rather than no threshold, which is
 * a thing a reader can argue with.
 *
 * The three-word floor is what stops `"7"` and `"10%"` passing. A bare number names a quantity
 * without naming what is counted, so it is the same non-answer in the opposite direction.
 */
export function readsAsAThreshold(value: string): boolean {
  const v = value.trim();
  if (v.length === 0) return false;
  if (v.split(/\s+/).filter((w) => w.length > 0).length < 3) return false;
  if (/\d/.test(v)) return true;
  const words = v.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.some((w) => (NUMBER_WORDS as ReadonlyArray<string>).includes(w));
}

/**
 * Does this name more than one tool?
 *
 * ## The boundary, which is the whole design of this function
 *
 * Every separator below requires SPACES around it, or is a punctuation mark the catalog's vocabulary
 * never uses. The catalog is snake_case verb-object — `read_learner_context`,
 * `flag_curriculum_content_gaps`, `close_workforce_tickets_on_recovery` — so:
 *
 *   - `search_and_replace` PASSES. The `and` is inside an identifier, not between two names.
 *   - `"draft a page and publish it"` is REFUSED. Two verbs, two tools, one field.
 *   - `"create, revise, publish"` is REFUSED on the comma before the words matter.
 *
 * ## Why a crude detector is the right call here, and what it costs
 *
 * This is a RELEASE rule with a one-line fix, not a correctness rule. The honest failure mode is a
 * false positive on a legitimate single-tool name containing a spaced `and` — *"read and write the
 * feed"* would be refused, and arguably that is one tool. The cost of that is a rename; the cost of
 * a false negative is a multi-tool capability built in a release that cannot grant or revoke it as
 * one thing. The refusal sentence therefore says explicitly that several ENDPOINTS of one tool are
 * fine, so somebody who hit the false positive knows to rename rather than to split their request.
 *
 * Applied to `tool_name` ONLY, never to `purpose`. A purpose is prose and is supposed to mention
 * the other things a tool sits next to.
 */
export function namesMoreThanOneTool(toolName: string): boolean {
  const n = toolName.trim();
  if (n.length === 0) return false;
  // Punctuation that enumerates. None of these appear in a catalog tool name.
  if (/[,;/+&]/.test(n)) return true;
  // Conjunctions, only when they stand as their own word.
  return /\s(and|plus|then|also|as\s+well\s+as)\s/i.test(n);
}

/**
 * Judge a tool request. Returns every reason it is refused, not just the first.
 *
 * All of them, because a form that reports one missing field per round trip is how a six-group
 * request gets abandoned halfway through. The portal renders the whole list.
 */
export function gateToolRequest(args: GateToolRequestArgs): ToolRequestIssue[] {
  const { detail: d } = args;
  const issues: ToolRequestIssue[] = [];
  const add = (rule: ToolRequestRefusal, detail: string): void => { issues.push({ rule, detail }); };

  // WHO ---------------------------------------------------------------------------------------
  const agentId = text(d.agent_id);
  if (!agentId) {
    add('agent_missing', 'A tool request has to name the agent that would hold the tool.');
  } else if (args.ownedAgentIds.length === 0) {
    add(
      'agent_roster_absent',
      'We have no agents on record for you, so we could not check that this one is yours.',
    );
  } else if (!args.ownedAgentIds.some((id) => id === agentId)) {
    add('agent_not_yours', 'That agent is not one of yours.');
  }
  // Structural rather than user-facing: the service always has a domain here, because filing
  // already refused a domain that is not the requester's. The rule exists so a future caller that
  // forgets to pass one is refused instead of writing a detail row with a blank domain.
  if (!text(args.domainKey)) {
    add('domain_missing', 'A tool request has to name the domain that agent owns.');
  }

  // WHAT --------------------------------------------------------------------------------------
  const toolName = text(d.tool_name);
  if (!toolName) {
    add('tool_name_missing', 'A tool request has to name the tool.');
  } else if (namesMoreThanOneTool(toolName)) {
    // THIS RELEASE ONLY, and the sentence says so, because a rule with no reason reads as a bug.
    add(
      'more_than_one_tool',
      'Name one tool. This release builds one tool per capability, so that a grant can be given '
      + 'or taken back as one thing. Several endpoints of the SAME tool are fine. If that is what '
      + 'this is, give it a single name. A second tool goes on its own request, and both can be '
      + 'open at once.',
    );
  }
  if (!text(d.purpose)) {
    add('purpose_missing', 'Say in one sentence what this tool is for.');
  }
  const reads = list(d.reads);
  const produces = list(d.produces);
  if (reads === null) {
    add('reads_undeclared', 'List what this tool would read, even if the list is empty.');
  }
  if (produces === null) {
    add('produces_undeclared', 'List what this tool would produce, even if the list is empty.');
  }
  if (reads !== null && produces !== null && reads.length === 0 && produces.length === 0) {
    add(
      'reads_and_produces_both_empty',
      'A tool has to read something or produce something. This one declares neither.',
    );
  }

  // WHICH DATA — the picker's output, and the half of the scope a grant can actually be written
  // from. Judged BEFORE `environment` is validated, so a request with both problems is told about
  // both in one round trip rather than learning about the datasets only after fixing the enum.
  const readDatasets = list(d.read_datasets);
  if (readDatasets === null) {
    add(
      'read_datasets_undeclared',
      'List the datasets this tool would read, even if the list is empty. '
      + 'Pick them from the catalog rather than typing them, so the names match real tables.',
    );
  } else if (readDatasets.length > 0) {
    // The roster is consulted ONLY here, so an unreadable catalog cannot block a request that
    // names no dataset at all.
    if (args.knownDatasets.length === 0) {
      add(
        'dataset_roster_absent',
        'The dataset catalog could not be read, so we could not check those names. '
        + 'Nothing is wrong with your request; try again shortly.',
      );
    } else {
      const known = new Set(args.knownDatasets);
      const unknown = readDatasets.filter((name) => !known.has(name));
      if (unknown.length > 0) {
        add(
          'read_datasets_not_catalogued',
          `These are not datasets we have on record: ${unknown.join(', ')}. `
          + 'Pick from the catalog, which is what a grant gets written against.',
        );
      }
    }
  }

  // WHAT FOR ----------------------------------------------------------------------------------
  const capabilityId = text(d.capability_id);
  if (!capabilityId) {
    add('capability_missing', 'Name the capability this tool serves.');
  } else if (args.knownCapabilityIds.length === 0) {
    add(
      'capability_roster_absent',
      'The capability registry could not be read, so we could not check that id.',
    );
  } else if (!args.knownCapabilityIds.some((id) => id === capabilityId)) {
    add('capability_not_found', `No capability has the id ${capabilityId}.`);
  }
  if (!text(d.task_unblocked)) {
    add('task_unblocked_missing', 'Say which piece of work this tool unblocks.');
  }
  if (!text(d.manual_today)) {
    add('manual_today_missing', 'Say what you do by hand today instead of this tool.');
  }

  // WHO ACTS ON IT — AF11.7, field 1. The question that was never asked ------------------------
  //
  // Judged here, beside `task_unblocked`, because the two are the pair that is easy to confuse:
  // one names the work, the other names the human. A reader who has just answered the first is in
  // the right frame to notice they have not answered the second.
  const actsOn = text(d.acts_on_output);
  if (!actsOn) {
    add(
      'acts_on_output_missing',
      'Name the person who will act on what this tool produces. '
      + 'Not a team and not a role, but a person, because a list nobody reads is a list nobody needed.',
    );
  } else if (args.knownActorEmails.length === 0) {
    add(
      'actor_roster_absent',
      'We could not read the list of people, so we could not check that name. '
      + 'Nothing is wrong with your request; try again shortly.',
    );
  } else if (!args.knownActorEmails.some((e) => e.toLowerCase() === actsOn.toLowerCase())) {
    add(
      'acts_on_output_not_a_person',
      `We have no record of ${actsOn}. Pick the person from the list rather than typing them, `
      + 'so the name is somebody we can actually reach.',
    );
  }

  // HOW IT WILL BE JUDGED — AF11.7, field 2 ---------------------------------------------------
  const threshold = text(d.judged_threshold);
  if (!threshold) {
    add(
      'judged_threshold_missing',
      'Say what number would make this tool a success. '
      + 'For example: "a draft is good if it publishes with fewer than three edits, '
      + '7 of the next 10 times."',
    );
  } else if (!readsAsAThreshold(threshold)) {
    add(
      'judged_threshold_has_no_number',
      'That has no number in it, so nobody could ever say whether it was met. '
      + '"The output is accurate" is not a threshold. Give a count, a rate or a share, '
      + 'and say what it counts.',
    );
  }
  if (!text(d.judged_measured_from)) {
    add(
      'judged_measured_from_missing',
      'Say what the system already records that would produce that number. '
      + 'If nothing records it today, say that, because a threshold nobody can measure is worth knowing '
      + 'about before the tool is built, not after.',
    );
  }

  // ALREADY DONE BY HAND — AF11.7, field 3. The state decides the PATH -------------------------
  //
  // The two "feature exists" answers are refusals rather than annotations, and the refusal carries
  // the route. See the header for why: AF11.2's duplicate check compares against REGISTERED TOOLS,
  // so a capability the product already has but no agent has been granted passes it untouched.
  // That is the most expensive mistake available in this path — paying to build something we own —
  // and nothing else in the contract can see it.
  const tried = text(d.tried_in_product);
  if (!tried) {
    add(
      'tried_in_product_missing',
      'Say whether you have already done this by hand in the app: '
      + 'you have used the feature, the feature is there and you have not, or it does not exist.',
    );
  } else if (!TOOL_PRODUCT_STATES.some((s) => s === tried)) {
    add(
      'tried_in_product_unknown',
      `Whether you have done this by hand has to be one of: ${TOOL_PRODUCT_STATES.join(', ')}.`,
    );
  } else if (tried === 'used_by_hand') {
    add(
      'feature_exists_request_a_grant',
      'You have said the app can already do this and you have used it. Then nothing needs '
      + 'building: the agent needs permission to use what is there. Ask for the grant instead, '
      + 'which is a different and much shorter request.',
    );
  } else if (tried === 'exists_unused') {
    add(
      'feature_exists_use_it_first',
      'You have said the app can already do this but you have not used it yet. Go and do the job '
      + 'by hand first. Either it works the way you need, and this is a grant rather than a build, '
      + 'or it does not, and you will be able to say exactly what is missing, which is the part '
      + 'that makes a build request worth approving.',
    );
  } else if (!text(d.missing_from_product)) {
    // Reached only on `not_built`, which is the one state that can be filed.
    add(
      'missing_from_product_missing',
      'Say what the app cannot do today. This is the whole case for building something, '
      + 'and it is what the person building it works from.',
    );
  }

  // WHEN --------------------------------------------------------------------------------------
  const neededBy = text(d.needed_by);
  if (!neededBy) {
    add('needed_by_missing', 'Say when you need this by.');
  } else if (!isCalendarDay(neededBy)) {
    add('needed_by_not_a_date', 'A needed-by date looks like 2026-11-30.');
  }
  const frequency = text(d.run_frequency);
  if (!frequency) {
    add('run_frequency_missing', 'Say how often this tool would run.');
  } else if (!TOOL_RUN_FREQUENCIES.some((f) => f === frequency)) {
    add(
      'run_frequency_unknown',
      `How often it runs has to be one of: ${TOOL_RUN_FREQUENCIES.join(', ')}.`,
    );
  }

  // WHERE — the blast-radius field, and the one the approver is actually approving ------------
  const touches = list(d.touches);
  if (touches === null || touches.length === 0) {
    add(
      'touches_missing',
      'List every system this tool would touch. This is the part being approved, so it cannot be blank.',
    );
  }

  const environment = text(d.environment);
  if (!environment) {
    add(
      'environment_missing',
      'Say whether this tool reads the sandbox or production. '
      + 'A sandbox tool gets a wide grant; a production one gets a narrow one.',
    );
  } else if (!TOOL_ENVIRONMENTS.some((e) => e === environment)) {
    add(
      'environment_unknown',
      `Where this runs has to be one of: ${TOOL_ENVIRONMENTS.join(', ')}.`,
    );
  } else if (environment === 'production' && reads !== null && reads.length > 0
             && readDatasets !== null && readDatasets.length === 0) {
    // ALI'S RULE, and the only place the two environments are treated differently.
    //
    // Sandbox grants are wide on purpose, so an unnamed sandbox read is a pass. A production read
    // is the one being narrowed, and an unnamed one cannot be: there is nothing to narrow it to.
    //
    // The sentence names BOTH ways out, because the common honest case is a tool whose reads are
    // not database reads at all. A refusal that only says "pick datasets" would push somebody with
    // no datasets to pick one anyway, which is worse than the blank it replaced.
    add(
      'production_reads_unscoped',
      'A production tool has to name the datasets it reads. '
      + 'Pick them from the catalog, or, if this tool reads no database, '
      + 'move those reads to what it touches and leave the dataset list empty.',
    );
  }

  // HOW ---------------------------------------------------------------------------------------
  if (list(d.inputs) === null) {
    add('inputs_undeclared', 'List what this tool needs as input, even if the list is empty.');
  }
  if (typeof d.writes !== 'boolean') {
    add('writes_undeclared', 'Say whether this tool writes anything. Leaving it blank is not an answer.');
  } else if (d.writes) {
    // Reads and writes are different grants, and a write that cannot be undone is a different
    // conversation. `chk_adtr_write_declares_effects` enforces the same pair in the table.
    if (!text(d.side_effects)) {
      add('side_effects_missing', 'A tool that writes has to say what it changes.');
    }
    if (typeof d.reversible !== 'boolean') {
      add('reversibility_undeclared', 'A tool that writes has to say whether the change can be undone.');
    }
  }

  return issues;
}

export type AcceptedToolRequest =
  | { readonly ok: true; readonly detail: ToolRequestDetail }
  | { readonly ok: false; readonly issues: ToolRequestIssue[] };

/**
 * Gate it and, on a pass, hand back the NARROWED value.
 *
 * The service never re-reads the raw input after this, which is the point: a caller that gated and
 * then persisted `args.detail` could still write a trimmed-to-nothing string, because the gate and
 * the write would be reading two different objects.
 */
export function acceptToolRequest(args: GateToolRequestArgs): AcceptedToolRequest {
  const issues = gateToolRequest(args);
  if (issues.length > 0) return { ok: false, issues };

  const d = args.detail;
  const writes = d.writes === true;
  // AF11.7. The ROSTER's spelling, not the typed one. The gate compared case-insensitively, so
  // `Sohail@Colaberry.com` passed; storing that would put a spelling on the record that no people
  // row carries, and the next reader would have two spellings of one person to reconcile. The
  // lookup cannot miss here, because the gate already refused every value that is not on the
  // roster — `?? text(...)` is there so a future caller that reorders the two cannot write a blank.
  const typedActor = text(d.acts_on_output);
  const rosterActor = args.knownActorEmails
    .find((e) => e.toLowerCase() === typedActor.toLowerCase()) ?? typedActor;
  return {
    ok: true,
    detail: {
      agent_id: text(d.agent_id),
      domain_key: text(args.domainKey),
      tool_name: text(d.tool_name),
      purpose: text(d.purpose),
      reads: list(d.reads) ?? [],
      produces: list(d.produces) ?? [],
      read_datasets: list(d.read_datasets) ?? [],
      capability_id: text(d.capability_id),
      task_unblocked: text(d.task_unblocked),
      manual_today: text(d.manual_today),
      acts_on_output: rosterActor,
      judged_threshold: text(d.judged_threshold),
      judged_measured_from: text(d.judged_measured_from),
      // Only `not_built` survives the gate, so the cast asserts what the gate established rather
      // than guessing. The two other states are refusals above, with their routes.
      tried_in_product: text(d.tried_in_product) as ToolProductState,
      missing_from_product: text(d.missing_from_product),
      needed_by: text(d.needed_by),
      run_frequency: text(d.run_frequency) as ToolRunFrequency,
      touches: list(d.touches) ?? [],
      environment: text(d.environment) as ToolEnvironment,
      inputs: list(d.inputs) ?? [],
      writes,
      // Kept only when they mean something. A side-effect sentence on a read-only tool is a field
      // two readers would interpret differently, which is the reason the decline-reason field on
      // the parent is refused on an approval.
      side_effects: writes ? text(d.side_effects) : null,
      reversible: writes ? d.reversible === true : null,
      reversibility_note: writes && text(d.reversibility_note) ? text(d.reversibility_note) : null,
    },
  };
}
