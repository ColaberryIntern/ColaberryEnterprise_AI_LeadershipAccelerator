import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import DatasetRegistry from '../models/DatasetRegistry';
import SystemProcess from '../models/SystemProcess';
import IntelligenceConfig from '../models/IntelligenceConfig';
import QAHistory from '../models/QAHistory';
import { intelligenceProxy } from '../services/intelligenceProxyService';
import { runDiscoveryAgent } from '../intelligence/agents/datasetRegistrationAgent';
import {
  handleQuery,
  handleExecutiveSummary,
  handleRankedInsights,
  handleEntityNetwork,
} from '../intelligence/orchestrator/queryEngine';

export async function handleGetHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [datasetsCount, processCount24h, engineHealth] = await Promise.all([
      DatasetRegistry.count(),
      SystemProcess.count({ where: { created_at: { [Op.gte]: oneDayAgo } } }),
      intelligenceProxy.getHealth().catch(() => null),
    ]);

    const lastDiscovery = await DatasetRegistry.findOne({
      order: [['last_scanned', 'DESC']],
      attributes: ['last_scanned'],
    });

    res.json({
      engine_status: engineHealth ? 'online' : 'offline',
      engine_detail: engineHealth?.data || null,
      last_discovery: lastDiscovery?.last_scanned || null,
      datasets_count: datasetsCount,
      processes_count_24h: processCount24h,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleListDatasets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const datasets = await DatasetRegistry.findAll({
      order: [['last_scanned', 'DESC']],
    });
    res.json(datasets);
  } catch (error) {
    next(error);
  }
}

export async function handleGetDataset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dataset = await DatasetRegistry.findByPk(req.params.id as string);
    if (!dataset) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }
    res.json(dataset);
  } catch (error) {
    next(error);
  }
}

export async function handleListProcesses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit = 100, offset = 0, source_module, event_type, status } = req.query;
    const where: Record<string, any> = {};
    if (source_module) where.source_module = source_module;
    if (event_type) where.event_type = event_type;
    if (status) where.status = status;

    const processes = await SystemProcess.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: Number(limit),
      offset: Number(offset),
    });
    res.json({ rows: processes.rows, count: processes.count });
  } catch (error) {
    next(error);
  }
}

export async function handleGetConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const configs = await IntelligenceConfig.findAll();
    res.json(configs);
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { config_key, config_value } = req.body;
    const [config] = await IntelligenceConfig.upsert({
      config_key,
      config_value,
      updated_at: new Date(),
    });
    res.json(config);
  } catch (error) {
    next(error);
  }
}

export async function handleTriggerDiscovery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Run TypeScript discovery (populates dataset_registry directly)
    const tsResult = await runDiscoveryAgent();

    // Also try Python discovery for data_dictionary.json (non-blocking)
    intelligenceProxy.runDiscovery().catch(() => {});

    res.json({
      status: 'completed',
      tables_discovered: tsResult?.tables_discovered || 0,
      relationships_found: tsResult?.relationships_found || 0,
      hub_entity: tsResult?.hub_entity || null,
    });
  } catch (error: any) {
    next(error);
  }
}

export async function handleGetDictionary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await intelligenceProxy.getDictionary();
    res.json(result.data);
  } catch (error: any) {
    if (error?.code === 'ECONNREFUSED') {
      // Fallback: build dictionary from dataset_registry
      const datasets = await DatasetRegistry.findAll();
      const dictionary: Record<string, any> = { tables: {} };
      for (const ds of datasets) {
        dictionary.tables[ds.table_name] = {
          row_count: ds.row_count,
          column_count: ds.column_count,
          semantic_types: ds.semantic_types,
          relationships: ds.relationships,
        };
      }
      res.json(dictionary);
      return;
    }
    next(error);
  }
}

export async function handleQueryOrchestrator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { question, scope } = req.body;
    if (!question) {
      res.status(400).json({ error: 'question is required' });
      return;
    }

    const data = await handleQuery(question, scope);

    // Store Q&A history
    await QAHistory.create({
      question,
      answer: data?.narrative || '',
      intent: data?.intent || '',
      entities: (data as any)?.entities || {},
      execution_path: data?.execution_path || '',
      sources: data?.sources || [],
      user_id: (req as any).user?.id || null,
      scope: scope || {},
    });

    res.json(data);
  } catch (error: any) {
    next(error);
  }
}

export async function handleGetExecutiveSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await handleExecutiveSummary(req.query.entity_type as string | undefined);
    res.json(data);
  } catch (error: any) {
    next(error);
  }
}

export async function handleGetRankedInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await handleRankedInsights();
    res.json(data);
  } catch (error: any) {
    next(error);
  }
}

export async function handleGetEntityNetwork(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await handleEntityNetwork();
    res.json(data);
  } catch (error: any) {
    next(error);
  }
}

export async function handleGetQAHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const history = await QAHistory.findAndCountAll({
      order: [['created_at', 'DESC']],
      limit: Number(limit),
      offset: Number(offset),
    });
    res.json({ rows: history.rows, count: history.count });
  } catch (error) {
    next(error);
  }
}

export async function handleGetKPIs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { getIntelligenceKPIs } = await import('../intelligence/services/analyticsService');
    const data = await getIntelligenceKPIs(req.query.entity_type as string | undefined);
    res.json(data);
  } catch (error) { next(error); }
}

export async function handleGetAnomalies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { getAnomalies } = await import('../intelligence/services/analyticsService');
    const data = await getAnomalies(req.query.entity_type as string | undefined);
    res.json(data);
  } catch (error) { next(error); }
}

export async function handleGetForecasts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { getForecasts } = await import('../intelligence/services/analyticsService');
    const data = await getForecasts(req.query.entity_type as string | undefined);
    res.json(data);
  } catch (error) { next(error); }
}

export async function handleGetRiskEntities(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { getRiskEntities } = await import('../intelligence/services/analyticsService');
    const data = await getRiskEntities(req.query.entity_type as string | undefined);
    res.json(data);
  } catch (error) { next(error); }
}

export async function handleGetBusinessHierarchy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { buildBusinessEntityHierarchy } = await import('../intelligence/services/businessEntityService');
    const data = await buildBusinessEntityHierarchy();
    res.json(data);
  } catch (error) { next(error); }
}

export async function handleDataAccessReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { verifyDataAccess } = await import('../intelligence/services/dataAccessService');
    const data = await verifyDataAccess();
    res.json(data);
  } catch (error) { next(error); }
}

export async function handleAssistantQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { question, entity_type } = req.body;
    if (!question) {
      res.status(400).json({ error: 'question is required' });
      return;
    }
    const { runAssistantPipeline } = await import('../intelligence/assistant/queryEngine');
    const data = await runAssistantPipeline(question, entity_type);

    // Store in Q&A history
    const QAHistory = (await import('../models/QAHistory')).default;
    await QAHistory.create({
      question,
      answer: data.narrative || '',
      intent: data.intent || '',
      entities: { entity_type: entity_type || 'global' },
      execution_path: data.execution_path || '',
      sources: data.sources || [],
      user_id: (req as any).user?.id || null,
      scope: { entity_type: entity_type || 'global' },
    });

    res.json(data);
  } catch (error) { next(error); }
}
