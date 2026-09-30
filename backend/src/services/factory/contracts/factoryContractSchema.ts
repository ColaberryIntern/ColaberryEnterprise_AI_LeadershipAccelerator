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
 * The full decomposition the Phase-2 LLM returns in one structured-output call. factoryAssemble
 * (T5) then attaches the deterministic source_blocks/requirements/tracks from the input and derives
 * idempotent assignment/edge ids, producing a FactoryProject factoryValidate can gate. Every array
 * is required (an empty array is a legal, gate-checkable value — "no roles yet" is visible, not absent).
 */
export const FACTORY_DECOMPOSITION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['processes', 'tasks', 'assignments', 'transitions', 'roles'],
  properties: {
    processes: { type: 'array', items: FACTORY_PROCESS_JSON_SCHEMA },
    tasks: { type: 'array', items: FACTORY_TASK_JSON_SCHEMA },
    assignments: { type: 'array', items: FACTORY_ASSIGNMENT_JSON_SCHEMA },
    transitions: { type: 'array', items: FACTORY_TRANSITION_JSON_SCHEMA },
    roles: { type: 'array', items: FACTORY_ROLE_JSON_SCHEMA },
  },
} as const;
