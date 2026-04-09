/**
 * ImplementationStrategyService
 * CRUD service for implementation strategy records.
 */

import { Op } from 'sequelize';

const LOG_PREFIX = '[ImplementationStrategy]';

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export async function getImplementationStrategies(params?: {
  search?: string;
  status?: string;
  project_id?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: any[]; count: number }> {
  const { default: ImplementationStrategy } = await import('../models/ImplementationStrategy');

  const where: any = {};
  const page = params?.page || 1;
  const limit = Math.min(params?.limit || 25, 100);
  const offset = (page - 1) * limit;

  // Status filter (default to active)
  where.status = params?.status || 'active';

  // Project filter
  if (params?.project_id) {
    where.project_id = params.project_id;
  }

  // Search across name and description
  if (params?.search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${params.search}%` } },
      { description: { [Op.iLike]: `%${params.search}%` } },
    ];
  }

  const { rows, count } = await ImplementationStrategy.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });

  console.log(`${LOG_PREFIX} Listed strategies: ${count} total, page ${page}`);
  return { rows, count };
}

export async function getImplementationStrategyById(id: string): Promise<any | null> {
  const { default: ImplementationStrategy } = await import('../models/ImplementationStrategy');
  return ImplementationStrategy.findByPk(id);
}

export async function createImplementationStrategy(data: {
  project_id: string;
  name: string;
  description?: string;
  priority?: string;
  phases?: any[];
  timeline?: Record<string, any>;
  risks?: any[];
  dependencies?: any[];
}): Promise<any> {
  const { default: ImplementationStrategy } = await import('../models/ImplementationStrategy');

  if (!data.project_id || !data.name) {
    throw new Error('project_id and name are required');
  }

  console.log(`${LOG_PREFIX} Creating strategy: ${data.name} (project: ${data.project_id})`);
  const strategy = await ImplementationStrategy.create(data as any);
  console.log(`${LOG_PREFIX} Created strategy ${(strategy as any).id}`);
  return strategy;
}

export async function updateImplementationStrategy(id: string, data: Partial<{
  name: string;
  description: string;
  status: string;
  priority: string;
  phases: any[];
  timeline: Record<string, any>;
  risks: any[];
  dependencies: any[];
}>): Promise<any> {
  const { default: ImplementationStrategy } = await import('../models/ImplementationStrategy');

  const strategy = await ImplementationStrategy.findByPk(id);
  if (!strategy) throw new Error('Implementation strategy not found');

  console.log(`${LOG_PREFIX} Updating strategy ${id}: fields=[${Object.keys(data).join(', ')}]`);
  await strategy.update(data);
  return strategy;
}
