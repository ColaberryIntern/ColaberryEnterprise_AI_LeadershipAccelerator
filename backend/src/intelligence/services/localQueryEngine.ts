import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import DatasetRegistry from '../../models/DatasetRegistry';
import { generateLocalSummary } from './executiveSummaryService';

interface QueryResponse {
  question: string;
  intent: string;
  narrative: string;
  data: Record<string, any>;
  visualizations: Array<{
    chart_type: string;
    title: string;
    data: Record<string, any>[];
    config: Record<string, any>;
  }>;
  follow_ups: string[];
  sources: string[];
  execution_path: string;
}

type Intent = 'aggregate' | 'ranking' | 'filter' | 'trend' | 'comparison' | 'detail' | 'executive_summary';

interface ExtractedEntities {
  tables: string[];
  columns: Array<{ table: string; column: string; semantic_type: string }>;
  filters: Array<{ column: string; value: string }>;
  metrics: Array<{ table: string; column: string; type: string }>;
}

// ── Registry Cache ──────────────────────────────────────────
let registryCache: DatasetRegistry[] | null = null;
let registryCacheTime = 0;
const REGISTRY_TTL = 5 * 60 * 1000;

async function loadRegistry(): Promise<DatasetRegistry[]> {
  const now = Date.now();
  if (registryCache && now - registryCacheTime < REGISTRY_TTL) return registryCache;
  registryCache = await DatasetRegistry.findAll();
  registryCacheTime = now;
  return registryCache;
}

// ── Table Aliases ───────────────────────────────────────────
const TABLE_ALIASES: Record<string, string> = {
  lead: 'leads',
  leads: 'leads',
  prospect: 'leads',
  prospects: 'leads',
  enrollment: 'enrollments',
  enrollments: 'enrollments',
  student: 'enrollments',
  students: 'enrollments',
  campaign: 'campaigns',
  campaigns: 'campaigns',
  marketing: 'campaigns',
  cohort: 'cohorts',
  cohorts: 'cohorts',
  class: 'cohorts',
  classes: 'cohorts',
  activity: 'activities',
  activities: 'activities',
  appointment: 'appointments',
  appointments: 'appointments',
  meeting: 'appointments',
  meetings: 'appointments',
  visitor: 'visitors',
  visitors: 'visitors',
  email: 'scheduled_emails',
  emails: 'scheduled_emails',
  dataset: 'dataset_registry',
  datasets: 'dataset_registry',
  process: 'system_processes',
  processes: 'system_processes',
  insight: 'icp_insights',
  insights: 'icp_insights',
  signal: 'behavioral_signals',
  signals: 'behavioral_signals',
  intent: 'intent_scores',
  score: 'intent_scores',
  scores: 'intent_scores',
};

// ── Filter Value Aliases ────────────────────────────────────
const FILTER_ALIASES: Record<string, { column: string; value: string }> = {
  active: { column: 'status', value: 'active' },
  inactive: { column: 'status', value: 'inactive' },
  completed: { column: 'status', value: 'completed' },
  pending: { column: 'status', value: 'pending' },
  draft: { column: 'status', value: 'draft' },
  hot: { column: 'lead_temperature', value: 'hot' },
  warm: { column: 'lead_temperature', value: 'warm' },
  cold: { column: 'lead_temperature', value: 'cold' },
  paid: { column: 'payment_status', value: 'paid' },
  unpaid: { column: 'payment_status', value: 'unpaid' },
};

// ── 1. Intent Classifier ────────────────────────────────────

const INTENT_KEYWORDS: Array<{ intent: Intent; patterns: RegExp[]; weight: number }> = [
  {
    intent: 'trend',
    patterns: [/\btrend/i, /over time/i, /\bmonthly\b/i, /\bweekly\b/i, /\bdaily\b/i, /\bgrowth\b/i, /\bhistory\b/i, /\bconversion\b/i, /\bover the (past|last)/i, /\btime series\b/i],
    weight: 3,
  },
  {
    intent: 'ranking',
    patterns: [/\btop\b/i, /\bbest\b/i, /\bworst\b/i, /\bhighest\b/i, /\blowest\b/i, /\bmost\b/i, /\bleast\b/i, /\brank/i, /\bbiggest\b/i, /\blargest\b/i],
    weight: 3,
  },
  {
    intent: 'aggregate',
    patterns: [/\bhow many\b/i, /\btotal\b/i, /\bcount\b/i, /\bsum\b/i, /\baverage\b/i, /\boverview\b/i, /\boverall\b/i, /\bbreakdown\b/i, /\bdistribution\b/i, /\bby\s+\w+/i],
    weight: 2,
  },
  {
    intent: 'comparison',
    patterns: [/\bcompare\b/i, /\bversus\b/i, /\bvs\.?\b/i, /\bbetween\b/i, /\bdifference\b/i],
    weight: 3,
  },
  {
    intent: 'filter',
    patterns: [/\bshow me\b/i, /\blist\b/i, /\bwhich\b/i, /\bfind\b/i, /\bwhat are the\b/i, /\bgive me\b/i],
    weight: 1,
  },
  {
    intent: 'detail',
    patterns: [/\bdetails?\b/i, /\btell me about\b/i, /\bdescribe\b/i, /\bexplain\b/i, /\binfo\b/i],
    weight: 2,
  },
];

function classifyIntent(question: string): Intent {
  const scores: Record<string, number> = {};

  for (const { intent, patterns, weight } of INTENT_KEYWORDS) {
    for (const pattern of patterns) {
      if (pattern.test(question)) {
        scores[intent] = (scores[intent] || 0) + weight;
      }
    }
  }

  let best: Intent = 'executive_summary';
  let bestScore = 0;
  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = intent as Intent;
    }
  }

  return best;
}

// ── 2. Entity Extractor ─────────────────────────────────────

function extractEntities(question: string, registry: DatasetRegistry[]): ExtractedEntities {
  const lowerQ = question.toLowerCase();
  const matchedTables = new Set<string>();
  const columns: ExtractedEntities['columns'] = [];
  const filters: ExtractedEntities['filters'] = [];
  const metrics: ExtractedEntities['metrics'] = [];

  // Build valid table set from registry
  const validTables = new Set(registry.map((r) => r.table_name));

  // Match table aliases
  for (const [alias, tableName] of Object.entries(TABLE_ALIASES)) {
    if (lowerQ.includes(alias) && validTables.has(tableName)) {
      matchedTables.add(tableName);
    }
  }

  // Direct table name match
  for (const ds of registry) {
    if (lowerQ.includes(ds.table_name.replace(/_/g, ' ')) || lowerQ.includes(ds.table_name)) {
      matchedTables.add(ds.table_name);
    }
  }

  // Extract columns and metrics for matched tables
  for (const tableName of matchedTables) {
    const ds = registry.find((r) => r.table_name === tableName);
    if (!ds?.semantic_types) continue;

    for (const [col, semType] of Object.entries(ds.semantic_types)) {
      // Check if column name or readable form is mentioned
      const readable = col.replace(/_/g, ' ');
      if (lowerQ.includes(readable) || lowerQ.includes(col)) {
        columns.push({ table: tableName, column: col, semantic_type: semType });
      }

      // Collect metric columns
      if (['currency', 'count', 'score', 'percentage'].includes(semType)) {
        metrics.push({ table: tableName, column: col, type: semType });
      }
    }
  }

  // Extract filter values
  for (const [keyword, filter] of Object.entries(FILTER_ALIASES)) {
    if (lowerQ.includes(keyword)) {
      // Only add if the filter column exists on a matched table
      for (const tableName of matchedTables) {
        const ds = registry.find((r) => r.table_name === tableName);
        if (ds?.semantic_types?.[filter.column]) {
          filters.push(filter);
          break;
        }
      }
    }
  }

  return { tables: Array.from(matchedTables), columns, filters, metrics };
}

// ── 3. SQL Builder ──────────────────────────────────────────

function findColumnByType(
  registry: DatasetRegistry[],
  tableName: string,
  ...types: string[]
): string | null {
  const ds = registry.find((r) => r.table_name === tableName);
  if (!ds?.semantic_types) return null;
  for (const type of types) {
    for (const [col, semType] of Object.entries(ds.semantic_types)) {
      if (semType === type) return col;
    }
  }
  return null;
}

function findAllColumnsByType(
  registry: DatasetRegistry[],
  tableName: string,
  ...types: string[]
): string[] {
  const ds = registry.find((r) => r.table_name === tableName);
  if (!ds?.semantic_types) return [];
  const result: string[] = [];
  for (const [col, semType] of Object.entries(ds.semantic_types)) {
    if (types.includes(semType)) result.push(col);
  }
  return result;
}

interface BuiltQuery {
  sql: string;
  params: any[];
  description: string;
}

function buildQuery(
  intent: Intent,
  entities: ExtractedEntities,
  registry: DatasetRegistry[]
): BuiltQuery | null {
  const table = entities.tables[0];
  if (!table) return null;

  // Validate table exists in registry
  const ds = registry.find((r) => r.table_name === table);
  if (!ds) return null;

  const categoryCol = findColumnByType(registry, table, 'category');
  const dateCol = findColumnByType(registry, table, 'date');
  const metricCol = findColumnByType(registry, table, 'currency', 'score', 'count');
  const nameCol = findColumnByType(registry, table, 'name');

  switch (intent) {
    case 'aggregate': {
      const groupBy = entities.columns.find((c) => c.semantic_type === 'category')?.column || categoryCol;
      if (groupBy) {
        return {
          sql: `SELECT COALESCE("${groupBy}"::text, 'unknown') as label, COUNT(*) as value FROM "${table}" GROUP BY "${groupBy}" ORDER BY value DESC LIMIT 15`,
          params: [],
          description: `${table} grouped by ${groupBy}`,
        };
      }
      return {
        sql: `SELECT COUNT(*) as total FROM "${table}"`,
        params: [],
        description: `total count of ${table}`,
      };
    }

    case 'ranking': {
      const orderCol = entities.metrics[0]?.column || metricCol;
      const selectCols = [nameCol, orderCol, categoryCol].filter(Boolean);
      if (orderCol && selectCols.length > 0) {
        const colList = selectCols.map((c) => `"${c}"`).join(', ');
        return {
          sql: `SELECT ${colList} FROM "${table}" WHERE "${orderCol}" IS NOT NULL ORDER BY "${orderCol}" DESC LIMIT 10`,
          params: [],
          description: `top ${table} by ${orderCol}`,
        };
      }
      // Fallback: group by category and count
      if (categoryCol) {
        return {
          sql: `SELECT COALESCE("${categoryCol}"::text, 'unknown') as label, COUNT(*) as value FROM "${table}" GROUP BY "${categoryCol}" ORDER BY value DESC LIMIT 10`,
          params: [],
          description: `top ${categoryCol} in ${table}`,
        };
      }
      return {
        sql: `SELECT * FROM "${table}" ORDER BY created_at DESC LIMIT 10`,
        params: [],
        description: `latest ${table}`,
      };
    }

    case 'trend': {
      const trendDate = dateCol || 'created_at';
      return {
        sql: `SELECT DATE_TRUNC('month', "${trendDate}") as period, COUNT(*) as value FROM "${table}" WHERE "${trendDate}" IS NOT NULL GROUP BY period ORDER BY period`,
        params: [],
        description: `${table} trend over time by ${trendDate}`,
      };
    }

    case 'filter': {
      if (entities.filters.length > 0) {
        const filter = entities.filters[0];
        const limitCols = [nameCol, categoryCol, metricCol, 'created_at'].filter(Boolean);
        const colList = limitCols.length > 0 ? limitCols.map((c) => `"${c}"`).join(', ') : '*';
        return {
          sql: `SELECT ${colList} FROM "${table}" WHERE "${filter.column}" = $1 LIMIT 50`,
          params: [filter.value],
          description: `${table} where ${filter.column} = ${filter.value}`,
        };
      }
      // No specific filter — show recent records
      const limitCols = [nameCol, categoryCol, metricCol, 'created_at'].filter(Boolean);
      const colList = limitCols.length > 0 ? limitCols.map((c) => `"${c}"`).join(', ') : '*';
      return {
        sql: `SELECT ${colList} FROM "${table}" ORDER BY created_at DESC LIMIT 20`,
        params: [],
        description: `recent ${table}`,
      };
    }

    case 'comparison': {
      if (entities.tables.length >= 2) {
        // Compare counts across tables
        const sqlParts = entities.tables.slice(0, 4).map(
          (t) => `SELECT '${t.replace(/'/g, "''")}' as entity, COUNT(*) as value FROM "${t}"`
        );
        return {
          sql: sqlParts.join(' UNION ALL '),
          params: [],
          description: `comparison of ${entities.tables.join(' vs ')}`,
        };
      }
      // Single table: group by category
      if (categoryCol) {
        return {
          sql: `SELECT COALESCE("${categoryCol}"::text, 'unknown') as label, COUNT(*) as value FROM "${table}" GROUP BY "${categoryCol}" ORDER BY value DESC`,
          params: [],
          description: `${table} by ${categoryCol}`,
        };
      }
      return null;
    }

    case 'detail': {
      const detailCols = findAllColumnsByType(registry, table, 'name', 'category', 'currency', 'score', 'date', 'email');
      const colList = detailCols.length > 0 ? detailCols.slice(0, 8).map((c) => `"${c}"`).join(', ') : '*';
      return {
        sql: `SELECT ${colList} FROM "${table}" ORDER BY created_at DESC LIMIT 20`,
        params: [],
        description: `details of ${table}`,
      };
    }

    default:
      return null;
  }
}

// ── 4. Response Formatter ───────────────────────────────────

function formatResponse(
  intent: Intent,
  entities: ExtractedEntities,
  rows: Record<string, any>[],
  question: string,
  queryDesc: string,
  registry: DatasetRegistry[]
): QueryResponse {
  const table = entities.tables[0] || 'data';
  const readableTable = table.replace(/_/g, ' ');

  // Build narrative
  let narrative: string;
  if (rows.length === 0) {
    narrative = `No data found for ${readableTable} matching your query.`;
  } else if (intent === 'aggregate' && rows.length === 1 && rows[0].total !== undefined) {
    narrative = `There are ${Number(rows[0].total).toLocaleString()} ${readableTable} in the system.`;
  } else if (intent === 'aggregate') {
    const top3 = rows.slice(0, 3).map((r) => `${r.label || r.group_val} (${Number(r.value).toLocaleString()})`).join(', ');
    narrative = `${readableTable} breakdown: ${top3}${rows.length > 3 ? ` and ${rows.length - 3} more categories` : ''}.`;
  } else if (intent === 'ranking') {
    const topItems = rows.slice(0, 3).map((r, i) => {
      const name = r[Object.keys(r)[0]];
      return `${i + 1}. ${name}`;
    });
    narrative = `Top ${readableTable}: ${topItems.join(', ')}.`;
  } else if (intent === 'trend') {
    const first = rows[0]?.value ? Number(rows[0].value) : 0;
    const last = rows[rows.length - 1]?.value ? Number(rows[rows.length - 1].value) : 0;
    const direction = last > first ? 'increased' : last < first ? 'decreased' : 'remained stable';
    narrative = `${readableTable} has ${direction} from ${first} to ${last} over ${rows.length} periods.`;
  } else if (intent === 'filter') {
    narrative = `Found ${rows.length} ${readableTable} matching your criteria.`;
  } else if (intent === 'comparison') {
    const items = rows.map((r) => `${r.entity || r.label}: ${Number(r.value).toLocaleString()}`).join(', ');
    narrative = `Comparison: ${items}.`;
  } else if (intent === 'detail') {
    narrative = `Showing ${rows.length} ${readableTable} records.`;
  } else {
    narrative = `Query returned ${rows.length} results for ${readableTable}.`;
  }

  // Build visualization
  const visualizations: QueryResponse['visualizations'] = [];
  const chartData = rows.slice(0, 20);

  if (chartData.length > 0 && (chartData[0].label || chartData[0].entity || chartData[0].period)) {
    let chartType = 'bar';
    let labelKey = 'label';
    if (intent === 'trend') {
      chartType = 'line';
      labelKey = 'period';
      // Format period dates
      for (const row of chartData) {
        if (row.period instanceof Date) {
          row.period = (row.period as Date).toISOString().slice(0, 7);
        } else if (typeof row.period === 'string') {
          row.period = row.period.slice(0, 7);
        }
      }
    } else if (intent === 'comparison') {
      labelKey = chartData[0].entity ? 'entity' : 'label';
    }

    visualizations.push({
      chart_type: chartType,
      title: queryDesc.charAt(0).toUpperCase() + queryDesc.slice(1),
      data: chartData.map((r) => ({
        label: r[labelKey] || r.label || r.entity || 'Unknown',
        value: Number(r.value || r.total || 0),
      })),
      config: { label_key: 'label', value_key: 'value' },
    });
  }

  // Generate follow-ups
  const followUps = generateFollowUps(intent, entities, registry);

  return {
    question,
    intent,
    narrative,
    data: { query: queryDesc, rows, row_count: rows.length },
    visualizations,
    follow_ups: followUps,
    sources: entities.tables,
    execution_path: `local_query → ${intent} → ${queryDesc}`,
  };
}

function generateFollowUps(intent: Intent, entities: ExtractedEntities, registry: DatasetRegistry[]): string[] {
  const table = entities.tables[0];
  if (!table) return ['Give me an executive summary', 'How many leads do we have?', 'Show campaign performance'];

  const readableTable = table.replace(/_/g, ' ');
  const ds = registry.find((r) => r.table_name === table);
  const semantics = ds?.semantic_types || {};
  const categoryColumns = Object.entries(semantics).filter(([, t]) => t === 'category').map(([c]) => c.replace(/_/g, ' '));
  const metricColumns = Object.entries(semantics).filter(([, t]) => ['currency', 'score', 'count'].includes(t)).map(([c]) => c.replace(/_/g, ' '));

  const suggestions: string[] = [];

  if (intent !== 'trend') {
    suggestions.push(`Show ${readableTable} trends over time`);
  }
  if (intent !== 'ranking' && metricColumns.length > 0) {
    suggestions.push(`Top ${readableTable} by ${metricColumns[0]}`);
  }
  if (intent !== 'aggregate' && categoryColumns.length > 0) {
    suggestions.push(`${readableTable} breakdown by ${categoryColumns[0]}`);
  }

  // Cross-entity suggestions
  const otherTables = ['leads', 'enrollments', 'campaigns', 'cohorts'].filter((t) => t !== table);
  if (otherTables.length > 0) {
    suggestions.push(`How many ${otherTables[0].replace(/_/g, ' ')} do we have?`);
  }

  return suggestions.slice(0, 4);
}

// ── Main Entry Point ────────────────────────────────────────

export async function handleLocalQuery(question: string): Promise<QueryResponse> {
  const registry = await loadRegistry();
  const intent = classifyIntent(question);
  const entities = extractEntities(question, registry);

  // No tables matched — fall back to executive summary
  if (entities.tables.length === 0) {
    const summary = await generateLocalSummary();
    return { ...summary, question, execution_path: 'local_fallback → executive_summary' };
  }

  const query = buildQuery(intent, entities, registry);
  if (!query) {
    const summary = await generateLocalSummary();
    return { ...summary, question, execution_path: 'local_fallback → no_query_built → executive_summary' };
  }

  try {
    const rows = await sequelize.query<Record<string, any>>(query.sql, {
      type: QueryTypes.SELECT,
      bind: query.params.length > 0 ? query.params : undefined,
    });

    return formatResponse(intent, entities, rows, question, query.description, registry);
  } catch (err: any) {
    console.warn('[Intelligence] Local query failed:', err?.message, '| SQL:', query.sql);
    const summary = await generateLocalSummary();
    return { ...summary, question, execution_path: `local_fallback → sql_error → executive_summary` };
  }
}
