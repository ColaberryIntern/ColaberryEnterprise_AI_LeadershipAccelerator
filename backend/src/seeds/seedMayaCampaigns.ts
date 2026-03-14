// ─── Seed: Maya Service Path Campaigns ────────────────────────────────────────
// Creates Maya-branded campaigns with FollowUpSequences where all
// communication comes from Maya's persona.
// Active campaigns: Voice Call Requested + Inbound Lead (general fallback)

import { Campaign, FollowUpSequence } from '../models';

const MAYA_CAMPAIGNS = [
  {
    name: 'Maya Voice Call Requested Campaign',
    description: 'Nurture leads who requested an immediate voice call from Maya — follow up after the call.',
    interest_group: 'voice_call',
    sequence: {
      name: 'Maya Voice Call Requested Sequence',
      description: 'Post-call follow-up sequence after Maya-initiated voice call',
      is_active: true,
      steps: [
        {
          delay_days: 0,
          channel: 'sms',
          sms_template: '',
          subject: '',
          body_template: '',
          ai_instructions: 'Send a brief text from Maya right after the voice call. Thank them for chatting. Include a link to the enrollment page or offer to book a strategy call. Under 160 chars.',
          ai_tone: 'warm, brief',
          step_goal: 'Immediate post-call touchpoint while interest is high',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 1,
          channel: 'email',
          subject: 'Great speaking with you, {{name}}',
          body_template: '',
          ai_instructions: 'Follow up on the voice call. Thank them for the conversation. Recap what was discussed if context is available. Suggest next steps: Executive Briefing, strategy call with leadership, or enrollment. Sign off as Maya.',
          ai_tone: 'warm, professional, action-oriented',
          step_goal: 'Convert voice call engagement into next step',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 3,
          channel: 'email',
          subject: 'A quick resource for you, {{name}}',
          body_template: '',
          ai_instructions: 'Share a relevant resource — executive briefing, case study, or program overview based on what they discussed on the call. Include a clear CTA to book a strategy call. Sign off as Maya.',
          ai_tone: 'helpful, consultative',
          step_goal: 'Provide value and drive toward strategy call booking',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 6,
          channel: 'email',
          subject: 'Still thinking about AI leadership, {{name}}?',
          body_template: '',
          ai_instructions: 'Final follow-up. Acknowledge they may need time. Mention the next cohort timeline and limited spots. Offer one last chance to book a strategy call or reply with questions. Keep it respectful. Sign off as Maya.',
          ai_tone: 'respectful, low-pressure, warm',
          step_goal: 'Final conversion attempt after voice call',
          max_attempts: 1,
          fallback_channel: null,
        },
      ],
    },
    ai_system_prompt: 'You are Maya, Director of Admissions at Colaberry. This lead requested a voice call and spoke with Maya AI. Your goal is to follow up on the call, provide next steps, and guide toward a strategy call or enrollment.',
  },
  {
    name: 'Maya Inbound Lead Campaign',
    description: 'General nurture for inbound leads who chatted with Maya but have not chosen a specific path yet.',
    interest_group: 'general',
    sequence: {
      name: 'Maya Inbound Lead Sequence',
      description: 'General interest nurture — discover their path and guide them',
      is_active: true,
      steps: [
        {
          delay_days: 1,
          channel: 'email',
          subject: 'Great chatting with you, {{name}}',
          body_template: '',
          ai_instructions: 'Follow up on their Maya chat conversation. Thank them for chatting. Briefly mention the 4 things you can help with: Executive Briefing, Strategy Call, Sponsorship/Group options, or Enrollment. Ask which interests them most. Sign off as Maya.',
          ai_tone: 'warm, helpful, curious',
          step_goal: 'Identify which service path they are most interested in',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 3,
          channel: 'sms',
          sms_template: '',
          subject: '',
          body_template: '',
          ai_instructions: 'Quick text from Maya. Ask if they had a chance to think about the AI Leadership Accelerator. Offer to send an Executive Briefing or book a strategy call. Under 160 chars.',
          ai_tone: 'friendly, brief',
          step_goal: 'Re-engage and route to a service path',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 6,
          channel: 'email',
          subject: 'A success story that might resonate, {{name}}',
          body_template: '',
          ai_instructions: 'Share a compelling success story from the program. Pick one that is broadly relatable — a leader who was unsure about AI but built something transformative. End with a CTA to book a strategy call. Sign off as Maya.',
          ai_tone: 'inspiring, relatable',
          step_goal: 'Build credibility and drive toward strategy call',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 10,
          channel: 'email',
          subject: 'One more thing, {{name}}',
          body_template: '',
          ai_instructions: 'Final touchpoint. Acknowledge they may be evaluating options. Mention what makes the AI Leadership Accelerator unique (hands-on, executive-level, real deliverables). Offer one last chance to connect. Keep it short and respectful. Sign off as Maya.',
          ai_tone: 'respectful, low-pressure',
          step_goal: 'Final conversion attempt',
          max_attempts: 1,
          fallback_channel: null,
        },
      ],
    },
    ai_system_prompt: 'You are Maya, Director of Admissions at Colaberry. This lead chatted with you but has not chosen a specific service path. Your goal is to identify their interest and guide them toward a strategy call or enrollment.',
  },
];

/**
 * Seed all Maya service-path campaigns and their follow-up sequences.
 * Idempotent — updates existing campaigns/sequences if they already exist.
 */
export async function seedMayaCampaigns(): Promise<void> {
  console.log('[SeedMayaCampaigns] Seeding Maya service-path campaigns...');

  for (const config of MAYA_CAMPAIGNS) {
    try {
      // Upsert FollowUpSequence
      let sequence = await FollowUpSequence.findOne({
        where: { name: config.sequence.name },
      });

      if (sequence) {
        await sequence.update({
          steps: config.sequence.steps as any,
          is_active: config.sequence.is_active,
          description: config.sequence.description,
        });
        console.log(`  Updated sequence: ${config.sequence.name}`);
      } else {
        sequence = await FollowUpSequence.create(config.sequence as any);
        console.log(`  Created sequence: ${config.sequence.name}`);
      }

      // Upsert Campaign
      let campaign = await Campaign.findOne({
        where: { name: config.name },
      });

      if (campaign) {
        await campaign.update({
          description: config.description,
          sequence_id: sequence.id,
          interest_group: config.interest_group,
          ai_system_prompt: config.ai_system_prompt,
          status: 'active',
        });
        console.log(`  Updated campaign: ${config.name} (status: active)`);
      } else {
        await Campaign.create({
          name: config.name,
          description: config.description,
          type: 'warm_nurture',
          status: 'active',
          sequence_id: sequence.id,
          interest_group: config.interest_group,
          ai_system_prompt: config.ai_system_prompt,
          channel_config: {
            email: { enabled: true, daily_limit: 50 },
            sms: { enabled: true },
            voice: { enabled: true },
          },
          settings: {
            test_mode_enabled: false,
            delay_between_sends: 120,
            max_leads_per_cycle: 50,
          },
        } as any);
        console.log(`  Created campaign: ${config.name} (status: active)`);
      }
    } catch (err: any) {
      console.error(`  Failed to seed "${config.name}":`, err.message);
    }
  }

  console.log('[SeedMayaCampaigns] Done.');
}

// Allow direct execution: npx ts-node src/seeds/seedMayaCampaigns.ts
if (require.main === module) {
  const { sequelize } = require('../models');
  sequelize.authenticate()
    .then(() => seedMayaCampaigns())
    .then(() => {
      console.log('Seed complete.');
      process.exit(0);
    })
    .catch((err: any) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
