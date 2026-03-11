// ─── Follow-Up Generator ──────────────────────────────────────────────────
// Generates 3 contextual follow-up questions. LLM-powered or rule-based.

import { Intent } from './intentClassifier';
import { chatCompletion } from './openaiHelper';

const STATIC_FOLLOWUPS: Record<Intent, string[]> = {
  campaign_analysis: [
    'What campaigns have the highest error rate?',
    'Show campaign conversion funnel',
    'Which campaigns should be paused?',
  ],
  lead_analysis: [
    'Which leads are most likely to convert?',
    'Show lead temperature distribution',
    'What is the pipeline stage breakdown?',
  ],
  student_analysis: [
    'What is the average completion rate?',
    'Which students are at dropout risk?',
    'Show cohort distribution',
  ],
  agent_analysis: [
    'Which agents have the most errors?',
    'Show automation impact metrics',
    'What is the agent execution frequency?',
  ],
  anomaly_detection: [
    'What factors are driving this trend?',
    'Show anomaly timeline by entity',
    'How does this compare to last week?',
  ],
  forecast_request: [
    'What factors could change this forecast?',
    'Show confidence intervals for the forecast',
    'Compare forecast to actual performance',
  ],
  comparison: [
    'What is driving the difference?',
    'Show historical comparison over time',
    'Which entity is performing best?',
  ],
  root_cause_analysis: [
    'What are the contributing factors?',
    'How has this changed over time?',
    'What actions would fix this?',
  ],
  text_search: [
    'Show me more entities like these',
    'What do these entities have in common?',
    'How are these related to each other?',
  ],
  general_insight: [
    'What are the top anomalies?',
    'Show me revenue trends',
    'Which entities are at risk?',
  ],
};

/**
 * Generate 3 contextual follow-up questions.
 */
export async function generateFollowups(
  intent: Intent,
  question: string,
  entityType: string | undefined,
  contextSummary: string
): Promise<string[]> {
  // Try LLM-generated follow-ups
  const llmFollowups = await generateLLMFollowups(question, entityType, contextSummary);
  if (llmFollowups && llmFollowups.length >= 3) {
    return llmFollowups.slice(0, 3);
  }

  // Fall back to static follow-ups
  return STATIC_FOLLOWUPS[intent] || STATIC_FOLLOWUPS.general_insight;
}

async function generateLLMFollowups(
  question: string,
  entityType: string | undefined,
  contextSummary: string
): Promise<string[] | null> {
  const system = `You are a business intelligence assistant for an enterprise education platform.
Given an analysis result, suggest exactly 3 natural follow-up questions an executive would ask next.
Each question should be actionable and specific to the data shown.
Respond with a JSON array of 3 strings.`;

  const user = `Original question: ${question}
${entityType ? `Entity scope: ${entityType}` : ''}
Analysis summary: ${contextSummary.slice(0, 500)}`;

  const raw = await chatCompletion(system, user, { json: true, maxTokens: 200, temperature: 0.5 });
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 3 && parsed.every((q: any) => typeof q === 'string')) {
      return parsed;
    }
    // Handle { questions: [...] } or { follow_ups: [...] } format
    const arr = parsed.questions || parsed.follow_ups || parsed.followups;
    if (Array.isArray(arr) && arr.length >= 3) return arr;
    return null;
  } catch {
    return null;
  }
}
