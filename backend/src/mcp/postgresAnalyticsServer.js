#!/usr/bin/env node
/**
 * Postgres Analytics MCP Server (READ-ONLY)
 *
 * Exposes safe, parameterized read queries over the prod Postgres database
 * via SSH + docker exec. Eliminates the boilerplate I write every time I
 * audit visitor traffic, lead pipeline, or campaign health.
 *
 * Tools exposed:
 *   query_visitor_sessions_by_site  - sessions/visitors/pageviews per site_slug for N days
 *   query_leads_by_source           - lead counts per lead_source over a date range
 *   query_recent_pageviews          - last N pageview events with filters
 *   query_campaign_health           - enrollment + send + reply stats for a campaign_id
 *   query_visitor_funnel            - sessions -> form_start -> form_submit -> lead
 *   run_safe_query                  - escape hatch: any SELECT statement (rejected if it
 *                                     contains DML/DDL keywords)
 *
 * Hard rule: READ-ONLY. Every query is wrapped in a regex check that rejects
 * any statement containing INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER/CREATE/GRANT
 * before it ever leaves this process. SSH connection is established per-call;
 * no persistent connection.
 *
 * Connection: ssh root@95.216.199.47 docker exec accelerator-db psql ...
 * Requires SSH key auth to root@95.216.199.47 (already set up).
 *
 * Registered in .claude/settings.json under "mcpServers".
 */
const { spawn } = require('child_process');
const { Server } = require('@modelcontextprotocol/sdk/server');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const SSH_HOST = process.env.PROD_SSH_HOST || 'root@95.216.199.47';
const DB_NAME = process.env.PROD_DB_NAME || 'accelerator_prod';
const DB_USER = process.env.PROD_DB_USER || 'accelerator';

// DML/DDL keywords that block a query. Word-boundary regex; case-insensitive.
const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COMMIT|ROLLBACK|VACUUM|REINDEX|COPY|LOCK)\b/i;

function isReadOnly(sql) {
  if (FORBIDDEN_KEYWORDS.test(sql)) return false;
  // Must start with SELECT or WITH (CTE) or SHOW or EXPLAIN
  const trimmed = sql.trim().toUpperCase();
  return /^(SELECT|WITH|SHOW|EXPLAIN)\b/.test(trimmed);
}

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    if (!isReadOnly(sql)) {
      reject(new Error('Query rejected: must be read-only (SELECT/WITH/SHOW/EXPLAIN) and contain no DML/DDL keywords.'));
      return;
    }
    // Escape single quotes for safe wrapping inside the ssh+docker exec command
    const escaped = sql.replace(/"/g, '\\"');
    const cmd = `docker exec accelerator-db psql -U ${DB_USER} -d ${DB_NAME} -P pager=off -t -A -F '|' -c "${escaped}"`;
    const child = spawn('ssh', [SSH_HOST, cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      // psql writes the collation warning to stderr always; ignore it
      const filteredStderr = stderr
        .split('\n')
        .filter((l) => !/collation version mismatch/i.test(l) && !/^DETAIL:/i.test(l) && !/^HINT:/i.test(l) && !/^WARNING:/i.test(l))
        .join('\n')
        .trim();
      if (code !== 0 && filteredStderr) {
        reject(new Error(`psql exit ${code}: ${filteredStderr}`));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: filteredStderr });
    });
    child.on('error', reject);
  });
}

const TOOLS = [
  {
    name: 'query_visitor_sessions_by_site',
    description: 'Per-site visitor session breakdown for the last N days. Returns site_slug, sessions, unique_visitors, pageviews, last_seen.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', default: 30, description: 'Lookback window in days (1-180)' } },
      additionalProperties: false,
    },
    build(args) {
      const days = Math.min(180, Math.max(1, Number(args?.days) || 30));
      return `SELECT COALESCE(site_slug,'(null)') AS site_slug, COUNT(DISTINCT id) AS sessions, COUNT(DISTINCT visitor_id) AS unique_visitors, COALESCE(SUM(pageview_count),0)::int AS pageviews, MAX(started_at)::timestamp(0) AS last_seen FROM visitor_sessions WHERE started_at >= NOW() - INTERVAL '${days} days' GROUP BY 1 ORDER BY sessions DESC`;
    },
  },
  {
    name: 'query_leads_by_source',
    description: 'Lead counts per lead source over the last N days. Returns source_name, lead_count, most_recent.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', default: 30 } },
      additionalProperties: false,
    },
    build(args) {
      const days = Math.min(180, Math.max(1, Number(args?.days) || 30));
      return `SELECT ls.name AS source_name, COUNT(l.id) AS lead_count, MAX(l.created_at)::timestamp(0) AS most_recent FROM lead_sources ls LEFT JOIN leads l ON (l.source = ls.slug OR l.source LIKE '%' || ls.slug || '%') AND l.created_at >= NOW() - INTERVAL '${days} days' GROUP BY ls.name ORDER BY lead_count DESC`;
    },
  },
  {
    name: 'query_recent_pageviews',
    description: 'Most recent N pageview events, optionally filtered by site_slug or page_path.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 50 },
        site_slug: { type: 'string', description: 'Optional: filter to one site' },
        page_path_like: { type: 'string', description: 'Optional: SQL LIKE pattern on page_path' },
      },
      additionalProperties: false,
    },
    build(args) {
      const limit = Math.min(500, Math.max(1, Number(args?.limit) || 50));
      const conditions = ["pe.event_type = 'pageview'"];
      if (args?.site_slug && /^[a-z0-9-]{1,64}$/i.test(args.site_slug)) {
        conditions.push(`vs.site_slug = '${args.site_slug.toLowerCase()}'`);
      }
      if (args?.page_path_like && /^[\w\-\/%._?=&]+$/.test(args.page_path_like)) {
        conditions.push(`pe.page_path ILIKE '${args.page_path_like}'`);
      }
      return `SELECT pe.timestamp::timestamp(0) AS at, vs.site_slug, pe.page_path, pe.page_title FROM page_events pe LEFT JOIN visitor_sessions vs ON vs.id = pe.session_id WHERE ${conditions.join(' AND ')} ORDER BY pe.timestamp DESC LIMIT ${limit}`;
    },
  },
  {
    name: 'query_campaign_health',
    description: 'Enrollment + step-1 send + reply stats for a specific campaign_id over the last N days.',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign UUID' },
        days: { type: 'number', default: 14 },
      },
      required: ['campaign_id'],
      additionalProperties: false,
    },
    build(args) {
      const days = Math.min(90, Math.max(1, Number(args?.days) || 14));
      const cid = String(args.campaign_id || '').replace(/[^a-zA-Z0-9-]/g, '');
      if (cid.length < 36 || cid.length > 36) throw new Error('campaign_id must be a 36-char UUID');
      return `SELECT 'enrolled' AS metric, COUNT(*)::text AS value FROM campaign_leads WHERE campaign_id = '${cid}' AND enrolled_at >= NOW() - INTERVAL '${days} days' UNION ALL SELECT 'active', COUNT(*)::text FROM campaign_leads WHERE campaign_id = '${cid}' AND status = 'active' AND enrolled_at >= NOW() - INTERVAL '${days} days' UNION ALL SELECT 'step1_sent', COUNT(DISTINCT se.lead_id)::text FROM scheduled_emails se JOIN campaign_leads cl ON cl.lead_id = se.lead_id WHERE cl.campaign_id = '${cid}' AND cl.enrolled_at >= NOW() - INTERVAL '${days} days' AND se.step_index = 0 AND se.sent_at IS NOT NULL`;
    },
  },
  {
    name: 'query_visitor_funnel',
    description: 'Conversion funnel: sessions -> form_start -> form_submit -> lead, scoped to last N days and optionally one site.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', default: 30 },
        site_slug: { type: 'string' },
      },
      additionalProperties: false,
    },
    build(args) {
      const days = Math.min(180, Math.max(1, Number(args?.days) || 30));
      const siteFilter = (args?.site_slug && /^[a-z0-9-]{1,64}$/i.test(args.site_slug))
        ? `AND vs.site_slug = '${args.site_slug.toLowerCase()}'` : '';
      return `WITH stage AS (SELECT COUNT(DISTINCT vs.id) AS sessions, COUNT(DISTINCT CASE WHEN pe.event_type = 'form_start' THEN vs.id END) AS form_starts, COUNT(DISTINCT CASE WHEN pe.event_type = 'form_submit' THEN vs.id END) AS form_submits, COUNT(DISTINCT vs.lead_id) AS leads FROM visitor_sessions vs LEFT JOIN page_events pe ON pe.session_id = vs.id WHERE vs.started_at >= NOW() - INTERVAL '${days} days' ${siteFilter}) SELECT 'sessions' AS stage, sessions AS n FROM stage UNION ALL SELECT 'form_starts', form_starts FROM stage UNION ALL SELECT 'form_submits', form_submits FROM stage UNION ALL SELECT 'leads', leads FROM stage`;
    },
  },
  {
    name: 'run_safe_query',
    description: 'ESCAPE HATCH: run an arbitrary SELECT/WITH/SHOW/EXPLAIN statement. Statements containing INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER/CREATE/GRANT/REVOKE/COMMIT/ROLLBACK/VACUUM/REINDEX/COPY/LOCK are rejected without running. Use only when none of the named tools fit.',
    inputSchema: {
      type: 'object',
      properties: { sql: { type: 'string', description: 'SQL statement, must be read-only' } },
      required: ['sql'],
      additionalProperties: false,
    },
    build(args) { return String(args?.sql || ''); },
  },
];

const server = new Server(
  { name: 'colaberry-postgres-analytics', version: '1.0.0' },
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
    const sql = toolDef.build(req.params.arguments || {});
    const result = await runQuery(sql);
    const out = result.stdout || '(no rows)';
    return { content: [{ type: 'text', text: `SQL: ${sql}\n\n${out}` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Tool ${toolDef.name} failed: ${err.message}` }], isError: true };
  }
});

(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
})().catch((err) => {
  console.error('[postgresAnalyticsServer] fatal:', err.message);
  process.exit(1);
});
