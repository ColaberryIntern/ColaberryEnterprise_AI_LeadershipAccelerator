/**
 * Seed: KB Ops — AI Systems Architect Accelerator, Founding Cohort
 * Run: npx ts-node src/seeds/seedKbData.ts
 * Idempotent: skips rows that already exist (matched by slug / email / question_pattern+course_id)
 */
import { sequelize } from '../config/database';
import CoraKbCourse from '../models/CoraKbCourse';
import CoraKbCohort from '../models/CoraKbCohort';
import ResponsiblePerson from '../models/ResponsiblePerson';
import CoraKbEntry from '../models/CoraKbEntry';

async function seed() {
  await sequelize.authenticate();
  console.log('[seed-kb] DB connected');

  // ── 1. Course ───────────────────────────────────────────────────────────────
  const [course] = await CoraKbCourse.findOrCreate({
    where: { slug: 'ai-architect' },
    defaults: {
      name: 'AI Systems Architect Accelerator',
      slug: 'ai-architect',
      description: '12-week online cohort for professionals designing and leading AI systems.',
      is_active: true,
    },
  });
  console.log('[seed-kb] course:', course.id);

  // ── 2. Founding Cohort ──────────────────────────────────────────────────────
  const [cohort] = await CoraKbCohort.findOrCreate({
    where: { course_id: course.id, cohort_number: 1 },
    defaults: {
      course_id: course.id,
      name: 'Founding Cohort',
      cohort_number: 1,
      open_house_date: 'Thursday, July 16, 2026',
      open_house_url: 'enterprise.colaberry.ai/open-house',
      start_date: 'Thursday, July 23, 2026',
      end_date: 'October 15, 2026',
      expo_date: 'October 2026',
      price_annual: 149,
      price_monthly: 199,
      seats_total: 40,
      seats_remaining: 32,
      enrollment_url: 'enterprise.colaberry.ai',
      waitlist_url: 'enterprise.colaberry.ai/waitlist',
      is_active: true,
    },
  });
  console.log('[seed-kb] cohort:', cohort.id);

  // ── 3. Responsible Persons ──────────────────────────────────────────────────
  type PersonSeed = {
    name: string; email: string; phone?: string;
    work_hours: string; time_zone: string;
    calendar_link?: string; areas: string[]; shift_note?: string;
  };

  const persons: PersonSeed[] = [
    {
      name: 'Roselen',
      email: 'admissions@colaberry.com',
      work_hours: 'Mon–Fri, 9AM–5PM',
      time_zone: 'CST (UTC−6)',
      areas: ['Admissions'],
    },
    {
      name: 'Kes Delele',
      email: 'kesetebirhan@colaberry.com',
      work_hours: 'Mon–Fri, 9AM–6PM',
      time_zone: 'CST (UTC−6)',
      areas: ['Program Management', 'Portal Admin'],
    },
    {
      name: 'Ali Muwwakkil',
      email: 'ali@colaberry.com',
      work_hours: 'Flexible',
      time_zone: 'CST (UTC−6)',
      areas: ['Executive', 'Program Strategy'],
    },
    {
      name: 'Taiwo',
      email: 'payments@colaberry.com',
      work_hours: 'Mon–Fri, 9AM–5PM',
      time_zone: 'CST (UTC−6)',
      areas: ['Payments', 'IPBC'],
    },
    {
      name: 'Balakrishna',
      email: 'supportagent1@colaberry.com',
      work_hours: 'Mon–Fri, 4:30AM–12:30PM',
      time_zone: 'CST (UTC−6)',
      areas: ['Customer Support'],
      shift_note: 'Early shift',
    },
    {
      name: 'Farhat',
      email: 'supportagent2@colaberry.com',
      work_hours: 'Mon–Fri, 12:00PM–8:00PM',
      time_zone: 'CST (UTC−6)',
      areas: ['Customer Support'],
      shift_note: 'Mid shift',
    },
    {
      name: 'Balamurali',
      email: 'supportagent33@colaberry.com',
      work_hours: 'Mon–Fri, 6:00PM–2:00AM; Sat, 9:00AM–1:00AM',
      time_zone: 'CST (UTC−6)',
      areas: ['Customer Support'],
      shift_note: 'Late shift + Saturday',
    },
    {
      name: 'Jackie',
      email: 'jackie@colaberry.com',
      work_hours: 'Flexible',
      time_zone: 'CST (UTC−6)',
      areas: ['Community', 'WhatsApp'],
      shift_note: 'Manages class WhatsApp group and portal community',
    },
  ];

  const personMap: Record<string, string> = {};
  for (const p of persons) {
    const [rec] = await ResponsiblePerson.findOrCreate({
      where: { email: p.email },
      defaults: p,
    });
    personMap[p.name] = rec.id;
    console.log('[seed-kb] person:', p.name, rec.id);
  }

  const P = personMap;

  // ── 4. KB Entries (26) ─────────────────────────────────────────────────────
  type EntrySeed = {
    course_id: string | null;
    main_category: string;
    sub_category: string;
    question_pattern: string;
    answer_template: string;
    primary_person_id: string | null;
    team_person_ids: string[];
    escalation_logic?: string;
    priority: 'High' | 'Medium' | 'Low';
    response_time: string;
    automation_potential: 'High' | 'Medium' | 'Low';
    emotional_tone: string;
    calendar_link?: string;
    keywords: string;
    notes?: string;
  };

  const entries: EntrySeed[] = [
    // ── PROGRAM BASICS ───────────────────────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Program Basics',
      sub_category: 'What is the program',
      question_pattern: 'What is the AI Systems Architect Accelerator?',
      answer_template: 'The {{course.name}} is a 12-week online cohort designed for professionals who want to design, build, and govern AI-powered systems. You\'ll work through four intensives — AI Foundation, Build Your AI Team, Connect AI to the Real World, and Design AI That Scales — finishing with a live Expo and Anthropic Architect Certification (CCA-F) prep.',
      primary_person_id: P['Roselen'],
      team_person_ids: [P['Roselen'], P['Kes Delele']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Informational',
      keywords: 'what is, program, accelerator, overview, AI architect',
    },
    {
      course_id: course.id,
      main_category: 'Program Basics',
      sub_category: 'Duration & Format',
      question_pattern: 'How long is the program and what is the format?',
      answer_template: 'The {{course.name}} runs for 12 weeks — {{cohort.start_date}} through {{cohort.end_date}}. Classes meet twice a week: Monday (Architecture Day) and Thursday (Build Day), 2 hours each, 4 hours total per week. All sessions are recorded and posted in the portal within 24 hours.',
      primary_person_id: P['Roselen'],
      team_person_ids: [P['Roselen']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Informational',
      keywords: 'duration, length, format, schedule, how long, weeks, online',
    },
    {
      course_id: course.id,
      main_category: 'Program Basics',
      sub_category: 'Curriculum',
      question_pattern: 'What will I learn? What does the curriculum cover?',
      answer_template: 'The curriculum has four intensives:\n• Weeks 1–3 (AI Foundation): Claude Code, Claude API, Agent Skills\n• Weeks 4–6 (Build Your AI Team): Prompt Engineering, Model Context Protocol (MCP), Advanced MCP\n• Weeks 7–9 (Connect AI to the Real World): Multi-Agent Systems, Workflow Automation, Reliability Engineering\n• Weeks 10–12 (Design AI That Scales): Governance (NIST AI RMF, EU AI Act), Systems Architecture, Capstone + Expo\n\nYou\'ll use Claude Code, Claude API, Docker Desktop, and GitHub throughout.',
      primary_person_id: P['Roselen'],
      team_person_ids: [P['Roselen'], P['Ali Muwwakkil']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Excited',
      keywords: 'curriculum, syllabus, what will I learn, topics, modules, intensives, MCP, Claude',
    },
    {
      course_id: course.id,
      main_category: 'Program Basics',
      sub_category: 'Who is it for',
      question_pattern: 'Is this program right for me? Who is this for?',
      answer_template: 'The {{course.name}} is built for working professionals who want to move beyond using AI tools and actually design, build, and govern AI systems. Whether you\'re in tech, operations, product, or leadership — if you want hands-on experience building real AI agents and understanding enterprise AI governance, this program is for you. You don\'t need prior AI experience, but you should be comfortable learning new technical tools.',
      primary_person_id: P['Roselen'],
      team_person_ids: [P['Roselen']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Encouraging',
      keywords: 'who is this for, right for me, prerequisites, background, experience required',
    },
    // ── PRICING & ENROLLMENT ─────────────────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Pricing & Enrollment',
      sub_category: 'Pricing',
      question_pattern: 'How much does the program cost?',
      answer_template: 'The Founding Cohort offers two options:\n• Annual Plan: ${{cohort.price_annual}}/month billed annually — this founding rate is permanently locked in for you.\n• Month-to-Month: ${{cohort.price_monthly}}/month, cancel anytime.\n\nThere\'s also a small Anthropic tooling cost (~$20/mo for Claude Code + ~$10/mo for API usage) paid directly to Anthropic as you build your projects. Scholarships are available — contact admissions@colaberry.com.',
      primary_person_id: P['Roselen'],
      team_person_ids: [P['Roselen'], P['Taiwo']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Transparent',
      keywords: 'price, cost, how much, fee, monthly, annual, subscription, pricing',
    },
    {
      course_id: course.id,
      main_category: 'Pricing & Enrollment',
      sub_category: 'Seat deposit',
      question_pattern: 'How does the $50 seat deposit work?',
      answer_template: 'A $50 deposit reserves your seat in the Founding Cohort and is credited toward your first subscription payment — you\'re not paying it on top of the ${{cohort.price_annual}}/${{cohort.price_monthly}} plan cost. In the meantime, you get free access to our AI Learning Content to get started right away. Curriculum (Classroom) access itself doesn\'t begin until the day your live cohort starts — that\'s also when your first subscription payment is charged, with each following payment landing on that same date each following month. Reserve your seat at {{cohort.enrollment_url}}.',
      primary_person_id: P['Taiwo'],
      team_person_ids: [P['Taiwo'], P['Roselen']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Transparent',
      keywords: 'deposit, down payment, $50, reserve seat, hold spot, seat deposit, when does access start',
    },
    {
      course_id: course.id,
      main_category: 'Pricing & Enrollment',
      sub_category: 'Enrollment',
      question_pattern: 'How do I enroll or sign up?',
      answer_template: 'Go to {{cohort.enrollment_url}}, select your membership plan (Annual at ${{cohort.price_annual}}/mo or Month-to-Month at ${{cohort.price_monthly}}/mo), and complete checkout. The Founding Cohort is limited to {{cohort.seats_total}} seats — enroll early to secure your spot and lock the founding rate.',
      primary_person_id: P['Roselen'],
      team_person_ids: [P['Roselen']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Action-oriented',
      keywords: 'enroll, sign up, register, apply, how to join, checkout',
    },
    {
      course_id: course.id,
      main_category: 'Pricing & Enrollment',
      sub_category: 'Seat availability',
      question_pattern: 'Are there still spots available?',
      answer_template: 'The Founding Cohort has {{cohort.seats_remaining}} of {{cohort.seats_total}} seats remaining. Once full, enrollment closes for this cohort. If you miss the founding cohort, you can join the waitlist at {{cohort.waitlist_url}}. Note: the ${{cohort.price_annual}}/month founding rate is exclusive to this cohort — later cohorts will be priced higher.',
      primary_person_id: P['Roselen'],
      team_person_ids: [P['Roselen']],
      priority: 'High',
      response_time: '< 1 hour',
      automation_potential: 'High',
      emotional_tone: 'Urgent but calm',
      keywords: 'seats, spots, availability, waitlist, full, capacity',
    },
    {
      course_id: course.id,
      main_category: 'Pricing & Enrollment',
      sub_category: 'Scholarship',
      question_pattern: 'Do you offer scholarships or financial aid?',
      answer_template: 'Yes, scholarships are available for qualifying applicants. Please contact admissions@colaberry.com with your name, background, and a brief statement of why you\'re applying for a scholarship. Our Admissions team will follow up within 2 business days.',
      primary_person_id: P['Roselen'],
      team_person_ids: [P['Roselen'], P['Ali Muwwakkil']],
      priority: 'Medium',
      response_time: '< 4 hours',
      automation_potential: 'Medium',
      emotional_tone: 'Empathetic',
      keywords: 'scholarship, financial aid, discount, reduced, afford, cost assistance',
    },
    // ── OPEN HOUSE ───────────────────────────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Program Basics',
      sub_category: 'Open House',
      question_pattern: 'Tell me about the Open House. How do I attend?',
      answer_template: 'The Open House on {{cohort.open_house_date}} is completely free and requires no commitment. You\'ll meet the instructors, see the full 12-week curriculum live, ask questions, and decide from there. The Founding Cohort kicks off {{cohort.start_date}}. Learn more and register at {{cohort.enrollment_url}}.',
      primary_person_id: P['Roselen'],
      team_person_ids: [P['Roselen'], P['Kes Delele']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Welcoming',
      keywords: 'open house, free session, preview, attend, register, RSVP',
    },
    // ── SCHEDULE ─────────────────────────────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Schedule & Sessions',
      sub_category: 'Class schedule',
      question_pattern: 'When are classes? What is the weekly schedule?',
      answer_template: 'Live sessions run twice weekly: Monday (Architecture Day, 2 hours) and Thursday (Build Day, 2 hours) — 4 hours total per week. Specific clock times are confirmed after enrollment. All sessions are recorded and posted in the portal within 24 hours of the live session.',
      primary_person_id: P['Kes Delele'],
      team_person_ids: [P['Kes Delele'], P['Balakrishna']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Informational',
      keywords: 'schedule, when, class time, Monday, Thursday, weekly, hours',
    },
    {
      course_id: course.id,
      main_category: 'Schedule & Sessions',
      sub_category: 'Session recordings',
      question_pattern: 'Can I watch recorded sessions if I miss a class?',
      answer_template: 'Every session is recorded and posted in the portal within 24 hours. You can watch the replay anytime and ask follow-up questions in the program portal (enterprise.colaberry.ai) or the class WhatsApp group.',
      primary_person_id: P['Kes Delele'],
      team_person_ids: [P['Kes Delele'], P['Balakrishna']],
      priority: 'Medium',
      response_time: '< 4 hours',
      automation_potential: 'High',
      emotional_tone: 'Reassuring',
      keywords: 'recording, replay, miss class, watch later, catch up',
    },
    // ── CERTIFICATION ────────────────────────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Certification & Outcomes',
      sub_category: 'Certification',
      question_pattern: 'What certification do I get?',
      answer_template: 'The program includes full prep for the Anthropic Architect Certification (CCA-F exam). You\'ll build a GitHub portfolio of real AI projects throughout the 12 weeks, which serves as your professional credential alongside the certification.',
      primary_person_id: P['Ali Muwwakkil'],
      team_person_ids: [P['Ali Muwwakkil'], P['Kes Delele']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Aspirational',
      keywords: 'certification, CCA-F, Anthropic, credential, certificate, portfolio',
    },
    {
      course_id: course.id,
      main_category: 'Certification & Outcomes',
      sub_category: 'Career outcomes',
      question_pattern: 'What jobs or roles can I get after this program?',
      answer_template: 'The {{course.name}} prepares you for roles in AI system design, AI product management, AI governance, and technical leadership in AI-driven organizations. We provide career coaching and portfolio support to help position you for opportunities — but we don\'t guarantee specific job placement.',
      primary_person_id: P['Ali Muwwakkil'],
      team_person_ids: [P['Ali Muwwakkil'], P['Roselen']],
      priority: 'Medium',
      response_time: '< 4 hours',
      automation_potential: 'High',
      emotional_tone: 'Aspirational',
      keywords: 'job, career, roles, outcomes, salary, placement, after program',
    },
    // ── COMMUNITY & ACCESS ───────────────────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Platform & Support',
      sub_category: 'Community access',
      question_pattern: 'How do I join the peer community or WhatsApp group?',
      answer_template: 'Your program community lives in the portal at enterprise.colaberry.ai and the class WhatsApp group. Both links are in your welcome email after enrollment. If you did not receive the welcome email, check your spam folder or contact jackie@colaberry.com.',
      primary_person_id: P['Jackie'],
      team_person_ids: [P['Jackie'], P['Kes Delele']],
      priority: 'Medium',
      response_time: '< 4 hours',
      automation_potential: 'High',
      emotional_tone: 'Friendly',
      keywords: 'WhatsApp, community, portal, group link, welcome email, Jackie, peer',
      notes: 'Confirmed 2026-07-06: portal + WhatsApp only — no Discord, no Skool.',
    },
    {
      course_id: course.id,
      main_category: 'Platform & Support',
      sub_category: 'Portal login issues',
      question_pattern: 'I can\'t log into the portal. How do I reset my access?',
      answer_template: 'Please try: (1) Clear your browser cache and cookies. (2) Go to enterprise.colaberry.ai. (3) If you signed up with Google, use "Continue with Google." Still stuck? Email kesetebirhan@colaberry.com with your registered email address and a screenshot of the error. Response within 1 business day.',
      primary_person_id: P['Kes Delele'],
      team_person_ids: [P['Kes Delele'], P['Balakrishna']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'Medium',
      emotional_tone: 'Calm, step-by-step',
      keywords: 'login, can\'t log in, portal access, password, reset, stuck',
    },
    {
      course_id: course.id,
      main_category: 'Platform & Support',
      sub_category: 'Session recordings access',
      question_pattern: 'Where do I find the session recordings in the portal?',
      answer_template: 'Log into enterprise.colaberry.ai → Dashboard → Current Intensive → Recordings tab. Replays are posted within 24 hours of the live session. If a recording is missing after 24 hours, email kesetebirhan@colaberry.com.',
      primary_person_id: P['Kes Delele'],
      team_person_ids: [P['Kes Delele'], P['Balakrishna']],
      priority: 'Medium',
      response_time: '< 4 hours',
      automation_potential: 'High',
      emotional_tone: 'Helpful',
      keywords: 'recording, where, portal, find, dashboard, intensive, tab',
    },
    // ── BILLING & ACCOUNT ────────────────────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Billing & Account',
      sub_category: 'Receipt & tax docs',
      question_pattern: 'I need a receipt or tax document.',
      answer_template: 'Log into enterprise.colaberry.ai → Account → Billing → Download Receipt. The organization\'s EIN is 45-4223538. Note: there is no 1098-T for this program — Colaberry is not a Title IV institution for this course. For billing questions, email kesetebirhan@colaberry.com.',
      primary_person_id: P['Kes Delele'],
      team_person_ids: [P['Kes Delele'], P['Taiwo']],
      priority: 'Medium',
      response_time: '< 4 hours',
      automation_potential: 'High',
      emotional_tone: 'Professional',
      keywords: 'receipt, tax, 1098-T, invoice, billing, document, EIN',
    },
    {
      course_id: course.id,
      main_category: 'Billing & Account',
      sub_category: 'Cancel or pause',
      question_pattern: 'How do I cancel or pause my membership?',
      answer_template: 'For Month-to-Month members: you can cancel anytime from your account at enterprise.colaberry.ai → Account → Billing → Cancel Membership. For Annual members: your plan runs for the full annual term. To discuss a pause or special circumstance, email kesetebirhan@colaberry.com or payments@colaberry.com.',
      primary_person_id: P['Taiwo'],
      team_person_ids: [P['Taiwo'], P['Kes Delele']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'Medium',
      emotional_tone: 'Empathetic',
      keywords: 'cancel, pause, refund, stop, subscription, end membership',
    },
    {
      course_id: course.id,
      main_category: 'Billing & Account',
      sub_category: 'Deposit refund',
      question_pattern: 'Can I get my seat deposit back, or what happens if I don\'t attend?',
      answer_template: 'If you reserved a seat with the $50 deposit and didn\'t attend your live class, the $50 is fully refundable, or you can apply it as a credit toward a future cohort of your choice — just email payments@colaberry.com. If your reserved cohort\'s start date passes without you completing enrollment, the reservation lapses automatically and the $50 becomes a credit on your account rather than a charge.',
      primary_person_id: P['Taiwo'],
      team_person_ids: [P['Taiwo'], P['Kes Delele']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'Medium',
      emotional_tone: 'Empathetic',
      keywords: 'deposit refund, no show, no-show, seat lapse, reservation lapse, deposit credit',
    },
    {
      course_id: course.id,
      main_category: 'Billing & Account',
      sub_category: 'Payment failure',
      question_pattern: 'My payment failed or I was charged incorrectly.',
      answer_template: 'Please email payments@colaberry.com with your account email and a description of the issue. Taiwo handles all billing corrections and will respond within 1 business day. For urgent issues, call or text during business hours (Mon–Fri, 9AM–5PM CST).',
      primary_person_id: P['Taiwo'],
      team_person_ids: [P['Taiwo']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'Low',
      emotional_tone: 'Empathetic, urgent',
      keywords: 'payment failed, charged wrong, refund, billing error, dispute',
    },
    // ── TOOLS & SETUP ────────────────────────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Tools & Setup',
      sub_category: 'Required tools',
      question_pattern: 'What tools do I need to install before the program starts?',
      answer_template: 'You\'ll need:\n• Claude Code (Anthropic subscription, ~$20/month — sign up at claude.ai/code)\n• Docker Desktop (free — docker.com/products/docker-desktop)\n• GitHub account (free — github.com)\n• A modern laptop (Mac or Windows, 8GB RAM minimum recommended)\n\nDetailed setup instructions are sent in your welcome email and are available in the portal after enrollment.',
      primary_person_id: P['Kes Delele'],
      team_person_ids: [P['Kes Delele'], P['Balakrishna']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Practical',
      keywords: 'tools, install, setup, Claude Code, Docker, GitHub, requirements, laptop',
    },
    {
      course_id: course.id,
      main_category: 'Tools & Setup',
      sub_category: 'Anthropic costs',
      question_pattern: 'What are the Anthropic costs and are they included?',
      answer_template: 'The Anthropic tooling costs are separate from your Colaberry membership and paid directly to Anthropic:\n• Claude Code subscription: ~$20/month\n• Claude API usage (for project builds): ~$10/month\n\nThese are estimates and vary by usage. Your Colaberry membership (${{cohort.price_annual}}/mo annual or ${{cohort.price_monthly}}/mo month-to-month) covers the program, portal, and instruction only.',
      primary_person_id: P['Kes Delele'],
      team_person_ids: [P['Kes Delele'], P['Roselen']],
      priority: 'High',
      response_time: '< 2 hours',
      automation_potential: 'High',
      emotional_tone: 'Transparent',
      keywords: 'Anthropic, Claude Code, API cost, additional cost, total cost, how much extra',
    },
    // ── INTERNSHIP & CAPSTONE ────────────────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Certification & Outcomes',
      sub_category: 'Internship track',
      question_pattern: 'What is the internship track?',
      answer_template: 'Alongside the 12-week curriculum, enrolled students can participate in a full-time internship track. This is a hands-on project lane where you apply your skills to real organizational AI challenges. Details are shared in the program portal after enrollment. Contact ali@colaberry.com for eligibility questions.',
      primary_person_id: P['Ali Muwwakkil'],
      team_person_ids: [P['Ali Muwwakkil'], P['Kes Delele']],
      priority: 'Medium',
      response_time: '< 8 hours',
      automation_potential: 'Medium',
      emotional_tone: 'Aspirational',
      keywords: 'internship, project, real work, track, apply skills',
    },
    {
      course_id: course.id,
      main_category: 'Certification & Outcomes',
      sub_category: 'Capstone & Expo',
      question_pattern: 'What is the capstone project and Expo?',
      answer_template: 'In Weeks 10–12 you\'ll design and build a complete AI system as your capstone. In {{cohort.expo_date}}, you\'ll present your project at a live Expo — a showcase where cohort members, instructors, and invited industry guests see what you built. The Expo project goes directly into your GitHub portfolio.',
      primary_person_id: P['Ali Muwwakkil'],
      team_person_ids: [P['Ali Muwwakkil'], P['Kes Delele']],
      priority: 'Medium',
      response_time: '< 8 hours',
      automation_potential: 'High',
      emotional_tone: 'Exciting',
      keywords: 'capstone, expo, demo day, final project, showcase, portfolio',
    },
    // ── AI MENTOR (PHASE 2 PLACEHOLDER) ─────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Platform & Support',
      sub_category: 'AI Mentor',
      question_pattern: 'Is there an AI Mentor I can ask questions to?',
      answer_template: '[PHASE 2 — NOT YET ACTIVE] An AI Mentor is being built for this cohort and will be available via the portal. Until it launches, please direct questions to your instructors in the portal discussion boards or contact support@colaberry.com.',
      primary_person_id: P['Kes Delele'],
      team_person_ids: [P['Kes Delele'], P['Ali Muwwakkil']],
      priority: 'Low',
      response_time: '< 1 business day',
      automation_potential: 'Low',
      emotional_tone: 'Informational',
      keywords: 'AI mentor, chatbot, automated help, Cora, assistant',
      notes: 'Phase 2 item. Legacy cai@aiagent.colaberry.com retired. New agent to be built against app data.',
    },
    // ── TECHNICAL SUPPORT ────────────────────────────────────────────────────
    {
      course_id: course.id,
      main_category: 'Platform & Support',
      sub_category: 'Broken links & site issues',
      question_pattern: 'A link on the portal is broken or a page is not working.',
      answer_template: 'Please email kesetebirhan@colaberry.com with: (1) the URL or page where the issue occurred, (2) a screenshot if possible, (3) the browser and device you\'re using. Response within 1 business day.',
      primary_person_id: P['Kes Delele'],
      team_person_ids: [P['Kes Delele'], P['Balakrishna']],
      priority: 'Medium',
      response_time: '< 4 hours',
      automation_potential: 'Medium',
      emotional_tone: 'Calm, helpful',
      keywords: 'broken link, 404, not working, error, page, website, fix',
    },
    // ── EMPLOYMENT VERIFICATION ──────────────────────────────────────────────
    {
      course_id: null,
      main_category: 'Administrative',
      sub_category: 'Employment verification',
      question_pattern: 'I need employment verification for a current or past employee.',
      answer_template: 'For employment verification requests, please email everify@colaberry.com. Include the employee\'s full name, dates of employment, and what information you need verified. Our team responds within 2 business days.',
      primary_person_id: P['Ali Muwwakkil'],
      team_person_ids: [P['Ali Muwwakkil']],
      priority: 'Medium',
      response_time: '< 2 business days',
      automation_potential: 'High',
      emotional_tone: 'Professional',
      keywords: 'employment verification, verify employment, HR, E-verify, everify',
    },
  ];

  let created = 0;
  let skipped = 0;
  for (const entry of entries) {
    const [, wasCreated] = await CoraKbEntry.findOrCreate({
      where: {
        question_pattern: entry.question_pattern,
        course_id: entry.course_id ?? null,
      },
      defaults: entry,
    });
    wasCreated ? created++ : skipped++;
  }

  console.log(`[seed-kb] entries: ${created} created, ${skipped} skipped`);
  console.log('[seed-kb] done');
  await sequelize.close();
}

seed().catch((err) => {
  console.error('[seed-kb] error:', err);
  process.exit(1);
});
