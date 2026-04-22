import { FollowUpSequence, Campaign, AdminUser, LandingPage } from '../models';

// ─── Sequence A: Zero Risk ──────────────────────────────────────────────────

const ZERO_RISK_SEQUENCE = {
  name: 'AI System Pilot — Zero Risk Sequence',
  description: '4-step sequence for skeptical executives. Zero-risk, long-term partnership, AI pace of change, training + hiring.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'What if you could test an AI system before paying anything?',
      body_template: '',
      ai_instructions: `Write a consultative email introducing the zero-risk AI system pilot. The lead can test a real AI system before committing any money. We build a working AI system in 14 days. Zero cost until the system is proven and running. You do not pay unless we deliver real value. This is for executives who have been burned by AI vendors or are skeptical of AI promises. Frame this as: we take all the risk. You do not pay until you see it working in your environment, on your data, solving your problem. This is not a one-off project. We are looking to build long-term partnerships where we continuously build and improve AI systems for your company. We are selecting 10 founding clients for this program. CTA: Book a 30-minute scoping call at https://enterprise.colaberry.ai/pilot/zero-risk

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'consultative',
      step_goal: 'Zero-risk, you only pay if we deliver value, long-term partnership pitch',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: '7 of 10 founding spots filled',
      body_template: '',
      ai_instructions: `Write a direct email about scarcity and urgency. 7 of 10 founding client spots have been claimed. Here is why urgency matters beyond the spots: AI capabilities are doubling roughly every 4 months. Companies that start building now will have compounding advantages. Companies that wait will be multiple generations behind by this time next year. The founding rate locks in your first year at approximately the cost of a junior developer. That rate increases significantly once we open to general availability. One of the founding clients is a logistics CEO who went from skeptic to pilot in one call. Reference the lead's industry and company. Be direct about the limited spots remaining. CTA: Book a 30-minute call at https://enterprise.colaberry.ai/pilot/zero-risk

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'direct',
      step_goal: 'Scarcity + AI doubling every 4 months + 1st year locked at junior dev price',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 5,
      channel: 'email' as const,
      subject: 'How a 200-person company deployed AI in 11 days',
      body_template: '',
      ai_instructions: `Write a storytelling email about a case study. A 200-person company deployed an AI system in 11 days through the pilot program. The system automated their core operational bottleneck, saving 70% of the time their team spent on the process. That translated to $180K in annual savings. Walk through the timeline: Day 1-3 scoping, Day 4-10 build, Day 11 live in production. The key insight is that the system was built on their infrastructure, with their data, solving their specific problem. Not a generic demo. After the first system proved its value, they continued building. We trained their team to work alongside AI systems and helped them identify the next set of processes to automate. That is the model: start with one system, prove the value, then keep building and improving. We stay on as a long-term partner so the company can keep pace with how fast AI is moving. CTA: Book a 30-minute call at https://enterprise.colaberry.ai/pilot/zero-risk

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'storytelling',
      step_goal: 'Case study + continued building + training team + long-term partnership',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: 'Last call: founding client program closes Friday',
      body_template: '',
      ai_instructions: `Write a personal email from Ali Muwwakkil. This is the final push. The founding client program closes Friday. After that, the price goes from the founding rate to full price. Founding clients get their first year locked in at roughly the cost of a junior developer, plus priority access to our build team. This is not a marketing tactic. We genuinely have limited capacity to run concurrent builds and we are almost at capacity. Beyond the systems we build, we also train your employees to work with AI and offer hiring solutions if you need people who can manage and extend these systems. I wanted to reach out personally because based on what I know about the lead's company, I think this could be a strong fit for a long-term partnership. If they want to explore it, the next step is a 30-minute scoping call where we identify the highest-impact process to automate first.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'personal',
      step_goal: 'Personal close + training + hiring solutions + long-term partnership',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const ZERO_RISK_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI Division. You write direct, no-nonsense emails about the AI System Pilot Program.

This is the Zero Risk sequence. The core proposition: we build a working AI system in 14 days. The client does not pay until they see it working. We take all the risk. This is the start of a long-term partnership, not a one-off project.

Key themes to weave throughout:
- You don't pay unless we provide value. Zero risk to start.
- We are looking to build long-term contracts. The pilot is how the partnership starts.
- First year locked in at approximately the cost of a junior developer.
- AI capabilities are doubling every 4 months. Companies that start now compound their advantage. Companies that wait fall behind fast.
- We help companies stay on top of AI, build fast, keep improving existing systems, and build new ones.
- We also train your employees to work with AI and offer hiring solutions for AI-capable talent.

Key context:
- 14-day build timeline: Days 1-3 Scope, Days 4-10 Build, Days 11-14 Validate
- 10 founding client spots, 7 already claimed
- Founding rate locks in first year pricing
- Target: CEOs, Founders, Presidents, Owners at companies with 51-500 employees
- Industries: Logistics, Transportation, Professional Services, Staffing
- Case study: 200-person company, 11-day deploy, 70% time savings, $180K annual savings

Tone: Direct and confident. You are offering something genuinely valuable with zero risk. No hype, no buzzwords. Just the facts about what you build and how it works.

Rules:
- Never include a sign-off — the signature is appended automatically
- Write in plain text style, no HTML formatting
- No opt-out language, no emdashes
- Reference the lead's specific context from the composite context`;

// ─── Sequence B: Cost Replacement ───────────────────────────────────────────

const COST_REPLACEMENT_SEQUENCE = {
  name: 'AI System Pilot — Cost Replacement Sequence',
  description: '4-step sequence for operations leaders. AI vs junior hires, AI pace of change, training + hiring, long-term contracts.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'Your next hire should be an AI system, not a person',
      body_template: '',
      ai_instructions: `Write a pragmatic email comparing AI systems to junior hires. A junior hire costs $65K+ per year loaded (salary, benefits, taxes, equipment, management overhead), takes 3 months to ramp, works 40 hours a week, calls in sick, and quits after 18 months. An AI system costs less than one junior salary for the entire first year, works 24/7, deploys in 14 days, never calls in sick, and gets better over time. The founding rate locks in your first year at approximately the price of a junior developer. Do NOT quote specific monthly pricing. You do not pay unless the system delivers real value. We build it in 14 days for free. If it works, you keep it. If not, you walk away. This is not about replacing people. It is about putting AI systems on the repetitive, high-volume work so your team can focus on judgment calls and strategy. We are building these systems for 10 founding clients as long-term partnerships. CTA: See what we would build for your team at https://enterprise.colaberry.ai/pilot/ai-team

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'pragmatic',
      step_goal: 'Junior hire comparison + 1st year locked in + you only pay if we deliver value',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'The math on AI agents vs. junior hires',
      body_template: '',
      ai_instructions: `Write an analytical email breaking down the math. Take 5 common processes that companies staff with junior employees: invoice processing, customer routing, report generation, data entry, scheduling. Each process typically requires 0.5 to 1 FTE. That is $225K to $325K per year in fully loaded labor costs across those 5 processes. An AI system handling all 5 costs approximately $180K per year (including the build, maintenance, and infrastructure). That is a net savings of $45K to $145K in year one, and the savings compound in year two when build costs drop. Here is what makes this even more compelling: AI capabilities are doubling roughly every 4 months. The system you build today will be significantly more capable in 6 months. Companies that start building now will have compounding advantages. Companies that wait 12 months will be multiple generations behind. The goal is to get your company in a position to build fast, keep improving your existing systems, and add new AI capabilities as the technology advances. Reference the lead's industry and suggest which of these 5 processes would have the highest impact for their company. CTA: Book a 30-minute call at https://enterprise.colaberry.ai/pilot/ai-team

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'analytical',
      step_goal: 'ROI math + AI doubling every 4 months + compounding advantage',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 5,
      channel: 'email' as const,
      subject: 'Watch an AI agent process 200 invoices in 4 minutes',
      body_template: '',
      ai_instructions: `Write a pragmatic email about a specific AI agent capability. We built an invoice processing agent that handles 200 invoices in 4 minutes with 97% accuracy. It extracts vendor, amount, line items, PO numbers, and flags exceptions automatically. The agent handles multiple formats (PDF, email, scanned images) and learns the company's specific coding rules. Before the agent, this took a team of 3 people two full days every month. Now it takes 4 minutes and one person reviewing the exceptions. This is one example of what we build in the free 14-day pilot. But the real value is what comes after. We stay on as a long-term partner. We train your team to work alongside AI systems. We help you identify and build the next system, and the one after that. We also offer hiring solutions if you need people who can manage and extend these systems internally. The companies that win with AI are the ones that keep building, not the ones that build once and stop. Reference the lead's company and suggest what an equivalent agent could do for their specific operations. CTA: Book a 30-minute call at https://enterprise.colaberry.ai/pilot/ai-team

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'pragmatic',
      step_goal: 'Demo + long-term partnership + training + hiring solutions',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: 'We are closing the founding round this week',
      body_template: '',
      ai_instructions: `Write a direct email about the founding round closing. The founding client program is closing this week. Founding clients get their first year locked in at approximately the price of a junior developer, plus priority access to our build team and quarterly optimization reviews. Do NOT quote specific monthly pricing. This is a long-term partnership. We build your first system free, and if it delivers value, we continue building and improving. After this founding round closes, pricing increases and engagements become less hands-on. AI is doubling in capability every 4 months. The companies in this founding round will be 2-3 generations ahead of their competitors by this time next year. If the lead wants to lock in the founding rate, the next step is a 30-minute scoping call this week. CTA: Book that call at https://enterprise.colaberry.ai/pilot/ai-team

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'direct',
      step_goal: 'Close + 1st year at junior dev price + AI pace of change + long-term',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const COST_REPLACEMENT_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI Division. You write pragmatic, numbers-driven emails about the AI System Pilot Program.

This is the Cost Replacement sequence. The core proposition: AI agents cost less than junior hires, work 24/7, and deploy in 14 days. This is a long-term partnership, not a one-off build.

Key themes to weave throughout:
- You don't pay unless we provide value. Free 14-day build to prove it.
- We are looking to build long-term contracts. First system free, then ongoing partnership.
- First year locked in at approximately the price of a junior developer.
- AI capabilities are doubling every 4 months. Companies that start now compound their advantage. Waiting means falling behind fast.
- Stay on top of AI — build fast, keep improving existing systems, and build new ones as AI advances.
- We also train your employees to work with AI and offer hiring solutions for AI-capable talent.

Key context:
- AI system for less than one junior hire salary per year (do NOT quote specific monthly pricing)
- Junior hire: $65K+ loaded, 40hrs, 3-month ramp, 18-month retention. AI: 24/7, instant deploy, scales without headcount
- 5 target processes: invoice processing, customer routing, report generation, data entry, scheduling
- Invoice processing demo: 200 invoices in 4 minutes, 97% accuracy
- Founding clients get locked-in rates for first year and priority access
- Target: VP Operations, COO, Director Operations, VP Revenue at 201-1000 employee companies
- Industries: Technology, Financial Services, Healthcare, Manufacturing

Tone: Pragmatic and analytical. Lead with numbers. These are operations leaders who think in terms of cost per unit, efficiency gains, and ROI. Speak their language.

Rules:
- Never include a sign-off — the signature is appended automatically
- Write in plain text style, no HTML formatting
- No opt-out language, no emdashes
- Reference the lead's specific context from the composite context`;

// ─── Sequence C: Exclusive Build Program ────────────────────────────────────

const EXCLUSIVE_BUILD_SEQUENCE = {
  name: 'AI System Pilot — Exclusive Build Program Sequence',
  description: '4-step sequence for CEO/Founders. Exclusive selection, long-term partnership, AI pace, training + hiring, booking CTA.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'We are picking 10 companies to build AI into from the inside',
      body_template: '',
      ai_instructions: `Write an exclusive email about a selection-based long-term partnership. We are not selling a service. We are selecting 10 companies to partner with long-term and build AI into their core operations from the inside out. You do not pay unless we deliver real value. We start with a free 14-day build to prove it. If it delivers, we become your company's AI team on an ongoing basis. AI capabilities are doubling roughly every 4 months. The companies that start building now will have compounding advantages that their competitors cannot catch up to. We are looking for companies where AI can create a structural competitive advantage, not just one-time efficiency gains. The criteria: $5M to $50M in revenue, 51 to 200 employees, a CEO or founder who is personally committed to building AI into their company. The next step is a 30-minute strategy call to see if there is a mutual fit. CTA: Book a call at https://enterprise.colaberry.ai/pilot/exclusive

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'exclusive',
      step_goal: 'Selection + long-term + you only pay if we deliver + AI doubling every 4 months',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'What becoming an AI company actually looks like',
      body_template: '',
      ai_instructions: `Write a visionary email about what it means to have AI built into a company as a long-term strategy. Most companies bolt AI on as a tool. We build it in as infrastructure. The difference: a tool automates one task, infrastructure transforms how the whole company operates. We start by identifying the 2-3 highest-impact processes and building AI systems that handle them. Once those are running, we identify the next layer. Over time, AI compounds across your operations. The first system saves you $200K. The second builds on the first and saves $500K. By the third, your competitors cannot catch up. The founding rate locks in your first year at approximately the cost of a junior developer. Beyond building systems, we also train your employees to work with AI. We teach your team how to manage, extend, and think alongside these systems. We also offer hiring solutions if you need AI-capable talent. This is not a project with an end date. It is a long-term partnership where we continuously build AI capabilities into your company. Reference the lead's company and paint a picture of what their company looks like with AI deeply embedded. CTA: Book a 30-minute strategy call to explore what this looks like for your business at https://enterprise.colaberry.ai/pilot/exclusive

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'visionary',
      step_goal: 'Compounding vision + 1st year at junior dev price + training + hiring',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 5,
      channel: 'email' as const,
      subject: 'How one CEO turned a single AI system into $2M in savings',
      body_template: '',
      ai_instructions: `Write a storytelling email about a CEO who started with one AI system and expanded through a long-term partnership. A logistics CEO started with a single AI system for route planning. It saved $1.2M in year one by optimizing fuel, driver hours, and delivery windows. That proved the value. So we built a second system that automated customer quoting, cutting it from 45 minutes to 90 seconds per quote and freeing up 3 sales reps to focus on closing. Then a third for exception handling on shipment delays. Total annualized savings: $2M. We also trained his operations team to work alongside the AI systems and helped him hire two AI-capable engineers. His company went from zero AI capability to having AI embedded across three core operations. And because AI is doubling in capability every 4 months, each system keeps getting better automatically. This is what a long-term AI partnership looks like. You start with one system, see the results, and keep building. Reference the lead's industry and draw a parallel to what a similar progression could look like for their business. CTA: Book a 30-minute strategy call to identify where the first system would go at https://enterprise.colaberry.ai/pilot/exclusive

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'storytelling',
      step_goal: 'Case study + training + hiring + AI keeps improving + book a call',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: '3 spots left in the founding partner program',
      body_template: '',
      ai_instructions: `Write a personal email from Ali Muwwakkil, Managing Director. This is the final email. 3 founding partner spots remain. I am writing this personally because I have reviewed the lead's company profile and I believe there is a strong fit for a long-term partnership. Founding partners get their first year locked in at approximately the cost of a junior developer, plus priority access to our build team. You do not pay unless we deliver value. We build the first system free. After this founding cohort, pricing increases significantly and engagements become less hands-on. AI is doubling in capability every 4 months. The founding partners in this program will be 2-3 generations ahead of their competitors by this time next year. The companies that build now win. The companies that wait get left behind. The next step is a 30-minute strategy call where I personally walk through what we would build first and how a long-term partnership would work for their specific company. This is not a sales call. It is a conversation between founders. CTA: Book that call at https://enterprise.colaberry.ai/pilot/exclusive

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'personal',
      step_goal: 'Personal close + 1st year locked + AI pace urgency + book a call',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const EXCLUSIVE_BUILD_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI Division. You write exclusive, founder-to-founder emails about the AI System Build Program.

This is the Exclusive Build Program sequence. The core proposition: we select 10 companies and become their long-term AI partner. We start with a free 14-day build to prove value, then grow the partnership over time. This is NOT a time-boxed project. It is an ongoing relationship.

Key themes to weave throughout:
- You don't pay unless we provide value. Free 14-day build to prove it.
- We are looking to build long-term contracts. We become your company's AI team.
- First year locked in at approximately the price of a junior developer.
- AI capabilities are doubling every 4 months. Companies that start now compound their advantage. Waiting means falling behind fast.
- Stay on top of AI — build fast, keep improving existing systems, and build new ones as AI advances.
- We also train your employees to work with AI and offer hiring solutions for AI-capable talent.

Key context:
- Free 14-day build to start, then ongoing partnership
- AI systems that compound over time (start with 1, expand as value proves out)
- Founding partners get locked-in rates for the first year and priority access
- Selection criteria: $5M-50M revenue, 51-200 employees, CEO/Founder commitment
- Case study: logistics CEO started with route planning ($1.2M savings), expanded to quoting + exception handling ($2M total), trained team, hired AI engineers
- 10 founding spots, 3 remaining
- Target: CEO, Founder, Co-Founder at 51-200 employee companies
- Industries: SaaS, Software, E-commerce, FinTech, HealthTech
- Goal: book a 30-minute strategy call

Tone: Exclusive and visionary. This is founder-to-founder communication. You are selecting long-term partners, not selling services. The tone should convey that this partnership is valuable and limited.

Rules:
- Never include a sign-off — the signature is appended automatically
- Write in plain text style, no HTML formatting
- No opt-out language, no emdashes
- Every email should include a CTA to book a 30-minute strategy call
- Reference the lead's specific context from the composite context`;

// ─── Seed Function ──────────────────────────────────────────────────────────

export async function seedPilotProgramCampaigns(): Promise<void> {
  const admin = await AdminUser.findOne();
  const createdBy = admin?.id || null;

  // ── Sequence A: Zero Risk ───────────────────────────────────────────────
  let zeroRiskSeq = await FollowUpSequence.findOne({
    where: { name: ZERO_RISK_SEQUENCE.name },
  });

  if (zeroRiskSeq) {
    await zeroRiskSeq.update({
      steps: ZERO_RISK_SEQUENCE.steps,
      description: ZERO_RISK_SEQUENCE.description,
      is_active: true,
    });
    console.log('[Seed] Zero Risk sequence exists. Updated steps.');
  } else {
    zeroRiskSeq = await FollowUpSequence.create(ZERO_RISK_SEQUENCE as any);
    console.log('[Seed] Created Zero Risk sequence. ID:', zeroRiskSeq.id);
  }

  // ── Sequence B: Cost Replacement ────────────────────────────────────────
  let costReplSeq = await FollowUpSequence.findOne({
    where: { name: COST_REPLACEMENT_SEQUENCE.name },
  });

  if (costReplSeq) {
    await costReplSeq.update({
      steps: COST_REPLACEMENT_SEQUENCE.steps,
      description: COST_REPLACEMENT_SEQUENCE.description,
      is_active: true,
    });
    console.log('[Seed] Cost Replacement sequence exists. Updated steps.');
  } else {
    costReplSeq = await FollowUpSequence.create(COST_REPLACEMENT_SEQUENCE as any);
    console.log('[Seed] Created Cost Replacement sequence. ID:', costReplSeq.id);
  }

  // ── Sequence C: Exclusive Build ─────────────────────────────────────────
  let exclusiveSeq = await FollowUpSequence.findOne({
    where: { name: EXCLUSIVE_BUILD_SEQUENCE.name },
  });

  if (exclusiveSeq) {
    await exclusiveSeq.update({
      steps: EXCLUSIVE_BUILD_SEQUENCE.steps,
      description: EXCLUSIVE_BUILD_SEQUENCE.description,
      is_active: true,
    });
    console.log('[Seed] Exclusive Build sequence exists. Updated steps.');
  } else {
    exclusiveSeq = await FollowUpSequence.create(EXCLUSIVE_BUILD_SEQUENCE as any);
    console.log('[Seed] Created Exclusive Build sequence. ID:', exclusiveSeq.id);
  }

  // ── Campaign A: Zero Risk ──────────────────────────────────────────────
  const [campaignA] = await Campaign.findOrCreate({
    where: { name: 'AI System Pilot — Zero Risk' },
    defaults: {
      name: 'AI System Pilot — Zero Risk',
      description: 'Zero-risk pilot program for skeptical executives. 14-day build, zero cost until proven.',
      type: 'cold_outbound',
      status: 'draft',
      sequence_id: zeroRiskSeq.id,
      ai_system_prompt: ZERO_RISK_SYSTEM_PROMPT,
      channel_config: {
        email: { enabled: true, daily_limit: 50 },
        voice: { enabled: false },
        sms: { enabled: false },
      },
      settings: {
        sender_email: 'ali@colaberry.com',
        sender_name: 'Ali Muwwakkil',
        agent_name: 'Ali Muwwakkil',
        test_mode_enabled: false,
        delay_between_sends: 60,
        max_leads_per_cycle: 15,
        send_time_start: '09:00',
        send_time_end: '17:00',
        send_active_days: [1, 2, 3, 4, 5],
      },
      targeting_criteria: {
        industries: ['Logistics', 'Transportation', 'Professional Services', 'Staffing'],
        title_patterns: ['CEO', 'Founder', 'President', 'Owner'],
        company_size_min: 51,
        company_size_max: 500,
        lead_source_type: 'cold',
      },
      destination_path: '/pilot/zero-risk',
      goals: 'Convert skeptical executives into pilot clients through zero-risk proposition. 14-day build, zero cost until proven.',
      created_by: createdBy,
    } as any,
  });
  console.log(`[Seed] Campaign A (Zero Risk). ID: ${campaignA.id}`);

  // ── Campaign B: AI Team Replacement ────────────────────────────────────
  const [campaignB] = await Campaign.findOrCreate({
    where: { name: 'AI System Pilot — AI Team Replacement' },
    defaults: {
      name: 'AI System Pilot — AI Team Replacement',
      description: 'Cost replacement pitch for operations leaders. AI agents vs junior hires, ROI math.',
      type: 'cold_outbound',
      status: 'draft',
      sequence_id: costReplSeq.id,
      ai_system_prompt: COST_REPLACEMENT_SYSTEM_PROMPT,
      channel_config: {
        email: { enabled: true, daily_limit: 50 },
        voice: { enabled: false },
        sms: { enabled: false },
      },
      settings: {
        sender_email: 'ali@colaberry.com',
        sender_name: 'Ali Muwwakkil',
        agent_name: 'Ali Muwwakkil',
        test_mode_enabled: false,
        delay_between_sends: 60,
        max_leads_per_cycle: 15,
        send_time_start: '09:00',
        send_time_end: '17:00',
        send_active_days: [1, 2, 3, 4, 5],
      },
      targeting_criteria: {
        industries: ['Technology', 'Financial Services', 'Healthcare', 'Manufacturing'],
        title_patterns: ['VP Operations', 'COO', 'Director Operations', 'VP Revenue'],
        company_size_min: 201,
        company_size_max: 1000,
        lead_source_type: 'cold',
      },
      destination_path: '/pilot/ai-team',
      goals: 'Convert operations leaders through cost replacement math. AI agents vs junior hires, ROI-driven.',
      created_by: createdBy,
    } as any,
  });
  console.log(`[Seed] Campaign B (AI Team Replacement). ID: ${campaignB.id}`);

  // ── Campaign C: Exclusive Build Program ────────────────────────────────
  const [campaignC] = await Campaign.findOrCreate({
    where: { name: 'AI System Pilot — Exclusive Build Program' },
    defaults: {
      name: 'AI System Pilot — Exclusive Build Program',
      description: 'Exclusive long-term AI partnership for CEO/Founders. Selection-based, book strategy calls.',
      type: 'cold_outbound',
      status: 'draft',
      sequence_id: exclusiveSeq.id,
      ai_system_prompt: EXCLUSIVE_BUILD_SYSTEM_PROMPT,
      channel_config: {
        email: { enabled: true, daily_limit: 50 },
        voice: { enabled: false },
        sms: { enabled: false },
      },
      settings: {
        sender_email: 'ali@colaberry.com',
        sender_name: 'Ali Muwwakkil',
        agent_name: 'Ali Muwwakkil',
        test_mode_enabled: false,
        delay_between_sends: 60,
        max_leads_per_cycle: 15,
        send_time_start: '09:00',
        send_time_end: '17:00',
        send_active_days: [1, 2, 3, 4, 5],
      },
      targeting_criteria: {
        industries: ['SaaS', 'Software', 'E-commerce', 'FinTech', 'HealthTech'],
        title_patterns: ['CEO', 'Founder', 'Co-Founder'],
        company_size_min: 51,
        company_size_max: 200,
        lead_source_type: 'cold',
      },
      destination_path: '/pilot/exclusive',
      goals: 'Book strategy calls with founding partners for long-term AI partnership. Exclusive, founder-to-founder positioning.',
      created_by: createdBy,
    } as any,
  });
  console.log(`[Seed] Campaign C (Exclusive Build). ID: ${campaignC.id}`);

  // ── Landing Pages ─────────────────────────────────────────────────────
  await LandingPage.findOrCreate({
    where: { path: '/pilot/zero-risk' },
    defaults: {
      name: 'AI Pilot — Zero Risk',
      path: '/pilot/zero-risk',
      is_marketing_enabled: true,
      conversion_event: 'pilot_zero_risk_booking',
    } as any,
  });
  console.log('[Seed] Landing page: /pilot/zero-risk');

  await LandingPage.findOrCreate({
    where: { path: '/pilot/ai-team' },
    defaults: {
      name: 'AI Pilot — AI Team Replacement',
      path: '/pilot/ai-team',
      is_marketing_enabled: true,
      conversion_event: 'pilot_ai_team_booking',
    } as any,
  });
  console.log('[Seed] Landing page: /pilot/ai-team');

  await LandingPage.findOrCreate({
    where: { path: '/pilot/exclusive' },
    defaults: {
      name: 'AI Pilot — Exclusive Build Program',
      path: '/pilot/exclusive',
      is_marketing_enabled: true,
      conversion_event: 'pilot_exclusive_apply',
    } as any,
  });
  console.log('[Seed] Landing page: /pilot/exclusive');

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('[Seed] Pilot program campaigns seeded.');
  console.log('[Seed] Sequences:');
  [ZERO_RISK_SEQUENCE, COST_REPLACEMENT_SEQUENCE, EXCLUSIVE_BUILD_SEQUENCE].forEach(seq => {
    console.log(`  ${seq.name} (${seq.steps.length} steps)`);
    seq.steps.forEach((s, i) => {
      console.log(`    ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.step_goal}`);
    });
  });
}
