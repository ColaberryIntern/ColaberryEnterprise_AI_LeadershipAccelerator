import { Cohort } from '../models';
import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';
import LiveSession from '../models/LiveSession';
import SkillDefinition from '../models/SkillDefinition';
import ontology from '../data/ontology.json';

/* ------------------------------------------------------------------ */
/*  Module + Section definitions (5 modules, 25 unified sections)     */
/* ------------------------------------------------------------------ */

const modules = [
  {
    module_number: 1,
    title: 'AI Strategy & Trust Discipline',
    description: 'Build the strategic case for AI in your organization. Assess AI maturity, identify high-impact opportunities, and establish trust frameworks that enable responsible adoption.',
    skill_area: 'strategy_trust' as const,
    lessons: [
      {
        lesson_number: 1, title: 'Executive AI Reality Check',
        description: 'Cut through the hype. Understand what AI can and cannot do for your organization today, and why executive AI fluency is now a competitive requirement.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'executive_ai_reality', skill_area: 'strategy_trust', key_points: ['AI capabilities vs hype', 'competitive pressure', 'cost of inaction', 'executive fluency imperative'], personalize_by: ['industry', 'company_size', 'ai_maturity_level'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 2, title: 'Trust Before Intelligence Framework',
        description: 'Learn why trust architecture must precede AI deployment. Understand the governance-first approach that separates successful AI initiatives from failed ones.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'trust_framework', skill_area: 'strategy_trust', key_points: ['trust as prerequisite', 'governance-first approach', 'stakeholder confidence', 'failure patterns without trust'], personalize_by: ['industry', 'role', 'identified_use_case'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 3, title: 'Identifying Responsible AI Opportunities',
        description: 'Framework for scoring AI opportunities by business impact, data readiness, risk profile, and organizational readiness. Prioritize your top candidates.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'opportunity_identification', skill_area: 'strategy_trust', key_points: ['opportunity scoring framework', 'business impact assessment', 'data readiness', 'risk profile evaluation'], personalize_by: ['industry', 'company_name', 'goal'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 4, title: 'Industry-Specific AI Applications',
        description: 'Deep dive into AI applications relevant to your specific industry. Real case studies, common patterns, and lessons learned from organizations like yours.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'industry_applications', skill_area: 'strategy_trust', key_points: ['industry-specific use cases', 'case studies', 'common patterns', 'lessons learned'], personalize_by: ['industry', 'company_name', 'company_size', 'internal_systems'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 5, title: 'Strategy & Trust: Synthesis & Application',
        description: "Apply everything you've learned. Map your organization's highest-priority AI opportunity and build your strategic trust framework.",
        lesson_type: 'section' as const, estimated_minutes: 35, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'strategy_trust_synthesis', skill_area: 'strategy_trust', key_points: ['opportunity mapping', 'trust framework application', 'strategic case building', 'readiness assessment'], personalize_by: ['industry', 'company_name', 'goal', 'identified_use_case'], industry_examples: true, question_count: 4, reflection_prompts: ['What is your highest-priority AI opportunity?', 'What trust gaps must you address first?'] },
      },
    ],
  },
  {
    module_number: 2,
    title: 'Governance & Risk Architecture',
    description: 'Design the governance framework that makes AI safe and trustworthy. Classify risks, build guardrails, and create human-in-the-loop controls.',
    skill_area: 'governance' as const,
    lessons: [
      {
        lesson_number: 1, title: 'AI Risk Taxonomy',
        description: 'Understand the landscape of AI risks: technical failures, data risks, ethical concerns, regulatory exposure, and reputational threats.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'risk_taxonomy', skill_area: 'governance', key_points: ['technical risks', 'data risks', 'ethical concerns', 'regulatory exposure', 'reputational threats'], personalize_by: ['industry', 'identified_use_case'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 2, title: 'Data Classification & Sensitivity',
        description: 'Learn to classify data by sensitivity level and understand what data can and cannot be used with AI systems in your regulatory context.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'data_classification', skill_area: 'governance', key_points: ['sensitivity levels', 'PII/PHI handling', 'regulatory requirements', 'data minimization'], personalize_by: ['industry', 'company_name'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 3, title: 'Failure Modes & Guardrails',
        description: 'Design for failure. Understand common AI failure modes and build guardrails that prevent, detect, and recover from errors.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'failure_modes_guardrails', skill_area: 'governance', key_points: ['hallucination patterns', 'edge case failures', 'cascading errors', 'guardrail design', 'monitoring triggers'], personalize_by: ['industry', 'identified_use_case'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 4, title: 'Human-in-the-Loop Design',
        description: 'Design effective human oversight patterns. When humans must intervene, how to make handoffs seamless, and avoiding automation complacency.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'human_in_the_loop', skill_area: 'governance', key_points: ['oversight patterns', 'intervention triggers', 'handoff design', 'automation complacency', 'escalation paths'], personalize_by: ['industry', 'role', 'identified_use_case'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 5, title: 'Governance: Blueprint & Application',
        description: 'Build a governance blueprint for your AI initiative. Define data policies, risk controls, monitoring plans, and override triggers.',
        lesson_type: 'section' as const, estimated_minutes: 35, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'governance_blueprint', skill_area: 'governance', key_points: ['data governance policies', 'risk control framework', 'monitoring & alerting', 'override triggers', 'audit trail design'], personalize_by: ['industry', 'company_name', 'identified_use_case'], industry_examples: true, question_count: 4, reflection_prompts: ['What is the highest-risk aspect of your AI initiative?', 'How will you ensure human oversight without creating bottlenecks?'] },
      },
    ],
  },
  {
    module_number: 3,
    title: 'Requirements & Use Case Precision',
    description: 'Translate business goals into precise system requirements. Define inputs, outputs, decision flows, edge cases, and success criteria.',
    skill_area: 'requirements' as const,
    lessons: [
      {
        lesson_number: 1, title: 'Translating Business Goals into System Requirements',
        description: 'Bridge the gap between "what we want" and "what we need to build". Learn to decompose business objectives into testable system requirements.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'business_to_requirements', skill_area: 'requirements', key_points: ['goal decomposition', 'requirement types', 'acceptance criteria', 'scope boundaries'], personalize_by: ['industry', 'identified_use_case', 'goal'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 2, title: 'Input / Output Mapping',
        description: 'Define exactly what goes in and what comes out. Map data sources, transformations, and output formats for your AI system.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'io_mapping', skill_area: 'requirements', key_points: ['input sources', 'data transformations', 'output formats', 'validation rules'], personalize_by: ['industry', 'identified_use_case', 'internal_systems'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 3, title: 'Decision Flow Modeling',
        description: 'Model the decision logic your AI system must follow. Define branching paths, conditional rules, and escalation triggers.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'decision_flow', skill_area: 'requirements', key_points: ['decision trees', 'branching logic', 'conditional rules', 'escalation paths'], personalize_by: ['industry', 'identified_use_case'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 4, title: 'Edge Case & Failure State Design',
        description: 'Anticipate what can go wrong. Design for edge cases, define failure states, and build recovery paths.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'edge_cases', skill_area: 'requirements', key_points: ['edge case identification', 'failure state taxonomy', 'recovery paths', 'graceful degradation'], personalize_by: ['industry', 'identified_use_case'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 5, title: 'Requirements: Document Builder & Synthesis',
        description: 'Build a complete requirements document for your AI initiative. Synthesize inputs, outputs, decision flows, and edge cases into a coherent specification.',
        lesson_type: 'section' as const, estimated_minutes: 35, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'requirements_synthesis', skill_area: 'requirements', key_points: ['requirements document structure', 'traceability matrix', 'validation checklist', 'stakeholder sign-off'], personalize_by: ['industry', 'company_name', 'identified_use_case'], industry_examples: true, question_count: 4, reflection_prompts: ['What requirement is most likely to be misunderstood by your team?', 'How will you validate your requirements against real user needs?'] },
      },
    ],
  },
  {
    module_number: 4,
    title: 'The 3-Agent System & Controlled Build',
    description: 'Learn the Planner-Builder-Reviewer pattern for controlled AI development. Build with discipline: one step at a time, with verification at every stage.',
    skill_area: 'build_discipline' as const,
    lessons: [
      {
        lesson_number: 1, title: 'Separation of Roles',
        description: 'Understand why separating planning, execution, and review is critical for AI systems.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'role_separation', skill_area: 'build_discipline', key_points: ['3-agent pattern', 'planner role', 'builder role', 'reviewer role'], personalize_by: ['industry', 'identified_use_case'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 2, title: 'Planner vs Executor',
        description: 'Deep dive into the distinction between planning and execution. Why AI systems fail when these roles are combined.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'planner_vs_executor', skill_area: 'build_discipline', key_points: ['planning discipline', 'execution boundaries', 'task decomposition', 'scope control'], personalize_by: ['industry', 'role'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 3, title: 'One-Step Task Discipline',
        description: 'The discipline of doing one thing at a time. Break complex AI tasks into atomic, verifiable steps.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'one_step_discipline', skill_area: 'build_discipline', key_points: ['atomic tasks', 'verifiable steps', 'independent validation', 'rollback capability'], personalize_by: ['industry', 'identified_use_case'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 4, title: 'Verification & Evidence Gating',
        description: 'Every step must produce evidence. Learn to design verification gates that ensure quality before proceeding.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'verification_gating', skill_area: 'build_discipline', key_points: ['evidence requirements', 'quality gates', 'verification patterns', 'automated checks'], personalize_by: ['industry', 'identified_use_case'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 5, title: 'Controlled Build: Simulation & Application',
        description: 'Design a controlled build plan for your AI initiative. Define build steps, verification evidence, and rollback plans.',
        lesson_type: 'section' as const, estimated_minutes: 35, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'controlled_build_simulation', skill_area: 'build_discipline', key_points: ['build plan design', 'step verification', 'rollback planning', 'quality gate enforcement'], personalize_by: ['industry', 'company_name', 'identified_use_case'], industry_examples: true, question_count: 4, reflection_prompts: ['What is the riskiest step in your build plan?', 'How will you ensure each step produces verifiable evidence?'] },
      },
    ],
  },
  {
    module_number: 5,
    title: 'Internal Sell & 90-Day Roadmap',
    description: 'Build your executive presentation, ROI framework, and 90-day expansion roadmap. Prepare to demonstrate and scale your AI initiative.',
    skill_area: 'executive_authority' as const,
    lessons: [
      {
        lesson_number: 1, title: 'Selling AI Internally',
        description: 'Craft a compelling internal narrative for AI adoption. Map stakeholders, handle objections, and build coalitions.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'internal_sell', skill_area: 'executive_authority', key_points: ['stakeholder mapping', 'objection handling', 'coalition building', 'narrative framing'], personalize_by: ['industry', 'company_name', 'role', 'goal'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 2, title: 'Governance Communication',
        description: 'Communicate AI governance to non-technical stakeholders. Translate risk frameworks into confidence-building narratives.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'governance_communication', skill_area: 'executive_authority', key_points: ['non-technical translation', 'confidence building', 'risk communication', 'transparency frameworks'], personalize_by: ['industry', 'role', 'company_name'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 3, title: 'ROI Framing',
        description: 'Build a defensible ROI model for your AI initiative. Quantify cost savings, revenue impact, and risk reduction.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'roi_framing', skill_area: 'executive_authority', key_points: ['cost savings quantification', 'revenue impact', 'risk reduction value', 'time-to-value metrics'], personalize_by: ['industry', 'company_name', 'company_size', 'identified_use_case'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 4, title: 'Scaling Strategy',
        description: 'Plan the path from POC to organization-wide deployment. Team enablement, infrastructure scaling, and governance layering.',
        lesson_type: 'section' as const, estimated_minutes: 30, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'scaling_strategy', skill_area: 'executive_authority', key_points: ['POC to production', 'team enablement', 'infrastructure scaling', 'governance layering'], personalize_by: ['industry', 'company_name', 'company_size'], industry_examples: true, question_count: 3 },
      },
      {
        lesson_number: 5, title: '90-Day Roadmap & Executive Demo',
        description: 'Build your post-program roadmap and prepare your executive demonstration. Synthesize everything into an actionable plan.',
        lesson_type: 'section' as const, estimated_minutes: 35, requires_structured_input: false, structured_fields_schema: null,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: { content_version: 'v2', topic: 'roadmap_and_demo', skill_area: 'executive_authority', key_points: ['90-day phased roadmap', 'executive presentation structure', 'demo preparation', 'success metrics'], personalize_by: ['industry', 'company_name', 'company_size', 'identified_use_case', 'goal'], industry_examples: true, question_count: 4, reflection_prompts: ['What is the single most compelling outcome from your POC?', 'What objection do you expect from your stakeholders?', 'How will you measure success in the first 30 days?'] },
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Live Session definitions (5 sessions)                             */
/* ------------------------------------------------------------------ */

function buildSessions(cohortId: string) {
  return [
    { cohort_id: cohortId, session_number: 1, title: 'The Enterprise AI Mandate', description: "Why AI leadership matters now. Assess your organization's AI maturity, identify high-impact use cases, and build the strategic case.", session_date: '2026-04-02', start_time: '1:00 PM', end_time: '3:00 PM', session_type: 'core' as const, status: 'scheduled' as const, curriculum_json: [ { title: 'The AI Leadership Imperative', description: 'Why every executive needs AI fluency now.', duration_minutes: 20 }, { title: 'AI Maturity Assessment', description: 'Evaluate where your organization stands on the AI maturity curve.', duration_minutes: 25 }, { title: 'Identifying High-Impact Use Cases', description: 'Framework for scoring AI opportunities.', duration_minutes: 30 }, { title: 'Building the Strategic Case', description: 'Craft a compelling 1-page AI Initiative Brief.', duration_minutes: 25 }, { title: 'Cohort Introductions & Use Case Sharing', description: 'Share your AI challenge and get peer feedback.', duration_minutes: 20 } ], materials_json: [ { title: 'AI Maturity Assessment Template', type: 'template' }, { title: 'Use Case Prioritization Scorecard', type: 'template' }, { title: 'AI Initiative Brief Template', type: 'template' }, { title: 'Session 1 Slides', type: 'slide' } ] },
    { cohort_id: cohortId, session_number: 2, title: 'Architecture & the 3-Agent System', description: 'Hands-on lab: Set up Claude Code, learn the 3-agent pattern, and build your first working AI agent.', session_date: '2026-04-07', start_time: '1:00 PM', end_time: '3:00 PM', session_type: 'lab' as const, status: 'scheduled' as const, curriculum_json: [ { title: 'Claude Code Environment Setup', description: 'Install and configure Claude Code.', duration_minutes: 20 }, { title: 'The 3-Agent Architecture Pattern', description: 'Deep dive into the Planner-Builder-Reviewer pattern.', duration_minutes: 25 }, { title: 'Building Your First Agent', description: 'Create a working Planner agent.', duration_minutes: 30 }, { title: 'Agent Communication & Orchestration', description: 'How agents pass context and validate outputs.', duration_minutes: 25 }, { title: 'Quality Gates & the Reviewer Agent', description: 'Add automated review and quality checks.', duration_minutes: 20 } ], materials_json: [ { title: 'Claude Code Setup Guide', type: 'reading' }, { title: '3-Agent Architecture Reference', type: 'reading' }, { title: 'Starter Repository (GitHub)', type: 'tool' }, { title: 'Session 2 Slides', type: 'slide' } ] },
    { cohort_id: cohortId, session_number: 3, title: 'Guided POC Launch', description: 'Scope and launch your AI Proof of Capability. Connect real data, build production-ready workflows.', session_date: '2026-04-09', start_time: '1:00 PM', end_time: '3:00 PM', session_type: 'core' as const, status: 'scheduled' as const, curriculum_json: [ { title: 'POC Scoping Workshop', description: 'Narrow your use case to a demonstrable proof of capability.', duration_minutes: 25 }, { title: 'Data Integration Strategies', description: 'Connect your AI agents to real organizational data.', duration_minutes: 25 }, { title: 'Building Production-Ready Workflows', description: 'Error handling, retry logic, logging, output validation.', duration_minutes: 25 }, { title: 'Success Metrics & Measurement', description: 'Define KPIs for your POC.', duration_minutes: 20 }, { title: 'Peer Review & Checkpoint', description: 'Present your POC plan to a peer group.', duration_minutes: 25 } ], materials_json: [ { title: 'POC Scoping Canvas', type: 'template' }, { title: 'Data Integration Playbook', type: 'reading' }, { title: 'Success Metrics Framework', type: 'template' }, { title: 'Session 3 Slides', type: 'slide' } ] },
    { cohort_id: cohortId, session_number: 4, title: 'Refinement & Executive Positioning', description: 'Harden your POC, build your executive narrative, and prepare a compelling ROI-driven presentation.', session_date: '2026-04-14', start_time: '1:00 PM', end_time: '3:00 PM', session_type: 'lab' as const, status: 'scheduled' as const, curriculum_json: [ { title: 'POC Hardening & Edge Cases', description: 'Stress-test your proof of capability.', duration_minutes: 25 }, { title: 'The Executive AI Narrative', description: 'Craft a story that resonates with C-suite audiences.', duration_minutes: 25 }, { title: 'ROI Framework & Business Case', description: 'Build a defensible ROI model.', duration_minutes: 25 }, { title: 'Executive Deck Structure', description: 'Build your presentation: problem, solution, demo, results, roadmap.', duration_minutes: 25 }, { title: 'Dry Run & Peer Feedback', description: 'Present your draft deck to peers.', duration_minutes: 20 } ], materials_json: [ { title: 'Executive Presentation Template', type: 'template' }, { title: 'ROI Calculator Spreadsheet', type: 'template' }, { title: 'Presentation Feedback Rubric', type: 'template' }, { title: 'Session 4 Slides', type: 'slide' } ] },
    { cohort_id: cohortId, session_number: 5, title: 'Executive Demonstrations — Demo Day', description: 'Present your AI Proof of Capability to the cohort. Live demos, executive feedback, graduation.', session_date: '2026-04-16', start_time: '1:00 PM', end_time: '3:00 PM', session_type: 'core' as const, status: 'scheduled' as const, curriculum_json: [ { title: 'Live Executive Demonstrations', description: 'Each participant presents their AI POC.', duration_minutes: 60 }, { title: 'Peer & Instructor Feedback', description: 'Structured feedback rounds.', duration_minutes: 20 }, { title: '90-Day AI Expansion Roadmap', description: 'Plan your post-program path.', duration_minutes: 20 }, { title: 'Lessons Learned & Best Practices', description: 'Cohort retrospective.', duration_minutes: 10 }, { title: 'Graduation & Next Steps', description: 'Certificates, alumni community, ongoing resources.', duration_minutes: 10 } ], materials_json: [ { title: '90-Day Roadmap Template', type: 'template' }, { title: 'Executive Evaluation Rubric', type: 'template' }, { title: 'AI Scaling Playbook', type: 'reading' }, { title: 'Session 5 Slides', type: 'slide' } ] },
  ];
}

/* ------------------------------------------------------------------ */
/*  Main seed function — idempotent, safe to run every startup        */
/* ------------------------------------------------------------------ */

export async function seedProgramCurriculum(): Promise<void> {
  // Find or create first cohort
  const cohort = await Cohort.findOne({ order: [['created_at', 'ASC']] });
  if (!cohort) {
    console.log('[Seed] No cohort found — skipping curriculum seed');
    return;
  }

  const cohortId = cohort.id;
  let modulesCreated = 0, lessonsCreated = 0, sessionsCreated = 0, skillsCreated = 0;

  // --- Seed Modules + Lessons ---
  for (const moduleDef of modules) {
    const [mod, modCreated] = await CurriculumModule.findOrCreate({
      where: { cohort_id: cohortId, module_number: moduleDef.module_number },
      defaults: {
        cohort_id: cohortId,
        module_number: moduleDef.module_number,
        title: moduleDef.title,
        description: moduleDef.description,
        skill_area: moduleDef.skill_area,
        total_lessons: moduleDef.lessons.length,
        unlock_rule: 'sequential',
      },
    });

    if (!modCreated) {
      await mod.update({
        title: moduleDef.title, description: moduleDef.description,
        skill_area: moduleDef.skill_area, total_lessons: moduleDef.lessons.length,
      });
    } else {
      modulesCreated++;
    }

    for (const lessonDef of moduleDef.lessons) {
      const [, lessonCreated] = await CurriculumLesson.findOrCreate({
        where: { module_id: mod.id, lesson_number: lessonDef.lesson_number },
        defaults: {
          module_id: mod.id,
          lesson_number: lessonDef.lesson_number,
          title: lessonDef.title,
          description: lessonDef.description,
          lesson_type: lessonDef.lesson_type,
          estimated_minutes: lessonDef.estimated_minutes,
          requires_structured_input: lessonDef.requires_structured_input,
          structured_fields_schema: lessonDef.structured_fields_schema,
          content_template_json: lessonDef.content_template_json,
          completion_requirements: lessonDef.completion_requirements,
        },
      });

      if (!lessonCreated) {
        // Update in case content changed
        await CurriculumLesson.update(
          {
            title: lessonDef.title, description: lessonDef.description,
            lesson_type: lessonDef.lesson_type, estimated_minutes: lessonDef.estimated_minutes,
            requires_structured_input: lessonDef.requires_structured_input,
            structured_fields_schema: lessonDef.structured_fields_schema,
            content_template_json: lessonDef.content_template_json,
            completion_requirements: lessonDef.completion_requirements,
          },
          { where: { module_id: mod.id, lesson_number: lessonDef.lesson_number } }
        );
      } else {
        lessonsCreated++;
      }
    }

    // Clean up old lesson 6 (assessment/lab) if it exists from previous seed
    await CurriculumLesson.destroy({
      where: { module_id: mod.id, lesson_number: 6 },
    });
  }

  // --- Seed Live Sessions ---
  const sessionDefs = buildSessions(cohortId);
  for (const sessionData of sessionDefs) {
    const [, created] = await LiveSession.findOrCreate({
      where: { cohort_id: cohortId, session_number: sessionData.session_number },
      defaults: sessionData as any,
    });

    if (!created) {
      await LiveSession.update(
        { title: sessionData.title, description: sessionData.description, curriculum_json: sessionData.curriculum_json, materials_json: sessionData.materials_json },
        { where: { cohort_id: cohortId, session_number: sessionData.session_number } }
      );
    } else {
      sessionsCreated++;
    }
  }

  // --- Seed Skill Definitions from ontology ---
  for (const layer of (ontology as any).layers) {
    for (const domain of layer.domains) {
      for (const skill of domain.skills) {
        const [, created] = await SkillDefinition.findOrCreate({
          where: { skill_id: skill.id },
          defaults: {
            layer_id: layer.id,
            domain_id: domain.id,
            skill_id: skill.id,
            name: skill.name,
            description: skill.description,
            weights: { proficiency_levels: skill.proficiency_levels, prerequisites: skill.prerequisites },
            mastery_threshold: 0.7,
            is_active: true,
          },
        });

        if (!created) {
          await SkillDefinition.update(
            { name: skill.name, description: skill.description, layer_id: layer.id, domain_id: domain.id, weights: { proficiency_levels: skill.proficiency_levels, prerequisites: skill.prerequisites } },
            { where: { skill_id: skill.id } }
          );
        } else {
          skillsCreated++;
        }
      }
    }
  }

  console.log(`[Seed] Curriculum: ${modulesCreated} modules, ${lessonsCreated} sections, ${sessionsCreated} sessions, ${skillsCreated} skills (cohort: ${cohort.name})`);
}
