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

// Table sync utility
import { sequelize } from '../config/database';
import DatasetRegistry from '../models/DatasetRegistry';
import SystemProcess from '../models/SystemProcess';
import IntelligenceConfig from '../models/IntelligenceConfig';
import QAHistory from '../models/QAHistory';
import AiSystemEvent from '../models/AiSystemEvent';

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
 * Uses alter:true so that new columns are added automatically.
 */
export async function ensureIntelligenceTables(): Promise<void> {
  await ensureVectorExtensions();

  const models = [DatasetRegistry, SystemProcess, IntelligenceConfig, QAHistory, AiSystemEvent];

  for (const model of models) {
    try {
      await (model as any).sync({ alter: true });
    } catch (error: any) {
      console.warn(`[Intelligence] Failed to sync ${(model as any).tableName}:`, error?.message);
    }
  }

  console.log('[Intelligence] Intelligence tables synced');
}
