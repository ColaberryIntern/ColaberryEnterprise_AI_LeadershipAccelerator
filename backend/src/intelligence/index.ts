// Discovery
export { runFullDiscovery } from './discovery/dictionaryBuilder';

// Agents
export { runDiscoveryAgent, ensureDatasetsCovered } from './agents/datasetRegistrationAgent';
export { observeProcess, intelligenceMiddleware, logSystemEvent } from './agents/processObservationAgent';

// Services
export { buildEntityNetwork } from './services/entityGraphService';
export { generateLocalSummary } from './services/executiveSummaryService';
export { handleLocalQuery } from './services/localQueryEngine';

// Orchestrator
export {
  handleQuery,
  handleExecutiveSummary,
  handleRankedInsights,
  handleEntityNetwork,
  isPythonAvailable,
} from './orchestrator/queryEngine';

// Autonomous Operations
export { runAutonomousCycle, simulateAutonomousCycle } from './autonomy/autonomousEngine';

// Strategy
export { runStrategicCycle } from './strategy/aiCOO';

// Meta-Agents
export { runMetaAgentLoop } from './meta/metaAgentLoop';

// Knowledge & Memory
export { getKnowledgeGraph } from './knowledge/knowledgeGraph';
export { getVectorMemory } from './memory/vectorMemory';

// Table sync utility
import { sequelize } from '../config/database';
import DatasetRegistry from '../models/DatasetRegistry';
import SystemProcess from '../models/SystemProcess';
import IntelligenceConfig from '../models/IntelligenceConfig';
import QAHistory from '../models/QAHistory';
import AiSystemEvent from '../models/AiSystemEvent';
import IntelligenceDecision from '../models/IntelligenceDecision';
import IntelligenceMemory from '../models/IntelligenceMemory';
import AgentPerformanceMetric from '../models/AgentPerformanceMetric';

/**
 * Ensure pgvector and uuid-ossp extensions are available.
 */
async function ensureVectorExtensions(): Promise<void> {
  try {
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS vector');
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('[Intelligence] Vector extensions ensured');
  } catch (err: any) {
    console.warn('[Intelligence] Vector extension setup skipped:', err?.message);
  }
}

/**
 * Ensure all intelligence-related tables exist.
 *
 * CREATE-ONLY by default. `alter: true` is gated behind DB_BOOT_SYNC (same flag
 * and reason as the global sync in server.ts): Sequelize's alter pass cannot
 * detect an existing unique index on a `unique: true` column, so it re-creates
 * one (`<table>_<col>_key`, `_key1`, `_key2` …) on EVERY boot. Left ungated,
 * this loop accumulated thousands of duplicate unique indexes per intelligence
 * table (dataset_registry, intelligence_config, …), exhausting the Postgres lock
 * table ("out of shared memory") and bloating the DB. New columns are added via
 * explicit schema hooks, not this sync — set DB_BOOT_SYNC=true only for a
 * deliberate, supervised schema reconciliation.
 */
export async function ensureIntelligenceTables(): Promise<void> {
  await ensureVectorExtensions();

  const models = [
    DatasetRegistry, SystemProcess, IntelligenceConfig, QAHistory, AiSystemEvent,
    IntelligenceDecision, IntelligenceMemory, AgentPerformanceMetric,
  ];

  const syncOpts = process.env.DB_BOOT_SYNC === 'true' ? { alter: true } : {};
  for (const model of models) {
    try {
      await (model as any).sync(syncOpts);
    } catch (error: any) {
      console.warn(`[Intelligence] Failed to sync ${(model as any).tableName}:`, error?.message);
    }
  }

  console.log('[Intelligence] Intelligence tables synced');
}
