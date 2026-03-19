// ─── Intent Classifier ─────────────────────────────────────────────────────
// Hybrid intent classification: keyword rules first, LLM fallback if low confidence.

import { chatCompletion } from './openaiHelper';

export type Intent =
  | 'campaign_analysis'
  | 'lead_analysis'
  | 'student_analysis'
  | 'agent_analysis'
  | 'anomaly_detection'
  | 'forecast_request'
  | 'comparison'
  | 'root_cause_analysis'
  | 'text_search'
  | 'general_insight';

const ALL_INTENTS: Intent[] = [
  'campaign_analysis', 'lead_analysis', 'student_analysis', 'agent_analysis',
  'anomaly_detection', 'forecast_request', 'comparison', 'root_cause_analysis',
  'text_search', 'general_insight',
];

interface IntentRule {
  intent: Intent;
  keywords: string[];
  weight: number;
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'campaign_analysis',
    keywords: [
      'campaign', 'campaigns', 'email campaign', 'outreach',
      'follow-up', 'follow up', 'sequence', 'drip',
      'open rate', 'click rate', 'bounce', 'unsubscribe',
      'email', 'emails', 'sent email', 'emails sent', 'scheduled email',
    ],
    weight: 1,
  },
  {
    intent: 'lead_analysis',
    keywords: [
      'lead', 'leads', 'prospect', 'pipeline', 'conversion',
      'temperature', 'hot lead', 'cold lead', 'opportunity',
      'funnel', 'stage', 'qualified', 'strategy call',
    ],
    weight: 1,
  },
  {
    intent: 'student_analysis',
    keywords: [
      'student', 'students', 'enrollment', 'enrollments',
      'cohort', 'attendance', 'completion', 'dropout',
      'graduation', 'lesson', 'skill', 'mastery',
      'curriculum', 'assignment',
    ],
    weight: 1,
  },
  {
    intent: 'agent_analysis',
    keywords: [
      'agent', 'agents', 'ai agent', 'automation',
      'orchestration', 'execution', 'bot', 'repair',
      'agent error', 'agent run', 'agent status',
    ],
    weight: 1,
  },
  {
    intent: 'anomaly_detection',
    keywords: [
      'anomaly', 'anomalies', 'unusual', 'spike', 'drop',
      'outlier', 'deviation', 'abnormal', 'unexpected',
      'issue', 'problem', 'wrong', 'broken', 'failing',
    ],
    weight: 1.2,
  },
  {
    intent: 'forecast_request',
    keywords: [
      'forecast', 'predict', 'projection', 'trend',
      'next week', 'next month', 'future', 'estimate',
      'growth', 'decline', 'trajectory',
    ],
    weight: 1.2,
  },
  {
    intent: 'comparison',
    keywords: [
      'compare', 'comparison', 'versus', 'vs', 'difference',
      'which is better', 'benchmark', 'relative',
    ],
    weight: 1.2,
  },
  {
    intent: 'root_cause_analysis',
    keywords: [
      'why', 'root cause', 'reason', 'explain why',
      'what caused', 'driving', 'factor', 'because',
    ],
    weight: 1.1,
  },
  {
    intent: 'text_search',
    keywords: [
      'find', 'search', 'similar', 'like', 'related',
      'matching', 'look up', 'entities like',
    ],
    weight: 0.9,
  },
];

// Entity type → intent mapping for scope override
const ENTITY_INTENT_MAP: Record<string, Intent> = {
  campaigns: 'campaign_analysis',
  leads: 'lead_analysis',
  students: 'student_analysis',
  agents: 'agent_analysis',
};

export interface ClassifiedIntent {
  intent: Intent;
  confidence: number;
  entityOverride: boolean;
  method: 'keyword' | 'llm';
}

/**
 * Classify a natural language question into an intent.
 * Uses keyword rules first. Falls back to LLM if confidence < 0.6.
 */
export async function classifyIntent(
  question: string,
  entityType?: string
): Promise<ClassifiedIntent> {
  // Phase 1: Keyword classification
  const keywordResult = classifyByKeywords(question, entityType);

  // If confident enough, return keyword result
  if (keywordResult.confidence >= 0.6) {
    return { ...keywordResult, method: 'keyword' };
  }

  // Phase 2: LLM fallback
  const llmResult = await classifyByLLM(question, entityType);
  if (llmResult) {
    return llmResult;
  }

  // If LLM fails, return keyword result as-is
  return { ...keywordResult, method: 'keyword' };
}

function classifyByKeywords(question: string, entityType?: string): Omit<ClassifiedIntent, 'method'> {
  const q = question.toLowerCase();

  const scores: Record<Intent, number> = {
    campaign_analysis: 0,
    lead_analysis: 0,
    student_analysis: 0,
    agent_analysis: 0,
    anomaly_detection: 0,
    forecast_request: 0,
    comparison: 0,
    root_cause_analysis: 0,
    text_search: 0,
    general_insight: 0,
  };

  for (const rule of INTENT_RULES) {
    for (const kw of rule.keywords) {
      if (q.includes(kw)) {
        scores[rule.intent] += rule.weight;
      }
    }
  }

  let topIntent: Intent = 'general_insight';
  let topScore = 0;
  for (const [intent, score] of Object.entries(scores) as [Intent, number][]) {
    if (score > topScore) {
      topScore = score;
      topIntent = intent;
    }
  }

  // Entity type override
  let entityOverride = false;
  if (entityType && ENTITY_INTENT_MAP[entityType]) {
    const entityIntent = ENTITY_INTENT_MAP[entityType];
    if (topScore <= 1 || topIntent === 'general_insight') {
      topIntent = entityIntent;
      topScore = Math.max(topScore, 1);
      entityOverride = true;
    } else if (topIntent === entityIntent) {
      topScore += 1;
    }
  }

  const confidence = Math.min(topScore / 3, 1);
  return { intent: topIntent, confidence, entityOverride };
}

async function classifyByLLM(
  question: string,
  entityType?: string
): Promise<ClassifiedIntent | null> {
  const system = `You are an intent classifier for a business intelligence system.
Classify the user's question into exactly one intent.

Valid intents:
${ALL_INTENTS.map((i) => `- ${i}`).join('\n')}

Respond with JSON: { "intent": "<intent>", "confidence": <0.0-1.0> }`;

  const user = entityType
    ? `Entity context: ${entityType}\nQuestion: ${question}`
    : `Question: ${question}`;

  const raw = await chatCompletion(system, user, { json: true, maxTokens: 100, temperature: 0.1 });
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const intent = parsed.intent as Intent;
    if (!ALL_INTENTS.includes(intent)) return null;
    const confidence = Math.min(Math.max(Number(parsed.confidence) || 0.7, 0), 1);
    return { intent, confidence, entityOverride: false, method: 'llm' };
  } catch {
    return null;
  }
}
