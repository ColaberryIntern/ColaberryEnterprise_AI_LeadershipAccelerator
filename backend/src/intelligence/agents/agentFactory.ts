// ─── Agent Factory ────────────────────────────────────────────────────────────
// Dynamic agent creation, retirement, and department management.
// Used by AI COO (Cory) to hire/retire agents at runtime.

import { AiAgent } from '../../models';
import { registerAgent, hasAgent, listAllAgents } from './agentRegistry';
import type { AgentExecutionResult } from '../../services/agents/types';
import { Op } from 'sequelize';
import { resolveGlobalConfig, HARDCODED_DEFAULTS } from '../../services/governanceResolutionService';

// ─── Department Mapping ──────────────────────────────────────────────────────

export type Department =
  | 'Executive'
  | 'Strategy'
  | 'Marketing'
  | 'Admissions'
  | 'Alumni'
  | 'Partnerships'
  | 'Education'
  | 'Student_Success'
  | 'Platform'
  | 'Intelligence'
  | 'Governance'
  | 'Reporting'
  | 'Finance'
  | 'Operations'
  | 'Orchestration'
  | 'Growth'
  | 'Infrastructure'
  | 'Security';

const CATEGORY_TO_DEPARTMENT: Record<string, Department> = {
  // Intelligence
  behavioral: 'Intelligence',
  ai_ops: 'Intelligence',
  memory: 'Intelligence',
  meta: 'Intelligence',
  autonomous: 'Intelligence',
  // Marketing
  outbound: 'Marketing',
  openclaw: 'Marketing',
  // Strategy
  strategic: 'Strategy',
  // Education
  accelerator: 'Education',
  curriculum: 'Education',
  // Platform
  maintenance: 'Platform',
  operations: 'Platform',
  website_intelligence: 'Platform',
  orchestration: 'Platform',
  // Admissions
  admissions: 'Admissions',
  admissions_ops: 'Admissions',
  // Governance
  security: 'Governance',
  governance_ops: 'Governance',
  // New department categories
  executive: 'Executive',
  alumni: 'Alumni',
  partnerships: 'Partnerships',
  student_success: 'Student_Success',
  // Reporting department
  reporting: 'Reporting',
  // Department Strategy
  dept_strategy: 'Strategy',
  // Security Operations
  security_ops: 'Security',
};

const DEPARTMENT_TO_CATEGORIES: Record<Department, string[]> = {
  Executive: ['executive'],
  Strategy: ['strategic'],
  Marketing: ['outbound', 'openclaw'],
  Admissions: ['admissions', 'admissions_ops'],
  Alumni: ['alumni'],
  Partnerships: ['partnerships'],
  Education: ['accelerator', 'curriculum'],
  Student_Success: ['student_success'],
  Platform: ['maintenance', 'operations', 'website_intelligence', 'orchestration'],
  Intelligence: ['behavioral', 'ai_ops', 'memory', 'meta', 'autonomous'],
  Governance: ['security', 'governance_ops'],
  Reporting: ['reporting'],
  Finance: [],
  Operations: [],
  Orchestration: [],
  Growth: [],
  Infrastructure: [],
  Security: ['security_ops'],
};

export function getDepartmentForCategory(category: string): Department {
  return CATEGORY_TO_DEPARTMENT[category] || 'Platform';
}

export function getAllDepartments(): Department[] {
  return Object.keys(DEPARTMENT_TO_CATEGORIES) as Department[];
}

// ─── Agent Spec ──────────────────────────────────────────────────────────────

export interface AgentSpec {
  name: string;
  role: string;
  department: Department;
  responsibilities: string;
  trigger_type?: 'cron' | 'on_demand' | 'event_driven';
  schedule?: string;
}

export interface DepartmentSummary {
  department: Department;
  agent_count: number;
  healthy: number;
  errored: number;
  paused: number;
  agents: Array<{
    id: string;
    agent_name: string;
    status: string;
    enabled: boolean;
    run_count: number;
    error_count: number;
    last_run_at: string | null;
  }>;
}

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Create a new agent dynamically. Validates uniqueness, enforces limits,
 * creates DB record in PENDING APPROVAL state (disabled until admin activates).
 * The agent is NOT registered in-memory until approved and activated.
 */
export async function createAgent(spec: AgentSpec): Promise<any> {
  // Validate name uniqueness
  const existing = await AiAgent.findOne({ where: { agent_name: spec.name } });
  if (existing || hasAgent(spec.name)) {
    throw new Error(`Agent "${spec.name}" already exists`);
  }

  // Enforce dynamic agent limit (from governance DB, fallback to hardcoded)
  let maxDynamic = HARDCODED_DEFAULTS.max_dynamic_agents;
  try {
    const config = await resolveGlobalConfig();
    maxDynamic = config.max_dynamic_agents;
  } catch { /* fallback */ }

  const dynamicCount = await AiAgent.count({ where: { agent_type: 'dynamic' } });
  if (dynamicCount >= maxDynamic) {
    throw new Error(`Maximum dynamic agents (${maxDynamic}) reached`);
  }

  // Determine category from department
  const categories = DEPARTMENT_TO_CATEGORIES[spec.department];
  const category = categories ? categories[0] : 'ai_ops';

  // Create DB record — DISABLED and PENDING APPROVAL until admin activates
  const agent = await AiAgent.create({
    agent_name: spec.name,
    agent_type: 'dynamic',
    status: 'paused',
    enabled: false,
    trigger_type: spec.trigger_type || 'on_demand',
    schedule: spec.schedule || '',
    category,
    description: spec.responsibilities,
    config: {
      role: spec.role,
      department: spec.department,
      responsibilities: spec.responsibilities,
      created_by: 'cory_coo',
      pending_approval: true,
    },
    run_count: 0,
    error_count: 0,
  } as any);

  // NOTE: Agent is NOT registered in-memory until approved via activatePendingAgent()
  console.log(`[Agent Factory] Created agent "${spec.name}" in ${spec.department} (PENDING APPROVAL)`);
  return agent;
}

/**
 * Activate a pending agent after admin approval.
 * Sets enabled=true, registers in-memory executor.
 */
export async function activatePendingAgent(agentId: string): Promise<any> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.agent_type !== 'dynamic') throw new Error('Only dynamic agents can be activated via this flow');

  await agent.update({
    enabled: true,
    status: 'idle',
    config: { ...(agent.config || {}), pending_approval: false, activated_at: new Date().toISOString() },
    updated_at: new Date(),
  });

  // Register in-memory with a generic executor
  registerAgent({
    name: agent.agent_name,
    category: 'operations',
    description: agent.description || '',
    executor: async (_agentId: string, _config: Record<string, any>): Promise<AgentExecutionResult> => {
      const start = Date.now();
      return {
        agent_name: agent.agent_name,
        campaigns_processed: 0,
        actions_taken: [],
        errors: [],
        duration_ms: Date.now() - start,
      };
    },
  });

  console.log(`[Agent Factory] Activated agent "${agent.agent_name}"`);
  return agent;
}

/**
 * Retire an agent — disable it and remove from in-memory registry.
 */
export async function retireAgent(agentId: string): Promise<void> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) throw new Error('Agent not found');

  await agent.update({ enabled: false, status: 'paused' });
  // Note: cannot remove from Map without name, but disabled agents won't be dispatched
  console.log(`[Agent Factory] Retired agent "${agent.agent_name}"`);
}

/**
 * Edit an existing agent's configuration.
 */
export async function editAgent(
  agentId: string,
  updates: Partial<AgentSpec>,
): Promise<any> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) throw new Error('Agent not found');

  const patchData: Record<string, any> = {};
  if (updates.responsibilities) {
    patchData.description = updates.responsibilities;
  }
  if (updates.department) {
    const cats = DEPARTMENT_TO_CATEGORIES[updates.department];
    if (cats) patchData.category = cats[0];
    patchData.config = { ...(agent.config || {}), department: updates.department };
  }
  if (updates.name) patchData.agent_name = updates.name;
  if (updates.schedule !== undefined) patchData.schedule = updates.schedule;
  if (updates.trigger_type) patchData.trigger_type = updates.trigger_type;

  await agent.update(patchData);
  return agent;
}

/**
 * List agents in a specific department.
 */
export async function listDepartmentAgents(department: Department): Promise<any[]> {
  const categories = DEPARTMENT_TO_CATEGORIES[department];
  if (!categories || categories.length === 0) return [];

  return AiAgent.findAll({
    where: { category: { [Op.in]: categories } },
    order: [['agent_name', 'ASC']],
  });
}

/**
 * Get summary statistics for each department.
 */
export async function getDepartmentSummary(): Promise<DepartmentSummary[]> {
  const allAgents = await AiAgent.findAll({ order: [['agent_name', 'ASC']] });
  const departments = getAllDepartments();

  return departments.map((dept) => {
    const categories = DEPARTMENT_TO_CATEGORIES[dept] || [];
    const deptAgents = allAgents.filter((a: any) => categories.includes(a.category));

    return {
      department: dept,
      agent_count: deptAgents.length,
      healthy: deptAgents.filter((a: any) => a.enabled && a.status !== 'error').length,
      errored: deptAgents.filter((a: any) => a.status === 'error').length,
      paused: deptAgents.filter((a: any) => a.status === 'paused' || !a.enabled).length,
      agents: deptAgents.map((a: any) => ({
        id: a.id,
        agent_name: a.agent_name,
        status: a.status,
        enabled: a.enabled,
        run_count: a.run_count || 0,
        error_count: a.error_count || 0,
        last_run_at: a.last_run_at ? a.last_run_at.toISOString() : null,
      })),
    };
  });
}
