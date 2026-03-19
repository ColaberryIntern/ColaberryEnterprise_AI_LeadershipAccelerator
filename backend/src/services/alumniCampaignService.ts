import { Campaign, CampaignLead, Lead, FollowUpSequence } from '../models';
import { createCampaign } from './campaignService';
import { createSequence } from './sequenceService';
import { enrollLeadsInCampaign } from './campaignService';
import { importAlumniAsLeads } from './alumniDataService';
import { initializeRamp } from './autonomousRampService';
import type { SequenceStep } from '../models/FollowUpSequence';

// ── Constants ────────────────────────────────────────────────────────────

const LANDING_PAGE = 'https://enterprise.colaberry.ai/alumni-ai-champion';

const AI_CHAMPION_SYSTEM_PROMPT = `You are Cory, an AI assistant writing on behalf of Ali Kursun, CEO of Colaberry.
You are reaching out to Colaberry alumni about the Alumni AI Champion Program.

Key messaging pillars:
- Colaberry alumni community — reference their shared history
- AI Agents Training — special alumni pricing available
- Referral Commission — $250 per successful company referral
- Landing page: ${LANDING_PAGE}

Tone: Personal, warm, professional. Write as if Ali is personally reaching out.
Never hardcode email content — generate fresh, personalized content each time.
Use the lead's name, company, title, and industry when available.
Keep emails concise (under 200 words). Keep SMS under 160 characters.`;

const RE_ENGAGEMENT_SYSTEM_PROMPT = `You are Cory, an AI assistant writing on behalf of Ali Kursun, CEO of Colaberry.
You are re-engaging a Colaberry alumni who has gone quiet after a previous outreach.

Key messaging pillars:
- Acknowledge it's been a while — no pressure
- Share something new or valuable (AI industry update, new cohort, feature)
- Alumni discount still available
- Referral commission: $250 per company referral
- Landing page: ${LANDING_PAGE}

Tone: Warm, understanding, value-forward. Not pushy.
Never hardcode content — generate fresh, personalized messages each time.`;

// ── AI Champion Sequence Steps ───────────────────────────────────────────

const AI_CHAMPION_STEPS: SequenceStep[] = [
  // Day 0 — Welcome email
  {
    delay_days: 0,
    channel: 'email',
    subject: '{{name}}, your Colaberry alumni AI opportunity',
    body_template: '',
    step_goal: 'Introduce Alumni AI Champion program, drive landing page visit',
    ai_tone: 'warm, personal, excited',
    ai_instructions: `Write a welcome email from Ali to a Colaberry alumni.
Introduce the Alumni AI Champion Program — two paths:
1. Enroll in AI Agents Training at a special alumni discount
2. Refer your company and earn $250 per successful referral
Include link: ${LANDING_PAGE}
Make it personal — reference their Colaberry journey. Keep under 200 words.
Subject should feel personal, not marketing-y.`,
  },
  // Day 0 — Follow-up SMS
  {
    delay_days: 0,
    channel: 'sms',
    subject: '',
    body_template: '',
    sms_template: '',
    step_goal: 'Drive inbox check for welcome email',
    ai_tone: 'casual, friendly',
    ai_instructions: `Write a short SMS (under 160 chars) from Ali to a Colaberry alumni.
Mention you just sent them something exciting via email about Colaberry alumni + AI.
Keep it casual and personal.`,
  },
  // Day 2 — Value-add email
  {
    delay_days: 2,
    channel: 'email',
    subject: 'AI trend {{name}} should know about',
    body_template: '',
    step_goal: 'Provide value, share alumni discount details, soft CTA for strategy call',
    ai_tone: 'informative, generous',
    ai_instructions: `Write a value-add email from Ali.
Share a relevant AI trend or insight (pick something timely for their industry if known).
Mention the alumni discount details for AI Agents Training.
Soft CTA: offer a quick strategy call to explore if the program is a fit.
Keep under 200 words. Make it feel like advice from a mentor, not a sales pitch.`,
  },
  // Day 4 — Direct SMS
  {
    delay_days: 4,
    channel: 'sms',
    subject: '',
    body_template: '',
    sms_template: '',
    step_goal: 'Get direct engagement — reply YES for interest',
    ai_tone: 'direct, friendly',
    ai_instructions: `Write a short SMS (under 160 chars) from Ali.
Ask directly if they're interested in AI agents training.
Mention alumni get special pricing. Ask them to reply YES if interested.`,
  },
  // Day 7 — Social proof email
  {
    delay_days: 7,
    channel: 'email',
    subject: 'How Colaberry alumni are leading in AI',
    body_template: '',
    step_goal: 'Social proof + referral details, CTA: join or refer',
    ai_tone: 'inspiring, community-focused',
    ai_instructions: `Write an email from Ali sharing alumni success stories with AI.
Reference how other Colaberry alumni are adopting AI in their companies.
Detail the referral program: $250 per successful company referral.
Two CTAs: 1) Join the training yourself 2) Refer your company.
Link: ${LANDING_PAGE}
Keep under 200 words.`,
  },
  // Day 10 — Final SMS
  {
    delay_days: 10,
    channel: 'sms',
    subject: '',
    body_template: '',
    sms_template: '',
    step_goal: 'Final touchpoint — urgency + landing page link',
    ai_tone: 'friendly, slight urgency',
    ai_instructions: `Write a final SMS (under 160 chars) from Ali.
Last note about the alumni AI training + $250/referral opportunity.
Include the landing page link: ${LANDING_PAGE}`,
  },
];

// ── Re-Engagement Sequence Steps ─────────────────────────────────────────

const RE_ENGAGEMENT_STEPS: SequenceStep[] = [
  // Day 0 — Re-engage email
  {
    delay_days: 0,
    channel: 'email',
    subject: '{{name}}, something new from Colaberry',
    body_template: '',
    step_goal: 'Re-engage: acknowledge absence, share new update, alumni discount still available',
    ai_tone: 'warm, understanding, no pressure',
    ai_instructions: `Write a re-engagement email from Ali to a Colaberry alumni who went quiet.
Acknowledge it's been a while — no guilt, just genuine reconnection.
Share a new update (new cohort, new AI trend, new feature).
Mention the alumni discount is still available.
Link: ${LANDING_PAGE}
Keep under 200 words. Make it feel like an old friend reaching out.`,
  },
  // Day 1 — SMS nudge
  {
    delay_days: 1,
    channel: 'sms',
    subject: '',
    body_template: '',
    sms_template: '',
    step_goal: 'Drive email open for re-engagement message',
    ai_tone: 'casual, friendly',
    ai_instructions: `Write a short SMS (under 160 chars) from Ali.
Mention exciting updates for Colaberry alumni. Ask them to check their email.`,
  },
  // Day 3 — Deeper value email
  {
    delay_days: 3,
    channel: 'email',
    subject: 'Quick AI strategy idea for {{company}}',
    body_template: '',
    step_goal: 'Provide deeper value, offer strategy call',
    ai_tone: 'consultative, helpful',
    ai_instructions: `Write an email from Ali offering genuine value.
Share a specific AI use case relevant to their industry or role.
Offer a free strategy call — no commitment, just exploring options.
Keep under 200 words. Focus on their benefit, not the sale.`,
  },
  // Day 6 — Final SMS
  {
    delay_days: 6,
    channel: 'sms',
    subject: '',
    body_template: '',
    sms_template: '',
    step_goal: 'Final re-engagement attempt — direct CTA',
    ai_tone: 'friendly, slight urgency',
    ai_instructions: `Write a final SMS (under 160 chars) from Ali.
Mention the alumni AI Champion program is closing soon.
Ask them to reply CALL if they'd like to chat with Ali.`,
  },
];

// ── Seed Function ────────────────────────────────────────────────────────

export interface SeedResult {
  champion_campaign_id: string;
  reengagement_campaign_id: string;
  alumni_imported: { created: number; updated: number; skipped: number; errors: number };
  leads_enrolled: number;
}

/**
 * Create both alumni campaigns (AI Champion + Re-Engagement),
 * import alumni from MSSQL, and enroll them in the primary campaign.
 */
export async function seedAlumniCampaigns(createdBy: string): Promise<SeedResult> {
  // 1. Create AI Champion sequence (find existing first to avoid duplicates)
  let championSeq = await FollowUpSequence.findOne({ where: { name: 'Alumni AI Champion Sequence' } });
  if (!championSeq) {
    championSeq = await createSequence({
      name: 'Alumni AI Champion Sequence',
      description: '6-step multi-channel sequence: Day 0 (email+SMS), Day 2 (email), Day 4 (SMS), Day 7 (email), Day 10 (SMS)',
      steps: AI_CHAMPION_STEPS,
    });
  }

  // 2. Create Re-Engagement sequence (find existing first to avoid duplicates)
  let reengageSeq = await FollowUpSequence.findOne({ where: { name: 'Alumni Re-Engagement Sequence' } });
  if (!reengageSeq) {
    reengageSeq = await createSequence({
      name: 'Alumni Re-Engagement Sequence',
      description: '4-step re-engagement: Day 0 (email), Day 1 (SMS), Day 3 (email), Day 6 (SMS)',
      steps: RE_ENGAGEMENT_STEPS,
    });
  }

  // 3. Create AI Champion campaign (idempotent — skip if exists)
  let championCampaign = await Campaign.findOne({ where: { name: 'Colaberry Alumni AI Champion Campaign' } });
  if (!championCampaign) {
    championCampaign = await createCampaign({
      name: 'Colaberry Alumni AI Champion Campaign',
      description: 'Primary alumni outreach: AI Agents training (alumni discount) + $250 referral commission. Multi-channel email+SMS over 10 days.',
      type: 'alumni',
      sequence_id: championSeq.id,
      ai_system_prompt: AI_CHAMPION_SYSTEM_PROMPT,
      channel_config: {
        email: { enabled: true, daily_limit: 100 },
        sms: { enabled: true },
        voice: { enabled: false },
      },
      targeting_criteria: {
        lifecycle_enabled: true,
        inactivity_days: 30,
        lead_source_type: 'alumni',
        lead_source_types: ['alumni'],
        utm_source: 'alumni_champion',
        utm_medium: 'email',
        utm_campaign: 'alumni_ai_champion_2026',
      },
      created_by: createdBy,
    });
  } else {
    await (championCampaign as any).update({ sequence_id: championSeq.id, status: 'active' });
  }

  // 4. Create Re-Engagement campaign (idempotent — skip if exists)
  let reengageCampaign = await Campaign.findOne({ where: { name: 'Colaberry Alumni Re-Engagement Campaign' } });
  if (!reengageCampaign) {
    reengageCampaign = await createCampaign({
      name: 'Colaberry Alumni Re-Engagement Campaign',
      description: 'Auto-triggered when alumni go inactive for 30 days after completing champion campaign. 4-step re-engagement over 6 days.',
      type: 'alumni_re_engagement',
      sequence_id: reengageSeq.id,
      ai_system_prompt: RE_ENGAGEMENT_SYSTEM_PROMPT,
      channel_config: {
        email: { enabled: true, daily_limit: 100 },
        sms: { enabled: true },
        voice: { enabled: false },
      },
      targeting_criteria: {
        lifecycle_enabled: true,
        paired_campaign_id: championCampaign.id,
        inactivity_days: 30,
        lead_source_type: 'alumni',
        utm_source: 'alumni_reengagement',
        utm_medium: 'email',
        utm_campaign: 'alumni_reengagement_2026',
      },
      created_by: createdBy,
    });
  } else {
    await (reengageCampaign as any).update({ sequence_id: reengageSeq.id, status: 'active' });
  }

  // 5. Cross-link: champion → re-engagement
  const existingCriteria = (championCampaign as any).targeting_criteria || {};
  await (championCampaign as any).update({
    targeting_criteria: {
      ...existingCriteria,
      paired_campaign_id: reengageCampaign.id,
    },
  });

  // 6. Import alumni from MSSQL (skip if not configured)
  let importResult = { created: [] as any[], updated: [] as any[], skipped: 0, errors: [] as string[] };
  try {
    importResult = await importAlumniAsLeads();
  } catch (err: any) {
    console.warn(`[AlumniCampaign] MSSQL import skipped: ${err.message}`);
    importResult.errors.push(`MSSQL import skipped: ${err.message}`);
  }

  // 7. Set autonomous mode BEFORE activation so ramp controls enrollment
  await (championCampaign as any).update({ campaign_mode: 'autonomous' });
  await (reengageCampaign as any).update({ campaign_mode: 'autonomous' });

  // 8. Pre-enroll all alumni leads with status 'enrolled' (NOT 'active').
  //    This registers them in CampaignLead but does NOT create ScheduledEmail
  //    records. The ramp system will activate them in phase-sized batches.
  const alumniLeads = await Lead.findAll({
    where: { lead_source_type: 'alumni' } as any,
    attributes: ['id'],
    raw: true,
  }) as any[];

  const leadIds = alumniLeads.map((l: any) => l.id);
  let enrolledCount = 0;

  if (leadIds.length > 0) {
    // Bulk-create CampaignLead records with 'enrolled' status (not active)
    for (const leadId of leadIds) {
      try {
        const existing = await CampaignLead.findOne({
          where: { campaign_id: championCampaign.id, lead_id: leadId },
        });
        if (existing) { enrolledCount++; continue; }
        await CampaignLead.create({
          campaign_id: championCampaign.id,
          lead_id: leadId,
          status: 'enrolled',
        } as any);
        enrolledCount++;
      } catch (err: any) {
        console.error(`[AlumniCampaign] Failed to pre-enroll lead ${leadId}:`, err.message);
      }
    }

    // Set lifecycle fields on enrolled CampaignLeads
    await CampaignLead.update(
      {
        lifecycle_status: 'active',
        last_campaign_entry: new Date(),
        campaign_cycle_number: 1,
      } as any,
      {
        where: { campaign_id: championCampaign.id },
      },
    );
  }

  // 9. Activate campaigns — then initialize ramp which enrolls only phase 1 batch
  await (championCampaign as any).update({ status: 'active', started_at: new Date() });
  await (reengageCampaign as any).update({ status: 'active', started_at: new Date() });

  // 10. Initialize ramp for champion campaign only.
  // This will activate phase 1 leads (e.g. 15 for alumni) from the 'enrolled' pool
  // and create ScheduledEmail records only for that batch.
  // Re-engagement campaign receives leads via lifecycle transitions only.
  await initializeRamp(championCampaign.id);

  // Set ramp_state metadata on re-engagement so the ramp infrastructure
  // is ready when leads arrive via lifecycle transitions, but do NOT
  // call initializeRamp (which would enrollPhaseBatch immediately).
  const reengageProfile = { phase_sizes: [10, 25, 50, -1] }; // alumni_re_engagement profile
  const reengageLeadsPerPhase: Record<string, number> = {};
  for (let i = 1; i <= reengageProfile.phase_sizes.length; i++) {
    reengageLeadsPerPhase[String(i)] = 0;
  }
  await (reengageCampaign as any).update({
    ramp_state: {
      current_phase: 1,
      phase_sizes: reengageProfile.phase_sizes,
      leads_enrolled_per_phase: reengageLeadsPerPhase,
      phase_started_at: new Date().toISOString(),
      phase_health_score: null,
      status: 'ramping',
      evaluation_history: [],
    },
    evolution_config: {
      enabled: true,
      evolution_frequency_sends: 100,
      evolution_frequency_hours: 24,
      last_evolution_at: null,
      sends_since_last_evolution: 0,
      similarity_threshold: 0.70,
      max_active_variants: 3,
    },
  });

  console.log(`[AlumniCampaign] Seed complete: champion=${championCampaign.id}, reengagement=${reengageCampaign.id}, enrolled=${enrolledCount}`);

  return {
    champion_campaign_id: championCampaign.id,
    reengagement_campaign_id: reengageCampaign.id,
    alumni_imported: {
      created: importResult.created.length,
      updated: importResult.updated.length,
      skipped: importResult.skipped,
      errors: importResult.errors.length,
    },
    leads_enrolled: enrolledCount,
  };
}

// ── Migrate Existing Alumni Campaigns to Autonomous ─────────────────────

export interface MigrationResult {
  updated: string[];
  errors: string[];
}

/**
 * Migrate existing alumni campaigns from warm_nurture/re_engagement types
 * to alumni/alumni_re_engagement with autonomous mode enabled.
 */
export async function migrateExistingAlumniCampaigns(): Promise<MigrationResult> {
  const result: MigrationResult = { updated: [], errors: [] };

  // Find champion campaign by name
  const champion = await Campaign.findOne({
    where: { name: 'Colaberry Alumni AI Champion Campaign' },
  }) as any;

  if (champion) {
    try {
      const updates: Record<string, any> = {};
      if (champion.type !== 'alumni') updates.type = 'alumni';
      if (champion.campaign_mode !== 'autonomous') updates.campaign_mode = 'autonomous';

      if (Object.keys(updates).length > 0) {
        await champion.update(updates);
        result.updated.push(`${champion.id} (Alumni AI Champion → type=alumni, mode=autonomous)`);
      }

      // Initialize ramp if active and no ramp_state
      if (champion.status === 'active' && !champion.ramp_state) {
        await initializeRamp(champion.id);
        result.updated.push(`${champion.id} (ramp initialized)`);
      }
    } catch (err: any) {
      result.errors.push(`Champion: ${err.message}`);
    }
  }

  // Find re-engagement campaign by name
  const reengage = await Campaign.findOne({
    where: { name: 'Colaberry Alumni Re-Engagement Campaign' },
  }) as any;

  if (reengage) {
    try {
      const updates: Record<string, any> = {};
      if (reengage.type !== 'alumni_re_engagement') updates.type = 'alumni_re_engagement';
      if (reengage.campaign_mode !== 'autonomous') updates.campaign_mode = 'autonomous';

      if (Object.keys(updates).length > 0) {
        await reengage.update(updates);
        result.updated.push(`${reengage.id} (Alumni Re-Engagement → type=alumni_re_engagement, mode=autonomous)`);
      }

      if (reengage.status === 'active' && !reengage.ramp_state) {
        await initializeRamp(reengage.id);
        result.updated.push(`${reengage.id} (ramp initialized)`);
      }
    } catch (err: any) {
      result.errors.push(`Re-Engagement: ${err.message}`);
    }
  }

  console.log(`[AlumniCampaign] Migration complete: ${result.updated.length} updates, ${result.errors.length} errors`);
  return result;
}
