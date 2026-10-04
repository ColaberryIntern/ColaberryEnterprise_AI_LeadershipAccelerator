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
  required: ['processes', 'tasks', 'assignments', 'transitions', 'roles', 'allocation', 'role_map'],
  properties: {
    processes: { type: 'array', items: FACTORY_PROCESS_JSON_SCHEMA },
    tasks: { type: 'array', items: FACTORY_TASK_JSON_SCHEMA },
    assignments: { type: 'array', items: FACTORY_ASSIGNMENT_JSON_SCHEMA },
    transitions: { type: 'array', items: FACTORY_TRANSITION_JSON_SCHEMA },
    roles: { type: 'array', items: FACTORY_ROLE_JSON_SCHEMA },
    // NULLABLE, not optional. Strict mode forces them into `required`, so `null` is how a
    // model says "nothing to declare" without being forced to invent rows. An absent
    // allocation is MEANT to be caught downstream by lifecyclePrerequisites.allocation_unknown.
    // That catch is NOT LIVE YET: lifecycleStatus.ts:144 hardcodes unknownAllocationCount: 0
    // in gatherEvidence, so the rule cannot fire. T6 wires it, along with the three sibling
    // allocation/accountability evidence fields that are stubbed the same permissive way.
    allocation: { type: ['array', 'null'], items: FACTORY_ALLOCATION_JSON_SCHEMA },
    role_map: { type: ['array', 'null'], items: FACTORY_ROLE_MAP_JSON_SCHEMA },
  },
} as const;
