// ─── Call Transcript Processor ─────────────────────────────────────────────────
// Processes Synthflow voice call transcripts via OpenAI to extract lead data,
// then updates the Lead record and AdmissionsMemory with the extracted info.

import OpenAI from 'openai';
import { env } from '../config/env';
import { Lead } from '../models';
import AdmissionsMemory from '../models/AdmissionsMemory';
import AdmissionsActionLog from '../models/AdmissionsActionLog';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = env.openaiApiKey;
    if (!apiKey) throw new Error('OpenAI API key not configured');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

interface TranscriptExtraction {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  interest_type?: 'executive_briefing' | 'strategy_call' | 'sponsorship' | 'enrollment' | 'general';
  pain_points?: string[];
  budget_mentioned?: string;
  timeline?: string;
  next_steps?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  call_summary?: string;
}

/**
 * Process a completed voice call transcript:
 * 1. Extract structured data via OpenAI
 * 2. Update Lead record with any new info (fill gaps, don't overwrite)
 * 3. Update AdmissionsMemory interests
 * 4. Log the extraction
 */
export async function processCallTranscript(
  leadId: number,
  transcript: string,
  callId: string,
): Promise<void> {
  if (!transcript || transcript.trim().length < 50) {
    console.log(`[TranscriptProcessor] Transcript too short for call ${callId}, skipping.`);
    return;
  }

  const lead = await Lead.findByPk(leadId);
  if (!lead) {
    console.warn(`[TranscriptProcessor] Lead ${leadId} not found for call ${callId}`);
    return;
  }

  // Extract structured data from transcript
  let extraction: TranscriptExtraction;
  try {
    extraction = await extractDataFromTranscript(transcript);
  } catch (err: any) {
    console.error(`[TranscriptProcessor] AI extraction failed for call ${callId}:`, err.message);
    return;
  }

  // Update Lead with extracted data (only fill in missing fields)
  const updates: Record<string, any> = {};
  if (extraction.name && !lead.getDataValue('name')) updates.name = extraction.name;
  if (extraction.email && !lead.email) updates.email = extraction.email;
  if (extraction.company && !lead.company) updates.company = extraction.company;
  if (extraction.title && !(lead as any).title) updates.title = extraction.title;
  if (extraction.interest_type && !(lead as any).interest_area) updates.interest_area = extraction.interest_type;

  if (Object.keys(updates).length > 0) {
    await lead.update(updates);
    console.log(`[TranscriptProcessor] Updated lead ${leadId} with:`, Object.keys(updates).join(', '));
  }

  // Update AdmissionsMemory interests
  if (extraction.pain_points && extraction.pain_points.length > 0) {
    try {
      const memory = await AdmissionsMemory.findOne({
        where: { lead_id: leadId },
      });
      if (memory) {
        const currentInterests: string[] = (memory as any).interests || [];
        const newInterests = [...new Set([...currentInterests, ...extraction.pain_points])].slice(0, 10);
        await memory.update({ interests: newInterests } as any);
      }
    } catch {
      // Non-critical
    }
  }

  // Log the extraction
  try {
    await AdmissionsActionLog.create({
      visitor_id: 'system',
      conversation_id: callId,
      action_type: 'call_transcript_processed',
      action_details: {
        call_id: callId,
        lead_id: leadId,
        fields_updated: Object.keys(updates),
        extraction: {
          interest_type: extraction.interest_type,
          pain_points: extraction.pain_points,
          budget_mentioned: extraction.budget_mentioned,
          timeline: extraction.timeline,
          next_steps: extraction.next_steps,
          sentiment: extraction.sentiment,
          call_summary: extraction.call_summary,
        },
      },
      status: 'completed',
      agent_name: 'Maya',
    });
  } catch {
    // Non-critical
  }

  console.log(`[TranscriptProcessor] Processed call ${callId} for lead ${leadId}. Sentiment: ${extraction.sentiment}, fields updated: ${Object.keys(updates).length}`);
}

/**
 * Use OpenAI to extract structured data from a call transcript.
 */
async function extractDataFromTranscript(transcript: string): Promise<TranscriptExtraction> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: env.chatModel,
    max_tokens: 500,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are analyzing a voice call transcript between a Colaberry AI admissions agent and a prospective participant. Extract any information shared during the call.

Return a JSON object with these fields (use null for any field not mentioned):
{
  "name": "Full name if shared",
  "email": "Email if shared",
  "phone": "Phone if shared (different from the called number)",
  "company": "Company/organization name",
  "title": "Job title or role",
  "interest_type": "executive_briefing|strategy_call|sponsorship|enrollment|general",
  "pain_points": ["Array of challenges or interests mentioned"],
  "budget_mentioned": "Any budget, cost, or investment discussion",
  "timeline": "Any urgency or timeline mentioned (e.g. 'Q2', 'next month', 'ASAP')",
  "next_steps": "What was agreed at the end of the call",
  "sentiment": "positive|neutral|negative",
  "call_summary": "2-3 sentence summary of the conversation"
}

Rules:
- Only extract information explicitly stated in the transcript
- Do not infer or guess — use null if not mentioned
- For interest_type: pick the closest match based on what they discussed
- pain_points should be short phrases, not full sentences
- call_summary should capture the key outcome`,
      },
      {
        role: 'user',
        content: transcript,
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() || '{}';

  try {
    const parsed = JSON.parse(text);
    return {
      name: parsed.name || undefined,
      email: parsed.email || undefined,
      phone: parsed.phone || undefined,
      company: parsed.company || undefined,
      title: parsed.title || undefined,
      interest_type: parsed.interest_type || undefined,
      pain_points: Array.isArray(parsed.pain_points) ? parsed.pain_points.filter(Boolean) : undefined,
      budget_mentioned: parsed.budget_mentioned || undefined,
      timeline: parsed.timeline || undefined,
      next_steps: parsed.next_steps || undefined,
      sentiment: parsed.sentiment || undefined,
      call_summary: parsed.call_summary || undefined,
    };
  } catch {
    console.warn('[TranscriptProcessor] Failed to parse AI response:', text.substring(0, 200));
    return {};
  }
}
