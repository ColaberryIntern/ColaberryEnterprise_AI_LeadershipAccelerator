import { FollowUpSequence, Campaign, AdminUser, LandingPage } from '../models';

// ─── Sequence A: Zero Risk ──────────────────────────────────────────────────

const ZERO_RISK_SEQUENCE = {
  name: 'AI System Pilot — Zero Risk Sequence',
  description: '4-step sequence for skeptical executives. Zero-risk proposition, scarcity, case study, deadline close.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'What if you could test an AI system before paying anything?',
      body_template: '',
      ai_instructions: `Write a consultative email introducing the zero-risk AI system pilot. The lead can test a real AI system before committing any money. We build a working AI system in 14 days. Zero cost until the system is proven and running. This is for executives who have been burned by AI vendors or are skeptical of AI promises. Frame this as: we take all the risk. You do not pay until you see it working in your environment, on your data, solving your problem. Mention that we are selecting 10 founding clients for this program. CTA: Book a scoping call at https://enterprise.colaberry.ai/pilot/zero-risk

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'consultative',
      step_goal: 'Zero-risk proposition for skeptical execs. Mention 14-day build, zero cost until proven.',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: '7 of 10 founding spots filled',
      body_template: '',
      ai_instructions: `Write a direct email about scarcity. 7 of 10 founding client spots have been claimed. One of the founding clients is a logistics CEO who needed AI to optimize route planning. He went from skeptic to pilot in one call. The founding rate locks in pricing that will increase significantly once the program opens to general availability. Reference the lead's industry and company. Be direct about the limited spots remaining.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'direct',
      step_goal: 'Scarcity — 7 spots claimed, logistics CEO example',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 5,
      channel: 'email' as const,
      subject: 'How a 200-person company deployed AI in 11 days',
      body_template: '',
      ai_instructions: `Write a storytelling email about a case study. A 200-person company deployed an AI system in 11 days through the pilot program. The system automated their core operational bottleneck, saving 70% of the time their team spent on the process. That translated to $180K in annual savings. Walk through the timeline: Day 1-3 scoping, Day 4-10 build, Day 11 live in production. The key insight is that the system was built on their infrastructure, with their data, solving their specific problem. Not a generic demo. Not a proof of concept that sits on a shelf. A working system.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'storytelling',
      step_goal: 'Case study — 70% time savings, $180K savings',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: 'Last call: founding client program closes Friday',
      body_template: '',
      ai_instructions: `Write a personal email from Ali Muwwakkil. This is the final push. The founding client program closes Friday. After that, the price goes from the founding rate to full price. This is not a marketing tactic. We genuinely have limited capacity to run concurrent pilots and we are almost at capacity. I wanted to reach out personally because based on what I know about the lead's company, I think this could be a strong fit. If they want to explore it, the next step is a 20-minute scoping call where we identify the highest-impact process to automate first.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'personal',
      step_goal: 'Deadline — founding rate vs full price',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const ZERO_RISK_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI Division. You write direct, no-nonsense emails about the AI System Pilot Program.

This is the Zero Risk sequence. The core proposition: we build a working AI system in 14 days. The client does not pay until they see it working. We take all the risk.

Key context:
- 14-day build timeline: Days 1-3 Scope, Days 4-10 Build, Days 11-14 Validate
- 10 founding client spots, 7 already claimed
- Founding rate locks in lower pricing
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
  description: '4-step sequence for operations leaders. AI agents vs junior hires, ROI math, demo, founding rate close.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'Your next hire should be an AI system, not a person',
      body_template: '',
      ai_instructions: `Write a pragmatic email comparing AI systems to junior hires. A junior hire costs $65K+ per year loaded (salary, benefits, taxes, equipment, management overhead), takes 3 months to ramp, works 40 hours a week, calls in sick, and quits after 18 months. An AI system costs less than one junior salary for the entire first year, works 24/7, deploys in 14 days, never calls in sick, and gets better over time. Do NOT quote specific monthly pricing. This is not about replacing people. It is about putting AI systems on the repetitive, high-volume work so your team can focus on judgment calls and strategy. We are building these systems for 10 founding clients right now. CTA: See what we would build for your team at https://enterprise.colaberry.ai/pilot/ai-team

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'pragmatic',
      step_goal: 'Less than 1 junior hire comparison, 24/7, zero ramp',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'The math on AI agents vs. junior hires',
      body_template: '',
      ai_instructions: `Write an analytical email breaking down the math. Take 5 common processes that companies staff with junior employees: invoice processing, customer routing, report generation, data entry, scheduling. Each process typically requires 0.5 to 1 FTE. That is $225K to $325K per year in fully loaded labor costs across those 5 processes. An AI system handling all 5 costs approximately $180K per year (including the build, maintenance, and infrastructure). That is a net savings of $45K to $145K in year one, and the savings compound in year two when build costs drop. The AI system also runs 24/7 with consistent quality. Reference the lead's industry and suggest which of these 5 processes would have the highest impact for their company.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'analytical',
      step_goal: '5 processes, $225-325K savings vs $180K cost',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 5,
      channel: 'email' as const,
      subject: 'Watch an AI agent process 200 invoices in 4 minutes',
      body_template: '',
      ai_instructions: `Write a pragmatic email about a specific AI agent capability. We built an invoice processing agent that handles 200 invoices in 4 minutes with 97% accuracy. It extracts vendor, amount, line items, PO numbers, and flags exceptions automatically. The agent handles multiple formats (PDF, email, scanned images) and learns the company's specific coding rules. Before the agent, this took a team of 3 people two full days every month. Now it takes 4 minutes and one person reviewing the exceptions. This is one example of what we build in the 14-day pilot. Reference the lead's company and suggest what an equivalent agent could do for their specific operations.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'pragmatic',
      step_goal: 'Invoice processing agent demo, 97% accuracy',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: 'We are closing the founding round this week',
      body_template: '',
      ai_instructions: `Write a direct email about the founding round closing. The founding client program is closing this week. Founding clients get locked-in rates, priority access to our build team, and quarterly optimization reviews. Do NOT quote specific monthly pricing. After this round closes, pricing increases and engagements become less hands-on. We are closing because we have nearly filled all 10 spots and need to focus our build capacity on delivering for those clients. If the lead wants to lock in the founding rate, the next step is a 20-minute scoping call this week.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'direct',
      step_goal: 'Close with founding benefits and deadline',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const COST_REPLACEMENT_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI Division. You write pragmatic, numbers-driven emails about the AI System Pilot Program.

This is the Cost Replacement sequence. The core proposition: AI agents cost less than junior hires, work 24/7, and deploy in 14 days.

Key context:
- AI system for less than one junior hire salary per year (do NOT quote specific monthly pricing)
- Junior hire: $65K+ loaded, 40hrs, 3-month ramp, 18-month retention. AI: 24/7, instant deploy, scales without headcount
- 5 target processes: invoice processing, customer routing, report generation, data entry, scheduling
- Invoice processing demo: 200 invoices in 4 minutes, 97% accuracy
- Founding clients get locked-in rates and priority access (pricing scoped on call)
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
  description: '4-step sequence for CEO/Founders. Exclusive selection, 12-week vision, case study ROI, personal close.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'We are picking 10 companies to build AI into from the inside',
      body_template: '',
      ai_instructions: `Write an exclusive email about a selection-based program. We are not selling a service. We are selecting 10 companies to partner with and build AI into their core operations from the inside out. This is a 12-week engagement where we embed with the leadership team, audit operations, build AI systems, train the team, and transfer ownership. The criteria: $5M to $50M in revenue, 51 to 200 employees, a CEO or founder who is personally committed to the transformation. We are looking for companies where AI can create a structural competitive advantage, not just efficiency gains. CTA: Apply at https://enterprise.colaberry.ai/pilot/exclusive

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'exclusive',
      step_goal: 'Selection process, $5M-50M revenue, 51-200 employees',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'What becoming an AI company actually looks like',
      body_template: '',
      ai_instructions: `Write a visionary email about the 12-week transformation. Phase 1 (Weeks 1-2): AI Audit. We map every process, identify the highest-impact automation targets, and build the business case. Phase 2 (Weeks 3-6): Build. We deploy 3-5 AI systems targeting the processes identified in the audit. Phase 3 (Weeks 7-10): Train. We train the team to manage, monitor, and extend the AI systems. Phase 4 (Weeks 11-12): Transfer. Full ownership transfer with documentation, runbooks, and ongoing advisory access. The outcome is not a vendor dependency. The outcome is an AI-capable company that can build and extend its own systems. Reference the lead's company and paint a picture of what their company looks like after the 12 weeks.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'visionary',
      step_goal: '12-week engagement, 4 phases',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 5,
      channel: 'email' as const,
      subject: 'How one founder turned $36K into $2M in operational savings',
      body_template: '',
      ai_instructions: `Write a storytelling email about a founder's ROI. A logistics CEO invested $36K in the build program. In 12 weeks, his company deployed AI systems that: reduced route planning time by 85%, automated customer quoting (from 45 minutes to 90 seconds per quote), and built an automated exception handling system for shipment delays. The annualized operational savings: $2M. The route planning AI alone saved $1.2M by optimizing fuel, driver hours, and delivery windows. The quoting system freed up 3 sales reps to focus on closing instead of quoting. This is the type of structural transformation that changes a company's economics permanently. Reference the lead's industry and draw a parallel to what similar results could look like in their business.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'storytelling',
      step_goal: 'Logistics CEO, 85% routing reduction, $36K to $2M',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: '3 spots left in the founding build program',
      body_template: '',
      ai_instructions: `Write a personal email from Ali Muwwakkil, Managing Director. This is the final email. 3 spots remain in the founding build program. I am writing this personally because I have reviewed the lead's company profile and I believe there is a strong fit. The founding program includes the full 12-week engagement at a rate that will not be available once we open to general availability. After the founding cohort, the engagement price increases significantly. The next step is a 30-minute conversation where I personally walk through what the 12-week engagement would look like for their specific company. This is not a sales call. It is a scoping conversation between founders.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold.
- No opt-out language. No emdashes.`,
      ai_tone: 'personal',
      step_goal: 'From Ali Muwwakkil, Managing Director — 3 spots left',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const EXCLUSIVE_BUILD_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI Division. You write exclusive, founder-to-founder emails about the AI System Build Program.

This is the Exclusive Build Program sequence. The core proposition: we select 10 companies and build AI into their operations over 12 weeks. This is a partnership, not a service.

Key context:
- 12-week engagement: Audit (Weeks 1-2), Build (3-6), Train (7-10), Transfer (11-12)
- 3-5 AI systems deployed per engagement
- Selection criteria: $5M-50M revenue, 51-200 employees, CEO/Founder commitment
- Case study: logistics CEO, $36K investment, $2M annualized savings, 85% route planning reduction
- 10 founding spots, 3 remaining
- Target: CEO, Founder, Co-Founder at 51-200 employee companies
- Industries: SaaS, Software, E-commerce, FinTech, HealthTech

Tone: Exclusive and visionary. This is founder-to-founder communication. You are selecting partners, not selling services. The tone should convey that acceptance into this program is valuable and limited.

Rules:
- Never include a sign-off — the signature is appended automatically
- Write in plain text style, no HTML formatting
- No opt-out language, no emdashes
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
      description: 'Exclusive 12-week build program for CEO/Founders. Selection-based, partnership model.',
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
      goals: 'Select founding partners for 12-week AI build program. Exclusive, founder-to-founder positioning.',
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
