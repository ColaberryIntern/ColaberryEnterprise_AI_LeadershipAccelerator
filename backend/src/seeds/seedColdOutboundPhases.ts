import { FollowUpSequence, Campaign, AdminUser } from '../models';

// ─── Phase 2: Authority Building ──────────────────────────────────────────────

const PHASE2_SEQUENCE = {
  name: 'Cold Outbound Phase 2 — Authority Building',
  description: '6-step authority-building sequence for cold leads who showed engagement in Phase 1. Thought leadership, case studies, program education, advisory services, ROI, and full pathway.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'What leaders in {{industry}} are building with AI',
      body_template: '',
      ai_instructions: `Write about AI trends specific to the lead's industry. Reference that enterprise leaders in their vertical are deploying AI systems now. Mention Colaberry's advisory services work across 8 industries including Technology, Finance, Healthcare, Manufacturing, Energy, Retail, Government, and Logistics. Link to https://enterprise.colaberry.ai/advisory. Do NOT pitch the Accelerator program directly. Frame this as thought leadership. Keep it 3-4 paragraphs. Include a soft CTA: 'Reply if any of this resonates with your team's challenges.'

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. No "Best," no "Looking forward," no "Warm regards." The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold, no fancy links. Just a normal email.
- No opt-out language. No emdashes.

Include a mention of the AI Workforce Designer as a way they can see AI applied to their specific industry. Link: https://advisor.colaberry.ai/advisory/`,
      ai_tone: 'consultative',
      step_goal: 'Build credibility and relevance to their industry',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 1,
      channel: 'sms' as const,
      subject: 'Phase 2 intro follow-up',
      body_template: '',
      ai_instructions: `Short SMS follow-up to the industry trends email sent yesterday. Reference their industry. Example: "Hi {{firstName}}, Danielle here from Colaberry. I sent you something about AI trends in {{industry}} yesterday. Curious if any of it resonated with what your team is working on." Max 160 characters. No opt-out language.`,
      ai_tone: 'casual',
      step_goal: 'SMS nudge after industry trends email',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'The 3-week deployment model',
      body_template: '',
      ai_instructions: `Share a case study. A VP of Technology at a financial services firm (2,000-5,000 employees) completed the Accelerator and delivered a working loan processing AI POC on Day 3, got board-approved 90-Day AI Roadmap within 3 weeks. Quote: 'We walked in not knowing how to evaluate AI vendors. We walked out with a POC running on our own infrastructure and a roadmap our board approved on first presentation.' Also mention a healthcare case: Director of Clinical Informatics got $2M budget approved, AI governance framework aligned to HIPAA on Day 1. Link to https://enterprise.colaberry.ai/case-studies. Frame as 'here is what leaders like you are achieving' not 'you should sign up'.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'consultative',
      step_goal: 'Social proof through case studies',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 4,
      channel: 'sms' as const,
      subject: 'Case study follow-up',
      body_template: '',
      ai_instructions: `Short SMS referencing the case study email. Example: "Hi {{firstName}}, did you see how a VP of Technology delivered a working AI POC in 3 days? Would love to share how that maps to {{company}}." Max 160 characters. No opt-out language.`,
      ai_tone: 'casual',
      step_goal: 'SMS nudge after case study email',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 5,
      channel: 'email' as const,
      subject: 'How the program works',
      body_template: '',
      ai_instructions: `Walk through the program structure. 5 sessions over 3 weeks, Tuesdays and Thursdays, 1-3 PM CT, 2 hours each. The unique 3-Agent Model: (1) The Enterprise Leader (you - strategy), (2) Claude Code (execution engine), (3) Your Custom LLM (ChatGPT, Claude, Gemini, or your company-approved LLM). Participants walk away with 6 artifacts: Working AI POC, Executive Presentation Deck, 90-Day Expansion Roadmap, Architecture Templates, Governance Framework, Advisory Ecosystem Access. Bring Your Own LLM - data stays in your environment. No technical experience required. Link to https://enterprise.colaberry.ai/program.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'professional',
      step_goal: 'Educate on program structure and unique approach',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 8,
      channel: 'email' as const,
      subject: 'AI Agent Implementation and Advisory Services',
      body_template: '',
      ai_instructions: `Deep dive into advisory services. Colaberry offers 5 services: (1) AI Roadmap Workshops - 2-day sessions to operationalize your 90-Day Roadmap, (2) Enterprise AI Architecture Design - 4-8 weeks, architects work alongside your team, (3) AI Agent Implementation Projects - 8-16 weeks end-to-end from architecture to deployment, (4) AI Governance Advisory - 3-6 weeks for regulated industries (Finance, Healthcare, Government), (5) AI Talent Deployment - access enterprise-trained AI practitioners for embedded or project-based work. Key differentiator: capability transfer model - 'works alongside yours, not for you - we transfer capability, not just deliverables.' Link to https://enterprise.colaberry.ai/advisory.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'consultative',
      step_goal: 'Showcase full service offering beyond the Accelerator',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 9,
      channel: 'sms' as const,
      subject: 'Advisory services follow-up',
      body_template: '',
      ai_instructions: `Short SMS about advisory services. Example: "Hi {{firstName}}, Danielle from Colaberry. Beyond the Accelerator, we do hands-on AI Agent Implementation projects (8-16 weeks). Would that be relevant for {{company}}?" Max 160 characters. No opt-out language.`,
      ai_tone: 'casual',
      step_goal: 'SMS nudge after advisory email',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 10,
      channel: 'email' as const,
      subject: 'The ROI conversation',
      body_template: '',
      ai_instructions: `Talk ROI with specific numbers. Example: A team of 20 employees each saving 4 hours per week equals $5,600/week in recovered productivity. That is $291,200 per year in annual recurring savings. The program investment pays for itself in 2.7 weeks. That is a 19.4x ROI. Over 3 years, the financial impact is $873,600. These are conservative estimates - many organizations see even higher returns when AI systems scale across departments. Program cost is $4,500 per participant with group rates available. Link to https://enterprise.colaberry.ai/executive-roi-calculator?employees=20&hours=4 and https://enterprise.colaberry.ai/pricing. Frame as 'here is how leaders justify the investment internally' not a hard sell.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.

After presenting the ROI numbers, suggest they try the AI Workforce Designer to see the impact modeled for their specific company. Link: https://advisor.colaberry.ai/advisory/`,
      ai_tone: 'professional',
      step_goal: 'Build the business case with concrete ROI numbers',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 11,
      channel: 'sms' as const,
      subject: 'ROI follow-up',
      body_template: '',
      ai_instructions: `Short SMS about ROI. Example: "Hi {{firstName}}, quick thought: 20 employees saving 4 hrs/week = $291K/year. The program pays for itself in under 3 weeks. Worth a conversation?" Max 160 characters. No opt-out language.`,
      ai_tone: 'casual',
      step_goal: 'SMS nudge with ROI numbers',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 12,
      channel: 'email' as const,
      subject: 'The full path from learning to enterprise execution',
      body_template: '',
      ai_instructions: `Tie everything together. The Accelerator is just the starting point. The full path: Accelerator (3 weeks) gives you vocabulary, POC, and roadmap. Then Advisory services take you to deployed, governed AI systems in production. From Roadmap Workshops to Architecture Design to AI Agent Implementation to ongoing Talent Deployment. This is not a course - it is an enterprise AI enablement pathway. Reference their company specifically and how this path maps to their role. Soft CTA: 'If you want to explore what this could look like for [Company], I am happy to walk you through it.' Link to https://enterprise.colaberry.ai/advisory.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'consultative',
      step_goal: 'Paint the full picture - Accelerator to Enterprise execution',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const PHASE2_SYSTEM_PROMPT = `You are Danielle Carter, outreach specialist for Colaberry Enterprise AI Division. You write personalized, consultative emails that feel like genuine 1:1 conversations from a knowledgeable insider.

This is Phase 2 of a cold outbound sequence. The lead has already received initial outreach (Phase 1) and showed engagement (opened emails, clicked links). They are NOT a stranger — they have some familiarity with Colaberry's content.

Key context:
- Enterprise AI Leadership Accelerator: 5 sessions over 3 weeks, Tuesdays and Thursdays, 1-3 PM CT
- The 3-Agent Model: Enterprise Leader + Claude Code + Custom LLM
- 6 artifacts: Working AI POC, Executive Presentation, 90-Day Roadmap, Architecture Templates, Governance Framework, Advisory Ecosystem Access
- Advisory services: Roadmap Workshops, Architecture Design, AI Agent Implementation, Governance Advisory, Talent Deployment
- $4,500 per participant, group rates available
- Limited to 15 participants per cohort

Tone: Consultative thought leader. You are sharing insights, not selling. Every email should provide genuine value even if they never buy. Reference the lead's specific industry, role, and company context.

Rules:
- Never include a sign-off — the signature is appended automatically
- Write in plain text style, no HTML formatting
- No opt-out language, no emdashes
- Always reference the lead's specific context from the composite context

The AI Workforce Designer (https://advisor.colaberry.ai/advisory/) is a free tool where leads can design their AI organization in 5 minutes. Reference it as a low-friction next step when appropriate.`;

// ─── Phase 3: Decision ────────────────────────────────────────────────────────

const PHASE3_SEQUENCE = {
  name: 'Cold Outbound Phase 3 — Decision',
  description: '3-step decision sequence for cold leads who showed continued engagement through Phase 2. Direct offer, competitive urgency, and personal close from Ali.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'April 14 cohort seats remaining',
      body_template: '',
      ai_instructions: `Direct conversion email. The April 14 cohort is approaching. Price is $4,500 per participant. Group pricing available for 2+ participants. Private corporate cohort for 10+. What is included: 5-Session Intensive Accelerator, Working AI POC, 90-Day AI Execution Roadmap, Executive AI Presentation Deck, Enterprise AI Architecture Templates, Ongoing Advisory Labs access, Peer cohort with technical leaders across industries, Executive Sponsorship Support Kit. Corporate Sponsorship pathway available with ROI justification templates and budget request templates. Link to https://enterprise.colaberry.ai/pricing. Be direct but not pushy.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.

If they are not ready to commit, offer the AI Workforce Designer as a zero-commitment next step: "Not ready to decide? See what AI could look like at your company first" with link https://advisor.colaberry.ai/advisory/`,
      ai_tone: 'professional',
      step_goal: 'Present the offer with urgency',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 1,
      channel: 'sms' as const,
      subject: 'Pricing follow-up',
      body_template: '',
      ai_instructions: `Short SMS after pricing email. Example: "Hi {{firstName}}, Danielle from Colaberry. April 14 cohort is filling up. $4,500 includes a working AI POC you build yourself. Want me to send the details?" Max 160 characters. No opt-out language.`,
      ai_tone: 'direct',
      step_goal: 'SMS nudge after pricing email',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'Your competitors are not waiting',
      body_template: '',
      ai_instructions: `Competitive angle. Leaders in their industry are already deploying AI. A CTO in manufacturing went from strategy to production in 11 weeks. Quote: 'The accelerator showed us we had the capability to build it ourselves.' The industry average for AI deployment is 6-12 months. This program compresses that to 3 weeks for the POC and roadmap. Their competitors are not waiting. Reference their specific industry and company. Link to https://enterprise.colaberry.ai/case-studies.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'professional',
      step_goal: 'Create urgency through competitive positioning',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 5,
      channel: 'sms' as const,
      subject: 'Final SMS before Ali close',
      body_template: '',
      ai_instructions: `Final SMS before Ali's personal email. Example: "Hi {{firstName}}, my colleague Ali (our Managing Director) is going to reach out to you personally. He saw your engagement and wanted to connect directly." Max 160 characters. No opt-out language.`,
      ai_tone: 'warm',
      step_goal: 'Warm intro for Ali personal close',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 6,
      channel: 'email' as const,
      subject: 'Personal note, {{name}}',
      body_template: '',
      ai_instructions: `THIS EMAIL IS FROM ALI, NOT DANIELLE. Write as Ali Muwwakkil, Managing Director. Short, direct, personal. 'I have been following your engagement with our content and I wanted to reach out personally. I saved a spot for you in the April 14 cohort. If you want to discuss how this maps to what [Company] is working on, here is my calendar.' Include booking link https://enterprise.colaberry.ai/ai-architect with lid= parameter. Sign as Ali Muwwakkil, Managing Director. Keep it under 5 sentences. This is the final personal push.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off beyond "Ali Muwwakkil, Managing Director" since this is a sender override email.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'personal',
      step_goal: 'Personal close from the MD',
      max_attempts: 1,
      fallback_channel: null,
      metadata: {
        sender_override: {
          sender_name: 'Ali Muwwakkil',
          sender_email: 'ali@colaberry.com',
        },
      },
    },
  ],
};

const PHASE3_SYSTEM_PROMPT = `You are Danielle Carter, outreach specialist for Colaberry Enterprise AI Division. This is Phase 3 — the decision phase. The lead has been through Phase 1 (initial outreach) and Phase 2 (authority building). They have opened emails, clicked links, and shown sustained interest.

IMPORTANT: Step 2 (the final email) is from Ali Muwwakkil, Managing Director — NOT Danielle. Check the step metadata for sender_override. When sender_override is present, write as that person instead.

Key context:
- April 14 cohort, limited to 15 participants
- $4,500 per participant, group rates for 2+, private corporate cohort for 10+
- 5-Session Intensive, Working AI POC, 90-Day Roadmap, Executive Presentation, Architecture Templates, Advisory Labs, Sponsorship Support Kit
- Booking link: https://enterprise.colaberry.ai/ai-architect

Tone: Direct and confident. This person has been engaged for weeks. Be clear about the offer, create urgency, but never be desperate. They know the value — help them take action.

Rules:
- Never include a sign-off (appended automatically) — EXCEPT for the Ali override email where Ali signs off naturally
- Write in plain text style, no HTML formatting
- No opt-out language, no emdashes
- Reference the lead's specific context

The AI Workforce Designer (https://advisor.colaberry.ai/advisory/) can be offered as a zero-commitment alternative when a lead is not ready for the pricing conversation.`;

// ─── Seed Function ────────────────────────────────────────────────────────────

export async function seedColdOutboundPhases(): Promise<void> {
  const admin = await AdminUser.findOne();
  const createdBy = admin?.id || null;

  // ── Phase 2 ────────────────────────────────────────────────────────────
  let phase2Sequence = await FollowUpSequence.findOne({
    where: { name: PHASE2_SEQUENCE.name },
  });

  if (phase2Sequence) {
    await phase2Sequence.update({
      steps: PHASE2_SEQUENCE.steps,
      description: PHASE2_SEQUENCE.description,
      is_active: true,
    });
    console.log('[Seed] Phase 2 sequence exists. Updated steps.');
  } else {
    phase2Sequence = await FollowUpSequence.create(PHASE2_SEQUENCE as any);
    console.log('[Seed] Created Phase 2 sequence. ID:', phase2Sequence.id);
  }

  let phase2Campaign = await Campaign.findOne({
    where: { type: 'cold_outbound_phase2' },
  });

  if (!phase2Campaign) {
    phase2Campaign = await Campaign.create({
      name: 'AI Leadership Cold Outbound - Authority Building',
      description: 'Phase 2 cold outbound: authority-building sequence for leads who showed engagement in Phase 1. 6 emails over 12 days covering thought leadership, case studies, program details, advisory services, ROI, and full pathway.',
      type: 'cold_outbound_phase2',
      status: 'active',
      sequence_id: phase2Sequence.id,
      ai_system_prompt: PHASE2_SYSTEM_PROMPT,
      channel_config: {
        email: { enabled: true, daily_limit: 50 },
        voice: { enabled: false },
        sms: { enabled: false },
      },
      settings: {
        sender_email: 'danielle@colaberry.com',
        sender_name: 'Danielle Carter',
        agent_name: 'Danielle Carter',
        test_mode_enabled: false,
        delay_between_sends: 60,
        max_leads_per_cycle: 15,
        send_time_start: '09:00',
        send_time_end: '17:00',
        send_active_days: [1, 2, 3, 4, 5],
      },
      targeting_criteria: {
        source_campaign_type: 'cold_outbound',
        graduation_criteria: {
          min_opens: 2,
          min_clicks: 1,
          operator: 'OR',
        },
      },
      goals: 'Build authority and deepen engagement with leads who showed interest in Phase 1. Educate on program structure, advisory services, and ROI. Prepare them for Phase 3 decision sequence.',
      created_by: createdBy,
    } as any);
    console.log(`[Seed] Created Phase 2 campaign. ID: ${phase2Campaign.id}`);
  } else {
    await phase2Campaign.update({
      sequence_id: phase2Sequence.id,
      ai_system_prompt: PHASE2_SYSTEM_PROMPT,
    } as any);
    console.log(`[Seed] Phase 2 campaign exists. Synced sequence.`);
  }

  console.log('[Seed] Phase 2 steps:');
  PHASE2_SEQUENCE.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.step_goal}`);
  });

  // ── Phase 3 ────────────────────────────────────────────────────────────
  let phase3Sequence = await FollowUpSequence.findOne({
    where: { name: PHASE3_SEQUENCE.name },
  });

  if (phase3Sequence) {
    await phase3Sequence.update({
      steps: PHASE3_SEQUENCE.steps,
      description: PHASE3_SEQUENCE.description,
      is_active: true,
    });
    console.log('[Seed] Phase 3 sequence exists. Updated steps.');
  } else {
    phase3Sequence = await FollowUpSequence.create(PHASE3_SEQUENCE as any);
    console.log('[Seed] Created Phase 3 sequence. ID:', phase3Sequence.id);
  }

  let phase3Campaign = await Campaign.findOne({
    where: { type: 'cold_outbound_phase3' },
  });

  if (!phase3Campaign) {
    phase3Campaign = await Campaign.create({
      name: 'AI Leadership Cold Outbound - Decision',
      description: 'Phase 3 cold outbound: decision sequence for leads who showed continued engagement in Phase 2. 3 emails over 6 days — direct offer, competitive urgency, and personal close from Ali.',
      type: 'cold_outbound_phase3',
      status: 'active',
      sequence_id: phase3Sequence.id,
      ai_system_prompt: PHASE3_SYSTEM_PROMPT,
      channel_config: {
        email: { enabled: true, daily_limit: 50 },
        voice: { enabled: false },
        sms: { enabled: false },
      },
      settings: {
        sender_email: 'danielle@colaberry.com',
        sender_name: 'Danielle Carter',
        agent_name: 'Danielle Carter',
        test_mode_enabled: false,
        delay_between_sends: 60,
        max_leads_per_cycle: 15,
        send_time_start: '09:00',
        send_time_end: '17:00',
        send_active_days: [1, 2, 3, 4, 5],
      },
      targeting_criteria: {
        source_campaign_type: 'cold_outbound_phase2',
        graduation_criteria: {
          min_opens: 1,
          min_clicks: 0,
          operator: 'OR',
        },
      },
      goals: 'Convert engaged leads to booked strategy calls or direct enrollment. Direct offer, competitive urgency, and personal close from Ali Muwwakkil.',
      created_by: createdBy,
    } as any);
    console.log(`[Seed] Created Phase 3 campaign. ID: ${phase3Campaign.id}`);
  } else {
    await phase3Campaign.update({
      sequence_id: phase3Sequence.id,
      ai_system_prompt: PHASE3_SYSTEM_PROMPT,
    } as any);
    console.log(`[Seed] Phase 3 campaign exists. Synced sequence.`);
  }

  console.log('[Seed] Phase 3 steps:');
  PHASE3_SEQUENCE.steps.forEach((s, i) => {
    console.log(`  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.step_goal}`);
  });

  console.log('[Seed] Cold outbound phases 2 & 3 seeded.');
}
