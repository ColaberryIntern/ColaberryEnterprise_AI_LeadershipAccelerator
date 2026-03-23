import { Project, UserCurriculumProfile, Enrollment } from '../models';
import { getProjectByEnrollment } from './projectService';
import { callLLMWithAudit } from './llmCallWrapper';

export interface ProjectSuggestion {
  id: string;
  name: string;
  slug: string;
  description: string;
  why_this_fits: string;
  confidence: number;
  system_type: string;
  key_capabilities: string[];
}

const MODEL = 'gpt-4o-mini';

// ---------------------------------------------------------------------------
// Generate 5 project suggestions from Module 1 artifacts
// ---------------------------------------------------------------------------

export async function generateSuggestions(enrollmentId: string): Promise<ProjectSuggestion[]> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  // Get curriculum profile for context
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [{ model: UserCurriculumProfile, as: 'curriculumProfile' }],
  });
  const profile = (enrollment as any)?.curriculumProfile;

  // Build context from project variables + profile
  const vars = project.project_variables || {};
  const context = {
    business_problem: vars.business_problem || project.primary_business_problem || '',
    ai_use_case: vars.ai_use_case || project.selected_use_case || '',
    data_sources: vars.data_sources || (project.data_sources ? JSON.stringify(project.data_sources) : ''),
    automation_goal: vars.automation_goal || project.automation_goal || '',
    success_metrics: vars.success_metrics || '',
    industry: profile?.industry || project.industry || '',
    company_name: profile?.company_name || project.organization_name || '',
    company_size: profile?.company_size || '',
    role: profile?.role || '',
    goal: profile?.goal || '',
    ai_maturity: profile?.ai_maturity_level || '',
  };

  // If we have minimal data, return fallback suggestions
  if (!context.business_problem && !context.ai_use_case && !context.industry) {
    return getDefaultSuggestions();
  }

  try {
    const result = await callLLMWithAudit({
      lessonId: 'project-suggestions',
      enrollmentId,
      generationType: 'participant_content',
      step: 'generate_project_suggestions',
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(context),
      model: MODEL,
      temperature: 0.7,
      maxTokens: 2000,
      responseFormat: { type: 'json_object' },
    });

    const parsed = JSON.parse(result.content);
    const suggestions: ProjectSuggestion[] = (parsed.suggestions || [])
      .slice(0, 5)
      .map((s: any, i: number) => ({
        id: `suggestion-${i + 1}`,
        name: String(s.name || `Project ${i + 1}`),
        slug: slugify(s.name || `project-${i + 1}`),
        description: String(s.description || ''),
        why_this_fits: String(s.why_this_fits || ''),
        confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0.7)),
        system_type: String(s.system_type || 'ai-system'),
        key_capabilities: Array.isArray(s.key_capabilities) ? s.key_capabilities.map(String) : [],
      }));

    console.log(`[ProjectSuggestions] Generated ${suggestions.length} suggestions for enrollment ${enrollmentId}`);
    return suggestions;
  } catch (err: any) {
    console.error(`[ProjectSuggestions] LLM error: ${err.message}, returning defaults`);
    return getDefaultSuggestions();
  }
}

// ---------------------------------------------------------------------------
// Prompt Builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are an AI project architect for an enterprise AI leadership accelerator program.

Your task: Generate exactly 5 unique AI project suggestions based on the student's business context and goals.

Return ONLY valid JSON with this structure:
{
  "suggestions": [
    {
      "name": "Project Name (concise, professional)",
      "description": "2-3 sentence description of what this AI system does",
      "why_this_fits": "1 sentence explaining why this matches the student's context",
      "confidence": 0.7-0.95,
      "system_type": "agent|dashboard|automation|analytics|assistant",
      "key_capabilities": ["capability1", "capability2", "capability3"]
    }
  ]
}

Rules:
- Generate 5 suggestions ranging from simpler to more complex
- Each must be directly relevant to the student's business problem and industry
- Include realistic AI capabilities (not science fiction)
- Slugs should be kebab-case
- Confidence reflects how well the project matches their stated goals`;
}

function buildUserPrompt(context: Record<string, string>): string {
  return `## Student Context

**Industry:** ${context.industry || 'Not specified'}
**Company:** ${context.company_name || 'Not specified'} (${context.company_size || 'unknown size'})
**Role:** ${context.role || 'Not specified'}
**AI Maturity:** ${context.ai_maturity || 'Not specified'}

## Module 1 Artifacts

**Business Problem:** ${context.business_problem || 'Not specified'}
**AI Use Case:** ${context.ai_use_case || 'Not specified'}
**Data Sources:** ${context.data_sources || 'Not specified'}
**Automation Goal:** ${context.automation_goal || 'Not specified'}
**Success Metrics:** ${context.success_metrics || 'Not specified'}
**Overall Goal:** ${context.goal || 'Not specified'}

Generate 5 project suggestions that address this business problem using AI.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function getDefaultSuggestions(): ProjectSuggestion[] {
  return [
    { id: 'suggestion-1', name: 'AI Customer Intelligence Agent', slug: 'ai-customer-intelligence-agent', description: 'An AI agent that analyzes customer behavior and provides actionable insights.', why_this_fits: 'Applicable to most business domains with customer data.', confidence: 0.6, system_type: 'agent', key_capabilities: ['behavior analysis', 'insight generation', 'alerting'] },
    { id: 'suggestion-2', name: 'Intelligent Process Automation', slug: 'intelligent-process-automation', description: 'Automate repetitive business processes using AI-driven decision making.', why_this_fits: 'Most organizations have processes that can be automated.', confidence: 0.6, system_type: 'automation', key_capabilities: ['workflow automation', 'decision engine', 'monitoring'] },
    { id: 'suggestion-3', name: 'AI-Powered Analytics Dashboard', slug: 'ai-powered-analytics-dashboard', description: 'A real-time dashboard with AI-generated insights and predictions.', why_this_fits: 'Data-driven decision making benefits any industry.', confidence: 0.55, system_type: 'dashboard', key_capabilities: ['real-time analytics', 'predictions', 'visualization'] },
    { id: 'suggestion-4', name: 'Enterprise AI Assistant', slug: 'enterprise-ai-assistant', description: 'A conversational AI assistant trained on your organization\'s knowledge base.', why_this_fits: 'Knowledge management is a universal business need.', confidence: 0.55, system_type: 'assistant', key_capabilities: ['natural language', 'knowledge base', 'context awareness'] },
    { id: 'suggestion-5', name: 'Predictive Risk Management System', slug: 'predictive-risk-management-system', description: 'An AI system that identifies and predicts business risks before they materialize.', why_this_fits: 'Risk mitigation is valuable across all industries.', confidence: 0.5, system_type: 'analytics', key_capabilities: ['risk scoring', 'anomaly detection', 'early warning'] },
  ];
}
