import AdmissionsKnowledgeEntry from '../models/AdmissionsKnowledgeEntry';

interface SeedEntry {
  category: string;
  title: string;
  content: string;
  keywords: string[];
  priority: number;
}

const SEED_ENTRIES: SeedEntry[] = [
  // Program
  { category: 'program', title: 'Program Overview', content: 'The Enterprise AI Leadership Accelerator is a comprehensive program designed for enterprise executives who want to lead AI transformation in their organizations. It combines strategic frameworks, hands-on AI tool mastery, and real-world project work.', keywords: ['program', 'overview', 'accelerator', 'what is'], priority: 10 },
  { category: 'program', title: 'Program Format', content: 'The program is delivered in a cohort-based format with live sessions, mentored project work, and peer collaboration. Participants engage in weekly live sessions and complete hands-on projects between sessions.', keywords: ['format', 'structure', 'delivery', 'how', 'cohort'], priority: 8 },
  { category: 'program', title: 'Program Duration', content: 'The program runs for 12 weeks with weekly live sessions. Each session is approximately 2 hours, with additional project work between sessions.', keywords: ['duration', 'length', 'weeks', 'how long', 'time'], priority: 8 },
  { category: 'program', title: 'Who Is This For', content: 'The program is designed for enterprise executives, VPs, directors, and senior managers who want to understand AI strategy, lead AI initiatives, and drive transformation in their organizations. No technical background is required.', keywords: ['who', 'audience', 'executives', 'target', 'qualifications', 'prerequisites'], priority: 9 },

  // Curriculum
  { category: 'curriculum', title: 'AI Strategy Foundations', content: 'Learn to evaluate AI opportunities, build business cases, and create AI roadmaps. Covers AI maturity models, competitive landscape analysis, and strategic planning frameworks.', keywords: ['strategy', 'foundations', 'ai strategy', 'roadmap', 'business case'], priority: 7 },
  { category: 'curriculum', title: 'AI Tools & Platforms', content: 'Hands-on experience with enterprise AI platforms including ChatGPT Enterprise, Claude, Copilot, and specialized tools for data analysis, content generation, and process automation.', keywords: ['tools', 'platforms', 'chatgpt', 'claude', 'copilot', 'hands-on'], priority: 7 },
  { category: 'curriculum', title: 'Change Management', content: 'Master frameworks for leading AI adoption across your organization. Covers stakeholder management, team upskilling strategies, risk mitigation, and building an AI-first culture.', keywords: ['change management', 'adoption', 'culture', 'team', 'upskilling'], priority: 6 },
  { category: 'curriculum', title: 'Capstone Project', content: 'Apply everything learned to a real AI initiative in your organization. Work with mentors to design, plan, and begin implementing an AI solution that delivers measurable business value.', keywords: ['capstone', 'project', 'hands-on', 'practical', 'real-world'], priority: 7 },

  // Pricing
  { category: 'pricing', title: 'Individual Enrollment', content: 'Individual enrollment in the Enterprise AI Leadership Accelerator provides full access to all sessions, mentoring, and resources. Contact us or book a strategy call for current pricing.', keywords: ['price', 'cost', 'individual', 'enrollment', 'how much'], priority: 9 },
  { category: 'pricing', title: 'ROI and Value', content: 'Participants typically see ROI within 3-6 months through improved AI strategy execution, better vendor selection, reduced consulting spend, and accelerated AI adoption. The program pays for itself many times over.', keywords: ['roi', 'value', 'return', 'worth', 'investment', 'benefit'], priority: 9 },
  { category: 'pricing', title: 'Payment Options', content: 'We offer flexible payment options including full payment, installment plans, and corporate invoicing. Corporate sponsorship and group rates are also available.', keywords: ['payment', 'installment', 'financing', 'pay', 'options'], priority: 7 },

  // Enterprise
  { category: 'enterprise', title: 'Corporate Sponsorship', content: 'Organizations can sponsor employees for the program with group rates, dedicated support, and customized project focus. Corporate sponsors receive progress reports and ROI tracking.', keywords: ['corporate', 'sponsor', 'sponsorship', 'company', 'organization'], priority: 8 },
  { category: 'enterprise', title: 'Group Rates', content: 'Special pricing is available for organizations enrolling multiple participants. Group enrollment includes team alignment sessions and coordinated project work.', keywords: ['group', 'team', 'rates', 'discount', 'multiple', 'bulk'], priority: 8 },
  { category: 'enterprise', title: 'Enterprise Training', content: 'For organizations needing a fully customized program, we offer enterprise training packages with tailored curriculum, private cohorts, and dedicated mentorship.', keywords: ['enterprise', 'training', 'custom', 'tailored', 'private'], priority: 7 },

  // Sponsorship
  { category: 'sponsorship', title: 'Sponsorship Benefits', content: 'Corporate sponsors receive: group pricing, dedicated account management, progress tracking dashboards, ROI measurement, and priority access to new cohorts.', keywords: ['sponsorship', 'benefits', 'advantages', 'package'], priority: 7 },
  { category: 'sponsorship', title: 'How to Sponsor', content: 'To sponsor employees, book a strategy call or contact our enterprise team. We will design a package tailored to your organization\'s AI strategy goals and team size.', keywords: ['how', 'sponsor', 'process', 'start', 'begin'], priority: 7 },

  // Outcomes
  { category: 'outcomes', title: 'Expected Outcomes', content: 'Graduates leave with: a clear AI strategy for their organization, hands-on experience with AI tools, a completed AI project, a peer network of AI leaders, and confidence to lead AI initiatives.', keywords: ['outcomes', 'results', 'graduate', 'what will i learn', 'skills'], priority: 8 },
  { category: 'outcomes', title: 'Career Impact', content: 'Past participants report career acceleration including promotions, expanded responsibilities, and recognition as AI leaders within their organizations.', keywords: ['career', 'promotion', 'impact', 'advancement', 'recognition'], priority: 7 },

  // FAQ
  { category: 'faq', title: 'Technical Requirements', content: 'No coding or technical background is required. The program is designed for business leaders. You will need a computer with internet access for live sessions.', keywords: ['technical', 'requirements', 'coding', 'skills', 'need', 'prerequisite'], priority: 8 },
  { category: 'faq', title: 'Time Commitment', content: 'Expect 4-6 hours per week: 2 hours for live sessions and 2-4 hours for project work and self-study.', keywords: ['time', 'commitment', 'hours', 'week', 'schedule', 'busy'], priority: 8 },
  { category: 'faq', title: 'Certificate', content: 'Participants who complete the program receive a certificate of completion from the Colaberry Enterprise AI Leadership Accelerator.', keywords: ['certificate', 'credential', 'completion', 'certification'], priority: 6 },
  { category: 'faq', title: 'Refund Policy', content: 'We offer a satisfaction guarantee for the first two weeks of the program. If you are not satisfied, contact us for a full refund.', keywords: ['refund', 'guarantee', 'cancel', 'money back'], priority: 6 },
  { category: 'faq', title: 'Next Cohort Start Date', content: 'New cohorts start regularly. Book a strategy call or visit the enrollment page for the most current cohort start dates and availability.', keywords: ['start', 'date', 'when', 'next', 'cohort', 'begin'], priority: 8 },

  // Logistics
  { category: 'logistics', title: 'Strategy Call Process', content: 'A strategy call is a 30-minute consultation to discuss your AI goals, assess fit for the program, and answer your questions. Book online through our calendar or ask Maya to schedule one.', keywords: ['strategy call', 'consultation', 'meeting', 'book', 'schedule'], priority: 9 },
  { category: 'logistics', title: 'Enrollment Process', content: 'To enroll: 1) Book a strategy call or submit an interest form, 2) Receive your personalized program brief, 3) Complete enrollment and payment, 4) Start with your cohort.', keywords: ['enroll', 'enrollment', 'process', 'steps', 'how to join', 'sign up'], priority: 9 },
  { category: 'logistics', title: 'Live Session Schedule', content: 'Live sessions are held weekly on a consistent day and time. Sessions are recorded for participants who occasionally miss a session.', keywords: ['session', 'schedule', 'live', 'recording', 'miss', 'recorded'], priority: 7 },
  { category: 'logistics', title: 'Contact Information', content: 'You can reach us through the chat widget (I\'m Maya!), by booking a strategy call, or through the contact page on our website.', keywords: ['contact', 'reach', 'email', 'phone', 'talk'], priority: 7 },
];

/**
 * Seed the admissions knowledge base. Idempotent — uses findOrCreate on title.
 */
export async function seedAdmissionsKnowledge(): Promise<void> {
  let created = 0;
  for (const entry of SEED_ENTRIES) {
    const [, wasCreated] = await AdmissionsKnowledgeEntry.findOrCreate({
      where: { title: entry.title },
      defaults: {
        category: entry.category as any,
        title: entry.title,
        content: entry.content,
        keywords: entry.keywords,
        priority: entry.priority,
        active: true,
      },
    });
    if (wasCreated) created++;
  }
  if (created > 0) {
    console.log(`[Admissions] Seeded ${created} knowledge base entries`);
  }
}
