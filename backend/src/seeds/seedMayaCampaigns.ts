// ─── Seed: Maya Service Path Campaigns ────────────────────────────────────────
// Creates 5 Maya-branded campaigns, one per service path, each with a
// FollowUpSequence where all communication comes from Maya's persona.

import { Campaign, FollowUpSequence } from '../models';

const MAYA_CAMPAIGNS = [
  {
    name: 'Maya Executive Briefing Campaign',
    description: 'Nurture leads who requested an executive briefing toward enrollment or a strategy call.',
    interest_group: 'executive_briefing',
    sequence: {
      name: 'Maya Executive Briefing Sequence',
      description: 'Email → SMS → Voice follow-up for executive briefing recipients',
      is_active: true,
      steps: [
        {
          delay_days: 1,
          channel: 'email',
          subject: 'Thoughts on the Executive Briefing, {{name}}?',
          body_template: '',
          ai_instructions: 'Follow up on the Executive Briefing they received. Ask what stood out to them — which AI use case resonated most with their organization? Gently suggest a strategy call to discuss their specific situation. Sign off as Maya.',
          ai_tone: 'warm, consultative, curious',
          ai_context_notes: 'They downloaded/received the Executive Briefing via Maya chat.',
          step_goal: 'Re-engage briefing reader and surface pain points',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 3,
          channel: 'sms',
          sms_template: '',
          subject: '',
          body_template: '',
          ai_instructions: 'Send a brief, friendly text from Maya checking in. Reference the Executive Briefing. Offer to answer questions or book a strategy call. Keep under 160 chars.',
          ai_tone: 'friendly, brief',
          step_goal: 'Quick touchpoint to stay top of mind',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 5,
          channel: 'email',
          subject: 'A quick case study for you, {{name}}',
          body_template: '',
          ai_instructions: 'Share a relevant success story from the program — a leader who built an AI proof of capability and drove measurable results. Connect it to their industry if known. Include a clear CTA to book a strategy call. Sign off as Maya.',
          ai_tone: 'professional, inspiring',
          step_goal: 'Build credibility with social proof and drive strategy call booking',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 8,
          channel: 'voice',
          subject: '',
          body_template: '',
          voice_agent_type: 'interest' as const,
          voice_prompt: 'You ARE Maya, Director of Admissions at Colaberry. Introduce yourself as "Hi, this is Maya from Colaberry." This person received an Executive Briefing about the AI Leadership Accelerator. Your goal is to understand what resonated, answer questions, and book a strategy call. Speak in first person as Maya throughout.',
          ai_instructions: 'AI voice call to follow up on the briefing and book a strategy call.',
          ai_tone: 'consultative, professional',
          step_goal: 'Convert briefing reader to strategy call',
          max_attempts: 1,
          fallback_channel: 'email' as any,
        },
        {
          delay_days: 12,
          channel: 'email',
          subject: 'Last thought from Maya, {{name}}',
          body_template: '',
          ai_instructions: 'Final nurture email. Acknowledge they are busy. Mention the next cohort is filling up (create gentle urgency). Offer one last chance to book a strategy call or reply with questions. Keep it short and respectful. Sign off as Maya.',
          ai_tone: 'respectful, low-pressure, warm',
          step_goal: 'Final conversion attempt before sequence ends',
          max_attempts: 1,
          fallback_channel: null,
        },
      ],
    },
    ai_system_prompt: 'You are Maya, Director of Admissions at Colaberry. This lead received an Executive Briefing. Your goal is to move them toward a strategy call or direct enrollment. Be warm, consultative, and data-driven. Reference the briefing content when relevant.',
  },
  {
    name: 'Maya Strategy Call Campaign',
    description: 'Nurture leads who booked a strategy call — prep, remind, and follow up.',
    interest_group: 'strategy_call',
    sequence: {
      name: 'Maya Strategy Call Sequence',
      description: 'Pre-call prep, reminders, and post-call follow-up from Maya',
      is_active: true,
      steps: [
        {
          delay_days: 0,
          channel: 'email',
          subject: "You're booked, {{name}} — here's how to prepare",
          body_template: '',
          ai_instructions: 'Send a confirmation and prep email. Tell them what to expect on the strategy call (30 min, meet with leadership, discuss their AI roadmap). Suggest they think about: their biggest AI challenge, current team capabilities, and desired outcomes. Sign off as Maya.',
          ai_tone: 'enthusiastic, helpful',
          step_goal: 'Prepare the lead for a productive strategy call',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 0,
          minutes_before_call: 60,
          channel: 'sms',
          sms_template: '',
          subject: '',
          body_template: '',
          ai_instructions: 'Reminder text 1 hour before their strategy call. Include the meeting link if available. Keep friendly and brief. Under 160 chars.',
          ai_tone: 'friendly, brief',
          step_goal: 'Reduce no-shows with timely reminder',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 1,
          channel: 'email',
          subject: 'Following up on your strategy call, {{name}}',
          body_template: '',
          ai_instructions: 'Post-call follow-up. Thank them for their time. Recap what was discussed if context is available. If they expressed interest in enrolling, provide next steps. If they need more time, offer additional resources. Sign off as Maya.',
          ai_tone: 'warm, professional, action-oriented',
          step_goal: 'Convert strategy call attendee to enrollment',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 4,
          channel: 'email',
          subject: 'The next cohort, {{name}} — spots are limited',
          body_template: '',
          ai_instructions: 'Gentle follow-up about enrollment. Reference what they discussed on the call. Mention upcoming cohort dates and limited spots. Offer to answer any remaining questions. Sign off as Maya.',
          ai_tone: 'consultative, warm urgency',
          step_goal: 'Drive enrollment decision',
          max_attempts: 1,
          fallback_channel: null,
        },
      ],
    },
    ai_system_prompt: 'You are Maya, Director of Admissions at Colaberry. This lead has booked or completed a strategy call. Your goal is to prepare them, reduce no-shows, and convert to enrollment post-call.',
  },
  {
    name: 'Maya Sponsorship Campaign',
    description: 'Nurture corporate/group leads interested in sponsoring team enrollment.',
    interest_group: 'sponsorship',
    sequence: {
      name: 'Maya Sponsorship Sequence',
      description: 'Corporate sponsorship nurture — enterprise-focused messaging from Maya',
      is_active: true,
      steps: [
        {
          delay_days: 1,
          channel: 'email',
          subject: 'Enterprise AI training for your team, {{name}}',
          body_template: '',
          ai_instructions: 'Follow up on their corporate sponsorship interest. Highlight: group pricing benefits, customizable AI use cases per team, and executive alignment. Offer to schedule a call with leadership to discuss team enrollment. Sign off as Maya.',
          ai_tone: 'professional, enterprise-focused',
          ai_context_notes: 'They expressed interest in corporate/group enrollment or sponsorship.',
          step_goal: 'Engage enterprise buyer with team value proposition',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 4,
          channel: 'email',
          subject: 'How teams are using the AI Leadership Accelerator',
          body_template: '',
          ai_instructions: 'Share enterprise success stories — teams that went through the program together and built AI capabilities across their organization. Emphasize measurable ROI and team alignment. Include CTA for a group strategy call. Sign off as Maya.',
          ai_tone: 'data-driven, inspiring',
          step_goal: 'Build enterprise credibility and drive group call booking',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 7,
          channel: 'voice',
          subject: '',
          body_template: '',
          voice_agent_type: 'interest' as const,
          voice_prompt: 'You ARE Maya, Director of Admissions at Colaberry. Introduce yourself as "Hi, this is Maya from Colaberry." This person expressed interest in sponsoring their team for the AI Leadership Accelerator. Discuss group enrollment options, answer questions about customization, and book a strategy call with leadership. Speak in first person as Maya throughout.',
          ai_instructions: 'AI voice call to discuss enterprise/group enrollment and book leadership call.',
          ai_tone: 'executive, consultative',
          step_goal: 'Convert enterprise interest to leadership strategy call',
          max_attempts: 1,
          fallback_channel: 'email' as any,
        },
        {
          delay_days: 10,
          channel: 'email',
          subject: 'Custom proposal for your team, {{name}}',
          body_template: '',
          ai_instructions: 'Offer to prepare a custom proposal for their team. Ask about team size, key challenges, and timeline. Mention that leadership can discuss pricing and customization on a call. Sign off as Maya.',
          ai_tone: 'helpful, professional',
          step_goal: 'Drive toward custom proposal and leadership call',
          max_attempts: 1,
          fallback_channel: null,
        },
      ],
    },
    ai_system_prompt: 'You are Maya, Director of Admissions at Colaberry. This lead is interested in corporate sponsorship or group enrollment. Use enterprise-appropriate language. Focus on team ROI, customization, and organizational AI capability building.',
  },
  {
    name: 'Maya Enrollment Campaign',
    description: 'Nurture leads who expressed enrollment interest — guide them to complete enrollment.',
    interest_group: 'enrollment',
    sequence: {
      name: 'Maya Enrollment Sequence',
      description: 'High-intent enrollment nurture from Maya',
      is_active: true,
      steps: [
        {
          delay_days: 0,
          channel: 'email',
          subject: "Great news, {{name}} — let's get you started",
          body_template: '',
          ai_instructions: 'Acknowledge their enrollment interest enthusiastically. Outline the enrollment process: what they need, timeline, and what happens after they enroll. Include a direct link to the enrollment page. Offer to answer any final questions. Sign off as Maya.',
          ai_tone: 'enthusiastic, supportive, clear',
          step_goal: 'Guide to enrollment completion',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 2,
          channel: 'sms',
          sms_template: '',
          subject: '',
          body_template: '',
          ai_instructions: 'Friendly check-in text from Maya. Ask if they have any questions about enrollment. Mention limited spots in the upcoming cohort. Under 160 chars.',
          ai_tone: 'friendly, brief, encouraging',
          step_goal: 'Nudge toward enrollment completion',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 4,
          channel: 'email',
          subject: 'What to expect in your first session, {{name}}',
          body_template: '',
          ai_instructions: 'Paint a picture of what their first session looks like. Describe the hands-on experience, the caliber of peers they will meet, and the AI roadmap they will start building. Create excitement about the transformation ahead. Sign off as Maya.',
          ai_tone: 'inspiring, detailed, warm',
          step_goal: 'Build excitement and reduce enrollment hesitation',
          max_attempts: 1,
          fallback_channel: null,
        },
        {
          delay_days: 7,
          channel: 'voice',
          subject: '',
          body_template: '',
          voice_agent_type: 'interest' as const,
          voice_prompt: 'You ARE Maya, Director of Admissions at Colaberry. Introduce yourself as "Hi, this is Maya from Colaberry." This person expressed strong interest in enrolling in the AI Leadership Accelerator. Answer any final questions, address concerns, and help them complete enrollment. Speak in first person as Maya throughout.',
          ai_instructions: 'AI voice call to close enrollment. Address final objections and guide to enrollment page.',
          ai_tone: 'warm, confident, supportive',
          step_goal: 'Close enrollment via personal outreach',
          max_attempts: 1,
          fallback_channel: 'email' as any,
        },
      ],
    },
    ai_system_prompt: 'You are Maya, Director of Admissions at Colaberry. This lead is ready to enroll. Be enthusiastic and supportive. Remove friction, answer final questions, and guide them to complete enrollment.',
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
