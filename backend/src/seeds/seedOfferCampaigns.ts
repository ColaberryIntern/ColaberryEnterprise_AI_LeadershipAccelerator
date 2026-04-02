import { FollowUpSequence, Campaign, AdminUser } from '../models';

// ─── Campaign 1: AI Advisory Pipeline ──────────────────────────────────────────

const ADVISORY_PIPELINE_SEQUENCE = {
  name: 'AI Advisory Pipeline',
  description: '4-step email sequence for advisory service leads. Discovery, scoping, proposal, and soft close.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'Understanding Your AI Strategy Needs',
      body_template: '',
      ai_instructions: `Write a discovery email to understand the lead's AI challenges. Reference their specific industry and role. Ask about their current AI maturity, biggest pain points, and what success looks like for their organization. Mention that Colaberry works across 8 industries (Technology, Finance, Healthcare, Manufacturing, Energy, Retail, Government, Logistics) and has helped leaders like them navigate AI strategy. Keep it conversational and consultative. 3-4 paragraphs. Soft CTA: 'I would love to understand where your team is on the AI journey - what are the biggest challenges you are facing right now?'

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. No "Best," no "Looking forward," no "Warm regards." The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold, no fancy links. Just a normal email.
- No opt-out language. No emdashes.

Suggest they try the AI Workforce Designer before the call to help clarify their needs: https://advisor.colaberry.ai/advisory/`,
      ai_tone: 'consultative',
      step_goal: 'Discover AI challenges and build initial rapport',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'Scoping Your AI Advisory Engagement',
      body_template: '',
      ai_instructions: `Follow up on the discovery email with specific advisory services that match the lead's likely needs based on their role and industry. Present Colaberry's advisory offerings: (1) AI Roadmap Workshops - 2-day intensive sessions, (2) Enterprise AI Architecture Design - 4-8 weeks working alongside their team, (3) AI Agent Implementation Projects - 8-16 weeks end-to-end, (4) AI Governance Advisory - 3-6 weeks for regulated industries, (5) AI Talent Deployment - embedded practitioners. Reference their industry-specific challenges. Explain the capability transfer model: 'We work alongside your team, not for you - we transfer capability, not just deliverables.' Link to https://enterprise.colaberry.ai/advisory. Keep it 3-4 paragraphs.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'consultative',
      step_goal: 'Present specific advisory services matching their needs',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: 'Your AI Advisory Proposal',
      body_template: '',
      ai_instructions: `Outline a recommended advisory engagement for the lead. Based on their role and company context, recommend a specific starting point (e.g., AI Roadmap Workshop for early-stage teams, Architecture Design for teams with existing AI, Governance Advisory for regulated industries). Include a rough timeline and expected outcomes. Reference specific outcomes: 'Leaders who complete our Roadmap Workshop walk away with a board-ready 90-Day AI Execution Plan and clear architecture decisions.' Mention that engagements are customized to their organization. Soft CTA: 'I have put together a rough outline of how this could work for {{company}} - happy to walk through it on a call.' Link to https://enterprise.colaberry.ai/ai-architect with booking.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'professional',
      step_goal: 'Present recommended engagement with timeline and outcomes',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 10,
      channel: 'email' as const,
      subject: 'Next Steps for Your AI Journey',
      body_template: '',
      ai_instructions: `Soft close email. Reference the previous emails and the value of getting started. Frame it as: the longer organizations wait on AI strategy, the further behind they fall. But keep it warm, not pushy. Offer a 30-minute strategy call to discuss their specific situation. Mention that Ali Muwwakkil, Managing Director, is available to personally walk through the options. Include booking link: https://enterprise.colaberry.ai/ai-architect. Keep it short - 2-3 paragraphs max.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'warm',
      step_goal: 'Soft close with strategy call CTA',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const ADVISORY_PIPELINE_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI Division. You write personalized, consultative emails that feel like genuine 1:1 conversations from a senior AI strategy leader.

This is the AI Advisory Pipeline sequence. The lead has been identified as a potential advisory services client based on their company size, maturity level, and needs.

Key context:
- Colaberry Advisory Services: Roadmap Workshops, Architecture Design, AI Agent Implementation, Governance Advisory, Talent Deployment
- Capability transfer model: we work alongside teams, not for them
- Industries: Technology, Finance, Healthcare, Manufacturing, Energy, Retail, Government, Logistics
- Engagements range from 2-day workshops to 16-week implementation projects
- Booking link: https://enterprise.colaberry.ai/ai-architect

Tone: Senior executive peer. Consultative, not salesy. You are helping them think through their AI strategy, not pitching services. Every email should provide genuine strategic value even if they never engage.

Rules:
- Never include a sign-off - the signature is appended automatically
- Write in plain text style, no HTML formatting
- No opt-out language, no emdashes
- Always reference the lead's specific context from the composite context

The AI Workforce Designer (https://advisor.colaberry.ai/advisory/) is a free 5-minute tool for designing an AI organization. Reference it as appropriate.`;

// ─── Campaign 2: Custom AI Build Pipeline ──────────────────────────────────────

const CUSTOM_BUILD_PIPELINE_SEQUENCE = {
  name: 'Custom AI Build Pipeline',
  description: '5-step email sequence for custom AI build leads. Technical discovery, architecture, timeline, investment, and close.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'Your AI Implementation Vision',
      body_template: '',
      ai_instructions: `Write a technical discovery email referencing the lead's specific AI idea or problem (from their idea_input if available). Ask about their current technical infrastructure, team capabilities, and what they envision building. Reference that Colaberry has delivered AI agent implementations across industries. Frame this as understanding their vision so we can architect the right solution. Mention the 3-Agent Model (Enterprise Leader + Claude Code + Custom LLM) as our implementation framework. Keep it 3-4 paragraphs. CTA: 'Tell me more about what you are envisioning - I want to make sure we architect this right for {{company}}.'

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.

Mention the AI Workforce Designer as a way to kick off technical discovery: https://advisor.colaberry.ai/advisory/`,
      ai_tone: 'consultative',
      step_goal: 'Technical discovery referencing their specific AI idea',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'Architecture Approach for {{company}}',
      body_template: '',
      ai_instructions: `Describe how Colaberry would architect an AI solution for their company. Reference the 3-Agent Model: (1) The Enterprise Leader sets strategy and makes decisions, (2) Claude Code handles execution and code generation, (3) Their Custom LLM (ChatGPT, Claude, Gemini, or company-approved model) provides domain-specific intelligence. Explain that data stays in their environment (Bring Your Own LLM). Mention architecture patterns: agent orchestration, deterministic execution, governance frameworks. Reference their industry for compliance considerations. Link to https://enterprise.colaberry.ai/advisory. Keep it 3-4 paragraphs.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'professional',
      step_goal: 'Present architecture approach using 3-Agent Model',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: 'Implementation Timeline and Scope',
      body_template: '',
      ai_instructions: `Outline a typical 8-16 week AI implementation engagement. Phase 1 (Weeks 1-2): Discovery and architecture design. Phase 2 (Weeks 3-6): Core agent development and integration. Phase 3 (Weeks 7-10): Testing, governance, and hardening. Phase 4 (Weeks 11-16): Deployment, capability transfer, and team training. Emphasize the capability transfer model - by the end, their team owns and maintains the system. Reference that this is not a black-box vendor relationship. Mention that timeline varies based on complexity. CTA: 'I can put together a specific timeline for what you described - want to walk through it?'

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'professional',
      step_goal: 'Present 8-16 week engagement timeline with capability transfer',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 10,
      channel: 'email' as const,
      subject: 'Investment and ROI',
      body_template: '',
      ai_instructions: `Talk about the ROI of custom AI builds. Reference their estimated ROI if available. Use concrete numbers: teams typically see 40-70% time savings on automated workflows, $200K-$500K annual savings from process automation, and payback periods of 3-6 months. Frame the investment as: the cost of NOT building is higher than the cost of building. Mention that Colaberry provides ROI modeling as part of the scoping process. Reference the Executive ROI Calculator: https://enterprise.colaberry.ai/executive-roi-calculator. Keep it 3 paragraphs. Be direct about value but not about specific pricing in email.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'professional',
      step_goal: 'Present ROI case using their estimated ROI data',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 14,
      channel: 'email' as const,
      subject: 'Ready to Build?',
      body_template: '',
      ai_instructions: `Direct close email. Reference the previous conversations about their AI vision, architecture, and ROI. Frame it as: the technical approach is clear, the ROI is proven, and the next step is a strategy call to finalize scope. Offer a 30-minute call with Ali to discuss specifics. Include booking link: https://enterprise.colaberry.ai/ai-architect. Keep it short and direct - 2-3 paragraphs. This is the final push in the sequence.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'direct',
      step_goal: 'Direct close with strategy call CTA',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const CUSTOM_BUILD_PIPELINE_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI Division. You write personalized, technically informed emails about custom AI implementations.

This is the Custom AI Build Pipeline sequence. The lead has been identified as needing a custom AI implementation based on their maturity score, specific use case (idea_input), and company size.

Key context:
- Custom AI builds: 8-16 week engagements
- 3-Agent Model: Enterprise Leader + Claude Code + Custom LLM
- Capability transfer: team owns the system at the end
- Bring Your Own LLM: data stays in their environment
- Industries: Technology, Finance, Healthcare, Manufacturing, Energy, Retail, Government, Logistics
- Booking link: https://enterprise.colaberry.ai/ai-architect

Tone: Technical peer. You understand their architecture challenges and can speak to implementation details. Not salesy - you are a builder helping another builder.

Rules:
- Never include a sign-off - the signature is appended automatically
- Write in plain text style, no HTML formatting
- No opt-out language, no emdashes
- Always reference the lead's specific context from the composite context

The AI Workforce Designer (https://advisor.colaberry.ai/advisory/) is a free 5-minute tool for designing an AI organization. Reference it as appropriate.`;

// ─── Campaign 3: Enterprise Deal Pipeline ──────────────────────────────────────

const ENTERPRISE_PIPELINE_SEQUENCE = {
  name: 'Enterprise Deal Pipeline',
  description: '6-step email sequence for enterprise-scale AI transformation leads. Strategic alignment through executive close.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'Enterprise AI Transformation at {{company}}',
      body_template: '',
      ai_instructions: `Write a high-level strategic alignment email for an enterprise lead. Reference their company specifically and their industry. Frame AI transformation as a multi-department strategic initiative, not a point solution. Mention that Colaberry works with organizations of their scale to deploy AI across functions: operations, finance, HR, customer service, supply chain. Reference the full pathway: assessment, roadmap, architecture, implementation, governance, talent. Keep it executive-level - big picture, strategic outcomes. 3-4 paragraphs. CTA: 'I would like to understand where {{company}} is on the AI transformation journey and where we might be able to accelerate it.'

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.

Suggest the AI Workforce Designer as a starting point for multi-department AI assessment: https://advisor.colaberry.ai/advisory/`,
      ai_tone: 'executive',
      step_goal: 'High-level strategic alignment with enterprise lead',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 3,
      channel: 'email' as const,
      subject: 'Technical Assessment Framework',
      body_template: '',
      ai_instructions: `Present the multi-department AI assessment approach. Explain that enterprise AI transformation starts with understanding current state across departments. Colaberry's assessment framework evaluates: (1) Data infrastructure readiness, (2) Process automation opportunities, (3) Team AI literacy and capability gaps, (4) Governance and compliance requirements, (5) Integration architecture. Reference that this is a structured 2-4 week assessment that produces a prioritized roadmap with quick wins and strategic initiatives. Mention that the assessment pays for itself by preventing costly misdirected AI investments. Link to https://enterprise.colaberry.ai/advisory.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'professional',
      step_goal: 'Present multi-department assessment approach',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 7,
      channel: 'email' as const,
      subject: 'Business Case: AI ROI Across {{company}}',
      body_template: '',
      ai_instructions: `Build the enterprise ROI case using available data. Reference their estimated ROI if available, departments impacted, and company size. Use enterprise-scale numbers: organizations with 1,000+ employees typically see $1M-$5M annual savings from AI automation across 3+ departments. Break it down: customer service (40% call deflection), operations (60% process automation), finance (70% reporting automation). Reference that enterprise AI programs have 18-24 month payback periods with compounding returns. Link to ROI calculator: https://enterprise.colaberry.ai/executive-roi-calculator. Frame as 'here is how enterprise leaders build the internal business case.'

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'professional',
      step_goal: 'Build enterprise ROI case using their data',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 14,
      channel: 'email' as const,
      subject: 'Enterprise AI Proposal',
      body_template: '',
      ai_instructions: `Outline a full enterprise AI proposal. Structure: Phase 1 - Multi-department assessment (2-4 weeks). Phase 2 - Priority department pilot (8-12 weeks). Phase 3 - Cross-department expansion (12-24 weeks). Phase 4 - Enterprise AI Center of Excellence (ongoing). Reference the capability transfer model - Colaberry builds the internal AI capability, not just the systems. Mention governance framework for regulated industries. This is the substantive proposal email - be thorough but not overwhelming. CTA: 'I have outlined what a phased approach could look like for {{company}} - let us walk through the details on a call.'

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'executive',
      step_goal: 'Present full enterprise proposal outline',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 21,
      channel: 'email' as const,
      subject: 'Accelerating Your Decision',
      body_template: '',
      ai_instructions: `Create competitive urgency without being pushy. Reference that industry peers are moving fast on AI: 'Organizations in {{industry}} that deploy enterprise AI in 2026 will have 18-24 months of compounding advantage over those that wait.' Mention specific industry movements - every major consulting firm now has an AI practice, competitors are deploying AI agents for customer service and operations. Frame Colaberry as the partner that accelerates their timeline. Reference case studies: enterprises that went from assessment to production AI in 16 weeks. Keep it strategic, not desperate. 3 paragraphs.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'executive',
      step_goal: 'Create competitive urgency through industry peer movement',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 28,
      channel: 'email' as const,
      subject: 'Executive Alignment Call',
      body_template: '',
      ai_instructions: `Final personal email from Ali. Keep it short and direct - 3-4 sentences max. Reference the previous emails and the value proposition. Offer a direct executive alignment call: 'I have been thinking about how this maps to {{company}} and I would like to share some specific ideas. Can we get 30 minutes on the calendar?' Include booking link: https://enterprise.colaberry.ai/ai-architect. This is Ali's personal push as Managing Director - make it feel personal and exclusive.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'personal',
      step_goal: 'Final personal push from Ali for executive alignment call',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const ENTERPRISE_PIPELINE_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI Division. You write strategic, executive-level emails for enterprise AI transformation engagements.

This is the Enterprise Deal Pipeline sequence. The lead has been identified as an enterprise-scale opportunity based on company size (1,000+ employees), estimated ROI ($500K+), and multi-department impact.

Key context:
- Enterprise AI transformation: multi-department, phased approach
- Assessment framework: data, process, people, governance, integration
- Capability transfer model: build internal AI capability
- Enterprise engagements: assessment (2-4 weeks) through Center of Excellence (ongoing)
- Governance frameworks for regulated industries
- Booking link: https://enterprise.colaberry.ai/ai-architect

Tone: C-suite peer. Strategic, authoritative, measured. You are a Managing Director speaking to another executive about enterprise transformation. Never salesy. Every email should demonstrate deep understanding of enterprise AI challenges.

Rules:
- Never include a sign-off - the signature is appended automatically
- Write in plain text style, no HTML formatting
- No opt-out language, no emdashes
- Always reference the lead's specific context from the composite context

The AI Workforce Designer (https://advisor.colaberry.ai/advisory/) is a free 5-minute tool for designing an AI organization. Reference it as appropriate.`;

// ─── Campaign 4: AI Workforce Designer Entry ───────────────────────────────────

const WORKFORCE_DESIGNER_ENTRY_SEQUENCE = {
  name: 'AI Workforce Designer Entry',
  description: '3-step sequence for leads entering from the AI Workforce Designer advisory tool. Welcome, recommended path, and strategy call.',
  is_active: true,
  steps: [
    {
      delay_days: 0,
      channel: 'email' as const,
      subject: 'Welcome - Your AI Assessment Results',
      body_template: '',
      ai_instructions: `Write a welcome email referencing the lead's AI Workforce Designer assessment results. Mention their maturity score if available and what it means for their organization. Reference key findings from their advisory session: areas of strength, gaps identified, and recommended next steps. Frame this as: 'Based on your assessment, here is where {{company}} stands and what the path forward looks like.' Keep it warm and informative - they just completed an assessment and want to understand their results. 3-4 paragraphs. No hard sell - just value delivery.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'warm',
      step_goal: 'Welcome and reference their advisory assessment results',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 2,
      channel: 'email' as const,
      subject: 'Your Recommended AI Path',
      body_template: '',
      ai_instructions: `Based on their classification (recommended_offer field), present the right next step. If classified as 'accelerator': present the 5-session Accelerator program. If 'advisory': present advisory services. If 'custom_build': present custom AI implementation. If 'enterprise_deal': present enterprise transformation. Reference their specific maturity score and how it informed the recommendation. Include relevant links based on classification: Accelerator -> https://enterprise.colaberry.ai/program, Advisory -> https://enterprise.colaberry.ai/advisory, All -> https://enterprise.colaberry.ai/pricing. Keep it 3-4 paragraphs. Frame as personalized recommendation, not generic marketing.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'consultative',
      step_goal: 'Present recommended path based on their classification',
      max_attempts: 1,
      fallback_channel: null,
    },
    {
      delay_days: 5,
      channel: 'email' as const,
      subject: 'Let Us Discuss Your Next Steps',
      body_template: '',
      ai_instructions: `Strategy call CTA email. Reference their assessment results and recommended path. Offer a 30-minute strategy call to discuss how to move forward. Mention that Ali Muwwakkil, Managing Director, will personally walk through the options and help them decide the right engagement. Include booking link: https://enterprise.colaberry.ai/ai-architect. Keep it short - 2-3 paragraphs. Warm and inviting, not pushy.

CRITICAL FORMATTING RULES:
- Do NOT include ANY sign-off. The signature block is appended automatically.
- Write in plain text style. No HTML formatting, no bold. Just a normal email.
- No opt-out language. No emdashes.`,
      ai_tone: 'warm',
      step_goal: 'Strategy call CTA with booking link',
      max_attempts: 1,
      fallback_channel: null,
    },
  ],
};

const WORKFORCE_DESIGNER_ENTRY_SYSTEM_PROMPT = `You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI Division. You write personalized follow-up emails for leads who completed the AI Workforce Designer assessment.

This is the Workforce Designer Entry sequence. The lead completed an AI advisory assessment through the Agent Foundry platform and has been routed to the appropriate offer based on their results.

Key context:
- AI Workforce Designer: assessment tool that evaluates AI maturity and recommends next steps
- Maturity score: 0-100 scale measuring organizational AI readiness
- Offer classifications: accelerator (training), advisory (strategy), custom_build (implementation), enterprise_deal (transformation)
- Accelerator: $4,500, 5 sessions over 3 weeks
- Advisory: 2-day to 6-week engagements
- Custom builds: 8-16 week implementations
- Enterprise: multi-department transformation programs
- Booking link: https://enterprise.colaberry.ai/ai-architect

Tone: Warm, knowledgeable guide. The lead just completed an assessment and wants to understand their results and options. Be helpful and informative, not salesy.

Rules:
- Never include a sign-off - the signature is appended automatically
- Write in plain text style, no HTML formatting
- No opt-out language, no emdashes
- Always reference the lead's specific context from the composite context`;

// ─── Seed Function ────────────────────────────────────────────────────────────

export async function seedOfferCampaigns(): Promise<void> {
  const admin = await AdminUser.findOne();
  const createdBy = admin?.id || null;

  // ── Campaign 1: Advisory Pipeline ───────────────────────────────────
  await seedCampaignWithSequence({
    sequence: ADVISORY_PIPELINE_SEQUENCE,
    systemPrompt: ADVISORY_PIPELINE_SYSTEM_PROMPT,
    campaignName: 'AI Advisory Pipeline',
    campaignType: 'advisory_pipeline',
    campaignDescription: 'Pipeline campaign for advisory service leads. 4-step email sequence: discovery, scoping, proposal, and soft close.',
    goals: 'Convert qualified advisory leads into booked strategy calls. Educate on advisory service options and present tailored engagement recommendations.',
    createdBy,
    settings: {
      sender_email: 'ali@colaberry.com',
      sender_name: 'Ali Muwwakkil',
      agent_name: 'Ali Muwwakkil',
      test_mode_enabled: false,
      delay_between_sends: 120,
      max_leads_per_cycle: 25,
      send_time_start: '09:00',
      send_time_end: '17:00',
      send_active_days: [1, 2, 3, 4, 5],
    },
  });

  // ── Campaign 2: Custom Build Pipeline ───────────────────────────────
  await seedCampaignWithSequence({
    sequence: CUSTOM_BUILD_PIPELINE_SEQUENCE,
    systemPrompt: CUSTOM_BUILD_PIPELINE_SYSTEM_PROMPT,
    campaignName: 'Custom AI Build Pipeline',
    campaignType: 'custom_build_pipeline',
    campaignDescription: 'Pipeline campaign for custom AI build leads. 5-step email sequence: technical discovery, architecture, timeline, investment, and close.',
    goals: 'Convert qualified custom build leads into booked strategy calls. Present technical approach, timeline, and ROI case for custom AI implementations.',
    createdBy,
    settings: {
      sender_email: 'ali@colaberry.com',
      sender_name: 'Ali Muwwakkil',
      agent_name: 'Ali Muwwakkil',
      test_mode_enabled: false,
      delay_between_sends: 120,
      max_leads_per_cycle: 20,
      send_time_start: '09:00',
      send_time_end: '17:00',
      send_active_days: [1, 2, 3, 4, 5],
    },
  });

  // ── Campaign 3: Enterprise Pipeline ─────────────────────────────────
  await seedCampaignWithSequence({
    sequence: ENTERPRISE_PIPELINE_SEQUENCE,
    systemPrompt: ENTERPRISE_PIPELINE_SYSTEM_PROMPT,
    campaignName: 'Enterprise Deal Pipeline',
    campaignType: 'enterprise_pipeline',
    campaignDescription: 'Pipeline campaign for enterprise-scale AI transformation leads. 6-step email sequence: strategic alignment, assessment, business case, proposal, urgency, and executive close.',
    goals: 'Convert enterprise leads into executive alignment calls. Build strategic business case for multi-department AI transformation engagements.',
    createdBy,
    settings: {
      sender_email: 'ali@colaberry.com',
      sender_name: 'Ali Muwwakkil',
      agent_name: 'Ali Muwwakkil',
      test_mode_enabled: false,
      delay_between_sends: 120,
      max_leads_per_cycle: 10,
      send_time_start: '09:00',
      send_time_end: '17:00',
      send_active_days: [1, 2, 3, 4, 5],
    },
  });

  // ── Campaign 4: Workforce Designer Entry ────────────────────────────
  await seedCampaignWithSequence({
    sequence: WORKFORCE_DESIGNER_ENTRY_SEQUENCE,
    systemPrompt: WORKFORCE_DESIGNER_ENTRY_SYSTEM_PROMPT,
    campaignName: 'AI Workforce Designer Entry',
    campaignType: 'workforce_designer_entry',
    campaignDescription: 'Entry campaign for leads from the AI Workforce Designer advisory tool. 3-step sequence: welcome with assessment results, recommended path, and strategy call CTA.',
    goals: 'Welcome advisory assessment completions and route them to the appropriate offer pipeline. Drive strategy call bookings based on their classification.',
    createdBy,
    settings: {
      sender_email: 'ali@colaberry.com',
      sender_name: 'Ali Muwwakkil',
      agent_name: 'Ali Muwwakkil',
      test_mode_enabled: false,
      delay_between_sends: 120,
      max_leads_per_cycle: 50,
      send_time_start: '09:00',
      send_time_end: '17:00',
      send_active_days: [1, 2, 3, 4, 5],
    },
  });

  console.log('[Seed] Offer pipeline campaigns seeded.');
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function seedCampaignWithSequence(opts: {
  sequence: { name: string; description: string; is_active: boolean; steps: any[] };
  systemPrompt: string;
  campaignName: string;
  campaignType: string;
  campaignDescription: string;
  goals: string;
  createdBy: string | null;
  settings: Record<string, any>;
}): Promise<void> {
  // Upsert sequence
  let sequence = await FollowUpSequence.findOne({
    where: { name: opts.sequence.name },
  });

  if (sequence) {
    await sequence.update({
      steps: opts.sequence.steps,
      description: opts.sequence.description,
      is_active: true,
    });
    console.log(`[Seed] ${opts.sequence.name} sequence exists. Updated steps.`);
  } else {
    sequence = await FollowUpSequence.create(opts.sequence as any);
    console.log(`[Seed] Created ${opts.sequence.name} sequence. ID: ${sequence.id}`);
  }

  // Upsert campaign
  let campaign = await Campaign.findOne({
    where: { type: opts.campaignType },
  });

  if (!campaign) {
    campaign = await Campaign.create({
      name: opts.campaignName,
      description: opts.campaignDescription,
      type: opts.campaignType,
      status: 'active',
      sequence_id: sequence.id,
      ai_system_prompt: opts.systemPrompt,
      channel_config: {
        email: { enabled: true, daily_limit: 50 },
        voice: { enabled: false },
        sms: { enabled: false },
      },
      settings: opts.settings,
      goals: opts.goals,
      created_by: opts.createdBy,
    } as any);
    console.log(`[Seed] Created ${opts.campaignName} campaign. ID: ${campaign.id}`);
  } else {
    await campaign.update({
      sequence_id: sequence.id,
      ai_system_prompt: opts.systemPrompt,
    } as any);
    console.log(`[Seed] ${opts.campaignName} campaign exists. Synced sequence.`);
  }

  console.log(`[Seed] ${opts.sequence.name} steps:`);
  opts.sequence.steps.forEach((s: any, i: number) => {
    console.log(`  ${i + 1}. Day ${s.delay_days} [${s.channel}] ${s.step_goal}`);
  });
}
