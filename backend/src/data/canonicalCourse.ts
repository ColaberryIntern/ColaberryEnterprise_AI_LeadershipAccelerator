/**
 * Canonical Course Structure — AI Systems Architect Accelerator (12 weeks).
 *
 * Single source of truth for the ONE canonical course. This typed object is what
 * "passes into the curriculum types to speed creation" — the seed
 * (seeds/seedCanonicalCourse.ts) turns it into ProgramBlueprint + Cohort +
 * CurriculumModule + CurriculumLesson + LiveSession rows that the Curriculum
 * Composer, the Timeline, and the Experience Studio all read from.
 *
 * Design doc: docs/training-program-2026-q3/CANONICAL_COURSE_STRUCTURE.md
 *
 * This file is intentionally dependency-free (inline types, pure data) so it can be
 * type-checked and unit-tested in isolation.
 */

export const ANTHROPIC_ACADEMY_BASE = 'https://anthropic.skilljar.com/';

export function anthropicUrl(slug: string): string {
  return `${ANTHROPIC_ACADEMY_BASE}${slug}`;
}

export type AnthropicCourseStatus =
  | 'confirmed' // 1:1 Academy course, link verified
  | 'closest_fit' // no 1:1 course; nearest Academy course chosen
  | 'loose_fit' // weak Academy match; may be replaced by Colaberry content
  | 'colaberry_authored' // no Academy course; Colaberry builds the module
  | 'external_gate'; // no course; external certification gate (CCA-F exam)

/** The legacy 5-value skill_area enum on curriculum_modules. Kept for back-compat. */
export type SkillArea =
  | 'strategy_trust'
  | 'governance'
  | 'requirements'
  | 'build_discipline'
  | 'executive_authority';

export type LessonType = 'concept' | 'lab' | 'assessment' | 'reflection' | 'section';

export interface AnthropicCourseRef {
  title: string | null;
  slug: string | null;
  url: string | null;
  status: AnthropicCourseStatus;
}

/**
 * Colaberry-authored content outline for the weeks with no 1:1 Anthropic Academy
 * course (weeks 10-12). This is the human-authored spec that folds into the week's
 * section/lab/assessment lessons so the Composer treats an authored week like an
 * Academy-mapped one. Full prose outlines: docs/training-program-2026-q3/COLABERRY_AUTHORED_WEEKS_10-12.md
 */
export interface ColaberryModuleOutline {
  summary: string;
  learning_objectives: string[];
  key_points: string[];
  frameworks: string[]; // e.g. INPACT, GOALS, 7-Layer Architecture, Trust Band
  lab_spec: { goal: string; deliverable: string; steps: string[] };
  assessment_blueprint: { question_count: number; passing_score: number; covers: string[] };
  resources: { title: string; url?: string }[];
}

export interface WeekDef {
  week_number: number; // 1..12 (also the module_number)
  theme: string;
  skill_area: SkillArea;
  mon_date: string; // Architecture Day (core session), YYYY-MM-DD
  thu_date: string; // Build Day (lab session), YYYY-MM-DD
  anthropic: AnthropicCourseRef;
  colaberry_module?: ColaberryModuleOutline | null; // present only for authored weeks (10-12)
}

export interface IntensiveDef {
  intensive_number: 1 | 2 | 3 | 4;
  title: string;
  standalone_value: string;
  build_due: string; // YYYY-MM-DD (Thu of the intensive's last week)
  weeks: WeekDef[]; // exactly 3
}

export interface ProgramDef {
  name: string;
  description: string;
  goals: string[];
  target_persona: string;
  learning_philosophy: string;
  core_competency_domains: { domain_id: string; name: string; weight: number }[];
  default_prompt_injection_rules: { system_context: string; tone: string; audience_level: string };
}

export interface CohortDef {
  name: string;
  description: string;
  start_date: string; // YYYY-MM-DD (Monday)
  core_day: string;
  core_time: string;
  optional_lab_day: string;
  timezone: string;
  max_seats: number;
}

export interface CanonicalCourse {
  program: ProgramDef;
  cohort: CohortDef;
  intensives: IntensiveDef[]; // exactly 4
}

export interface WeeklyLessonDef {
  lesson_number: number;
  title: string;
  description: string;
  lesson_type: LessonType;
  estimated_minutes: number;
  requires_structured_input: boolean;
  completion_requirements: Record<string, unknown>;
  content_template_json: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Program (course) definition                                        */
/* ------------------------------------------------------------------ */

const program: ProgramDef = {
  name: 'AI Systems Architect Accelerator',
  description:
    'A 12-week, 4-intensive program that turns business technologists into AI Systems Architects. Each 3-week intensive is a stand-alone, stackable seminar built around an Anthropic Academy course, culminating in the Claude Certified Architect — Foundations (CCA-F) gate.',
  goals: [
    'Stand up a working Claude Code environment, a reusable Skills library, and a Workflow Assistant',
    'Build an enterprise Prompt Library and a coordinated multi-agent team',
    'Ship a working MCP server integrated with a real business system',
    'Establish a reliability + governance layer and a solution architecture package',
    'Pass the Claude Certified Architect — Foundations exam and present at the Architect Expo',
  ],
  target_persona:
    'Business technologists, senior ICs, and technical leaders (roughly 30-55) who will architect and lead AI systems, not just use them. Comfortable with tools; do not need to be full-time engineers.',
  learning_philosophy:
    'Learn by shipping. Every week pairs an Anthropic Academy course with a hands-on build, an assessment, a recorded demo, and a sign-off. Two live sessions per week: Monday Architecture Day, Thursday Build Day. Four stackable intensives, each with its own shippable deliverable.',
  core_competency_domains: [
    { domain_id: 'build_discipline', name: 'Build Discipline', weight: 1.0 },
    { domain_id: 'requirements', name: 'Requirements & Integration', weight: 0.9 },
    { domain_id: 'governance', name: 'Governance & Reliability', weight: 0.9 },
    { domain_id: 'executive_authority', name: 'Architecture & Authority', weight: 0.95 },
  ],
  default_prompt_injection_rules: {
    system_context:
      'You are the curriculum engine for the AI Systems Architect Accelerator. Learners build real AI systems with Claude Code, Agent Skills, the Claude API, MCP, and subagents across a 12-week, 4-intensive arc. Be concrete, build-oriented, and tie every concept to the week’s shippable deliverable.',
    tone: 'Practical, senior-engineer-to-architect. Precise, no hype. Show the build, not just the theory.',
    audience_level: 'Technical leaders and senior ICs becoming AI Systems Architects.',
  },
};

/* ------------------------------------------------------------------ */
/*  Cohort (first run of the course)                                   */
/* ------------------------------------------------------------------ */

const cohort: CohortDef = {
  name: 'Cohort 1 — July 2026',
  description:
    'First run of the AI Systems Architect Accelerator. 12 weeks, two live sessions per week (Mon Architecture Day, Thu Build Day).',
  start_date: '2026-07-13', // Monday
  core_day: 'Monday',
  core_time: '1:00–3:00 PM ET',
  optional_lab_day: 'Thursday',
  timezone: 'America/New_York',
  max_seats: 20,
};

/* ------------------------------------------------------------------ */
/*  Intensives × weeks (Anthropic Academy mapping)                     */
/* ------------------------------------------------------------------ */

const intensives: IntensiveDef[] = [
  {
    intensive_number: 1,
    title: 'Build Your AI Foundation',
    standalone_value: 'Working AI environment + Skills library + Workflow Assistant',
    build_due: '2026-07-30',
    weeks: [
      {
        week_number: 1,
        theme: 'Claude Code Foundations + Workspace',
        skill_area: 'build_discipline',
        mon_date: '2026-07-13',
        thu_date: '2026-07-16',
        anthropic: { title: 'Claude Code 101', slug: 'claude-code-101', url: anthropicUrl('claude-code-101'), status: 'confirmed' },
      },
      {
        week_number: 2,
        theme: 'Agent Skills (build 3 skills)',
        skill_area: 'build_discipline',
        mon_date: '2026-07-20',
        thu_date: '2026-07-23',
        anthropic: { title: 'Introduction to agent skills', slug: 'introduction-to-agent-skills', url: anthropicUrl('introduction-to-agent-skills'), status: 'confirmed' },
      },
      {
        week_number: 3,
        theme: 'Claude API + Workflow Assistant',
        skill_area: 'build_discipline',
        mon_date: '2026-07-27',
        thu_date: '2026-07-30',
        anthropic: { title: 'Building with the Claude API', slug: 'claude-with-the-anthropic-api', url: anthropicUrl('claude-with-the-anthropic-api'), status: 'confirmed' },
      },
    ],
  },
  {
    intensive_number: 2,
    title: 'Create Your AI Team',
    standalone_value: 'Enterprise Prompt Library + Multi-agent system + Coordination patterns',
    build_due: '2026-08-20',
    weeks: [
      {
        week_number: 4,
        theme: 'Prompt Engineering + Prompt Library',
        skill_area: 'requirements',
        mon_date: '2026-08-03',
        thu_date: '2026-08-06',
        anthropic: { title: 'Claude Platform 101 (closest fit — prompt eng also in Building with the Claude API)', slug: 'claude-platform-101', url: anthropicUrl('claude-platform-101'), status: 'closest_fit' },
      },
      {
        week_number: 5,
        theme: 'MCP Foundations + First MCP Server',
        skill_area: 'requirements',
        mon_date: '2026-08-10',
        thu_date: '2026-08-13',
        anthropic: { title: 'Introduction to Model Context Protocol', slug: 'introduction-to-model-context-protocol', url: anthropicUrl('introduction-to-model-context-protocol'), status: 'confirmed' },
      },
      {
        week_number: 6,
        theme: 'Advanced MCP + System Integration',
        skill_area: 'requirements',
        mon_date: '2026-08-17',
        thu_date: '2026-08-20',
        anthropic: { title: 'Model Context Protocol: Advanced Topics', slug: 'model-context-protocol-advanced-topics', url: anthropicUrl('model-context-protocol-advanced-topics'), status: 'confirmed' },
      },
    ],
  },
  {
    intensive_number: 3,
    title: 'Connect AI To The Real World',
    standalone_value: 'Working MCP server + Business system integration',
    build_due: '2026-09-10',
    weeks: [
      {
        week_number: 7,
        theme: 'Subagents + Multi-Agent Team',
        skill_area: 'build_discipline',
        mon_date: '2026-08-24',
        thu_date: '2026-08-27',
        anthropic: { title: 'Introduction to subagents', slug: 'introduction-to-subagents', url: anthropicUrl('introduction-to-subagents'), status: 'confirmed' },
      },
      {
        week_number: 8,
        theme: 'Claude Code Workflows + Automation',
        skill_area: 'build_discipline',
        mon_date: '2026-08-31',
        thu_date: '2026-09-03',
        anthropic: { title: 'Claude Code in Action', slug: 'claude-code-in-action', url: anthropicUrl('claude-code-in-action'), status: 'confirmed' },
      },
      {
        week_number: 9,
        theme: 'Reliability Engineering + Quality Layer',
        skill_area: 'governance',
        mon_date: '2026-09-07',
        thu_date: '2026-09-10',
        anthropic: { title: 'AI Capabilities and Limitations (loose fit; else Colaberry-authored)', slug: 'ai-capabilities-and-limitations', url: anthropicUrl('ai-capabilities-and-limitations'), status: 'loose_fit' },
      },
    ],
  },
  {
    intensive_number: 4,
    title: 'Design AI That Scales',
    standalone_value: 'Reliability Framework + Governance Engine + Solution Architecture Package',
    build_due: '2026-10-01',
    weeks: [
      {
        week_number: 10,
        theme: 'Governance + Governance Engine',
        skill_area: 'governance',
        mon_date: '2026-09-14',
        thu_date: '2026-09-17',
        anthropic: { title: 'Governance Engine (Colaberry-authored)', slug: null, url: null, status: 'colaberry_authored' },
        colaberry_module: {
          summary:
            'Wrap the system built in Intensives 1-3 in a Governance Engine: attribute-based access control (ABAC), human-in-the-loop (HITL) escalation, and an immutable audit trail. Governance is the trust layer that makes the system safe to run in production.',
          learning_objectives: [
            'Design a 5-factor ABAC policy (user, resource, action, context, risk) for an agentic system',
            'Define the categories of action that must escalate to a human, and the escalation path',
            'Instrument an audit trail that reconstructs any decision from a single correlation ID',
            'Score the system on the INPACT Permitted and Transparent dimensions and the GOALS Governance pillar',
          ],
          key_points: [
            'Governance-first, not governance-after: the engine gates actions before side effects fire',
            '5-factor ABAC with policy evaluation budget (<10ms) — see 7-Layer Architecture Layer 5',
            'Eight high-risk categories that force HITL escalation; target <15% escalation rate (INPACT Permitted)',
            'Audit trail = correlation IDs on every action, tool call, and write; redact secrets',
            'Idempotency + fail-closed defaults: an ungoverned action is a denied action',
          ],
          frameworks: ['GOALS (Governance)', 'INPACT (Permitted, Transparent)', '7-Layer Architecture (Layer 5)', 'Trust Band Scoring'],
          lab_spec: {
            goal: 'Ship a working Governance Engine over your Intensive-1-3 system',
            deliverable: 'A governance module (policy config + ABAC evaluator + HITL gate + audit log) demonstrably blocking a disallowed action and escalating a high-risk one',
            steps: [
              'Author an ABAC policy file for your system (roles, resources, allowed actions, risk tiers)',
              'Implement the policy evaluator as middleware / an MCP tool that runs before each side-effecting action',
              'Add a HITL escalation path for the high-risk categories (queue + approve/deny + resume)',
              'Instrument an audit log keyed on a correlation ID; redact secrets',
              'Prove it: show one blocked action, one escalated action, and the audit reconstruction',
            ],
          },
          assessment_blueprint: {
            question_count: 8,
            passing_score: 70,
            covers: ['ABAC design', 'HITL escalation categories', 'audit trail / correlation IDs', 'INPACT Permitted & Transparent', 'fail-closed defaults'],
          },
          resources: [
            { title: 'Colaberry: The Governance Engine Pattern (Layer 5)' },
            { title: 'INPACT framework — Permitted & Transparent dimensions' },
            { title: 'GOALS — Governance pillar reference' },
          ],
        },
      },
      {
        week_number: 11,
        theme: 'Systems Architecture + Arch Package',
        skill_area: 'requirements',
        mon_date: '2026-09-21',
        thu_date: '2026-09-24',
        anthropic: { title: 'Systems Architecture / CCA-Foundations (Colaberry-authored)', slug: null, url: null, status: 'colaberry_authored' },
        colaberry_module: {
          summary:
            'Assemble the Solution Architecture Package: map your system onto the 7-Layer reference architecture, document trust boundaries and data flow, capture architecture decision records (ADRs), and produce the INPACT / Trust Band scorecard. This is the CCA-Foundations deliverable set.',
          learning_objectives: [
            'Map a real agentic system onto the 7-Layer reference architecture',
            'Document trust boundaries, data flow, and failure/recovery paths for each layer',
            'Write architecture decision records (ADRs) that justify the key design choices',
            'Produce an INPACT composite + Trust Band scorecard for the finished system',
          ],
          key_points: [
            '7-Layer Architecture: Storage → Data Fabric → Semantic → Intelligence → Governance → Observability → Orchestration',
            'An architecture package is diagrams + decisions + evidence, not slides',
            'Trust boundaries: where untrusted input crosses into the system, and what validates it',
            'Reliability + governance from weeks 9-10 are layers in the package, not add-ons',
            'The package is the exhibit for the Architect Expo and the CCA-F portfolio',
          ],
          frameworks: ['7-Layer Architecture (full stack)', 'INPACT composite', 'Trust Band Scoring', 'GOALS (all five pillars)'],
          lab_spec: {
            goal: 'Produce the Solution Architecture Package for your system',
            deliverable: 'An architecture package: system + data-flow diagrams, a 7-layer mapping table, 5+ ADRs, and an INPACT/Trust Band scorecard',
            steps: [
              'Draw the system diagram and the request/data-flow diagram (mark trust boundaries)',
              'Fill the 7-layer mapping table: what your system does at each layer (or why a layer is N/A)',
              'Write ADRs for the 5 highest-stakes decisions (model choice, MCP boundaries, governance, storage, orchestration)',
              'Compute the INPACT composite and Trust Band position; note the top 3 gaps',
              'Package it into a single reviewable artifact (PDF/site) for the Expo',
            ],
          },
          assessment_blueprint: {
            question_count: 8,
            passing_score: 70,
            covers: ['7-layer mapping', 'trust boundaries', 'ADR quality', 'INPACT/Trust Band scoring', 'architecture documentation'],
          },
          resources: [
            { title: 'Colaberry: 7-Layer Reference Architecture' },
            { title: 'Architecture Decision Records (ADR) template' },
            { title: 'CCA — Foundations exam guide', url: 'https://claudecertifications.com/claude-certified-architect/exam-guide' },
          ],
        },
      },
      {
        week_number: 12,
        theme: 'Capstone + Architect Expo',
        skill_area: 'executive_authority',
        mon_date: '2026-09-28',
        thu_date: '2026-10-01',
        anthropic: { title: 'Claude Certified Architect — Foundations exam (external gate)', slug: null, url: 'https://claudecertifications.com/claude-certified-architect/exam-guide', status: 'external_gate' },
        colaberry_module: {
          summary:
            'Integrate everything into a capstone, present at the Architect Expo, and sit the Claude Certified Architect — Foundations (CCA-F) exam. The week is the external gate: pass the exam, present the system, submit the architecture package.',
          learning_objectives: [
            'Integrate the foundation, team, integration, reliability, governance, and architecture work into one capstone system',
            'Present the system and its architecture package to a panel at the Architect Expo',
            'Prepare for and pass the CCA-Foundations exam',
            'Position the system with executive authority: problem, architecture, evidence, roadmap',
          ],
          key_points: [
            'Capstone = the whole 12-week arc running end to end, governed and observable',
            'The Expo is a demo + defense: show the build, defend the decisions, cite the evidence',
            'CCA-F is the external certification gate — use the exam guide to close prep gaps',
            'Presentation structure: problem → architecture → live demo → trust/evidence → roadmap',
            'Graduation artifact = certification + architecture package + recorded Expo talk',
          ],
          frameworks: ['CCA-Foundations exam blueprint', 'INPACT composite', 'Trust Band Scoring', '7-Layer Architecture'],
          lab_spec: {
            goal: 'Finalize the capstone and present at the Architect Expo',
            deliverable: 'A live capstone demo, the finalized architecture package, a recorded Expo presentation, and a CCA-F exam attempt',
            steps: [
              'Freeze the capstone: end-to-end run with governance + observability on',
              'Complete CCA-F prep against the exam guide; take the practice assessment',
              'Build the Expo presentation (problem → architecture → demo → evidence → roadmap)',
              'Present at the Expo (Thu Build Day = the Expo); record it',
              'Sit the CCA-F exam and submit the architecture package',
            ],
          },
          assessment_blueprint: {
            question_count: 12,
            passing_score: 70,
            covers: ['CCA-F blueprint domains', 'end-to-end integration', 'architecture defense', 'trust evidence', 'executive positioning'],
          },
          resources: [
            { title: 'Claude Certified Architect — Foundations exam guide', url: 'https://claudecertifications.com/claude-certified-architect/exam-guide' },
            { title: 'Colaberry: Architect Expo presentation rubric' },
            { title: 'Capstone integration checklist' },
          ],
        },
      },
    ],
  },
];

export const CANONICAL_COURSE: CanonicalCourse = { program, cohort, intensives };

/** Flatten the 4×3 structure into 12 ordered weeks. */
export function allWeeks(course: CanonicalCourse = CANONICAL_COURSE): (WeekDef & { intensive: IntensiveDef })[] {
  return course.intensives.flatMap((intensive) =>
    intensive.weeks.map((week) => ({ ...week, intensive }))
  );
}

/**
 * The weekly 5-task checklist, built for a given week. Uses the existing lesson_type
 * enum so the Composer, gating engine, and skill-genome keep working unchanged.
 */
export function buildWeeklyLessons(week: WeekDef): WeeklyLessonDef[] {
  const authored = week.colaberry_module ?? null;
  const courseLabel = week.anthropic.title || `Week ${week.week_number} module`;
  const sectionTitle =
    week.anthropic.status === 'colaberry_authored' || week.anthropic.status === 'external_gate'
      ? `Module: ${courseLabel}`
      : `Anthropic Academy: ${courseLabel}`;

  const sectionDescription = authored
    ? authored.summary
    : week.anthropic.url
      ? `Complete the mapped course, then note how it applies to your build: ${week.anthropic.url}`
      : `Complete the Colaberry-authored module for "${week.theme}".`;

  const assessment = authored?.assessment_blueprint ?? { question_count: 8, passing_score: 70, covers: [] as string[] };

  return [
    {
      lesson_number: 1,
      title: sectionTitle,
      description: sectionDescription,
      lesson_type: 'section',
      estimated_minutes: 45,
      requires_structured_input: false,
      completion_requirements: authored ? { module_complete: true } : { external_course_ack: true },
      content_template_json: {
        content_version: 'canonical-v1',
        week_number: week.week_number,
        theme: week.theme,
        anthropic_course: week.anthropic,
        colaberry_module: authored,
        learning_objectives: authored?.learning_objectives ?? null,
        key_points: authored?.key_points ?? null,
        frameworks: authored?.frameworks ?? null,
      },
    },
    {
      lesson_number: 2,
      title: `Lab: ${week.theme}`,
      description: authored
        ? `${authored.lab_spec.goal}. Deliverable: ${authored.lab_spec.deliverable}.`
        : `Hands-on build that produces this week's artifact for "${week.theme}".`,
      lesson_type: 'lab',
      estimated_minutes: 60,
      requires_structured_input: true,
      completion_requirements: { artifact_submitted: true },
      content_template_json: {
        content_version: 'canonical-v1',
        week_number: week.week_number,
        theme: week.theme,
        lab_spec: authored?.lab_spec ?? null,
      },
    },
    {
      lesson_number: 3,
      title: `Assessment: ${week.theme}`,
      description: `Knowledge check for week ${week.week_number}. ${assessment.passing_score}% to pass.`,
      lesson_type: 'assessment',
      estimated_minutes: 20,
      requires_structured_input: false,
      completion_requirements: { quiz_pass_score: assessment.passing_score },
      content_template_json: {
        content_version: 'canonical-v1',
        week_number: week.week_number,
        question_count: assessment.question_count,
        passing_score: assessment.passing_score,
        covers: assessment.covers,
      },
    },
    {
      lesson_number: 4,
      title: 'Build Video / Demo',
      description: 'Record a short demo of this week’s build and what it does.',
      lesson_type: 'reflection',
      estimated_minutes: 15,
      requires_structured_input: true,
      completion_requirements: { video_submitted: true },
      content_template_json: { content_version: 'canonical-v1', week_number: week.week_number, artifact_type: 'video' },
    },
    {
      lesson_number: 5,
      title: 'Weekly Sign-off',
      description: 'Self/instructor sign-off that gates the next week.',
      lesson_type: 'reflection',
      estimated_minutes: 10,
      requires_structured_input: false,
      completion_requirements: { signoff: true },
      content_template_json: { content_version: 'canonical-v1', week_number: week.week_number, gate: 'weekly_signoff' },
    },
  ];
}
