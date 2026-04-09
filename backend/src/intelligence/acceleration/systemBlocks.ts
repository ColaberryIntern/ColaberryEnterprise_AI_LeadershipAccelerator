/**
 * System Blocks — reusable prompt fragments that can be injected into
 * generated prompts. Each block represents a well-known implementation
 * pattern (CRUD, auth, monitoring, etc.) with specific file templates.
 */

export interface SystemBlock {
  id: string;
  name: string;
  version: string;
  category: 'crud' | 'auth' | 'monitoring' | 'notification' | 'search' | 'file_upload' | 'agent';
  /** Reusable prompt section injected into the generated prompt */
  prompt_fragment: string;
  /** Typical files this block produces */
  files_generated: string[];
  /** NPM packages needed (for reference) */
  dependencies: string[];
  /** Other block IDs this can compose with */
  composable_with: string[];
  /** When this block applies (action types that benefit) */
  applies_to: string[];
}

export const SYSTEM_BLOCKS: SystemBlock[] = [
  {
    id: 'block_crud_rest',
    name: 'RESTful CRUD Service',
    version: '1.0.0',
    category: 'crud',
    prompt_fragment: `## REUSABLE PATTERN: RESTful CRUD

Follow this exact structure for new services:
- **Model**: \`backend/src/models/{Name}.ts\` — UUID PK, Sequelize, timestamps, underscored
- **Service**: \`backend/src/services/{name}Service.ts\` — getAll (pagination, search, filters), getById, create, update
- **Routes**: \`backend/src/routes/admin/{name}Routes.ts\` — GET /, GET /:id, POST /, PUT /:id with requireAdmin middleware
- **Registration**: Add import + router.use() in \`backend/src/routes/adminRoutes.ts\`
- **Model registration**: Add import + export in \`backend/src/models/index.ts\`

Patterns to follow:
- All route handlers use lazy imports: \`const { Service } = await import('../../services/...')\`
- Pagination: \`?page=1&limit=20\` with \`offset\` and \`limit\` in Sequelize
- Search: \`?search=term\` using \`Op.iLike\` on name/description fields
- Default status filter: \`WHERE status = 'active'\``,
    files_generated: ['models/{Name}.ts', 'services/{name}Service.ts', 'routes/admin/{name}Routes.ts'],
    dependencies: [],
    composable_with: ['block_monitoring_basic', 'block_search'],
    applies_to: ['backend_improvement', 'requirement_implementation', 'add_database'],
  },
  {
    id: 'block_monitoring_basic',
    name: 'Basic Monitoring Setup',
    version: '1.0.0',
    category: 'monitoring',
    prompt_fragment: `## REUSABLE PATTERN: Monitoring

Add observability to the service:
- **Logging**: Use Winston logger from \`backend/src/config/logger.ts\`
  - Log on create/update: \`logger.info('Created {name}', { id, action: 'create' })\`
  - Log on error: \`logger.error('Failed to create {name}', { error: err.message })\`
- **Audit Trail**: All POST/PUT/DELETE automatically logged by global audit middleware
- **KPI Tracking**: Add to \`backend/src/services/reporting/kpiService.ts\` if process-specific metrics needed`,
    files_generated: [],
    dependencies: [],
    composable_with: ['block_crud_rest'],
    applies_to: ['monitoring_gap', 'add_monitoring', 'improve_reliability'],
  },
  {
    id: 'block_error_handling',
    name: 'Error Handling Pattern',
    version: '1.0.0',
    category: 'crud',
    prompt_fragment: `## REUSABLE PATTERN: Error Handling

Apply these patterns in every route handler:
- **Try-catch wrapper**: Every handler wrapped in try-catch returning 500 on error
- **Input validation**: Check required fields, return 400 with specific message
- **Not found**: Return 404 when findByPk returns null
- **Conflict**: Return 409 on unique constraint violations
- **HTTP status codes**: 200 (success), 201 (created), 400 (bad input), 404 (not found), 409 (conflict), 500 (server error)`,
    files_generated: [],
    dependencies: [],
    composable_with: ['block_crud_rest'],
    applies_to: ['improve_reliability', 'backend_improvement'],
  },
  {
    id: 'block_search',
    name: 'Search & Filter Pattern',
    version: '1.0.0',
    category: 'search',
    prompt_fragment: `## REUSABLE PATTERN: Search & Filtering

Implement search with these patterns:
- **Query params**: \`?search=term&status=active&page=1&limit=20\`
- **Sequelize where**: Build dynamic where clause from query params
- **iLike search**: \`{ [Op.iLike]: \`%\${search}%\` }\` on name + description
- **Pagination**: \`{ offset: (page-1)*limit, limit: Math.min(limit, 100) }\`
- **Sort**: Default by \`created_at DESC\`, allow \`?sort=name&order=asc\``,
    files_generated: [],
    dependencies: [],
    composable_with: ['block_crud_rest'],
    applies_to: ['requirement_implementation', 'backend_improvement', 'optimize_performance'],
  },
  {
    id: 'block_agent_pattern',
    name: 'AI Agent Implementation',
    version: '1.0.0',
    category: 'agent',
    prompt_fragment: `## REUSABLE PATTERN: AI Agent

Follow this structure for new agents:
- **File**: \`backend/src/intelligence/agents/{Name}Agent.ts\`
- **Pattern**: Follow existing agents (e.g., ActionPlannerAgent.ts)
- **Export**: Async executor function returning AgentExecutionResult
- **Registration**: Add to \`backend/src/services/agentRegistrySeed.ts\`
- **Logging**: Use \`AiAgentActivityLog.create()\` for execution logging
- **LLM calls**: Use \`callLLMWithAudit()\` for tracked LLM interactions
- **Idempotency**: Operations must be safe to rerun`,
    files_generated: ['intelligence/agents/{Name}Agent.ts'],
    dependencies: [],
    composable_with: ['block_monitoring_basic'],
    applies_to: ['agent_enhancement', 'add_agents'],
  },
];

/**
 * Get system blocks applicable to a given action type.
 * Returns blocks sorted by relevance (most specific first).
 */
export function getApplicableBlocks(actionType: string): SystemBlock[] {
  return SYSTEM_BLOCKS.filter(b => b.applies_to.includes(actionType));
}
