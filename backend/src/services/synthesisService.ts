import OpenAI from 'openai';
import { env } from '../config/env';
import StrategyCallIntelligence from '../models/StrategyCallIntelligence';
import StrategyCall from '../models/StrategyCall';
import Lead from '../models/Lead';
import { sendIntelligenceBrief } from './emailService';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    if (!env.openaiApiKey) throw new Error('OpenAI API key not configured');
    openaiClient = new OpenAI({ apiKey: env.openaiApiKey });
  }
  return openaiClient;
}

const SYSTEM_PROMPT = `You are an enterprise AI strategist preparing an internal intelligence brief for a strategy call.

Based on the executive's prep form responses and any available profile data:

1. Summarize their likely AI direction and strategic intent
2. Identify implied business objectives behind their stated challenges
3. Predict their likely first AI build or deployment
4. Assign a confidence score (0-100%) for how well you understand their needs
5. Identify capability gaps based on their maturity level and team size
6. Identify potential internal political risks or adoption barriers
7. Suggest the optimal positioning approach for the strategy call
8. Identify likely objections or hesitations
9. Provide 3 high-leverage strategic angles for the call

Respond with ONLY valid JSON (no markdown fences):
{
  "executive_summary": "2-3 sentence overview of this lead's AI situation and intent",
  "pain_points": ["list of inferred pain points"],
  "recommended_topics": ["list of 3-5 topics to cover on the call"],
  "opportunity_assessment": "Brief assessment of the business opportunity",
  "suggested_approach": "How to position the call for maximum value",
  "red_flags": ["any concerns or barriers to note"],
  "confidence_score": 75,
  "recommended_focus": ["top 3 areas to focus the strategy call on"]
}`;

interface SynthesisResult {
  executive_summary: string;
  pain_points: string[];
  recommended_topics: string[];
  opportunity_assessment: string;
  suggested_approach: string;
  red_flags: string[];
  confidence_score: number;
  recommended_focus: string[];
}

export async function synthesizeIntelligence(intelligenceId: string): Promise<void> {
  const intelligence = await StrategyCallIntelligence.findByPk(intelligenceId);
  if (!intelligence) {
    console.error('[Synthesis] Intelligence record not found:', intelligenceId);
    return;
  }

  // Build context from prep data
  const parts: string[] = [];
  parts.push('PREP FORM RESPONSES:');
  parts.push(`- Primary Challenges: ${intelligence.primary_challenges.join(', ')}`);
  parts.push(`- AI Maturity Level: ${intelligence.ai_maturity_level}`);
  parts.push(`- Team Size: ${intelligence.team_size}`);
  if (intelligence.priority_use_case) parts.push(`- Priority Use Case: ${intelligence.priority_use_case}`);
  parts.push(`- Timeline Urgency: ${intelligence.timeline_urgency}`);
  if (intelligence.current_tools.length > 0) parts.push(`- Current Tools: ${intelligence.current_tools.join(', ')}`);
  if (intelligence.budget_range) parts.push(`- Budget Range: ${intelligence.budget_range}`);
  parts.push(`- Evaluating Consultants: ${intelligence.evaluating_consultants ? 'Yes' : 'No'}`);
  if (intelligence.previous_ai_investment) parts.push(`- Previous AI Investment: ${intelligence.previous_ai_investment}`);
  if (intelligence.specific_questions) parts.push(`- Questions for Call: ${intelligence.specific_questions}`);
  if (intelligence.additional_context) parts.push(`- Additional Context: ${intelligence.additional_context}`);
  parts.push(`- Completion Score: ${intelligence.completion_score}%`);

  // Add lead profile if available
  if (intelligence.lead_id) {
    try {
      const lead = await Lead.findByPk(intelligence.lead_id);
      if (lead) {
        parts.push('\nLEAD PROFILE:');
        parts.push(`- Name: ${lead.name}`);
        if (lead.company) parts.push(`- Company: ${lead.company}`);
        if (lead.title) parts.push(`- Title: ${lead.title}`);
        if (lead.industry) parts.push(`- Industry: ${lead.industry}`);
        if (lead.company_size) parts.push(`- Company Size: ${lead.company_size}`);
        if (lead.lead_score) parts.push(`- Lead Score: ${lead.lead_score}/100`);
      }
    } catch (err) {
      console.warn('[Synthesis] Could not load lead profile:', err);
    }
  }

  // Add extracted document text if available
  if (intelligence.extracted_text) {
    parts.push('\nUPLOADED DOCUMENT CONTENT (excerpt):');
    parts.push(intelligence.extracted_text.substring(0, 5000));
  }

  const userPrompt = parts.join('\n');

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: env.aiModel,
      max_tokens: 1500,
      temperature: 0.5,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || '';
    const cleaned = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');

    let result: SynthesisResult;
    try {
      result = JSON.parse(cleaned);
    } catch {
      console.error('[Synthesis] Failed to parse AI response as JSON:', content.substring(0, 200));
      await intelligence.update({
        ai_synthesis: content,
        ai_confidence_score: null,
        ai_recommended_focus: null,
        ai_synthesized_at: new Date(),
        status: 'synthesized',
        updated_at: new Date(),
      });
      return;
    }

    await intelligence.update({
      ai_synthesis: JSON.stringify(result),
      ai_confidence_score: Math.min(100, Math.max(0, result.confidence_score || 0)),
      ai_recommended_focus: result.recommended_focus || [],
      ai_synthesized_at: new Date(),
      status: 'synthesized',
      updated_at: new Date(),
    });

    console.log(
      '[Synthesis] Complete for intelligence:',
      intelligenceId,
      '| confidence:',
      result.confidence_score
    );

    // Send intelligence brief email to Ali (non-blocking)
    try {
      const call = await StrategyCall.findByPk(intelligence.strategy_call_id);
      if (call) {
        sendIntelligenceBrief({
          name: call.name,
          email: call.email,
          company: call.company,
          completionScore: intelligence.completion_score,
          aiMaturity: intelligence.ai_maturity_level,
          timeline: intelligence.timeline_urgency,
          challenges: intelligence.primary_challenges,
          tools: intelligence.current_tools,
          budgetRange: intelligence.budget_range,
          evaluatingConsultants: intelligence.evaluating_consultants,
          priorityUseCase: intelligence.priority_use_case,
          specificQuestions: intelligence.specific_questions,
          uploadedFileName: intelligence.uploaded_file_name,
          aiSynthesis: intelligence.ai_synthesis,
          aiConfidenceScore: intelligence.ai_confidence_score,
          aiRecommendedFocus: intelligence.ai_recommended_focus,
          leadId: intelligence.lead_id,
        }).catch((err) => console.error('[Synthesis] Intelligence brief email failed:', err));
      }
    } catch (err) {
      console.error('[Synthesis] Failed to send intelligence brief:', err);
    }
  } catch (err) {
    console.error('[Synthesis] OpenAI call failed:', err);
  }
}
