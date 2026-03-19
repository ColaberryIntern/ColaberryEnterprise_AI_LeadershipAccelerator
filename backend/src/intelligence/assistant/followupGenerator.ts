// ─── Follow-Up Generator ──────────────────────────────────────────────────
// Generates 3 contextual follow-up questions. LLM-powered or rule-based.

import { Intent } from './intentClassifier';
import { chatCompletion } from './openaiHelper';

const STATIC_FOLLOWUPS: Record<Intent, string[]> = {
  campaign_analysis: [
    'Which campaigns are driving the most enrollments?',
    'How are our email open and conversion rates?',
    'Which campaigns should we scale or pause?',
  ],
  lead_analysis: [
    'Which leads are closest to enrolling?',
    'Where are leads getting stuck in the pipeline?',
    'What is our lead-to-enrollment conversion rate?',
  ],
  student_analysis: [
    'How are students progressing through the program?',
    'Which students might be at risk of dropping out?',
    'What is our program completion rate?',
  ],
  agent_analysis: [
    'Are any business processes failing that need attention?',
    'How is our automation impacting outreach volume?',
    'What business operations are running smoothly?',
  ],
  anomaly_detection: [
    'What business impact does this anomaly have?',
    'How does this compare to last week?',
    'What should we do to address this?',
  ],
  forecast_request: [
    'What could change this growth trajectory?',
    'How does the forecast compare to our targets?',
    'What actions would improve the forecast?',
  ],
  comparison: [
    'What is driving the performance difference?',
    'How has this changed over the last month?',
    'Where should we focus to close the gap?',
  ],
  root_cause_analysis: [
    'What is the business impact of this issue?',
    'How has this changed over time?',
    'What actions would fix this?',
  ],
  text_search: [
    'How are these related to our business goals?',
    'What patterns do you see?',
    'What should we do with this information?',
  ],
  general_insight: [
    'What are the biggest risks to our growth?',
    'How are enrollments trending this month?',
    'What should I focus on today?',
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
