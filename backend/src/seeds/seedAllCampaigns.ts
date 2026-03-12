import { FollowUpSequence, Campaign, AdminUser } from '../models';
import { seedAlumniCampaigns } from '../services/alumniCampaignService';

/**
 * Idempotent seed for all core campaigns.
 * Called on server startup — creates campaigns if they don't exist,
 * links them to existing sequences.
 * Does NOT call connectDatabase() or process.exit() — expects DB to be ready.
 */
export async function seedAllCampaigns() {
  const admin = await AdminUser.findOne();
  const createdBy = admin?.id || null;

  // ─── 1. Cold Outbound ──────────────────────────────────────────────
  await upsertCampaign({
    name: 'AI Leadership Cold Outbound Q1',
    sequenceName: 'Cold Outbound AI Leadership Sequence',
    description: 'Cold outbound campaign targeting AI-interested executives sourced from Apollo. All messages AI-generated at send time.',
    type: 'cold_outbound',
    status: 'draft',
    targeting_criteria: {
      industries: ['SaaS', 'Technology', 'Financial Services', 'Healthcare', 'Manufacturing'],
      title_patterns: ['CTO', 'VP Engineering', 'Director AI', 'Chief Data', 'Head of AI'],
      company_size_min: 51,
      company_size_max: 1000,
      score_min: 40,
      lead_source_type: 'cold',
    },
    channel_config: {
      email: { enabled: true, daily_limit: 50 },
      voice: { enabled: true },
      sms: { enabled: false },
    },
    ai_system_prompt: `You are a professional outreach specialist for Colaberry Enterprise AI Division. You write personalized, consultative messages that feel like genuine 1:1 conversations.

Key messaging points:
- Enterprise AI Leadership Accelerator: 5-day intensive program
- Executives build a working AI proof of concept, executive presentation, and 90-day roadmap
- Limited to 15 participants per cohort
- $4,500 investment vs $50K-$150K consulting alternative
- Recent graduates achieved: 70% time savings, $2M budget approvals, 89% accuracy ML models

Tone: Professional, peer-level, consultative. Never sound like marketing. Always reference the lead's specific context.`,
    created_by: createdBy,
  });

  // ─── 2. Executive Briefing Interest ────────────────────────────────
  await upsertCampaign({
    name: 'Executive Briefing Interest Campaign',
    sequenceName: 'Executive Briefing Interest',
    description: 'Auto-campaign for executive briefing downloaders. Leads are enrolled automatically when they submit the Get Executive Briefing form. Starts at Day 1 since Day 0 voice call + email are handled by automationService.',
    type: 'warm_nurture',
    status: 'active',
    channel_config: {
      email: { enabled: true, daily_limit: 50 },
      voice: { enabled: true },
      sms: { enabled: false },
    },
    ai_system_prompt: `You are writing follow-up messages for Colaberry Enterprise AI Division. The recipient is an executive who recently downloaded the Executive Briefing on AI Leadership. They are evaluating AI training programs and internal capability building. Reference the briefing naturally — they have read it. Be consultative, not salesy. Focus on helping them understand how to act on the briefing insights. Ali Merchant is the sender.`,
    settings: {
      test_mode_enabled: false,
      delay_between_sends: 120,
      max_leads_per_cycle: 50,
    },
  });

  // ─── 3. Strategy Call No-Show Recovery ─────────────────────────────
  await upsertCampaign({
    name: 'Strategy Call No-Show Recovery Campaign',
    sequenceName: 'Strategy Call No-Show Recovery',
    description: 'Auto-campaign for strategy call no-show recovery. Leads are enrolled when a no-show is detected.',
    type: 'warm_nurture',
    status: 'active',
    ai_system_prompt: `You are writing recovery messages for Colaberry Enterprise AI Division. The recipient missed their scheduled strategy call. Be warm, understanding, and never guilt-trip them. Offer to reschedule and emphasize that their preparation data is saved. Focus on making it easy for them to re-engage.`,
    settings: {
      test_mode_enabled: false,
      delay_between_sends: 60,
      max_leads_per_cycle: 20,
    },
  });

  // ─── 4. Strategy Call Prep Nudge (legacy, marked completed) ────────
  await upsertCampaign({
    name: 'Strategy Call Prep Nudge Campaign',
    sequenceName: 'Strategy Call Prep Nudge',
    description: 'Auto-campaign for strategy call prep nudges. Leads are enrolled automatically on booking.',
    type: 'warm_nurture',
    status: 'completed',
    ai_system_prompt: `You are writing follow-up messages for Colaberry Enterprise AI Division. The recipient has booked a strategy call and needs to complete a short preparation form. Be warm, professional, and value-driven. Emphasize that the prep form makes their call more productive — it's not busywork. Never be pushy or salesy.`,
    settings: {
      test_mode_enabled: false,
      delay_between_sends: 60,
      max_leads_per_cycle: 50,
    },
  });

  // ─── 5. Strategy Call Readiness (replaces Prep Nudge) ──────────────
  await upsertCampaign({
    name: 'Strategy Call Readiness Campaign',
    sequenceName: 'Strategy Call Readiness',
    description: 'Auto-campaign for strategy call bookings. Leads are enrolled automatically on booking. Ensures executives are prepared and excited for their meeting. Replaces the old 3-step Prep Nudge.',
    type: 'warm_nurture',
    status: 'active',
    goals: 'Ensure every strategy call booking results in a prepared, engaged executive who shows up ready for a productive 30-minute session. Target 90%+ show rate. Get executives to complete the prep form before the call so we can personalize the discussion to their specific AI challenges and organizational context.',
    gtm_notes: 'This is a warm nurture countdown campaign. Leads are auto-enrolled on booking a strategy call. Step 1 is the booking confirmation (sent immediately). Steps 2-6 are a countdown sequence scheduled backwards from the call time (T-3d, T-1d, T-6h, T-3h, T-15min). The campaign should never feel salesy — the executive has already committed to the call. Focus is on preparation, expectation-setting, and logistics. All messages are AI-generated using lead context. The sequence auto-cancels steps whose countdown time has already passed at enrollment and cancels entirely when the prep form is submitted.',
    channel_config: {
      email: { enabled: true, daily_limit: 50 },
      voice: { enabled: false },
      sms: { enabled: true },
    },
    ai_system_prompt: `You are writing follow-up messages for Colaberry Enterprise AI Division. The recipient is an executive who has booked a 30-minute strategy call. Your goal is to ensure they are prepared, excited, and show up ready to have a productive conversation. Never be salesy — they have already committed to the call. Focus on helping them get maximum value from their 30 minutes. Ali Merchant is the sender.`,
    settings: {
      test_mode_enabled: false,
      delay_between_sends: 60,
      max_leads_per_cycle: 50,
    },
  });

  // ─── 6 & 7. Alumni campaigns (champion + re-engagement) ─────────────
  if (createdBy) {
    try {
      await seedAlumniCampaigns(createdBy);
    } catch (err: any) {
      console.warn('[Seed] Alumni campaigns seed skipped:', err?.message);
    }
  }

  console.log('[Seed] All core campaigns seeded.');
}

// ─── Helper ────────────────────────────────────────────────────────────

async function upsertCampaign(data: {
  name: string;
  sequenceName: string;
  description: string;
  type: string;
  status: string;
  targeting_criteria?: object;
  channel_config?: object;
  ai_system_prompt: string;
  settings?: object;
  goals?: string;
  gtm_notes?: string;
  created_by?: string | null;
}) {
  // Find existing sequence
  const sequence = await FollowUpSequence.findOne({ where: { name: data.sequenceName } });
  if (!sequence) {
    console.warn(`[Seed] Sequence "${data.sequenceName}" not found — skipping campaign "${data.name}"`);
    return;
  }

  const existing = await Campaign.findOne({ where: { name: data.name } });
  if (existing) {
    // Update sequence link and status
    await existing.update({ sequence_id: sequence.id, status: data.status } as any);
    return;
  }

  const campaignData: any = {
    name: data.name,
    description: data.description,
    type: data.type,
    status: data.status,
    sequence_id: sequence.id,
    ai_system_prompt: data.ai_system_prompt,
  };

  if (data.targeting_criteria) campaignData.targeting_criteria = data.targeting_criteria;
  if (data.channel_config) campaignData.channel_config = data.channel_config;
  if (data.settings) campaignData.settings = data.settings;
  if (data.goals) campaignData.goals = data.goals;
  if (data.gtm_notes) campaignData.gtm_notes = data.gtm_notes;
  if (data.created_by) campaignData.created_by = data.created_by;

  await Campaign.create(campaignData);
  console.log(`[Seed] Created campaign: ${data.name}`);
}
