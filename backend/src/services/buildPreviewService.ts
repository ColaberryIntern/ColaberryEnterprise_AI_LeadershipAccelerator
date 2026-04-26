/**
 * Build Preview Service
 *
 * Quick GPT-4o-mini call to generate an AI Organization Preview
 * from a project idea. Runs in ~5 seconds — not the full pipeline.
 * Same pattern as the Architect's profile_generator.py.
 */

export interface AgentPreview {
  name: string;
  role: string;
  type: 'monitoring' | 'automation' | 'analytics' | 'communication' | 'decision' | 'integration';
}

export interface DepartmentPreview {
  name: string;
  description: string;
  color: string;
  agents: AgentPreview[];
}

export interface CapabilityPreview {
  name: string;
  category: string;
  description: string;
}

export interface SimulationEvent {
  agent: string;
  department: string;
  action: string;
  type: 'data' | 'alert' | 'decision' | 'automation' | 'report';
}

export interface SystemPreview {
  departments: DepartmentPreview[];
  capabilities: CapabilityPreview[];
  simulation_events: SimulationEvent[];
  total_agents: number;
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
          content: `You design AI organizations for software systems. Output ONLY valid JSON. Generate a realistic AI agent organization that would power the described system. Include Cory as the AI Control Tower (root coordinator).`
        },
        {
          role: 'user',
          content: `Design an AI agent organization for this system idea:

"${idea}"

Return JSON with this exact structure:
{
  "departments": [
    {
      "name": "Department Name",
      "description": "What this dept handles",
      "agents": [
        { "name": "Agent Name", "role": "What it does (1 sentence)", "type": "monitoring|automation|analytics|communication|decision|integration" }
      ]
    }
  ],
  "capabilities": [
    { "name": "Capability Name", "category": "Automation|Intelligence|Integration|Security|Analytics|Communication|Data|UX", "description": "What this enables" }
  ],
  "simulation_events": [
    { "agent": "Agent Name", "department": "Department Name", "action": "Specific action being performed right now", "type": "data|alert|decision|automation|report" }
  ]
}

RULES:
- Create 4-6 departments specific to the idea
- Create 20-25 agents total across departments (4-5 per dept)
- First department must be "AI Control Tower" with Cory as the lead agent
- Capabilities should be 6-8 items categorized appropriately
- Simulation events should be 5-6 realistic actions happening RIGHT NOW
- Everything must be specific to the idea, not generic
- Agent names should be descriptive (e.g., "Demand Forecaster", "Anomaly Detector")`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    const departments: DepartmentPreview[] = (parsed.departments || []).map((d: any, i: number) => ({
      name: d.name || `Department ${i + 1}`,
      description: d.description || '',
      color: DEPT_COLORS[i % DEPT_COLORS.length],
      agents: (d.agents || []).map((a: any) => ({
        name: a.name || 'Agent',
        role: a.role || '',
        type: a.type || 'automation',
      })),
    }));

    const capabilities: CapabilityPreview[] = (parsed.capabilities || []).map((c: any) => ({
      name: c.name || '',
      category: c.category || 'General',
      description: c.description || '',
    }));

    const simulation_events: SimulationEvent[] = (parsed.simulation_events || []).map((e: any) => ({
      agent: e.agent || 'Agent',
      department: e.department || '',
      action: e.action || '',
      type: e.type || 'automation',
    }));

    const total_agents = departments.reduce((sum, d) => sum + d.agents.length, 0);

    return { departments, capabilities, simulation_events, total_agents };
  } catch (err: any) {
    console.warn('[BuildPreview] LLM call failed:', err?.message);
    // Return a minimal fallback
    return {
      departments: [
        { name: 'AI Control Tower', description: 'Central coordination and orchestration', color: '#3b82f6', agents: [
          { name: 'Cory', role: 'AI System Architect — coordinates all agents', type: 'decision' },
          { name: 'Task Orchestrator', role: 'Routes work to appropriate agents', type: 'automation' },
          { name: 'Health Monitor', role: 'Tracks system health and agent performance', type: 'monitoring' },
        ]},
        { name: 'Intelligence', description: 'Data analysis and insights', color: '#8b5cf6', agents: [
          { name: 'Data Analyst', role: 'Processes and analyzes incoming data', type: 'analytics' },
          { name: 'Pattern Detector', role: 'Identifies trends and anomalies', type: 'analytics' },
        ]},
        { name: 'Operations', description: 'System operations and automation', color: '#10b981', agents: [
          { name: 'Workflow Engine', role: 'Executes automated workflows', type: 'automation' },
          { name: 'Integration Manager', role: 'Connects external services', type: 'integration' },
        ]},
      ],
      capabilities: [
        { name: 'Intelligent Automation', category: 'Automation', description: 'AI-driven workflow execution' },
        { name: 'Real-time Analytics', category: 'Intelligence', description: 'Live data processing and insights' },
        { name: 'System Monitoring', category: 'Monitoring', description: 'Health tracking and alerting' },
      ],
      simulation_events: [
        { agent: 'Cory', department: 'AI Control Tower', action: 'Initializing system architecture analysis...', type: 'decision' },
        { agent: 'Data Analyst', department: 'Intelligence', action: 'Processing initial data schema...', type: 'data' },
        { agent: 'Workflow Engine', department: 'Operations', action: 'Setting up automation pipelines...', type: 'automation' },
      ],
      total_agents: 7,
    };
  }
}
