import AdmissionsKnowledgeEntry from '../models/AdmissionsKnowledgeEntry';

interface SeedEntry {
  category: string;
  title: string;
  content: string;
  keywords: string[];
  priority: number;
}

const SEED_ENTRIES: SeedEntry[] = [
  // Program Core
  {
    category: 'program',
    title: 'Program Overview',
    content: 'The Enterprise AI Leadership Accelerator is a 5-session, 3-week intensive program where Directors and Technical Leaders build a working AI proof of capability for their organization. This is not a lecture series — participants leave with a production-architecture AI solution, an executive presentation deck, and a 90-day expansion roadmap. The program uses a hands-on "3-Agent Model": the enterprise leader (you), Claude Code as the execution engine, and your organization\'s approved LLM (ChatGPT, Claude, Gemini, or company-approved).',
    keywords: ['program', 'overview', 'accelerator', 'what is', 'about'],
    priority: 10,
  },
  {
    category: 'program',
    title: 'Program Format',
    content: 'The program consists of 5 live virtual sessions over 3 weeks (Tuesdays and Thursdays). Each session is 2 hours. Between sessions, participants complete 2-4 hours of applied work building their actual AI initiative. The format is cohort-based with live instruction, hands-on exercises, and peer collaboration. Sessions are held on a consistent schedule: Week 1 (Tue/Thu), Week 2 (Tue/Thu), Week 3 (Thu — final presentations).',
    keywords: ['format', 'structure', 'delivery', 'how', 'cohort', 'sessions', 'schedule', 'virtual', 'live'],
    priority: 9,
  },
  {
    category: 'program',
    title: 'Program Duration',
    content: 'The program runs for 3 weeks with 5 sessions total. Sessions are held on Tuesdays and Thursdays, each lasting 2 hours. Total program time is approximately 10 hours of live sessions plus 2-4 hours of applied work between each session.',
    keywords: ['duration', 'length', 'weeks', 'how long', 'time', 'sessions', 'hours'],
    priority: 9,
  },
  {
    category: 'program',
    title: 'Who Is This For',
    content: 'The program is designed for: Directors and VPs of Engineering, Technology, or Data; Chief Technology Officers and Chief Data Officers; Senior Technical Architects responsible for AI adoption; Technical leaders at organizations with $50M+ in revenue; Leaders whose teams are being asked to deliver AI outcomes now. This is for builders and decision-makers, not observers.',
    keywords: ['who', 'audience', 'executives', 'target', 'qualifications', 'prerequisites', 'directors', 'vp', 'cto'],
    priority: 9,
  },
  {
    category: 'program',
    title: 'Next Cohort',
    content: 'The next cohort starts March 31, 2026. Sessions run on Tuesdays and Thursdays over 3 weeks. Cohort sizes are kept small to ensure hands-on attention. Visit the enrollment page or ask Maya to help you secure your spot.',
    keywords: ['start', 'date', 'when', 'next', 'cohort', 'begin', 'march'],
    priority: 10,
  },

  // Curriculum / Sessions
  {
    category: 'curriculum',
    title: 'Week 1 — Strategic Alignment & Architecture',
    content: 'Week 1 covers the Define & Architect phase. Session 1 (Tuesday): Set up the 3-Agent Model, identify your highest-priority AI use case, and establish your AI architecture foundation. Session 2 (Thursday): Deep-dive into enterprise AI architecture patterns, governance frameworks, and risk assessment. By end of Week 1, you have a scoped use case and architectural blueprint.',
    keywords: ['week 1', 'strategy', 'architecture', 'session 1', 'session 2', 'define', 'use case'],
    priority: 8,
  },
  {
    category: 'curriculum',
    title: 'Week 2 — Guided Build & Executive Positioning',
    content: 'Week 2 covers the Build & Position phase. Session 3 (Tuesday): Build your working AI proof of capability with guided hands-on development using Claude Code and your chosen LLM. Session 4 (Thursday): Craft your executive presentation deck — board and C-suite ready for internal buy-in and budget approval. By end of Week 2, you have a working system and a polished executive pitch.',
    keywords: ['week 2', 'build', 'system', 'session 3', 'session 4', 'executive', 'presentation'],
    priority: 8,
  },
  {
    category: 'curriculum',
    title: 'Week 3 — Executive Readiness & Expansion',
    content: 'Week 3 is the Operationalize & Present phase. Session 5 (Thursday): Final presentations to the cohort and advisors. Each participant presents their AI proof of capability, executive deck, and 90-day expansion roadmap. You receive peer feedback and advisory input to refine your approach before presenting internally.',
    keywords: ['week 3', 'presentation', 'session 5', 'final', 'roadmap', 'operationalize'],
    priority: 8,
  },
  {
    category: 'curriculum',
    title: 'The 3-Agent Model',
    content: 'The program uses a unique "3-Agent Model" for AI development: (1) The Enterprise Leader — that\'s you, providing strategic direction and domain expertise; (2) Claude Code — the AI execution engine that writes production-quality code; (3) Your Custom LLM — ChatGPT, Claude, Gemini, or your company-approved model for reasoning and content. Participants bring their own LLM credentials. No company data is shared with Colaberry.',
    keywords: ['3-agent', 'model', 'claude code', 'llm', 'chatgpt', 'tools', 'methodology'],
    priority: 8,
  },

  // Outcomes
  {
    category: 'outcomes',
    title: 'What You Leave With',
    content: 'By the end of the program, every participant leaves with 6 concrete deliverables: (1) A working AI Proof of Capability — production-architecture quality, scoped to your highest-priority use case; (2) An Executive AI Presentation Deck — board and C-suite ready for internal buy-in and budget approval; (3) A 90-Day AI Expansion Roadmap — prioritized, resourced, and governed for immediate execution; (4) Enterprise AI Architecture Templates — reusable patterns, governance frameworks, and risk assessment tools; (5) Governance & Risk Alignment — frameworks aligned to your regulatory environment and compliance posture; (6) Advisory Ecosystem Access — ongoing access to Colaberry\'s Enterprise AI Advisory Labs and peer network.',
    keywords: ['outcomes', 'results', 'deliverables', 'what will i get', 'leave with', 'proof of capability'],
    priority: 9,
  },

  // Pricing
  {
    category: 'pricing',
    title: 'Program Investment',
    content: 'The Enterprise AI Leadership Accelerator is $4,500 per participant. This includes all 5 live sessions, hands-on exercises, mentored project work, enterprise AI architecture templates, governance frameworks, and ongoing access to the Advisory Labs peer network.',
    keywords: ['price', 'cost', 'individual', 'enrollment', 'how much', 'investment', '$4500', '4500'],
    priority: 10,
  },
  {
    category: 'pricing',
    title: 'ROI and Value',
    content: 'The program pays for itself through reduced consulting spend, faster AI deployment, and avoided missteps. Participants leave with a production-ready AI proof of capability — most organizations spend $50K-$200K to get a comparable deliverable from external firms. The 90-day expansion roadmap alone saves months of strategic planning time.',
    keywords: ['roi', 'value', 'return', 'worth', 'investment', 'benefit', 'consulting'],
    priority: 9,
  },
  {
    category: 'pricing',
    title: 'Payment Options',
    content: 'We offer flexible payment options including full payment, installment plans, and corporate invoicing. Corporate sponsorship and group rates are also available for organizations enrolling multiple leaders.',
    keywords: ['payment', 'installment', 'financing', 'pay', 'options'],
    priority: 7,
  },

  // Enterprise / Sponsorship
  {
    category: 'enterprise',
    title: 'Corporate Sponsorship',
    content: 'Organizations can sponsor leaders for the program with group rates, dedicated support, and coordinated project focus. Corporate sponsors receive progress reports and ROI tracking. This is ideal for organizations looking to build internal AI capability across multiple departments.',
    keywords: ['corporate', 'sponsor', 'sponsorship', 'company', 'organization'],
    priority: 8,
  },
  {
    category: 'enterprise',
    title: 'Group Enrollment',
    content: 'Special pricing is available for organizations enrolling multiple participants. Group enrollment includes team alignment sessions and coordinated project work so your AI initiatives are strategically aligned.',
    keywords: ['group', 'team', 'rates', 'discount', 'multiple', 'bulk'],
    priority: 8,
  },

  // FAQ
  {
    category: 'faq',
    title: 'Technical Requirements',
    content: 'Participants should be technical leaders comfortable with technology concepts, though no coding is required — Claude Code handles the execution. You will need a computer with internet access for live sessions, and access to at least one enterprise LLM (ChatGPT, Claude, Gemini, etc.). Participants bring their own LLM credentials; no company data is shared with Colaberry.',
    keywords: ['technical', 'requirements', 'coding', 'skills', 'need', 'prerequisite'],
    priority: 8,
  },
  {
    category: 'faq',
    title: 'Time Commitment',
    content: 'The total time commitment is approximately 20-30 hours over 3 weeks: 10 hours of live sessions (5 sessions x 2 hours) plus 2-4 hours of applied work between each session building your AI proof of capability.',
    keywords: ['time', 'commitment', 'hours', 'week', 'schedule', 'busy'],
    priority: 8,
  },
  {
    category: 'faq',
    title: 'Certificate',
    content: 'Participants who complete the program and present their AI proof of capability receive a certificate of completion from the Colaberry Enterprise AI Leadership Accelerator.',
    keywords: ['certificate', 'credential', 'completion', 'certification'],
    priority: 6,
  },

  // Logistics
  {
    category: 'logistics',
    title: 'Strategy Call',
    content: 'A strategy call is a 30-minute consultation to discuss your AI goals, assess fit for the program, and answer your questions. It is the best way to determine if the Accelerator is right for your situation. Book online through our calendar or ask Maya to schedule one.',
    keywords: ['strategy call', 'consultation', 'meeting', 'book', 'schedule', 'talk'],
    priority: 9,
  },
  {
    category: 'logistics',
    title: 'Enrollment Process',
    content: 'To enroll: (1) Book a strategy call or submit an interest form to discuss your goals, (2) Receive the executive briefing with full program details, (3) Complete enrollment and payment, (4) Start with your cohort on day one. The next cohort begins March 31.',
    keywords: ['enroll', 'enrollment', 'process', 'steps', 'how to join', 'sign up', 'register'],
    priority: 9,
  },
  {
    category: 'logistics',
    title: 'Contact Information',
    content: 'You can reach us through the chat widget (I\'m Maya!), by booking a strategy call, or through the contact page on our website at enterprise.colaberry.ai.',
    keywords: ['contact', 'reach', 'email', 'phone', 'talk'],
    priority: 7,
  },

  // AI Champion Network (only shown on champion/referral pages)
  {
    category: 'champion',
    title: 'AI Champion Network',
    content: 'The AI Champion Network is our alumni and referral program. There are two paths: Path 1 — Enroll yourself in the AI Leadership Accelerator (your company can sponsor you), and earn $250 if your company pays. Path 2 — Refer others (leaders, managers, teams, or departments) and earn $250 per enrolled participant with no cap. Alumni can activate their referral account at enterprise.colaberry.ai/referrals/login. Three referral types are available: Corporate Sponsor (introduce the program to company leadership), Introduced Referral (we reach out mentioning your name), or Anonymous Referral (your name is never mentioned).',
    keywords: ['champion', 'alumni', 'referral', 'refer', 'network', 'commission', 'earn', '$250', 'sponsor'],
    priority: 8,
  },
  {
    category: 'champion',
    title: 'AI Champion Referral Commission',
    content: 'AI Champions earn $250 per enrolled participant — no cap. Examples: 1 enrollment = $250, 4 enrollments = $1,000, 10 enrollments = $2,500, 20 enrollments = $5,000. You earn commission when you enroll and your company pays, or when any leader, manager, team, or department enrolls through your referral.',
    keywords: ['commission', 'earn', 'money', 'referral', 'champion', 'reward', 'incentive', 'payment'],
    priority: 7,
  },
];

/**
 * Seed the admissions knowledge base. Upserts — updates content if title exists.
 */
export async function seedAdmissionsKnowledge(): Promise<void> {
  let created = 0;
  let updated = 0;
  for (const entry of SEED_ENTRIES) {
    const existing = await AdmissionsKnowledgeEntry.findOne({ where: { title: entry.title } });
    if (existing) {
      // Update content if it changed
      if (existing.content !== entry.content || JSON.stringify(existing.keywords) !== JSON.stringify(entry.keywords)) {
        await existing.update({
          content: entry.content,
          keywords: entry.keywords,
          priority: entry.priority,
          category: entry.category as any,
        });
        updated++;
      }
    } else {
      await AdmissionsKnowledgeEntry.create({
        category: entry.category as any,
        title: entry.title,
        content: entry.content,
        keywords: entry.keywords,
        priority: entry.priority,
        active: true,
      });
      created++;
    }
  }
  if (created > 0 || updated > 0) {
    console.log(`[Admissions] Knowledge base: ${created} created, ${updated} updated`);
  }
}
