import { z } from 'zod';

export const CHALLENGE_OPTIONS = [
  'AI strategy & roadmap development',
  'Data infrastructure & quality',
  'Talent & skills gap',
  'Change management & adoption',
  'ROI justification & business case',
  'Vendor evaluation & selection',
  'Governance & compliance',
  'Integration with existing systems',
  'Scaling from POC to production',
  'Executive buy-in & stakeholder alignment',
] as const;

export const TOOL_OPTIONS = [
  'ChatGPT / OpenAI',
  'Microsoft Copilot',
  'Google Gemini / Vertex AI',
  'AWS AI services (Bedrock, SageMaker)',
  'Anthropic Claude',
  'Internal/custom ML models',
  'RPA / automation platforms',
  'BI / analytics platforms',
  'No AI tools currently',
  'Other',
] as const;

export const AI_MATURITY_LEVELS = [
  'exploring',
  'experimenting',
  'piloting',
  'scaling',
  'optimizing',
] as const;

export const TEAM_SIZE_OPTIONS = [
  '1-10',
  '11-50',
  '51-200',
  '201-1000',
  '1000+',
] as const;

export const TIMELINE_OPTIONS = [
  'immediate',
  '1-3_months',
  '3-6_months',
  '6-12_months',
  'no_timeline',
] as const;

export const BUDGET_OPTIONS = [
  'under_10k',
  '10k-50k',
  '50k-150k',
  '150k-500k',
  '500k+',
  'not_defined',
] as const;

export const strategyPrepSchema = z.object({
  primary_challenges: z.array(z.string()).min(1, 'Select at least one challenge'),
  ai_maturity_level: z.enum(AI_MATURITY_LEVELS),
  team_size: z.enum(TEAM_SIZE_OPTIONS),
  priority_use_case: z.string().optional().default(''),
  timeline_urgency: z.enum(TIMELINE_OPTIONS),
  current_tools: z.array(z.string()).optional().default([]),
  budget_range: z.string().optional().default(''),
  evaluating_consultants: z.boolean().optional().default(false),
  previous_ai_investment: z.string().optional().default(''),
  specific_questions: z.string().optional().default(''),
  additional_context: z.string().optional().default(''),
});

export type StrategyPrepInput = z.infer<typeof strategyPrepSchema>;
