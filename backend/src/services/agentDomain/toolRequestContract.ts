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
 */

import {
  TOOL_ENVIRONMENTS,
  TOOL_RUN_FREQUENCIES,
  type ToolEnvironment,
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
  | 'reads_undeclared'
  | 'produces_undeclared'
  | 'reads_and_produces_both_empty'
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
  if (!text(d.tool_name)) add('tool_name_missing', 'A tool request has to name the tool.');
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
