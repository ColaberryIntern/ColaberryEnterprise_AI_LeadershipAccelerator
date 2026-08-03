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
    content: 'The AI Systems Architect Accelerator is a 12-week online cohort for working professionals who want to move beyond using AI tools and actually design, build, and govern AI systems. Participants build a Business Workflow Assistant, a multi-agent AI team, a working MCP server integrated with a real system, and a complete Solution Architecture Package. Anthropic certifies knowledge; Colaberry certifies capability - participants finish with a deployed AI system, a GitHub portfolio, and Anthropic Architect certification (CCA-F) prep.',
    keywords: ['program', 'overview', 'accelerator', 'what is', 'about'],
    priority: 10,
  },
  {
    category: 'program',
    title: 'Program Format',
    content: 'Two live sessions per week: Monday (Architecture Day) and Thursday (Build Day), 2 hours each, 4 hours per week total. All sessions are recorded and posted within 24 hours, so falling behind on a given week never means falling out of the program. Fully online, CST time zone, with community access via the program portal (enterprise.colaberry.ai) and a WhatsApp group.',
    keywords: ['format', 'structure', 'delivery', 'how', 'cohort', 'sessions', 'schedule', 'virtual', 'live'],
    priority: 9,
  },
  {
    category: 'program',
    title: 'Program Duration',
    content: 'The program runs 12 weeks in four 3-week blocks: Weeks 1-3 (AI Foundation - Claude Code, the Claude API, and core agent skills), Weeks 4-6 (Build Your AI Team - prompt engineering, Model Context Protocol, multi-tool agent design), Weeks 7-9 (Connect AI to the Real World - multi-agent systems, workflow automation, reliability engineering), Weeks 10-12 (Design AI That Scales - governance frameworks, full system architecture, live Expo presentation).',
    keywords: ['duration', 'length', 'weeks', 'how long', 'time', 'sessions', 'hours'],
    priority: 9,
  },
  {
    category: 'program',
    title: 'Who Is This For',
    content: 'The program is built for working professionals who want hands-on experience building real AI agents and understanding AI governance - whether you\'re in tech, operations, product, or leadership. No prior AI experience is required, but you should be comfortable with basic software concepts like git and the command line, and you should arrive with a real business problem or idea you want to solve.',
    keywords: ['who', 'audience', 'right for me', 'target', 'qualifications', 'prerequisites', 'background'],
    priority: 9,
  },
  {
    category: 'program',
    title: 'Next Cohort',
    content: 'The Founding Cohort is the current live cohort - capped at 40 seats. For the exact next Open House and kickoff dates and current seat availability, check enterprise.colaberry.ai or ask Maya to pull the live figures; do not state a specific date from memory, it goes stale quickly.',
    keywords: ['start', 'date', 'when', 'next', 'cohort', 'begin'],
    priority: 10,
  },

  // Curriculum / Sessions
  {
    category: 'curriculum',
    title: 'Weeks 1-3 - AI Foundation',
    content: 'Get hands-on with Claude Code, the Claude API, and core agent skills. By the end of this block you\'ve built your first AI workflow assistant with reusable AI Skills.',
    keywords: ['week 1', 'week 2', 'week 3', 'foundation', 'claude code', 'claude api', 'agent skills'],
    priority: 8,
  },
  {
    category: 'curriculum',
    title: 'Weeks 4-6 - Build Your AI Team',
    content: 'Master prompt engineering, Model Context Protocol (MCP), and advanced multi-tool agent design. By the end of this block you\'ve built a multi-agent AI team with an Enterprise Prompt Library.',
    keywords: ['week 4', 'week 5', 'week 6', 'mcp', 'prompt engineering', 'multi-agent'],
    priority: 8,
  },
  {
    category: 'curriculum',
    title: 'Weeks 7-9 - Connect AI to the Real World',
    content: 'Build multi-agent systems, automate real workflows, and engineer for reliability. By the end of this block you have a working MCP server integrated with a real system.',
    keywords: ['week 7', 'week 8', 'week 9', 'automation', 'reliability', 'mcp server'],
    priority: 8,
  },
  {
    category: 'curriculum',
    title: 'Weeks 10-12 - Design AI That Scales',
    content: 'Apply governance frameworks (NIST AI RMF, ISO 42001, EU AI Act), architect a full AI system, and present at a live Expo. You leave with a complete Solution Architecture Package.',
    keywords: ['week 10', 'week 11', 'week 12', 'governance', 'architecture', 'expo', 'presentation'],
    priority: 8,
  },
  {
    category: 'curriculum',
    title: 'Tools Used',
    content: 'You\'ll use Claude Code, the Claude API, Model Context Protocol (MCP), Docker Desktop, and GitHub throughout the program. Anthropic Architect Certification (CCA-F) exam prep is built into the curriculum.',
    keywords: ['tools', 'claude code', 'claude api', 'mcp', 'docker', 'github', 'software'],
    priority: 8,
  },

  // Outcomes
  {
    category: 'outcomes',
    title: 'What You Leave With',
    content: 'By the end of the program, every participant leaves with a deployed AI system, a GitHub portfolio of real projects, and Anthropic Architect certification (CCA-F) prep. Concretely, you build: a Business Workflow Assistant with reusable AI Skills, a multi-agent AI team with an Enterprise Prompt Library, a working MCP server integrated with a real system, and a complete Solution Architecture Package.',
    keywords: ['outcomes', 'results', 'deliverables', 'what will i get', 'leave with', 'portfolio', 'certification'],
    priority: 9,
  },

  // Pricing
  {
    category: 'pricing',
    title: 'Program Investment',
    content: 'One membership, two ways to pay: $149/month billed annually (the founding rate, locked in for as long as your membership stays active), or $199/month month-to-month with cancel-anytime flexibility. That single price covers all four Architect Intensives, Anthropic certification prep, the internship experience, and guided GitHub portfolio projects - no separate course fees. There is also a small student-paid Anthropic tooling cost (~$20/mo for Claude Code, ~$10/mo for API usage) paid directly to Anthropic, not to Colaberry.',
    keywords: ['price', 'cost', 'individual', 'enrollment', 'how much', 'investment', 'membership', '149', '199'],
    priority: 10,
  },
  {
    category: 'pricing',
    title: 'Seat Deposit',
    content: 'Registering through the Open House reserves your seat with a $50 deposit, credited toward your first membership payment - not paid on top of it. Full program access starts the day your cohort kicks off, and that\'s also when your first membership charge lands, with each following charge landing on that same date each month after. If you end up not attending, the $50 is fully refundable, or it can be applied as a credit toward a future cohort instead.',
    keywords: ['deposit', 'down payment', '$50', 'reserve', 'seat', 'open house', 'when does access start'],
    priority: 10,
  },
  {
    category: 'pricing',
    title: 'ROI and Value',
    content: 'The program pays for itself through the real deliverables you walk away with: a deployed AI system, a GitHub portfolio employers can actually review, and Anthropic Architect certification prep - proof of capability, not just a certificate claim. Scholarships are available for qualifying applicants; ask admissions@colaberry.com.',
    keywords: ['roi', 'value', 'return', 'worth', 'investment', 'benefit', 'scholarship'],
    priority: 9,
  },
  {
    category: 'pricing',
    title: 'Payment Options',
    content: 'Enrollment is a single membership - $149/month billed annually (founding rate) or $199/month month-to-month, no separate course fees or add-ons. A $50 deposit can reserve a seat through the Open House and is credited toward the first payment. Scholarships are available for qualifying applicants.',
    keywords: ['payment', 'options', 'pay', 'financing', 'scholarship'],
    priority: 7,
  },

  // FAQ
  {
    category: 'faq',
    title: 'Technical Requirements',
    content: 'No professional software engineering background is required, but you should be comfortable with basic concepts like git and the command line, and arrive with a real business problem or idea to work on. You\'ll need a laptop with internet access for live sessions, Claude Code (Anthropic subscription), Docker Desktop, and a GitHub account.',
    keywords: ['technical', 'requirements', 'coding', 'skills', 'need', 'prerequisite'],
    priority: 8,
  },
  {
    category: 'faq',
    title: 'Time Commitment',
    content: 'About 4 hours of live sessions per week (Monday Architecture Day + Thursday Build Day, 2 hours each) across 12 weeks, plus applied project work between sessions. All sessions are recorded, so a missed week never means falling out of the program.',
    keywords: ['time', 'commitment', 'hours', 'week', 'schedule', 'busy'],
    priority: 8,
  },
  {
    category: 'faq',
    title: 'Certificate',
    content: 'Participants who complete the program earn Anthropic Architect certification (CCA-F) prep and exam readiness, plus a GitHub portfolio of deployed projects as proof of capability. Anthropic certifies the knowledge; Colaberry certifies the capability.',
    keywords: ['certificate', 'credential', 'completion', 'certification', 'cca-f'],
    priority: 6,
  },

  // Logistics
  {
    category: 'logistics',
    title: 'Strategy Call',
    content: 'A strategy call is a 30-minute consultation to discuss your goals, assess fit for the program, and answer your questions. It\'s the best way to determine if the Accelerator is right for your situation. Book online through our calendar or ask Maya to schedule one.',
    keywords: ['strategy call', 'consultation', 'meeting', 'book', 'schedule', 'talk'],
    priority: 9,
  },
  {
    category: 'logistics',
    title: 'Enrollment Process',
    content: 'To enroll: (1) Attend the free Open House to meet the instructors and see the full curriculum live - no commitment required, (2) Reserve your seat with the $50 deposit if you\'re ready, or enroll directly for self-paced access, (3) Select your plan (Annual or Month-to-Month) and complete checkout at enterprise.colaberry.ai, (4) Start with your cohort when it kicks off. Seats are limited - check enterprise.colaberry.ai for current availability.',
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
    content: 'The AI Champion Network is our alumni and referral program for the AI Systems Architect Accelerator. Refer others (individuals, teams, or departments) and earn $250 per enrolled participant with no cap. Alumni can activate their referral account at enterprise.colaberry.ai/referrals/login. Three referral types are available: Corporate Sponsor (introduce the program to company leadership), Introduced Referral (we reach out mentioning your name), or Anonymous Referral (your name is never mentioned).',
    keywords: ['champion', 'alumni', 'referral', 'refer', 'network', 'commission', 'earn', '$250'],
    priority: 8,
  },
  {
    category: 'champion',
    title: 'AI Champion Referral Commission',
    content: 'AI Champions earn $250 per enrolled participant - no cap. Examples: 1 enrollment = $250, 4 enrollments = $1,000, 10 enrollments = $2,500, 20 enrollments = $5,000. You earn commission whenever anyone you refer enrolls through your referral link.',
    keywords: ['commission', 'earn', 'money', 'referral', 'champion', 'reward', 'incentive', 'payment'],
    priority: 7,
  },
];

/**
 * Titles retired 2026-08-03 when the KB was rewritten for the live "AI Systems
 * Architect Accelerator" program (replacing the old "Enterprise AI Leadership
 * Accelerator" / $4,500 identity). The upsert loop below only touches titles
 * still present in SEED_ENTRIES, so these would otherwise stay active forever
 * as orphaned stale rows — deactivate them explicitly instead.
 */
const RETIRED_TITLES = [
  'Week 1 - Strategic Alignment & Architecture',
  'Week 2 - Guided Build & Executive Positioning',
  'Week 3 - Executive Readiness & Expansion',
  'The 3-Agent Model',
  'Corporate Sponsorship',
  'Group Enrollment',
];

/**
 * Seed the admissions knowledge base. Upserts - updates content if title exists.
 */
export async function seedAdmissionsKnowledge(): Promise<void> {
  let created = 0;
  let updated = 0;
  let deactivated = 0;

  for (const title of RETIRED_TITLES) {
    const [count] = await AdmissionsKnowledgeEntry.update(
      { active: false },
      { where: { title, active: true } },
    );
    deactivated += count;
  }

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
  if (created > 0 || updated > 0 || deactivated > 0) {
    console.log(`[Admissions] Knowledge base: ${created} created, ${updated} updated, ${deactivated} retired`);
  }
}
