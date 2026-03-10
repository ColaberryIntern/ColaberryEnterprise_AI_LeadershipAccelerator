import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import DatasetRegistry from '../../models/DatasetRegistry';
import { intelligenceProxy } from '../../services/intelligenceProxyService';

interface TableStatus {
  name: string;
  category: string;
  status: 'available' | 'empty' | 'missing';
  row_count: number;
}

interface DataAccessReport {
  tables: TableStatus[];
  summary: {
    total: number;
    available: number;
    empty: number;
    missing: number;
  };
  python_proxy: boolean;
  vector_db: boolean;
  checked_at: string;
}

const CRITICAL_TABLES: Record<string, string> = {
  campaigns: 'campaigns',
  leads: 'leads',
  enrollments: 'students',
  cohorts: 'cohorts',
  visitors: 'visitors',
  ai_agents: 'agents',
  activities: 'leads',
  campaign_health: 'campaigns',
  campaign_errors: 'campaigns',
  opportunity_scores: 'leads',
  attendance_records: 'students',
  curriculum_modules: 'curriculum',
  program_blueprints: 'curriculum',
  orchestration_health: 'agents',
  dataset_registry: 'system',
  system_processes: 'system',
  qa_history: 'system',
};

export async function verifyDataAccess(): Promise<DataAccessReport> {
  const tables: TableStatus[] = [];

  // Check each critical table
  for (const [tableName, category] of Object.entries(CRITICAL_TABLES)) {
    try {
      const result: { count: string }[] = await sequelize.query(
        `SELECT COUNT(*) as count FROM "${tableName}"`,
        { type: QueryTypes.SELECT },
      );
      const rowCount = Number(result[0]?.count || 0);
      tables.push({
        name: tableName,
        category,
        status: rowCount > 0 ? 'available' : 'empty',
        row_count: rowCount,
      });
    } catch {
      tables.push({
        name: tableName,
        category,
        status: 'missing',
        row_count: 0,
      });
    }
  }

  // Cross-reference with dataset_registry
  const registeredDatasets = await DatasetRegistry.findAll({
    attributes: ['table_name', 'row_count'],
  });
  const registryMap = new Map(registeredDatasets.map((d) => [d.table_name, d.row_count]));

  // Update row counts from registry if more recent
  for (const t of tables) {
    const registryCount = registryMap.get(t.name);
    if (registryCount != null && registryCount > t.row_count) {
      t.row_count = registryCount;
      if (t.status === 'empty' && registryCount > 0) {
        t.status = 'available';
      }
    }
  }

  // Check Python proxy (ML + orchestrator)
  let pythonProxy = false;
  try {
    const health = await intelligenceProxy.getHealth();
    pythonProxy = !!health?.data;
  } catch {
    pythonProxy = false;
  }

  // Check vector DB via proxy
  let vectorDb = false;
  try {
    const health = await intelligenceProxy.getHealth();
    vectorDb = !!(health?.data?.vector_store || health?.data?.chromadb);
  } catch {
    vectorDb = false;
  }

  const available = tables.filter((t) => t.status === 'available').length;
  const empty = tables.filter((t) => t.status === 'empty').length;
  const missing = tables.filter((t) => t.status === 'missing').length;

  return {
    tables,
    summary: {
      total: tables.length,
      available,
      empty,
      missing,
    },
    python_proxy: pythonProxy,
    vector_db: vectorDb,
    checked_at: new Date().toISOString(),
  };
}
