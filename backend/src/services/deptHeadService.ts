// ─── Department Head AI Service ──────────────────────────────────────────────
// Each department has a virtual "head" that can evaluate ideas, research
// feasibility, and produce reports for the COO.

import { chatCompletion } from '../intelligence/assistant/openaiHelper';
import Department from '../models/Department';
import Initiative from '../models/Initiative';

export interface IdeaEvaluation {
  idea: string;
  department_id: string;
  department_name: string;
  head_name: string;
  research_summary: string;
  feasibility_score: number;    // 0-100
  confidence: number;           // 0-100
  risk_assessment: string;
  estimated_impact: string;
  estimated_timeline: string;
  recommendation: 'auto_implement' | 'needs_approval' | 'not_recommended';
  implementation_plan: string[];
  coo_report: string;
}

export interface DeptHeadMessage {
  role: 'user' | 'head';
  content: string;
  evaluation?: IdeaEvaluation;
}

// Virtual department heads — names and personalities
const DEPT_HEADS: Record<string, { name: string; title: string; personality: string }> = {
  intelligence: { name: 'Dr. Sarah Chen', title: 'VP of Intelligence', personality: 'Analytical, data-driven, cautious but innovative. Thinks in systems and metrics.' },
  operations: { name: 'James Liu', title: 'VP of Operations', personality: 'Pragmatic, reliability-focused, cost-conscious. Values uptime and stability above all.' },
  growth: { name: 'Jordan Rivera', title: 'VP of Growth', personality: 'Aggressive, experiment-driven, ROI-focused. Loves A/B tests and conversion optimization.' },
  marketing: { name: 'Natalie Brooks', title: 'VP of Marketing', personality: 'Creative, brand-conscious, data-informed. Balances art with analytics.' },
  finance: { name: 'Robert Chang', title: 'CFO', personality: 'Conservative, compliance-aware, margin-focused. Questions every dollar spent.' },
  infrastructure: { name: 'Priya Sharma', title: 'VP of Infrastructure', personality: 'Technical, security-minded, scalability-focused. Thinks about edge cases.' },
  education: { name: 'Dr. Marcus Reid', title: 'VP of Education', personality: 'Student-centric, outcome-driven, quality-focused. Measures everything by student success.' },
  orchestration: { name: 'Alex Turner', title: 'VP of Orchestration', personality: 'Systems thinker, efficiency-obsessed, cross-functional. Sees dependencies others miss.' },
};

const AUTO_IMPLEMENT_THRESHOLD = 75; // confidence >= 75 → auto-implement

/**
 * Chat with a department head — general conversation.
 */
export async function chatWithDeptHead(
  departmentSlug: string,
  message: string,
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<{ response: string; head_name: string; head_title: string }> {
  const head = DEPT_HEADS[departmentSlug];
  if (!head) {
    return { response: 'Department head not available.', head_name: 'Unknown', head_title: 'Unknown' };
  }

  const dept = await Department.findOne({ where: { slug: departmentSlug } });
  const deptContext = dept
    ? `Department: ${dept.name}. Mission: ${(dept as any).mission || 'N/A'}. Team size: ${(dept as any).team_size || 'N/A'}. Health: ${(dept as any).health_score || 'N/A'}/100.`
    : `Department: ${departmentSlug}`;

  const activeInitiatives = await Initiative.findAll({
    where: { department_id: dept?.id },
    order: [['priority', 'ASC']],
    limit: 5,
  });
  const initiativeContext = activeInitiatives.length > 0
    ? `Current initiatives: ${activeInitiatives.map((i: any) => `${i.title} (${i.status}, ${i.progress}%)`).join('; ')}`
    : 'No active initiatives.';

  const systemPrompt = `You are ${head.name}, ${head.title} of Colaberry Enterprise.
Personality: ${head.personality}
${deptContext}
${initiativeContext}

You report to the CEO and work alongside Cory (the AI COO). When the CEO asks about ideas or proposals:
- Be direct and professional
- Reference real department context (initiatives, KPIs, team)
- Give honest assessments
- If they propose an idea, ask clarifying questions or evaluate it
- Keep responses concise (3-5 sentences unless detailed analysis requested)`;

  const messages = conversationHistory.slice(-6).map((m) => ({
    role: m.role === 'head' ? 'assistant' : 'user',
    content: m.content,
  }));
  messages.push({ role: 'user', content: message });

  const historyStr = messages.map((m) => `${m.role === 'user' ? 'CEO' : head.name}: ${m.content}`).join('\n');

  const response = await chatCompletion(
    systemPrompt,
    historyStr,
    { maxTokens: 500, temperature: 0.4 },
  );

  return {
    response: response || `I'll look into that. Let me get back to you with more details.`,
    head_name: head.name,
    head_title: head.title,
  };
}

/**
 * Evaluate an idea — the dept head researches feasibility and returns a structured report.
 * If confidence > threshold, marks as auto-implementable.
 */
export async function evaluateIdea(
  departmentSlug: string,
  idea: string,
): Promise<IdeaEvaluation> {
  const head = DEPT_HEADS[departmentSlug];
  if (!head) throw new Error(`No department head for slug: ${departmentSlug}`);

  const dept = await Department.findOne({ where: { slug: departmentSlug } });
  if (!dept) throw new Error(`Department not found: ${departmentSlug}`);

  const activeInitiatives = await Initiative.findAll({
    where: { department_id: dept.id },
    limit: 10,
  });

  const deptMeta = (dept as any).metadata || {};
  const kpis = deptMeta.kpis || [];
  const objectives = deptMeta.strategic_objectives || [];

  const systemPrompt = `You are ${head.name}, ${head.title} of Colaberry Enterprise.
${head.personality}

Department: ${dept.name}
Mission: ${(dept as any).mission}
Team size: ${(dept as any).team_size}
Health score: ${(dept as any).health_score}/100
Innovation score: ${(dept as any).innovation_score}/100
KPIs: ${kpis.map((k: any) => `${k.name}: ${k.value}${k.unit} (${k.trend})`).join(', ') || 'N/A'}
Objectives: ${objectives.map((o: any) => `${o.title} (${o.progress}%)`).join(', ') || 'N/A'}
Current initiatives: ${activeInitiatives.map((i: any) => `${i.title} (${i.status}, ${i.progress}%, priority: ${i.priority})`).join('; ')}

The CEO has proposed an idea for your department. Evaluate it thoroughly.
Return a JSON object with these fields:
{
  "research_summary": "2-3 paragraphs of thorough research and analysis",
  "feasibility_score": 0-100,
  "confidence": 0-100 (how confident you are in this assessment),
  "risk_assessment": "key risks identified",
  "estimated_impact": "expected business impact",
  "estimated_timeline": "e.g., 4-6 weeks",
  "recommendation": "auto_implement" or "needs_approval" or "not_recommended",
  "implementation_plan": ["step 1", "step 2", ...],
  "coo_report": "A formal 3-paragraph report to present to the COO summarizing the idea, your evaluation, and your recommendation"
}

Be honest. Use real data from your department context. If the idea conflicts with current priorities or resources, say so.`;

  const result = await chatCompletion(
    systemPrompt,
    `Evaluate this idea: ${idea}`,
    { json: true, maxTokens: 1200, temperature: 0.3 },
  );

  let evaluation: any = {};
  if (result) {
    try { evaluation = JSON.parse(result); } catch { /* use defaults */ }
  }

  const confidence = evaluation.confidence || 50;
  const feasibility = evaluation.feasibility_score || 50;

  // Override recommendation based on confidence threshold
  let recommendation: IdeaEvaluation['recommendation'] = evaluation.recommendation || 'needs_approval';
  if (confidence >= AUTO_IMPLEMENT_THRESHOLD && feasibility >= 70) {
    recommendation = 'auto_implement';
  } else if (feasibility < 30) {
    recommendation = 'not_recommended';
  } else {
    recommendation = 'needs_approval';
  }

  return {
    idea,
    department_id: dept.id,
    department_name: dept.name,
    head_name: head.name,
    research_summary: evaluation.research_summary || 'Unable to complete evaluation at this time.',
    feasibility_score: feasibility,
    confidence,
    risk_assessment: evaluation.risk_assessment || 'Assessment pending.',
    estimated_impact: evaluation.estimated_impact || 'To be determined.',
    estimated_timeline: evaluation.estimated_timeline || 'TBD',
    recommendation,
    implementation_plan: evaluation.implementation_plan || [],
    coo_report: evaluation.coo_report || `Evaluation of "${idea}" is pending detailed analysis.`,
  };
}

/**
 * Get department head info for a given slug.
 */
export function getDeptHeadInfo(slug: string) {
  return DEPT_HEADS[slug] || null;
}
