import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import DatasetRegistry from '../models/DatasetRegistry';
import SystemProcess from '../models/SystemProcess';
import IntelligenceConfig from '../models/IntelligenceConfig';
import QAHistory from '../models/QAHistory';
import { intelligenceProxy } from '../services/intelligenceProxyService';

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
    const result = await intelligenceProxy.runDiscovery();
    res.json(result.data);
  } catch (error: any) {
    if (error?.code === 'ECONNREFUSED') {
      res.status(503).json({ error: 'Intelligence engine is not running' });
      return;
    }
    next(error);
  }
}

export async function handleGetDictionary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await intelligenceProxy.getDictionary();
    res.json(result.data);
  } catch (error: any) {
    if (error?.code === 'ECONNREFUSED') {
      res.status(503).json({ error: 'Intelligence engine is not running' });
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

    const result = await intelligenceProxy.queryOrchestrator({ question, scope });

    // Store Q&A history
    await QAHistory.create({
      question,
      answer: result.data?.narrative || '',
      intent: result.data?.intent || '',
      entities: result.data?.entities || {},
      execution_path: result.data?.execution_path || '',
      sources: result.data?.sources || [],
      user_id: (req as any).user?.id || null,
      scope: scope || {},
    });

    res.json(result.data);
  } catch (error: any) {
    if (error?.code === 'ECONNREFUSED') {
      res.status(503).json({ error: 'Intelligence engine is not running' });
      return;
    }
    next(error);
  }
}

export async function handleGetExecutiveSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await intelligenceProxy.getExecutiveSummary();
    res.json(result.data);
  } catch (error: any) {
    if (error?.code === 'ECONNREFUSED') {
      res.status(503).json({ error: 'Intelligence engine is not running' });
      return;
    }
    next(error);
  }
}

export async function handleGetRankedInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await intelligenceProxy.getRankedInsights();
    res.json(result.data);
  } catch (error: any) {
    if (error?.code === 'ECONNREFUSED') {
      res.status(503).json({ error: 'Intelligence engine is not running' });
      return;
    }
    next(error);
  }
}

export async function handleGetEntityNetwork(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await intelligenceProxy.getEntityNetwork();
    res.json(result.data);
  } catch (error: any) {
    if (error?.code === 'ECONNREFUSED') {
      res.status(503).json({ error: 'Intelligence engine is not running' });
      return;
    }
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
