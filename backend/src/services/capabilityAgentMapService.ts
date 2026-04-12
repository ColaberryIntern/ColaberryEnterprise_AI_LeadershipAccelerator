/**
 * Capability-Agent Mapping Service
 * Manages the formal relationships between business processes and agents.
 * The capability_agent_maps table is the source of truth; Capability.linked_agents[]
 * is kept in sync as a denormalized cache for backward compatibility.
 */
import CapabilityAgentMap from '../models/CapabilityAgentMap';
import Capability from '../models/Capability';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Sync: populate mapping table from existing linked_agents arrays
// ---------------------------------------------------------------------------

export async function syncFromLinkedAgents(projectId?: string): Promise<{ created: number; skipped: number }> {
  const where: any = {};
  if (projectId) where.project_id = projectId;

  const caps = await Capability.findAll({ where, attributes: ['id', 'linked_agents'] });
  let created = 0;
  let skipped = 0;

  for (const cap of caps) {
    const agents = (cap.linked_agents || []) as string[];
    for (const agentName of agents) {
      if (!agentName) continue;
      const existing = await CapabilityAgentMap.findOne({
        where: { capability_id: cap.id, agent_name: agentName, status: 'active' },
      });
      if (existing) { skipped++; continue; }
      await CapabilityAgentMap.create({
        capability_id: cap.id,
        agent_name: agentName,
        role: 'executor',
        status: 'active',
        linked_by: 'sync',
      });
      created++;
    }
  }

  return { created, skipped };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function linkAgent(capabilityId: string, agentName: string, options?: {
  featureId?: string;
  role?: string;
  config?: Record<string, any>;
  linkedBy?: string;
}): Promise<CapabilityAgentMap> {
  // Reactivate if soft-deleted, or create new
  const existing = await CapabilityAgentMap.findOne({
    where: { capability_id: capabilityId, agent_name: agentName },
  });

  if (existing) {
    existing.status = 'active';
    existing.unlinked_at = null as any;
    existing.role = options?.role || existing.role;
    existing.feature_id = options?.featureId || existing.feature_id;
    existing.config = options?.config || existing.config;
    existing.linked_by = options?.linkedBy || 'manual';
    existing.linked_at = new Date();
    await existing.save();
    await syncLinkedAgentsCache(capabilityId);
    return existing;
  }

  const map = await CapabilityAgentMap.create({
    capability_id: capabilityId,
    feature_id: options?.featureId,
    agent_name: agentName,
    role: options?.role || 'executor',
    config: options?.config || {},
    linked_by: options?.linkedBy || 'manual',
  });

  await syncLinkedAgentsCache(capabilityId);
  return map;
}

export async function unlinkAgent(capabilityId: string, agentName: string): Promise<void> {
  const map = await CapabilityAgentMap.findOne({
    where: { capability_id: capabilityId, agent_name: agentName, status: 'active' },
  });
  if (map) {
    map.status = 'disabled';
    map.unlinked_at = new Date();
    await map.save();
    await syncLinkedAgentsCache(capabilityId);
  }
}

export async function getAgentsForCapability(capabilityId: string): Promise<CapabilityAgentMap[]> {
  return CapabilityAgentMap.findAll({
    where: { capability_id: capabilityId, status: 'active' },
    order: [['priority', 'ASC'], ['agent_name', 'ASC']],
  });
}

export async function getCapabilitiesForAgent(agentName: string): Promise<CapabilityAgentMap[]> {
  return CapabilityAgentMap.findAll({
    where: { agent_name: agentName, status: 'active' },
    order: [['priority', 'ASC']],
  });
}

export async function getAgentHistory(capabilityId: string): Promise<CapabilityAgentMap[]> {
  return CapabilityAgentMap.findAll({
    where: { capability_id: capabilityId },
    order: [['linked_at', 'DESC']],
  });
}

// ---------------------------------------------------------------------------
// Keep Capability.linked_agents[] in sync (backward compat cache)
// ---------------------------------------------------------------------------

async function syncLinkedAgentsCache(capabilityId: string): Promise<void> {
  const activeMaps = await CapabilityAgentMap.findAll({
    where: { capability_id: capabilityId, status: 'active' },
    attributes: ['agent_name'],
    order: [['priority', 'ASC']],
  });

  const agentNames = activeMaps.map(m => m.agent_name);
  await Capability.update(
    { linked_agents: agentNames } as any,
    { where: { id: capabilityId } },
  );
}
