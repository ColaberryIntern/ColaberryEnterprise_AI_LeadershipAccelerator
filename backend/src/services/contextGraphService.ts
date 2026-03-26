// ─── Composite Context Graph Service ─────────────────────────────────────────
// Builds a structured, verified context object for AI message generation.
// Grounds the LLM in database facts instead of relying on prompting alone.
// Reduces hallucinations by providing explicit URLs, sender identity, engagement
// history, and previous message content.

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

export interface CompositeContext {
  lead: {
    name: string;
    firstName: string;
    company: string;
    title: string;
    industry: string;
    phone: string;
    temperature: string;
    pipelineStage: string;
    score: number;
    notes: string;
  };
  campaign: {
    name: string;
    type: string;
    senderName: string;
    senderRelationship: string;
    step: number;
    totalSteps: number;
    stepGoal: string;
  };
  engagement: {
    emailsSent: number;
    emailsOpened: number;
    linksClicked: number;
    lastClickedUrl: string | null;
    repliesReceived: number;
    voiceCallsMade: number;
    lastCallOutcome: string | null;
    temperatureTrend: string;
    bookingAttempts: number;
  };
  previousMessages: Array<{
    channel: string;
    subject: string;
    bodyPreview: string;
    sentAt: string;
    outcome: string;
  }>;
  allowedUrls: {
    booking: string;
    landingPage: string;
    mainSite: string;
  };
  cohort: {
    name: string;
    startDate: string;
    seatsRemaining: number;
    daysUntilStart: number;
  } | null;
  alumniContext: any | null;
}

export async function buildCompositeContext(
  leadId: number,
  campaignId: string,
  stepIndex: number,
): Promise<CompositeContext> {
  const [
    leadRows,
    campaignRows,
    prevMessages,
    engagementRows,
    tempHistory,
    cohortRows,
    bookingClicks,
  ] = await Promise.all([
    // 1. Lead record
    sequelize.query(`
      SELECT name, email, company, title, phone, industry, lead_score,
        lead_temperature, pipeline_stage, notes, alumni_context
      FROM leads WHERE id = :leadId
    `, { replacements: { leadId }, type: QueryTypes.SELECT }),

    // 2. Campaign + sequence step
    sequelize.query(`
      SELECT c.name, c.type, c.settings, c.ai_system_prompt,
        fs.steps, jsonb_array_length(fs.steps) as total_steps
      FROM campaigns c
      LEFT JOIN follow_up_sequences fs ON fs.id = c.sequence_id
      WHERE c.id = :campaignId
    `, { replacements: { campaignId }, type: QueryTypes.SELECT }),

    // 3. Last 2 sent messages for this lead
    sequelize.query(`
      SELECT channel, subject, LEFT(body, 300) as body_preview, status, created_at
      FROM communication_logs
      WHERE lead_id = :leadId AND direction = 'outbound' AND status IN ('sent', 'delivered', 'opened', 'clicked')
      ORDER BY created_at DESC LIMIT 2
    `, { replacements: { leadId }, type: QueryTypes.SELECT }),

    // 4. Engagement summary
    sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE outcome = 'sent') as emails_sent,
        COUNT(*) FILTER (WHERE outcome = 'opened') as emails_opened,
        COUNT(*) FILTER (WHERE outcome = 'clicked') as links_clicked,
        COUNT(*) FILTER (WHERE outcome = 'replied') as replies,
        COUNT(*) FILTER (WHERE channel = 'voice') as voice_calls
      FROM interaction_outcomes
      WHERE lead_id = :leadId
    `, { replacements: { leadId }, type: QueryTypes.SELECT }),

    // 5. Temperature history (last change)
    sequelize.query(`
      SELECT previous_temperature, new_temperature, trigger_type, created_at
      FROM lead_temperature_histories
      WHERE lead_id = :leadId
      ORDER BY created_at DESC LIMIT 1
    `, { replacements: { leadId }, type: QueryTypes.SELECT }).catch(() => []),

    // 6. Next cohort
    sequelize.query(`
      SELECT name, start_date, max_seats, seats_taken
      FROM cohorts
      WHERE status = 'open' AND start_date > NOW()
      ORDER BY start_date ASC LIMIT 1
    `, { type: QueryTypes.SELECT }),

    // 7. Booking link clicks (how many times they tried to book)
    sequelize.query(`
      SELECT COUNT(*) as cnt FROM interaction_outcomes
      WHERE lead_id = :leadId AND outcome = 'clicked'
      AND (metadata->>'url' LIKE '%ai-architect%' OR metadata->>'url' LIKE '%calendly%' OR metadata->>'url' LIKE '%strategy%' OR metadata->>'url' LIKE '%book%')
    `, { replacements: { leadId }, type: QueryTypes.SELECT }),
  ]);

  // Parse results
  const lead = (leadRows as any)[0] || {};
  const campaign = (campaignRows as any)[0] || {};
  const settings = campaign.settings || {};
  const eng = (engagementRows as any)[0] || {};
  const temp = (tempHistory as any[])?.[0];
  const cohort = (cohortRows as any)[0];
  const bookingCount = parseInt((bookingClicks as any)[0]?.cnt || '0', 10);

  // Get step goal from sequence
  let stepGoal = '';
  let totalSteps = parseInt(campaign.total_steps || '0', 10);
  if (campaign.steps) {
    const steps = typeof campaign.steps === 'string' ? JSON.parse(campaign.steps) : campaign.steps;
    if (steps[stepIndex]) {
      stepGoal = steps[stepIndex].step_goal || steps[stepIndex].subject || '';
    }
  }

  // Build sender relationship string
  const isAlumni = (campaign.type || '').includes('alumni');
  const isCold = (campaign.type || '').includes('cold');
  const senderRelationship = isAlumni
    ? 'This lead is a Colaberry alumni. They know Ali Muwwakkil personally. Reference Ali as the person behind this outreach.'
    : isCold
    ? 'This is a COLD prospect. They do NOT know Ali or Colaberry. Do not presume familiarity.'
    : 'This is a warm lead who has shown interest in Colaberry.';

  // Build temperature trend
  const tempTrend = temp
    ? `${temp.previous_temperature} -> ${temp.new_temperature} (${temp.trigger_type})`
    : lead.lead_temperature || 'unknown';

  // Last clicked URL
  const lastClick = await sequelize.query(`
    SELECT metadata->>'url' as url FROM interaction_outcomes
    WHERE lead_id = :leadId AND outcome = 'clicked' AND metadata->>'url' IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `, { replacements: { leadId }, type: QueryTypes.SELECT }) as any[];
  const lastClickedUrl = lastClick[0]?.url || null;

  // Last voice call outcome
  const lastCall = await sequelize.query(`
    SELECT provider_response->>'end_call_reason' as outcome FROM communication_logs
    WHERE lead_id = :leadId AND channel = 'voice' AND direction = 'outbound'
    ORDER BY created_at DESC LIMIT 1
  `, { replacements: { leadId }, type: QueryTypes.SELECT }) as any[];
  const lastCallOutcome = lastCall[0]?.outcome || null;

  // Determine allowed URLs based on campaign type
  const allowedUrls = {
    booking: 'https://enterprise.colaberry.ai/ai-architect',
    landingPage: isAlumni
      ? 'https://enterprise.colaberry.ai/alumni-ai-champion'
      : 'https://enterprise.colaberry.ai/ai-architect',
    mainSite: 'https://enterprise.colaberry.ai',
  };

  // Build cohort context
  const cohortContext = cohort ? {
    name: cohort.name,
    startDate: new Date(cohort.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    seatsRemaining: (cohort.max_seats || 20) - (cohort.seats_taken || 0),
    daysUntilStart: Math.max(0, Math.round((new Date(cohort.start_date).getTime() - Date.now()) / 86400000)),
  } : null;

  // Format previous messages
  const formattedPrev = (prevMessages as any[]).map((m: any) => ({
    channel: m.channel,
    subject: m.subject || '(no subject)',
    bodyPreview: (m.body_preview || '').replace(/<[^>]+>/g, '').substring(0, 300),
    sentAt: new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    outcome: m.status,
  }));

  return {
    lead: {
      name: lead.name || '',
      firstName: (lead.name || '').split(' ')[0],
      company: lead.company || '',
      title: lead.title || '',
      industry: lead.industry || '',
      phone: lead.phone || '',
      temperature: lead.lead_temperature || 'cold',
      pipelineStage: lead.pipeline_stage || 'new_lead',
      score: lead.lead_score || 0,
      notes: (lead.notes || '').substring(0, 500),
    },
    campaign: {
      name: campaign.name || '',
      type: campaign.type || '',
      senderName: settings.agent_name || settings.sender_name || 'Colaberry',
      senderRelationship,
      step: stepIndex,
      totalSteps,
      stepGoal,
    },
    engagement: {
      emailsSent: parseInt(eng.emails_sent || '0', 10),
      emailsOpened: parseInt(eng.emails_opened || '0', 10),
      linksClicked: parseInt(eng.links_clicked || '0', 10),
      lastClickedUrl,
      repliesReceived: parseInt(eng.replies || '0', 10),
      voiceCallsMade: parseInt(eng.voice_calls || '0', 10),
      lastCallOutcome,
      temperatureTrend: tempTrend,
      bookingAttempts: bookingCount,
    },
    previousMessages: formattedPrev,
    allowedUrls,
    cohort: cohortContext,
    alumniContext: lead.alumni_context || null,
  };
}
