// ─── Intent Classifier ─────────────────────────────────────────────────────
// Deterministic keyword-based intent classification.
// No LLM — pure pattern matching for speed and reproducibility.

export type Intent =
  | 'campaign_analysis'
  | 'lead_analysis'
  | 'student_analysis'
  | 'agent_analysis'
  | 'anomaly_detection'
  | 'forecast_request'
  | 'general_insight';

interface IntentRule {
  intent: Intent;
  keywords: string[];
  weight: number;
}

const INTENT_RULES: IntentRule[] = [
  // Campaign analysis
  {
    intent: 'campaign_analysis',
    keywords: [
      'campaign', 'campaigns', 'email campaign', 'outreach',
      'follow-up', 'follow up', 'sequence', 'drip',
      'open rate', 'click rate', 'bounce', 'unsubscribe',
    ],
    weight: 1,
  },
  // Lead analysis
  {
    intent: 'lead_analysis',
    keywords: [
      'lead', 'leads', 'prospect', 'pipeline', 'conversion',
      'temperature', 'hot lead', 'cold lead', 'opportunity',
      'funnel', 'stage', 'qualified', 'strategy call',
    ],
    weight: 1,
  },
  // Student analysis
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
  // Agent analysis
  {
    intent: 'agent_analysis',
    keywords: [
      'agent', 'agents', 'ai agent', 'automation',
      'orchestration', 'execution', 'bot', 'repair',
      'agent error', 'agent run', 'agent status',
    ],
    weight: 1,
  },
  // Anomaly detection
  {
    intent: 'anomaly_detection',
    keywords: [
      'anomaly', 'anomalies', 'unusual', 'spike', 'drop',
      'outlier', 'deviation', 'abnormal', 'unexpected',
      'issue', 'problem', 'wrong', 'broken', 'failing',
    ],
    weight: 1.2, // Higher weight — anomaly keywords are strong signals
  },
  // Forecast
  {
    intent: 'forecast_request',
    keywords: [
      'forecast', 'predict', 'projection', 'trend',
      'next week', 'next month', 'future', 'estimate',
      'growth', 'decline', 'trajectory',
    ],
    weight: 1.2,
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
}

/**
 * Classify a natural language question into a deterministic intent.
 * If entity_type is provided, it biases strongly toward that entity's intent.
 */
export function classifyIntent(
  question: string,
  entityType?: string
): ClassifiedIntent {
  const q = question.toLowerCase();

  // Score each intent
  const scores: Record<Intent, number> = {
    campaign_analysis: 0,
    lead_analysis: 0,
    student_analysis: 0,
    agent_analysis: 0,
    anomaly_detection: 0,
    forecast_request: 0,
    general_insight: 0,
  };

  for (const rule of INTENT_RULES) {
    for (const kw of rule.keywords) {
      if (q.includes(kw)) {
        scores[rule.intent] += rule.weight;
      }
    }
  }

  // Find top-scoring intent
  let topIntent: Intent = 'general_insight';
  let topScore = 0;
  for (const [intent, score] of Object.entries(scores) as [Intent, number][]) {
    if (score > topScore) {
      topScore = score;
      topIntent = intent;
    }
  }

  // Entity type override: if scope says "agents", bias toward agent_analysis
  let entityOverride = false;
  if (entityType && ENTITY_INTENT_MAP[entityType]) {
    const entityIntent = ENTITY_INTENT_MAP[entityType];

    // If no strong competing intent, use entity scope
    if (topScore <= 1 || topIntent === 'general_insight') {
      topIntent = entityIntent;
      topScore = Math.max(topScore, 1);
      entityOverride = true;
    }
    // If entity intent already won or is close, boost it
    else if (topIntent === entityIntent) {
      topScore += 1;
    }
  }

  // Normalize confidence (0-1 range, capped)
  const confidence = Math.min(topScore / 3, 1);

  return { intent: topIntent, confidence, entityOverride };
}
