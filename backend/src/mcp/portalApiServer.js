#!/usr/bin/env node
/**
 * Portal API MCP Server
 *
 * Exposes the central portal's read-only state and telemetry endpoints as
 * MCP tools so Claude Code can query project state without writing curl
 * boilerplate on every check.
 *
 * Tools exposed:
 *   get_system_state        - GET /api/portal/project/system-state
 *   explain_task            - GET /api/portal/project/system-state/explain/:taskId
 *   get_telemetry           - GET /api/portal/project/telemetry?limit=N
 *   get_telemetry_health    - GET /api/portal/project/telemetry/health
 *   get_state_graph         - GET /api/portal/project/graph
 *   get_database_map        - GET /api/portal/project/database-map
 *   get_ui_map              - GET /api/portal/project/ui-map
 *
 * All reads. No mutations. Auth via PORTAL_BEARER_TOKEN env var if set;
 * otherwise calls are unauthenticated (works for public endpoints only).
 *
 * Registered in .claude/settings.json under "mcpServers".
 *
 * Stdio MCP server using @modelcontextprotocol/sdk v1.29.0.
 */
const { Server } = require('@modelcontextprotocol/sdk/server');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const PORTAL_BASE = process.env.PORTAL_BASE_URL || 'https://enterprise.colaberry.ai';
const PORTAL_TOKEN = process.env.PORTAL_BEARER_TOKEN || '';

const TOOLS = [
  {
    name: 'get_system_state',
    description: 'Get the full authoritative project state from the portal. Use this instead of re-reading the codebase when you need to know what the system thinks the current state is.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    path: () => '/api/portal/project/system-state',
  },
  {
    name: 'explain_task',
    description: 'Get the portal\'s explanation for why a given task is next in the queue. Useful for understanding the reasoning behind state-engine decisions.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'UUID of the task to explain' } },
      required: ['task_id'],
      additionalProperties: false,
    },
    path: ({ task_id }) => `/api/portal/project/system-state/explain/${encodeURIComponent(task_id)}`,
  },
  {
    name: 'get_telemetry',
    description: 'Get recent BuildManifest telemetry entries. Use to see what Claude Code has emitted recently and what state changes resulted.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent entries to return (default 20, max 100)', default: 20 },
      },
      additionalProperties: false,
    },
    path: ({ limit }) => `/api/portal/project/telemetry?limit=${Math.min(100, Math.max(1, Number(limit) || 20))}`,
  },
  {
    name: 'get_telemetry_health',
    description: 'Get the telemetry health summary - shows missing_validation_telemetry score and other emission-quality metrics.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    path: () => '/api/portal/project/telemetry/health',
  },
  {
    name: 'get_state_graph',
    description: 'Get the state graph (nodes + edges representing system structure as the portal sees it).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    path: () => '/api/portal/project/graph',
  },
  {
    name: 'get_database_map',
    description: 'Get the declared database topology - tables, columns, relationships as the portal has tracked them through telemetry.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    path: () => '/api/portal/project/database-map',
  },
  {
    name: 'get_ui_map',
    description: 'Get the declared UI topology - routes, components, surfaces as the portal has tracked them through telemetry.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    path: () => '/api/portal/project/ui-map',
  },
];

async function callPortal(url) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'colaberry-portal-mcp/1.0',
  };
  if (PORTAL_TOKEN) headers.Authorization = `Bearer ${PORTAL_TOKEN}`;
  const r = await fetch(url, { headers });
  const text = await r.text();
  return {
    status: r.status,
    url,
    body: text.length > 50000 ? text.slice(0, 50000) + '\n...[truncated, ' + text.length + ' total bytes]' : text,
  };
}

const server = new Server(
  { name: 'colaberry-portal-api', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const toolDef = TOOLS.find((t) => t.name === req.params.name);
  if (!toolDef) {
    return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const url = PORTAL_BASE + toolDef.path(req.params.arguments || {});
    const result = await callPortal(url);
    if (result.status >= 400) {
      return {
        content: [{ type: 'text', text: `Portal returned ${result.status} for ${url}\n\n${result.body}` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: result.body }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Tool ${toolDef.name} failed: ${err.message}` }], isError: true };
  }
});

(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until stdin closes
})().catch((err) => {
  console.error('[portalApiServer] fatal:', err.message);
  process.exit(1);
});
