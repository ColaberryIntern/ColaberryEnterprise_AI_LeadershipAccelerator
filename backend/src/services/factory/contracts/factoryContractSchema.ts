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
