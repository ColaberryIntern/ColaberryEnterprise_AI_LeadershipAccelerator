/**
 * factoryContractSchema — the structured-output JSON-schema mirror of the parts of
 * factoryContract.ts an LLM will fill in Phase 2 (FactoryTask and Assignment). Kept in
 * lockstep with the TypeScript by factoryContract.test.ts, exactly as planContract.ts keeps
 * BUILD_PLAN_JSON_SCHEMA in step with BuildPlan. Phase 1 does not call an LLM; this exists so
 * the contract the LLM must satisfy is defined now and cannot drift from the types.
 */

export const FACTORY_TASK_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'process_id', 'title', 'description', 'kind', 'stage_id', 'source_evidence',
    'required_skills', 'judgment_level', 'decision_authority', 'data_sensitivity',
    'interaction_pattern', 'frequency', 'effort_minutes', 'effort_basis', 'confidence', 'method',
  ],
  properties: {
    id: { type: 'string' },
    process_id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    kind: { type: 'string', enum: ['START', 'TASK', 'DECISION', 'END'] },
    stage_id: { type: 'string' },
    source_evidence: { type: 'array', items: { type: 'string' } },
    required_skills: { type: 'array', items: { type: 'string' } },
    judgment_level: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
    decision_authority: { type: 'string', enum: ['none', 'recommend', 'decide_bounded', 'decide_full'] },
    data_sensitivity: { type: 'string', enum: ['public', 'internal', 'confidential', 'regulated'] },
    interaction_pattern: { type: ['string', 'null'] },
    frequency: { type: ['string', 'null'] },
    effort_minutes: { type: ['number', 'null'] },
    effort_basis: { type: 'string', enum: ['UNKNOWN', 'ESTIMATED', 'MEASURED'] },
    confidence: { type: ['number', 'null'] },
    method: { type: 'string', enum: ['EXPLICIT', 'INFERRED', 'LLM'] },
  },
} as const;

export const FACTORY_ASSIGNMENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'task_id', 'role_id', 'responsibility', 'executor', 'minutes', 'basis', 'evidence_note'],
  properties: {
    id: { type: 'string' },
    task_id: { type: 'string' },
    role_id: { type: 'string' },
    responsibility: {
      type: 'string',
      enum: ['PERFORMER', 'APPROVER', 'ACCOUNTABLE', 'CONTRIBUTOR', 'CONSULTED', 'INFORMED'],
    },
    executor: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'id'],
          properties: { type: { type: 'string', enum: ['person', 'team', 'agent'] }, id: { type: 'string' } },
        },
        { type: 'null' },
      ],
    },
    minutes: { type: ['number', 'null'] },
    basis: { type: 'string', enum: ['UNKNOWN', 'ESTIMATED', 'MEASURED'] },
    evidence_note: { type: ['string', 'null'] },
  },
} as const;

/**
 * Phase 2 additions — the parts of a FactoryProject the LLM must ALSO emit so a decomposition
 * is a COMPLETE, gate-valid project rather than just tasks+assignments. factoryValidate requires
 * a resolvable process per task (WORK_REFERENCE) and a single-START/≥1-END reachable transition
 * graph (START/END/REACHABILITY/BRANCH_KIND/LOOP), so the model emits processes, transitions, and
 * roles too. These mirror ProcessRecord / TransitionEdge / Role in factoryContract.ts and are held
 * in lockstep by factoryContract.test.ts exactly as FACTORY_TASK/ASSIGNMENT are. Additive: the two
 * frozen schemas above are reused unchanged.
 */
export const FACTORY_PROCESS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'business_outcome', 'success_criterion', 'trigger', 'inputs', 'outputs',
    'decision_branches', 'future_owner_role_id', 'exceptions',
  ],
  properties: {
    id: { type: 'string' },
    business_outcome: { type: 'string' },
    success_criterion: { type: 'string' },
    trigger: { type: 'string' },
    inputs: { type: 'array', items: { type: 'string' } },
    outputs: { type: 'array', items: { type: 'string' } },
    decision_branches: { type: 'array', items: { type: 'string' } },
    future_owner_role_id: { type: ['string', 'null'] },
    exceptions: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const FACTORY_TRANSITION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'from_task_id', 'to_task_id', 'condition', 'is_rework'],
  properties: {
    id: { type: 'string' },
    from_task_id: { type: 'string' },
    to_task_id: { type: 'string' },
    condition: { type: ['string', 'null'] },
    is_rework: { type: 'boolean' },
  },
} as const;

export const FACTORY_ROLE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'definition'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    definition: { type: 'string' },
  },
} as const;

/**
 * One row of the human/AI allocation matrix (P3-T3).
 *
 * WHY THE MODEL IS ASKED FOR THIS AT ALL, when three of the four fields are DERIVABLE from the
 * assignments: `task_id`, `execution_class` and `accountable_role_id` can each be read off the
 * PERFORMER/ACCOUNTABLE/APPROVER assignments, and
 * `services/lifecycle/generation/allocation.ts` does exactly that. `rationale` cannot be. It is
 * the judgement - WHY this work sits on this side of the line - and a derived rationale is a
 * restatement of the structure, not a reason.
 *
 * So the model states the whole row and the derivation CROSS-CHECKS it. Asking for only the
 * rationale would have been simpler, but a stated allocation that disagrees with the assignment
 * graph is itself a finding: it means the narrative and the structure have diverged, which is
 * the kind of incoherence this phase exists to catch rather than average away.
 */
export const FACTORY_ALLOCATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id', 'execution_class', 'rationale', 'accountable_role_id'],
  properties: {
    task_id: { type: 'string' },
    // The four classes AllocationRow already declares. An enum, not a free string: a model
    // inventing a fifth class is how "mostly automated" becomes unreviewable.
    execution_class: {
      type: 'string',
      enum: ['human', 'ai_with_approval', 'ai_autonomous', 'deterministic_software'],
    },
    rationale: { type: 'string' },
    // Nullable because purely human work needs no separate accountable role - the performer
    // IS the accountability. AI work without one is refused downstream, not here.
    accountable_role_id: { type: ['string', 'null'] },
  },
} as const;

/**
 * One row of the old->new role map (P3-T3).
 *
 * Unlike allocation, NONE of this is derivable. What a displaced function became, which part
 * the AI now contributes, and what the person retains are facts about a job, and nothing in the
 * assignment graph encodes them. This is the only part of P3-T3 the model is the sole source of.
 */
export const FACTORY_ROLE_MAP_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['previous_function', 'ai_contribution', 'new_role_id', 'retained_responsibilities'],
  properties: {
    previous_function: { type: 'string' },
    ai_contribution: { type: 'string' },
    new_role_id: { type: 'string' },
    retained_responsibilities: { type: 'array', items: { type: 'string' } },
  },
} as const;

/**
 * One AI agent team (L10.2) — the AI tasks of ONE subject, and the human answerable for them.
 *
 * ## Why the model declares these rather than picking from a roster
 *
 * The obvious design is a roster: hand the model the agents that exist and let it choose. That is
 * wrong here for two reasons. A bid is a proposal to BUILD something, so the agents it needs do
 * not exist yet - there is nothing to pick from. And the registry holds hundreds of agents, which
 * is both unquotable in a prompt and the wrong question: "which of our agents applies" is not
 * "what agent team does this contract require".
 *
 * So agent teams are DECLARED, exactly as `roles` are. The model emits the team and then names it
 * as an executor, which is why doing so is not invention: the id it references is one it defined
 * in the same response. ANTI-INVENTION bars naming an outside thing - a vendor, a tool, a
 * number - that nothing in the source supports. It was never meant to bar declaring structure the
 * output is asked for, but with no team list to declare into, an agent executor WAS an invented
 * id, and the honest move was the null the prompt rewards. That is why every Herriman allocation
 * row came back `human`.
 *
 * ## Why `subject` is the field that does the work
 *
 * One team, one subject, and no two teams sharing one. That is the rule that stops "the AI" from
 * becoming a single omniscient agent holding every task, which is the pre-AI monolith with a new
 * label. An admissions agent handles admissions. `humanAiStructure` checks it (SUBJECT_REQUIRED,
 * SUBJECT_UNIQUE, TASK_ONE_TEAM).
 */
export const FACTORY_AGENT_TEAM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'name', 'subject', 'task_ids', 'approver_role_id',
    'execution_policy', 'approval_policy', 'autonomy_stage', 'trust_dimensions',
  ],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    subject: { type: 'string' },
    task_ids: { type: 'array', items: { type: 'string' } },
    // Nullable so a missing approver is VISIBLE as a gap (APPROVER_MISSING) rather than
    // unrepresentable. An agent may never be the approver; that is checked, not requested.
    approver_role_id: { type: ['string', 'null'] },
    // Mirrors delivery/deliveryStoryContract. Not redefined, not re-spelled.
    execution_policy: { type: 'string', enum: ['manual_only', 'agent_with_review', 'agent_autonomous'] },
    approval_policy: { type: 'string', enum: ['none', 'internal_review', 'client_approval'] },
    // NAMESPACED, and the enum is written out rather than interpolated so this file stays a
    // frozen literal. A bare `R3` is the value that must never be stored (autonomyLadder), so
    // offering only `autonomy:R0..R9` means the model cannot produce one.
    //
    // `oneOf` RATHER THAN an enum containing null, deliberately. A nullable enum written
    // `{type:['string','null'], enum:[...,null]}` may or may not survive strict mode, and this
    // file's own history records a schema mistake that made the WHOLE schema unsubmittable while
    // every suite stayed green, because they all mock the client. The executor field above has
    // used `oneOf` since Phase 2 and generates in production daily - `toStrictSchema` rewrites
    // it to `anyOf` - so this is the construction with evidence behind it rather than the one
    // that reads more neatly.
    autonomy_stage: {
      oneOf: [
        {
          type: 'string',
          enum: [
            'autonomy:R0', 'autonomy:R1', 'autonomy:R2', 'autonomy:R3', 'autonomy:R4',
            'autonomy:R5', 'autonomy:R6', 'autonomy:R7', 'autonomy:R8', 'autonomy:R9',
          ],
        },
        { type: 'null' },
      ],
    },
    // The six INPACT dimensions from the book Colaberry sells. An empty array is honest; a
    // team claiming all six without evidence is the thing deliveryTrustGate exists to refuse.
    trust_dimensions: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['instant', 'natural', 'permitted', 'adaptive', 'contextual', 'transparent'],
      },
    },
  },
} as const;

/**
 * Where a human task lands (L10.3) — the field that makes "one console" checkable.
 *
 * Human tasks had an owner and no DESTINATION, so roles were the only grouping primitive left
 * downstream and a generated app grew one screen per role. That is the hundred-page, many-login
 * app the first cohort shipped. `kind` keeps the claim honest: submitting on a city's procurement
 * portal is genuinely not a screen we can build, and forcing it onto the console would improve
 * the count by making it false.
 */
export const FACTORY_SURFACE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'kind', 'task_ids'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    kind: { type: 'string', enum: ['console', 'external'] },
    task_ids: { type: 'array', items: { type: 'string' } },
  },
} as const;

/**
 * The full decomposition the Phase-2 LLM returns in one structured-output call. factoryAssemble
 * (T5) then attaches the deterministic source_blocks/requirements/tracks from the input and derives
 * idempotent assignment/edge ids, producing a FactoryProject factoryValidate can gate. Every array
 * is required (an empty array is a legal, gate-checkable value — "no roles yet" is visible, not absent).
 */
export const FACTORY_DECOMPOSITION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // ALL SEVEN. OpenAI strict structured outputs require every key in `properties`
  // to appear in `required`, at every object level, and this schema is submitted with
  // `strict: true` from factoryDecompose.ts:152 and factoryRepair.ts:189. An earlier
  // version of P3-T3 added allocation and role_map to `properties` only, which made the
  // WHOLE SCHEMA unsubmittable - so the moment FLAGS.factoryGeneration flipped, nothing
  // would have generated at all, on either path. Both suites mock the client, so no test
  // caught it; the parity assertion added in factoryContract.test.ts now does.
  //
  // The reason originally given for omitting them - that stored decompositions would fail
  // to parse - was unfounded. Nothing parses stored decompositions against this schema:
  // its only non-test consumers are the two `response_format` sites, and stored shape is
  // checked by the hand-rolled isDecompositionShaped (factoryDecompose.ts:118-126), which
  // does not read either key.
  //
  // L10.2/L10.3 ADDED agent_teams AND surfaces TO BOTH LISTS, for the reason the paragraph above
  // records: properties-only is unsubmittable, and no mocked suite would notice.
  required: [
    'processes', 'tasks', 'assignments', 'transitions', 'roles', 'allocation', 'role_map',
    'agent_teams', 'surfaces',
  ],
  properties: {
    processes: { type: 'array', items: FACTORY_PROCESS_JSON_SCHEMA },
    tasks: { type: 'array', items: FACTORY_TASK_JSON_SCHEMA },
    assignments: { type: 'array', items: FACTORY_ASSIGNMENT_JSON_SCHEMA },
    transitions: { type: 'array', items: FACTORY_TRANSITION_JSON_SCHEMA },
    roles: { type: 'array', items: FACTORY_ROLE_JSON_SCHEMA },
    // NULLABLE, not optional. Strict mode forces them into `required`, so `null` is how a
    // model says "nothing to declare" without being forced to invent rows. An absent
    // allocation is MEANT to be caught downstream by lifecyclePrerequisites.allocation_unknown.
    // That catch is NOT LIVE YET: `readLifecycleEvidence` in lifecycleStatus.ts leaves
    // unknownAllocationCount unassessed (cited by symbol, not line: this comment named a
    // line that moved one commit later)
    // in readLifecycleEvidence (renamed from gatherEvidence by P5-T1.1), so the rule cannot
    // fire. A later task wires it, along with the three sibling
    // allocation/accountability evidence fields that are stubbed the same permissive way.
    allocation: { type: ['array', 'null'], items: FACTORY_ALLOCATION_JSON_SCHEMA },
    role_map: { type: ['array', 'null'], items: FACTORY_ROLE_MAP_JSON_SCHEMA },
    // Nullable for the same reason as allocation: `null` is how a model says "nothing to
    // declare" under strict mode. An all-human process legitimately has no agent teams, and
    // that is a finding to report rather than rows to invent. `humanAiStructure` tells the two
    // apart - it returns STRUCTURE_ABSENT for an undeclared structure instead of passing it.
    agent_teams: { type: ['array', 'null'], items: FACTORY_AGENT_TEAM_JSON_SCHEMA },
    surfaces: { type: ['array', 'null'], items: FACTORY_SURFACE_JSON_SCHEMA },
  },
} as const;
