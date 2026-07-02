/**
 * seedAcceleratorCurriculum.ts
 *
 * Creates the 12-week AI Systems Architect Accelerator cohort in the dev DB
 * so the full portal UX (Skilljar CTAs, CCA-F link, week progression) can be
 * tested locally without touching production.
 *
 * What it does:
 *   1. findOrCreate cohort "AI Systems Architect — July 2026 (dev)"
 *   2. findOrCreate 12 CurriculumModule rows (W1–W12, Appendix A titles)
 *   3. Create 3 CurriculumLesson rows per module if none exist
 *   4. findOrCreate Enrollment for kes@localdev.test
 *   5. initializeParticipantCurriculum (creates LessonInstance rows)
 *   6. Print portal login URL
 *
 * Idempotent: safe to run repeatedly.
 *
 * Usage (from repo root — requires compiled JS in the dev container):
 *   node dist/seeds/seedAcceleratorCurriculum.js
 *
 * Or in dev (TypeScript):
 *   npx ts-node backend/src/seeds/seedAcceleratorCurriculum.ts
 */

import { randomUUID } from 'crypto';
import { connectDatabase } from '../config/database';
import '../models';
import { Cohort } from '../models';
import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';
import Enrollment from '../models/Enrollment';
import { initializeParticipantCurriculum } from '../services/curriculumService';

const COHORT_NAME = 'AI Systems Architect — July 2026 (dev)';
const KES_EMAIL   = 'kes@localdev.test';
const PORT        = process.env.FRONTEND_PORT || '9999';

type SkillArea = 'strategy_trust' | 'governance' | 'requirements' | 'build_discipline' | 'executive_authority';

interface WeekDef {
  module_number: number;
  title:         string;
  description:   string;
  skill_area:    SkillArea;
  lessons:       { title: string; description: string }[];
}

const WEEKS: WeekDef[] = [
  {
    module_number: 1,
    title:       'Claude Code Foundations',
    description: 'Master Claude Code as your primary development environment. Build your first AI-assisted workflow and establish the coding habits that carry through the program.',
    skill_area:  'build_discipline',
    lessons: [
      { title: 'Setting Up Claude Code',           description: 'Install and configure Claude Code; run your first prompt-driven task.' },
      { title: 'Core Commands and Context',         description: 'Learn the commands, context window mechanics, and how to guide the model effectively.' },
      { title: 'Your First AI-Assisted Project',    description: 'Build a small end-to-end feature using Claude Code from spec to commit.' },
    ],
  },
  {
    module_number: 2,
    title:       'Agent Skills',
    description: 'Understand how AI agents plan, act, and use tools. Design your first agent workflow and learn how to evaluate agent reliability.',
    skill_area:  'build_discipline',
    lessons: [
      { title: 'What Is an Agent?',                description: 'Define agents, tools, and loops. Distinguish agents from simple API calls.' },
      { title: 'Tool Use and Function Calling',    description: 'Wire up tools; observe how the model selects and sequences them.' },
      { title: 'Evaluating Agent Reliability',     description: 'Build a test harness for your agent; define pass/fail criteria.' },
    ],
  },
  {
    module_number: 3,
    title:       'Claude API + Workflow Assistant',
    description: 'Connect Claude to your own codebase via the API. Build a lightweight workflow assistant that automates a repeatable task in your organization.',
    skill_area:  'build_discipline',
    lessons: [
      { title: 'API Authentication and Basics',    description: 'Set up API keys, send your first message, handle streaming.' },
      { title: 'Designing a Workflow Prompt',      description: 'Craft system prompts for a repeatable enterprise task.' },
      { title: 'Building the Assistant End-to-End',description: 'Integrate the API into a real codebase; handle errors and retries.' },
    ],
  },
  {
    module_number: 4,
    title:       'Prompt Engineering',
    description: 'Learn the techniques that separate effective AI users from everyone else: chain-of-thought, few-shot examples, structured output, and role framing.',
    skill_area:  'build_discipline',
    lessons: [
      { title: 'Prompt Anatomy',                   description: 'System vs user messages, temperature, and output format control.' },
      { title: 'Chain-of-Thought and Few-Shot',    description: 'Guide the model through complex reasoning with examples.' },
      { title: 'Structured Output Design',         description: 'Get reliable JSON, tables, and typed responses from the model.' },
    ],
  },
  {
    module_number: 5,
    title:       'MCP Foundations',
    description: 'Understand the Model Context Protocol: how it standardizes tool and resource exposure so any model can work with any data source.',
    skill_area:  'build_discipline',
    lessons: [
      { title: 'What Is MCP?',                     description: 'Protocol overview, why it matters, and the server/client architecture.' },
      { title: 'Your First MCP Server',            description: 'Scaffold a local MCP server; expose a simple tool to Claude.' },
      { title: 'Connecting MCP to Claude Code',    description: 'Wire your MCP server into Claude Code and run an end-to-end task.' },
    ],
  },
  {
    module_number: 6,
    title:       'Advanced MCP',
    description: 'Go deeper: resource subscriptions, sampling, authentication patterns, and multi-server orchestration for production-grade MCP deployments.',
    skill_area:  'build_discipline',
    lessons: [
      { title: 'Resources and Subscriptions',      description: 'Expose live data sources; push updates to the model in real time.' },
      { title: 'Auth Patterns for MCP Servers',    description: 'Secure your MCP server with OAuth and API-key patterns.' },
      { title: 'Multi-Server Orchestration',       description: 'Chain multiple MCP servers; handle routing and conflict resolution.' },
    ],
  },
  {
    module_number: 7,
    title:       'Subagents + Multi-Agent Team',
    description: 'Design multi-agent systems where specialized subagents collaborate under an orchestrator. Learn handoff protocols and parallelization patterns.',
    skill_area:  'build_discipline',
    lessons: [
      { title: 'Orchestrator + Subagent Pattern',  description: 'Define the orchestrator role and how tasks are delegated.' },
      { title: 'Agent Communication Contracts',    description: 'Type the interfaces between agents; enforce contracts at runtime.' },
      { title: 'Parallelization and Fan-Out',      description: 'Run agents in parallel; aggregate results safely.' },
    ],
  },
  {
    module_number: 8,
    title:       'Workflows + Automation',
    description: 'Build durable, automated AI workflows that survive failures, retry intelligently, and integrate with the tools your organization already uses.',
    skill_area:  'build_discipline',
    lessons: [
      { title: 'Workflow Design Principles',       description: 'Idempotency, retry strategy, and dead-letter handling for AI jobs.' },
      { title: 'Integrating Existing Enterprise Tools', description: 'Connect your workflow to Slack, email, databases, and CRMs.' },
      { title: 'Monitoring and Observability',     description: 'Add structured logging and metrics to your automation pipeline.' },
    ],
  },
  {
    module_number: 9,
    title:       'Reliability',
    description: 'Build AI systems that hold up in production: failure-first design, circuit breakers, rate-limit handling, and graceful degradation.',
    skill_area:  'strategy_trust',
    lessons: [
      { title: 'Failure-First Design',             description: 'Design the failure path before the happy path; document every failure mode.' },
      { title: 'Circuit Breakers and Timeouts',    description: 'Implement the canonical circuit breaker pattern from this codebase.' },
      { title: 'Testing Under Adversarial Conditions', description: 'BREAK your system deliberately; HARDEN it with tests.' },
    ],
  },
  {
    module_number: 10,
    title:       'Governance',
    description: 'Establish the policies, audit trails, and access controls that make AI systems accountable to your organization and compliant with regulation.',
    skill_area:  'governance',
    lessons: [
      { title: 'AI Governance Frameworks',         description: 'Map the governance landscape: NIST AI RMF, ISO 42001, EU AI Act.' },
      { title: 'Audit Trails and Explainability',  description: 'Build logging that satisfies a compliance audit; trace every decision.' },
      { title: 'Access Control for AI Systems',    description: 'Role-based access, data minimization, and PII handling in AI pipelines.' },
    ],
  },
  {
    module_number: 11,
    title:       'Systems Architecture',
    description: 'Design scalable, maintainable AI system architectures: layered services, clean contracts, and the patterns that separate prototypes from production.',
    skill_area:  'requirements',
    lessons: [
      { title: 'Layered AI Architecture',          description: 'Orchestration, execution, and verification layers — and why the separation matters.' },
      { title: 'Contract-Driven Design',           description: 'Define typed contracts at every module boundary; enforce them in CI.' },
      { title: 'Architecture Review',              description: 'Review a real system; identify blast-radius risks and improvement paths.' },
    ],
  },
  {
    module_number: 12,
    title:       'Capstone + Expo',
    description: 'Present your AI system to peers and stakeholders. Then sit the Claude Certified Architect - Foundations exam to earn your Anthropic credential.',
    skill_area:  'executive_authority',
    lessons: [
      { title: 'Capstone Presentation Prep',       description: 'Structure your Demo Day narrative: problem, solution, architecture, results.' },
      { title: 'Demo Day',                         description: 'Live presentation of your AI build to cohort peers and invited stakeholders.' },
      { title: 'CCA-F Exam Preparation',           description: 'Review key concepts and take the Claude Certified Architect - Foundations exam.' },
    ],
  },
];

async function run(): Promise<void> {
  await connectDatabase();

  // 1. Cohort
  const [cohort, cohortCreated] = await Cohort.findOrCreate({
    where: { name: COHORT_NAME },
    defaults: {
      name:             COHORT_NAME,
      start_date:       '2026-07-13',
      core_day:         'Sunday',
      core_time:        '10:00 AM–12:00 PM EST',
      optional_lab_day: 'Wednesday',
      max_seats:        20,
      seats_taken:      0,
      status:           'open' as const,
    },
  });
  console.log(`Cohort: ${cohortCreated ? 'created' : 'already exists'} — ${cohort.name} (${cohort.id})`);

  // 2. Modules + Lessons
  let modulesCreated = 0;
  let lessonsCreated = 0;

  for (const week of WEEKS) {
    const [mod, modCreated] = await CurriculumModule.findOrCreate({
      where: { cohort_id: cohort.id, module_number: week.module_number },
      defaults: {
        cohort_id:    cohort.id,
        module_number: week.module_number,
        title:         week.title,
        description:   week.description,
        skill_area:    week.skill_area,
        total_lessons: week.lessons.length,
        unlock_rule:   'sequential',
      },
    });

    if (modCreated) modulesCreated++;

    // Check existing lessons for this module
    const existingLessons = await CurriculumLesson.findAll({
      where: { module_id: mod.id },
      attributes: ['lesson_number'],
    });
    const existingNumbers = new Set(existingLessons.map((l) => l.lesson_number));

    for (let i = 0; i < week.lessons.length; i++) {
      const lessonNum = i + 1;
      if (existingNumbers.has(lessonNum)) continue;

      await CurriculumLesson.create({
        module_id:              mod.id,
        lesson_number:          lessonNum,
        title:                  week.lessons[i].title,
        description:            week.lessons[i].description,
        lesson_type:            'section',
        estimated_minutes:      30,
        requires_structured_input: false,
        mandatory:              true,
        sort_order:             lessonNum,
        completion_requirements: {},
      });
      lessonsCreated++;
    }

    const status = modCreated ? 'created' : 'exists';
    console.log(`  W${week.module_number.toString().padStart(2, '0')} ${status}: ${week.title}`);
  }

  console.log(`\nModules: ${modulesCreated} created. Lessons: ${lessonsCreated} created.`);

  // 3. Enrollment for kes@localdev.test
  let enrollment = await Enrollment.findOne({ where: { email: KES_EMAIL } });
  let enrollmentCreated = false;

  if (!enrollment) {
    const token   = randomUUID();
    const expiry  = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    enrollment = await Enrollment.create({
      full_name:               'Kes Delele (dev)',
      email:                   KES_EMAIL,
      company:                 'Colaberry',
      title:                   'AI Systems Architect',
      cohort_id:               cohort.id,
      payment_status:          'paid',
      payment_method:          'invoice',
      payment_mode:            'test',
      status:                  'active',
      portal_enabled:          true,
      portal_token:            token,
      portal_token_expires_at: expiry,
      intake_completed:        true,
      maturity_level:          1,
    });
    enrollmentCreated = true;
  } else if (enrollment.cohort_id !== cohort.id) {
    // Enrollment exists but points to a different cohort — update to this one
    await enrollment.update({ cohort_id: cohort.id });
    console.log(`  [enrollment] Updated cohort_id to ${cohort.id} for ${KES_EMAIL}`);
  }

  console.log(`\nEnrollment: ${enrollmentCreated ? 'created' : 'already exists'} — ${KES_EMAIL} (${enrollment.id})`);

  // 4. Initialize LessonInstances (idempotent — skips if already initialized)
  try {
    await initializeParticipantCurriculum(enrollment.id);
    console.log('LessonInstances: initialized (or already existed)');
  } catch (err) {
    console.warn('initializeParticipantCurriculum warning:', (err as Error).message);
  }

  // 5. Login URL
  const token = enrollment.portal_token;
  const loginUrl = `http://localhost:${PORT}/portal/verify?token=${token}`;

  console.log('\n=== DEV LOGIN ===');
  console.log(`Login as ${KES_EMAIL}:`);
  console.log(loginUrl);
  console.log('\nExpect: 12 weeks in left sidebar, correct CTAs per week:');
  console.log('  W1–W3, W5–W8: "Open course on Skilljar"');
  console.log('  W4, W9–W11:   "Colaberry-original module"');
  console.log('  W12:           "Go to CCA-F exam" (green)');

  process.exit(0);
}

run().catch((err) => {
  console.error('[seedAcceleratorCurriculum] FATAL:', err.message);
  process.exit(1);
});
