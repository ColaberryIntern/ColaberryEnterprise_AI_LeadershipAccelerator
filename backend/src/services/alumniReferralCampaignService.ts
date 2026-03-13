import { Campaign, FollowUpSequence } from '../models';
import { createCampaign } from './campaignService';
import { createSequence } from './sequenceService';
import type { SequenceStep } from '../models/FollowUpSequence';

// ── Constants ────────────────────────────────────────────────────────────

const REFERRAL_CAMPAIGN_SYSTEM_PROMPT = `You are Maya, Director of Admissions at Colaberry Enterprise AI Division.
You are reaching out to a corporate contact who was PERSONALLY REFERRED by a Colaberry alumni.

Critical rules:
- This is a WARM INTRODUCTION, not a cold pitch. The referrer already established trust.
- ALWAYS mention the referrer by name naturally in the message. Check the REFERRAL CONTEXT section for their name.
- Reference the referrer's Colaberry experience as social proof — they completed a Colaberry program and thought this contact would benefit.
- Focus on the Enterprise AI Leadership Accelerator: 5-day intensive where executives build a working AI proof of concept, executive presentation, and 90-day roadmap.
- Limited to 15 participants per cohort.
- Never mention the referral commission or the referral program itself — the contact should not know about the financial incentive.

Tone: Warm, professional, consultative. You're connecting two people, not selling.
Keep emails concise (150-250 words). Keep SMS under 160 characters.
Never hardcode content — generate fresh, personalized messages each time.
Sign off as Maya.`;

// ── Referral Sequence Steps ─────────────────────────────────────────────

const REFERRAL_STEPS: SequenceStep[] = [
  // Day 0 — Warm introduction email
  {
    delay_days: 0,
    channel: 'email',
    subject: '{{name}}, a personal introduction from a colleague',
    body_template: '',
    step_goal: 'Warm intro via referral — establish connection, introduce program',
    ai_tone: 'warm, personal, consultative',
    ai_instructions: `Write a warm introduction email. The lead was personally referred by a Colaberry alumni (check REFERRAL CONTEXT for their name).
Open by mentioning the referrer by name — they recommended we connect.
Briefly introduce the Enterprise AI Leadership Accelerator: 5-day intensive where executives build a working AI proof of concept, executive presentation, and 90-day roadmap.
Ask what AI challenge resonates most with their organization.
Keep under 200 words. Make it feel like a personal connection, not a marketing email.`,
    ai_context_notes: 'This lead was personally referred by a Colaberry alumni. Check REFERRAL CONTEXT for the referrer name. Use their name naturally to establish trust.',
  },
  // Day 2 — Value + social proof
  {
    delay_days: 2,
    channel: 'email',
    subject: 'What leaders are building in 5 days, {{name}}',
    body_template: '',
    step_goal: 'Share program outcomes, reference referrer, suggest strategy call',
    ai_tone: 'informative, warm, credible',
    ai_instructions: `Follow up on the intro email. Mention that the referrer (check REFERRAL CONTEXT) thought this would be particularly valuable for them.
Share 2-3 specific outcomes from program graduates:
1. VP of Engineering at Fortune 500 built AI document analysis saving 70% time
2. Director of Data Science created AI readiness dashboard that secured $2M budget
3. CTO deployed churn prediction model with 89% accuracy in 30 days
Tie examples to the lead's industry if possible.
Suggest a brief 15-minute strategy call to explore fit.
Keep under 200 words.`,
    ai_context_notes: 'This lead was personally referred. Mention the referrer name from REFERRAL CONTEXT when following up.',
  },
  // Day 4 — SMS nudge
  {
    delay_days: 4,
    channel: 'sms',
    subject: '',
    body_template: '',
    sms_template: '',
    step_goal: 'Quick nudge — check if they saw emails, offer call',
    ai_tone: 'casual, friendly',
    ai_instructions: `Write a short SMS (under 160 chars). Quick check-in about the AI Leadership program that the referrer (from REFERRAL CONTEXT) recommended. Offer to set up a quick call.`,
    ai_context_notes: 'Referral lead. Mention the referrer name briefly.',
  },
  // Day 7 — Case study + urgency
  {
    delay_days: 7,
    channel: 'email',
    subject: 'Limited seats for the next cohort, {{name}}',
    body_template: '',
    step_goal: 'Industry-relevant case study, urgency via limited seats, one more referrer mention',
    ai_tone: 'consultative, slight urgency',
    ai_instructions: `Share a specific success story relevant to their industry or role.
Reference that the referrer (from REFERRAL CONTEXT) connected us because they saw a fit.
Mention limited cohort size (15 seats) and the upcoming start date.
Clear CTA: book a strategy call to secure their spot.
Keep under 200 words.`,
    ai_context_notes: 'Referral lead. Last mention of referrer name — keep it natural, not forced.',
  },
  // Day 10 — Respectful final follow-up
  {
    delay_days: 10,
    channel: 'email',
    subject: 'Last note from me, {{name}}',
    body_template: '',
    step_goal: 'Respectful close — acknowledge referral, final offer, step back gracefully',
    ai_tone: 'respectful, warm, no pressure',
    ai_instructions: `Final touchpoint. Reference that the referrer (from REFERRAL CONTEXT) connected us.
Reiterate the core value: 5-day intensive, working AI proof of concept, 90-day roadmap.
Offer one last chance to schedule a call.
Close warmly — let them know the door is always open.
Keep under 150 words. This should feel gracious, not desperate.`,
    ai_context_notes: 'Final email in the referral sequence. Close respectfully.',
  },
];

// ── Seed Function ───────────────────────────────────────────────────────

export async function seedAlumniReferralCampaign(): Promise<void> {
  const CAMPAIGN_NAME = 'Colaberry Alumni Referrals Campaign';
  const SEQUENCE_NAME = 'Alumni Referral Introduction Sequence';

  // Check if already exists
  const existing = await Campaign.findOne({ where: { name: CAMPAIGN_NAME } });
  if (existing) {
    console.log(`[Seed] ${CAMPAIGN_NAME} already exists, skipping.`);
    return;
  }

  // Create sequence
  let sequence = await FollowUpSequence.findOne({ where: { name: SEQUENCE_NAME } });
  if (!sequence) {
    sequence = await createSequence({
      name: SEQUENCE_NAME,
      steps: REFERRAL_STEPS,
    });
  }

  // Create campaign (createCampaign defaults to 'draft', then we activate)
  // Find an admin to set as creator
  const { AdminUser } = await import('../models');
  const admin = await AdminUser.findOne();

  const campaign = await createCampaign({
    name: CAMPAIGN_NAME,
    type: 'alumni_referral' as any,
    sequence_id: sequence.id,
    ai_system_prompt: REFERRAL_CAMPAIGN_SYSTEM_PROMPT,
    created_by: admin?.id || 'system',
  });
  await campaign.update({ status: 'active' });

  console.log(`[Seed] ${CAMPAIGN_NAME} created with ${REFERRAL_STEPS.length}-step sequence.`);
}
