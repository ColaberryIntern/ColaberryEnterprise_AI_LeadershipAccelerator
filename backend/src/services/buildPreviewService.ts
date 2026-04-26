/**
 * Build Preview Service — Rich AI Organization Preview
 *
 * Generates comprehensive system preview from a project idea:
 * - AI org with 20-25 agents across departments
 * - ROI analysis (manual cost vs AI cost)
 * - Human-in-the-loop requirements
 * - Detailed agent profiles with responsibilities
 * - Interactive simulation scenarios
 * - Capability breakdown
 */

export interface AgentPreview {
  name: string;
  role: string;
  type: 'monitoring' | 'automation' | 'analytics' | 'communication' | 'decision' | 'integration';
  responsibilities: string[];
  hitl_required: boolean;
  hitl_reason?: string;
}

export interface DepartmentPreview {
  name: string;
  description: string;
  color: string;
  agents: AgentPreview[];
  manual_fte: number;
  ai_replacement_pct: number;
}

export interface CapabilityPreview {
  name: string;
  category: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface SimulationScenario {
  name: string;
  description: string;
  events: Array<{ agent: string; department: string; action: string; type: string; delay_ms: number }>;
}

export interface ROIAnalysis {
  manual_annual_cost: number;
  ai_annual_cost: number;
  annual_savings: number;
  efficiency_gain_pct: number;
  roi_pct: number;
  payback_months: number;
  manual_fte_needed: number;
  ai_fte_equivalent: number;
}

export interface SystemPreview {
  departments: DepartmentPreview[];
  capabilities: CapabilityPreview[];
  simulation_scenarios: SimulationScenario[];
  roi: ROIAnalysis;
  total_agents: number;
  hitl_summary: { total_decisions: number; automated: number; human_required: number; human_oversight: number };
}

const DEPT_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

export async function generateSystemPreview(idea: string): Promise<SystemPreview> {
  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You design comprehensive AI organizations for enterprise software systems. Output ONLY valid JSON. Be specific to the user's idea — never generic.`
        },
        {
          role: 'user',
          content: `Design a complete AI agent organization for this system:

"${idea}"

Return JSON with this EXACT structure:
{
  "departments": [
    {
      "name": "Department Name",
      "description": "2-3 sentence description of what this department handles",
      "manual_fte": 3,
      "ai_replacement_pct": 85,
      "agents": [
        {
          "name": "Agent Name",
          "role": "1-sentence role description",
          "type": "monitoring|automation|analytics|communication|decision|integration",
          "responsibilities": ["Specific task 1", "Specific task 2", "Specific task 3"],
          "hitl_required": false,
          "hitl_reason": "Why human oversight needed (if hitl_required=true)"
        }
      ]
    }
  ],
  "capabilities": [
    { "name": "Capability Name", "category": "Automation|Intelligence|Integration|Security|Analytics|Communication|Data|UX", "description": "What this enables (2 sentences)", "impact": "high|medium|low" }
  ],
  "simulation_scenarios": [
    {
      "name": "Scenario Name",
      "description": "What happens in this scenario",
      "events": [
        { "agent": "Agent Name", "department": "Dept Name", "action": "Specific action being performed", "type": "data|alert|decision|automation|report", "delay_ms": 2000 }
      ]
    }
  ],
  "roi": {
    "manual_annual_cost": 850000,
    "ai_annual_cost": 120000,
    "annual_savings": 730000,
    "efficiency_gain_pct": 65,
    "roi_pct": 508,
    "payback_months": 3,
    "manual_fte_needed": 12,
    "ai_fte_equivalent": 2
  }
}

RULES:
- Create 4-6 departments specific to the idea
- Create 20-25 agents total (4-5 per dept)
- First department must be "AI Control Tower" with Cory as lead
- 3-5 agents should have hitl_required=true (critical decisions, financial, compliance)
- Each agent must have 3 specific responsibilities
- ROI numbers must be realistic for the industry described
- manual_annual_cost should reflect hiring 8-15 FTEs for this work
- ai_annual_cost should be ~$80K-$150K (compute + maintenance)
- Create 3-4 simulation scenarios with 4-6 events each
- Capabilities should be 6-8 items with mix of high/medium/low impact
- Everything must be specific to "${idea}" — not generic`
        }
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    const departments: DepartmentPreview[] = (parsed.departments || []).map((d: any, i: number) => ({
      name: d.name || `Department ${i + 1}`,
      description: d.description || '',
      color: DEPT_COLORS[i % DEPT_COLORS.length],
      manual_fte: d.manual_fte || 3,
      ai_replacement_pct: d.ai_replacement_pct || 80,
      agents: (d.agents || []).map((a: any) => ({
        name: a.name || 'Agent',
        role: a.role || '',
        type: a.type || 'automation',
        responsibilities: a.responsibilities || ['Process data', 'Generate reports', 'Monitor status'],
        hitl_required: a.hitl_required || false,
        hitl_reason: a.hitl_reason || '',
      })),
    }));

    const capabilities: CapabilityPreview[] = (parsed.capabilities || []).map((c: any) => ({
      name: c.name || '', category: c.category || 'General', description: c.description || '', impact: c.impact || 'medium',
    }));

    const simulation_scenarios: SimulationScenario[] = (parsed.simulation_scenarios || []).map((s: any) => ({
      name: s.name || 'Scenario',
      description: s.description || '',
      events: (s.events || []).map((e: any) => ({
        agent: e.agent || 'Agent', department: e.department || '', action: e.action || '', type: e.type || 'automation', delay_ms: e.delay_ms || 2000,
      })),
    }));

    const roi: ROIAnalysis = {
      manual_annual_cost: parsed.roi?.manual_annual_cost || 850000,
      ai_annual_cost: parsed.roi?.ai_annual_cost || 120000,
      annual_savings: parsed.roi?.annual_savings || 730000,
      efficiency_gain_pct: parsed.roi?.efficiency_gain_pct || 65,
      roi_pct: parsed.roi?.roi_pct || 508,
      payback_months: parsed.roi?.payback_months || 3,
      manual_fte_needed: parsed.roi?.manual_fte_needed || 12,
      ai_fte_equivalent: parsed.roi?.ai_fte_equivalent || 2,
    };

    const total_agents = departments.reduce((sum, d) => sum + d.agents.length, 0);
    const allAgents = departments.flatMap(d => d.agents);
    const hitlAgents = allAgents.filter(a => a.hitl_required);

    return {
      departments, capabilities, simulation_scenarios, roi, total_agents,
      hitl_summary: {
        total_decisions: total_agents * 3,
        automated: allAgents.filter(a => !a.hitl_required).length * 3,
        human_required: hitlAgents.length,
        human_oversight: Math.round(hitlAgents.length / total_agents * 100),
      },
    };
  } catch (err: any) {
    console.warn('[BuildPreview] LLM call failed:', err?.message);
    return getFallbackPreview();
  }
}

function getFallbackPreview(): SystemPreview {
  return {
    departments: [
      { name: 'AI Control Tower', description: 'Central coordination and orchestration of all AI agents', color: '#3b82f6', manual_fte: 2, ai_replacement_pct: 90, agents: [
        { name: 'Cory', role: 'AI System Architect — coordinates all agents and decisions', type: 'decision', responsibilities: ['Orchestrate agent workflows', 'Monitor system health', 'Prioritize tasks'], hitl_required: false },
        { name: 'Task Router', role: 'Routes work to the right agent', type: 'automation', responsibilities: ['Classify incoming requests', 'Load-balance across agents', 'Track task completion'], hitl_required: false },
      ]},
      { name: 'Operations', description: 'Core business operations and process automation', color: '#10b981', manual_fte: 4, ai_replacement_pct: 75, agents: [
        { name: 'Workflow Engine', role: 'Executes automated workflows', type: 'automation', responsibilities: ['Process automation', 'Error handling', 'Status reporting'], hitl_required: false },
        { name: 'Quality Gate', role: 'Validates outputs and enforces standards', type: 'monitoring', responsibilities: ['Output validation', 'Quality scoring', 'Compliance checks'], hitl_required: true, hitl_reason: 'Critical quality decisions require human approval' },
      ]},
    ],
    capabilities: [
      { name: 'Intelligent Automation', category: 'Automation', description: 'AI-driven workflow execution', impact: 'high' },
      { name: 'Real-time Analytics', category: 'Intelligence', description: 'Live data processing', impact: 'high' },
    ],
    simulation_scenarios: [
      { name: 'Standard Operations', description: 'Normal system workflow', events: [
        { agent: 'Cory', department: 'AI Control Tower', action: 'Initializing system...', type: 'decision', delay_ms: 2000 },
        { agent: 'Workflow Engine', department: 'Operations', action: 'Processing incoming data...', type: 'automation', delay_ms: 2000 },
      ]},
    ],
    roi: { manual_annual_cost: 650000, ai_annual_cost: 95000, annual_savings: 555000, efficiency_gain_pct: 60, roi_pct: 484, payback_months: 3, manual_fte_needed: 8, ai_fte_equivalent: 2 },
    total_agents: 4,
    hitl_summary: { total_decisions: 12, automated: 9, human_required: 1, human_oversight: 25 },
  };
}
