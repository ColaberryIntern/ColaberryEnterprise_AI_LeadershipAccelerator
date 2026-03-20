// ─── Cory Agentic Engine ──────────────────────────────────────────────────────
// Tool-calling agentic loop for Cory's conversational queries.
// Mirrors the proven Maya pattern (chatService.ts) adapted for data investigation.
// Cory can autonomously: discover schema, run SQL, verify claims, build charts.
// Max 8 rounds. All tools are read-only. Output matches AssistantResponse shape.

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import DatasetRegistry from '../../models/DatasetRegistry';
import {
  chatCompletionWithTools,
  type ChatCompletionMessageParam,
  type ChatCompletionTool,
} from './openaiHelper';
import { validateSQL, generateSQL, type SqlResult } from './sqlExecutor';
import { validateAndFixCharts, extractNormalizedConfig } from './agents/chartValidationAgent';
import { validateAndEnrichResults, getBusinessLabel } from './agents/dataAnalystAgent';
import { validateReport } from './agents/reportQualityAgent';
import type { AssistantResponse, NarrativeSections, PipelineStep } from './queryEngine';
import type { ChartConfig, ChartType } from './chartSelector';
import { getDepartmentDetail } from '../../services/departmentIntelligenceService';
import Department from '../../models/Department';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_ROUNDS = 8;
const MAX_SQL_ROWS = 50;
const SQL_TIMEOUT_MS = 10_000;

// ─── Tool Trace (for pipeline step logging) ────────────────────────────────

interface ToolTraceEntry {
  round: number;
  tool: string;
  args: Record<string, any>;
  result_summary: string;
  duration_ms: number;
}

// ─── Tool Definitions (OpenAI Function Calling Schema) ──────────────────────

const CORY_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'discover_schema',
      description: 'Discover what database tables exist, their row counts, columns, and relationships. Use this first to understand what data is available before writing SQL.',
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'Optional filter — only return tables/columns containing this term (e.g., "lead", "campaign", "email")',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_sql_query',
      description: 'Execute a read-only SQL SELECT query against the PostgreSQL database. Returns up to 50 rows. Use this to gather data for analysis.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'The SELECT query to execute. Must be read-only (no INSERT/UPDATE/DELETE). Use COALESCE for nullable columns.' },
          description: { type: 'string', description: 'Brief description of what this query measures (e.g., "Campaign counts by status")' },
        },
        required: ['sql', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_sql',
      description: 'Generate a SQL query from a natural language question. Returns the SQL without executing it — call run_sql_query to execute. Use when you want SQL generated for a complex question.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Natural language question to generate SQL for' },
          tables: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of table names to focus on',
          },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verify_claim',
      description: 'Verify a specific numeric claim against data you have already gathered. Use this before including any number in your final response to ensure accuracy.',
      parameters: {
        type: 'object',
        properties: {
          claim: { type: 'string', description: 'The claim to verify (e.g., "There are 12 active campaigns")' },
          metric_name: { type: 'string', description: 'The metric being checked (e.g., "active_campaigns")' },
          expected_value: { type: 'number', description: 'The number you want to verify' },
          sql: { type: 'string', description: 'A targeted SQL query to verify this specific number (e.g., "SELECT COUNT(*) AS c FROM campaigns WHERE status = \'active\'")' },
        },
        required: ['claim', 'expected_value', 'sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_chart',
      description: 'Create a chart visualization from data you have gathered. Reference a previous SQL query result by its index (0-based).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Chart title (business-friendly)' },
          chart_type: { type: 'string', enum: ['bar', 'line', 'radar', 'combo', 'waterfall'], description: 'Chart type' },
          sql_result_index: { type: 'number', description: 'Index of the SQL result to use as chart data (0 = first query you ran)' },
          label_key: { type: 'string', description: 'Column name for the x-axis/label' },
          value_key: { type: 'string', description: 'Column name for the y-axis/value' },
        },
        required: ['title', 'chart_type', 'sql_result_index', 'label_key', 'value_key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_department_context',
      description: 'Load detailed data for a specific department: KPIs, initiatives, risks, team size, health scores. Use when the question involves a department.',
      parameters: {
        type: 'object',
        properties: {
          department_name: { type: 'string', description: 'Department name (e.g., "Marketing", "Security", "Intelligence")' },
        },
        required: ['department_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: 'Search the knowledge base for qualitative context — past decisions, strategic documents, learnings. Use when you need non-SQL context.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          top_k: { type: 'number', description: 'Number of results (default 3)' },
        },
        required: ['query'],
      },
    },
  },
];

// ─── System Prompt ──────────────────────────────────────────────────────────

function buildAgenticSystemPrompt(context?: Record<string, any>): string {
  let prompt = `You are Cory, the AI Chief Operating Officer of Colaberry Enterprise.
You are an agentic investigator — you autonomously gather data, verify findings, and produce executive-quality reports.

## Your Investigation Protocol

1. **DISCOVER**: Start by using \`discover_schema\` to understand what tables are available. This gives you full visibility into the database.
2. **GATHER**: Write and execute SQL queries using \`run_sql_query\` to collect data relevant to the question. Start broad (totals, status breakdowns), then drill into specifics.
3. **VERIFY**: Before citing any number, use \`verify_claim\` to cross-check it. Wrong numbers destroy executive trust.
4. **VISUALIZE**: Create 2-3 charts using \`build_chart\` to support your narrative. Choose chart types that match the data shape (bar for categories, line for trends, radar for multi-metric comparison).
5. **SYNTHESIZE**: Once you have verified data, write your final response as a structured executive briefing.

## Mandatory Rules

- **EVERY number you cite MUST come from a tool result.** Never estimate, round differently, or invent numbers.
- **If a query returns unexpected results, investigate why** — run a different query, check the schema, verify your assumptions.
- **Report ALL entity statuses** (active AND total) — never say "X active" when you mean "X total."
- **Flag anomalies**: If something looks wrong (e.g., 0 completed strategy calls, very low enrollments), call it out explicitly.
- **Be thorough**: Check multiple data sources. A campaign question should also look at emails sent, lead generation, and errors.
- **Business language only**: Translate technical terms to business language. "agent error_count > 0" → "3 automation processes need attention."

## Response Format

Your FINAL message (when you stop calling tools) MUST be valid JSON:
{
  "executive_summary": "2-3 sentence business-focused overview with verified numbers",
  "key_findings": ["finding with exact number", "another finding"],
  "risk_assessment": "1-2 sentence risk evaluation",
  "recommended_actions": ["specific actionable recommendation", "another action"],
  "follow_up_areas": ["area to investigate further", "another area"]
}`;

  // Inject entity scope context
  if (context?.entity_type && context?.entity_name) {
    prompt += `\n\nCURRENT SCOPE: ${context.entity_name} (${context.entity_type}).
ALL responses must focus on ${context.entity_name}. Use \`get_department_context\` if this is a department.
Reference specific numbers and data relevant to this scope.`;
  }

  // Inject conversation history
  if (context?.conversation_history?.length) {
    prompt += '\n\nRECENT CONVERSATION:';
    for (const msg of context.conversation_history) {
      prompt += `\n${msg.role === 'user' ? 'User' : 'Cory'}: ${msg.content}`;
    }
  }

  return prompt;
}

// ─── Tool Executors ─────────────────────────────────────────────────────────

async function executeToolCall(
  toolName: string,
  args: Record<string, any>,
  state: { sqlResults: SqlResult[]; charts: ChartConfig[] }
): Promise<any> {
  switch (toolName) {
    case 'discover_schema':
      return executeDiscoverSchema(args.search_term);
    case 'run_sql_query':
      return executeRunSQL(args.sql, args.description, state.sqlResults);
    case 'generate_sql':
      return executeGenerateSQL(args.question, args.tables);
    case 'verify_claim':
      return executeVerifyClaim(args.claim, args.expected_value, args.sql);
    case 'build_chart':
      return executeBuildChart(args as any, state.sqlResults, state.charts);
    case 'get_department_context':
      return executeGetDepartmentContext(args.department_name);
    case 'search_knowledge':
      return executeSearchKnowledge(args.query, args.top_k);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function executeDiscoverSchema(searchTerm?: string): Promise<any> {
  try {
    const registries = await DatasetRegistry.findAll({ where: { status: 'active' } });
    let tables = registries.map((r: any) => ({
      name: r.table_name,
      row_count: r.row_count,
      columns: Object.keys(r.semantic_types || {}),
      relationships: (r.relationships || []).map((rel: any) =>
        `${rel.source_column} → ${rel.target_table}.${rel.target_column}`
      ),
    }));

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      tables = tables.filter((t) =>
        t.name.includes(term) ||
        t.columns.some((c: string) => c.includes(term))
      );
    }

    return { tables, total_tables: tables.length };
  } catch (err: any) {
    return { error: err.message, tables: [] };
  }
}

async function executeRunSQL(
  sql: string,
  description: string,
  sqlResults: SqlResult[]
): Promise<any> {
  const cleaned = sql.trim().replace(/;$/, '');

  if (!validateSQL(cleaned)) {
    return { error: 'SQL validation failed — only SELECT/WITH queries are allowed.', rows: [], row_count: 0 };
  }

  try {
    const rows = await sequelize.query(cleaned, {
      type: QueryTypes.SELECT,
      ...(sequelize.getDialect() === 'postgres' ? { raw: true } : {}),
    }) as Record<string, any>[];

    const capped = rows.slice(0, MAX_SQL_ROWS);
    const result: SqlResult = {
      rows: capped,
      query: cleaned,
      description: description || 'SQL query',
      tables: [],
      method: 'llm',
    };
    sqlResults.push(result);

    return {
      rows: capped,
      row_count: rows.length,
      truncated: rows.length > MAX_SQL_ROWS,
      result_index: sqlResults.length - 1,
    };
  } catch (err: any) {
    return { error: `SQL execution failed: ${err.message?.slice(0, 200)}`, rows: [], row_count: 0 };
  }
}

async function executeGenerateSQL(question: string, tables?: string[]): Promise<any> {
  const result = await generateSQL(question, tables);
  if (!result) return { error: 'Could not generate SQL for this question' };
  return { sql: result.sql, tables_used: result.tables_used };
}

async function executeVerifyClaim(
  claim: string,
  expectedValue: number,
  sql: string
): Promise<any> {
  const cleaned = sql.trim().replace(/;$/, '');
  if (!validateSQL(cleaned)) {
    return { verified: false, error: 'Verification SQL rejected', claim };
  }

  try {
    const rows = await sequelize.query(cleaned, { type: QueryTypes.SELECT }) as Record<string, any>[];
    if (rows.length === 0) {
      return { verified: false, actual_value: null, claim, note: 'Query returned no rows' };
    }

    // Extract the first numeric value from the result
    const firstRow = rows[0];
    const values = Object.values(firstRow);
    const actualNum = values.map(Number).find((n) => !isNaN(n) && isFinite(n));

    if (actualNum == null) {
      return { verified: false, actual_value: null, claim, note: 'No numeric value in result' };
    }

    const tolerance = 0.05; // 5%
    const diff = Math.abs(actualNum - expectedValue);
    const pctDiff = expectedValue !== 0 ? (diff / expectedValue) * 100 : (actualNum === 0 ? 0 : 100);
    const verified = pctDiff <= tolerance * 100;

    return {
      verified,
      expected: expectedValue,
      actual_value: actualNum,
      discrepancy_pct: Math.round(pctDiff * 10) / 10,
      claim,
      sql: cleaned,
    };
  } catch (err: any) {
    return { verified: false, error: err.message?.slice(0, 200), claim };
  }
}

function executeBuildChart(
  args: { title: string; chart_type: string; sql_result_index: number; label_key: string; value_key: string },
  sqlResults: SqlResult[],
  charts: ChartConfig[]
): any {
  const { title, chart_type, sql_result_index, label_key, value_key } = args;

  if (sql_result_index < 0 || sql_result_index >= sqlResults.length) {
    return { error: `Invalid sql_result_index ${sql_result_index}. You have ${sqlResults.length} results (0-indexed).` };
  }

  const sr = sqlResults[sql_result_index];
  if (sr.rows.length === 0) {
    return { error: 'Cannot build chart from empty result set.' };
  }

  // Apply business labels to the data
  const enrichedRows = sr.rows.map((row) => {
    const newRow: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      newRow[getBusinessLabel(k)] = v;
    }
    return newRow;
  });

  const chart: ChartConfig = {
    type: chart_type as ChartType,
    title,
    data: enrichedRows,
    labelKey: getBusinessLabel(label_key),
    valueKey: getBusinessLabel(value_key),
  };

  // Validate and fix chart config
  const validated = validateAndFixCharts([chart], sqlResults);
  if (validated.length > 0) {
    charts.push(validated[0]);
    return { chart_created: true, title, chart_type, data_rows: enrichedRows.length };
  }

  return { error: 'Chart validation failed — data shape does not fit chart type.' };
}

async function executeGetDepartmentContext(departmentName: string): Promise<any> {
  try {
    const dept = await Department.findOne({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('name')),
        departmentName.toLowerCase(),
      ),
    });
    if (!dept) return { error: `Department "${departmentName}" not found` };

    const detail = await getDepartmentDetail(dept.id);
    if (!detail) return { error: `No detail data for department "${departmentName}"` };

    // Return structured data Cory can reason about
    const o = (detail as any).overview;
    return {
      name: o.name,
      mission: o.mission,
      team_size: o.team_size,
      health_score: Math.round(o.health_score),
      innovation_score: Math.round(o.innovation_score),
      kpis: (detail as any).kpis || [],
      strategic_objectives: (detail as any).strategic_objectives || [],
      active_initiatives: ((detail as any).building || []).length,
      risks: ((detail as any).risks || []).map((r: any) => ({ title: r.title, severity: r.severity })),
      achievements: ((detail as any).achievements || []).slice(0, 5).map((a: any) => a.title),
    };
  } catch (err: any) {
    return { error: err.message?.slice(0, 200) };
  }
}

async function executeSearchKnowledge(query: string, topK?: number): Promise<any> {
  try {
    const { executeVectorSearch } = await import('./vectorExecutor');
    const results = await executeVectorSearch(['semantic_entity_search'], query);
    const successful = results.filter((r) => r.status === 'success');
    const items = successful.flatMap((r) => r.data).slice(0, topK || 3);
    return { results: items, count: items.length };
  } catch {
    return { results: [], count: 0, note: 'Vector search unavailable' };
  }
}

// ─── Agentic Loop ───────────────────────────────────────────────────────────

export async function runCoryAgenticLoop(
  question: string,
  context?: Record<string, any>
): Promise<AssistantResponse> {
  const toolTrace: ToolTraceEntry[] = [];
  const sqlResults: SqlResult[] = [];
  const charts: ChartConfig[] = [];
  let totalTokens = 0;
  let rounds = 0;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: buildAgenticSystemPrompt(context) },
    { role: 'user', content: question },
  ];

  try {
    // Initial LLM call with tools
    let response = await chatCompletionWithTools(messages, CORY_TOOLS, {
      maxTokens: 1500,
      temperature: 0.2,
    });
    totalTokens += response.usage?.total_tokens || 0;
    let assistantMessage = response.choices[0]?.message;

    // Agentic loop — iterate while LLM requests tool calls
    while (
      assistantMessage?.tool_calls &&
      assistantMessage.tool_calls.length > 0 &&
      rounds < MAX_ROUNDS
    ) {
      rounds++;
      messages.push(assistantMessage as ChatCompletionMessageParam);

      for (const toolCall of assistantMessage.tool_calls) {
        const fn = (toolCall as any).function;
        if (!fn) continue;
        const fnName = fn.name;
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(fn.arguments);
        } catch {
          args = {};
        }

        const t0 = Date.now();
        const result = await executeToolCall(fnName, args, { sqlResults, charts });
        const duration = Date.now() - t0;

        toolTrace.push({
          round: rounds,
          tool: fnName,
          args,
          result_summary: summarizeResult(fnName, result),
          duration_ms: duration,
        });

        messages.push({
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Re-call LLM with accumulated tool results
      response = await chatCompletionWithTools(messages, CORY_TOOLS, {
        maxTokens: 1500,
        temperature: 0.2,
      });
      totalTokens += response.usage?.total_tokens || 0;
      assistantMessage = response.choices[0]?.message;
    }

    // Build final response from LLM's last message + accumulated data
    return assembleOutput(
      assistantMessage?.content || null,
      question,
      sqlResults,
      charts,
      toolTrace,
      totalTokens,
      rounds,
      context
    );
  } catch (err: any) {
    // Graceful degradation — return whatever we have
    console.warn('[CoryAgenticEngine] Loop error:', err?.message?.slice(0, 200));
    return assembleOutput(
      null,
      question,
      sqlResults,
      charts,
      toolTrace,
      totalTokens,
      rounds,
      context
    );
  }
}

// ─── Output Assembly ────────────────────────────────────────────────────────

function assembleOutput(
  finalContent: string | null,
  question: string,
  sqlResults: SqlResult[],
  charts: ChartConfig[],
  toolTrace: ToolTraceEntry[],
  totalTokens: number,
  rounds: number,
  context?: Record<string, any>
): AssistantResponse {
  // Parse LLM's final JSON narrative
  let sections: NarrativeSections = {
    executive_summary: '',
    key_findings: [],
    risk_assessment: '',
    recommended_actions: [],
    follow_up_areas: [],
  };

  if (finalContent) {
    try {
      // Try to extract JSON from the content (may have markdown wrapping)
      const jsonMatch = finalContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        sections = {
          executive_summary: parsed.executive_summary || '',
          key_findings: Array.isArray(parsed.key_findings) ? parsed.key_findings : [],
          risk_assessment: parsed.risk_assessment || '',
          recommended_actions: Array.isArray(parsed.recommended_actions) ? parsed.recommended_actions : [],
          follow_up_areas: Array.isArray(parsed.follow_up_areas) ? parsed.follow_up_areas : [],
        };
      }
    } catch {
      // If JSON parse fails, use the raw content as narrative
      sections.executive_summary = finalContent.slice(0, 500);
    }
  }

  // Enrich SQL results through the data analyst agent
  let enrichedSql = sqlResults;
  let insights: Array<{ type: string; severity: string; message: string; metric?: string; value?: number }> = [];
  try {
    const enriched = validateAndEnrichResults(sqlResults, []);
    enrichedSql = enriched.sqlResults;
    insights = enriched.insights.map((i) => ({
      type: i.type,
      severity: i.severity,
      message: i.message,
      metric: i.metric,
      value: i.value,
    }));
  } catch { /* use original */ }

  // Extract KPI insights from SQL results
  for (const sr of enrichedSql) {
    if (sr.rows.length !== 1) continue;
    const row = sr.rows[0];
    for (const [key, val] of Object.entries(row)) {
      if (key.endsWith('_at') || key.endsWith('_date')) continue;
      const num = Number(val);
      if (!isNaN(num) && num > 0 && isFinite(num)) {
        const bizLabel = getBusinessLabel(key);
        if (!insights.some((i) => i.metric === bizLabel)) {
          insights.push({
            type: 'metric',
            severity: 'info',
            message: `${bizLabel}: ${num.toLocaleString()}`,
            metric: bizLabel,
            value: num,
          });
        }
      }
    }
    if (insights.filter((i) => i.metric).length >= 6) break;
  }

  // Build pipeline steps from tool trace
  const pipelineSteps: PipelineStep[] = toolTrace.map((t, i) => ({
    step: i + 1,
    name: `${t.tool}`,
    status: 'completed' as const,
    duration_ms: t.duration_ms,
    detail: t.result_summary,
  }));

  // Build visualizations with normalized config keys
  const visualizations = charts.map((c) => ({
    chart_type: c.type,
    title: c.title,
    data: c.data,
    config: { ...extractNormalizedConfig(c), labelKey: c.labelKey, valueKey: c.valueKey },
  }));

  const executionPath = toolTrace.map((t) => t.tool).join(' → ');

  const response: AssistantResponse = {
    question,
    entity_type: context?.entity_type || null,
    intent: 'general_insight',
    confidence: rounds > 0 ? Math.min(0.95, 0.6 + rounds * 0.05) : 0.5,
    narrative: sections.executive_summary,
    narrative_sections: sections,
    insights,
    visualizations,
    recommendations: sections.recommended_actions.length > 0
      ? sections.recommended_actions
      : sections.follow_up_areas,
    sources: [...new Set(enrichedSql.flatMap((sr) => sr.tables))],
    pipelineSteps,
    execution_path: executionPath || 'agentic_loop',
  };

  // Final quality gate
  return validateReport(response, enrichedSql);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function summarizeResult(tool: string, result: any): string {
  switch (tool) {
    case 'discover_schema':
      return `Found ${result.total_tables || 0} tables`;
    case 'run_sql_query':
      return result.error
        ? `Error: ${result.error.slice(0, 80)}`
        : `${result.row_count} rows (index: ${result.result_index})`;
    case 'generate_sql':
      return result.sql ? `Generated SQL (${result.sql.length} chars)` : 'Failed';
    case 'verify_claim':
      return result.verified
        ? `Verified: ${result.claim} = ${result.actual_value}`
        : `Mismatch: expected ${result.expected}, got ${result.actual_value}`;
    case 'build_chart':
      return result.chart_created ? `Chart: ${result.title}` : `Failed: ${result.error?.slice(0, 80)}`;
    case 'get_department_context':
      return result.name ? `Loaded ${result.name} dept (health: ${result.health_score})` : result.error || 'Unknown';
    case 'search_knowledge':
      return `${result.count || 0} knowledge results`;
    default:
      return 'OK';
  }
}
