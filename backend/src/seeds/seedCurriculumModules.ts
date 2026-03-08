import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { Cohort } from '../models';
import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';

interface LessonDef {
  lesson_number: number;
  title: string;
  description: string;
  lesson_type: 'concept' | 'lab' | 'assessment' | 'reflection';
  estimated_minutes: number;
  requires_structured_input: boolean;
  structured_fields_schema?: any;
  content_template_json: any;
}

interface ModuleDef {
  module_number: number;
  title: string;
  description: string;
  skill_area: 'strategy_trust' | 'governance' | 'requirements' | 'build_discipline' | 'executive_authority';
  lessons: LessonDef[];
}

const modules: ModuleDef[] = [
  {
    module_number: 1,
    title: 'AI Strategy & Trust Discipline',
    description: 'Build the strategic case for AI in your organization. Assess AI maturity, identify high-impact opportunities, and establish trust frameworks that enable responsible adoption.',
    skill_area: 'strategy_trust',
    lessons: [
      {
        lesson_number: 1,
        title: 'Executive AI Reality Check',
        description: 'Cut through the hype. Understand what AI can and cannot do for your organization today, and why executive AI fluency is now a competitive requirement.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'executive_ai_reality',
          key_points: ['AI capabilities vs hype', 'competitive pressure', 'cost of inaction', 'executive fluency imperative'],
          personalize_by: ['industry', 'company_size', 'ai_maturity_level'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 2,
        title: 'Trust Before Intelligence Framework',
        description: 'Learn why trust architecture must precede AI deployment. Understand the governance-first approach that separates successful AI initiatives from failed ones.',
        lesson_type: 'concept',
        estimated_minutes: 30,
        requires_structured_input: false,
        content_template_json: {
          topic: 'trust_framework',
          key_points: ['trust as prerequisite', 'governance-first approach', 'stakeholder confidence', 'failure patterns without trust'],
          personalize_by: ['industry', 'role', 'identified_use_case'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 3,
        title: 'Identifying Responsible AI Opportunities',
        description: 'Framework for scoring AI opportunities by business impact, data readiness, risk profile, and organizational readiness. Prioritize your top candidates.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'opportunity_identification',
          key_points: ['opportunity scoring framework', 'business impact assessment', 'data readiness', 'risk profile evaluation'],
          personalize_by: ['industry', 'company_name', 'goal'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 4,
        title: 'Industry-Specific AI Applications',
        description: 'Deep dive into AI applications relevant to your specific industry. Real case studies, common patterns, and lessons learned from organizations like yours.',
        lesson_type: 'concept',
        estimated_minutes: 30,
        requires_structured_input: false,
        content_template_json: {
          topic: 'industry_applications',
          key_points: ['industry-specific use cases', 'case studies', 'common patterns', 'lessons learned'],
          personalize_by: ['industry', 'company_name', 'company_size', 'internal_systems'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 5,
        title: 'Assessment: Strategy & Trust Readiness',
        description: 'Test your understanding of AI strategy fundamentals, trust frameworks, and opportunity identification.',
        lesson_type: 'assessment',
        estimated_minutes: 20,
        requires_structured_input: false,
        content_template_json: {
          topic: 'strategy_trust_assessment',
          question_count: 10,
          question_types: ['multiple_choice', 'scenario_based'],
          covers: ['ai_reality', 'trust_framework', 'opportunity_scoring', 'industry_applications'],
          passing_score: 70,
        },
      },
      {
        lesson_number: 6,
        title: 'Lab: Opportunity Mapping Form',
        description: 'Map your organization\'s highest-priority AI opportunity using the structured scoring framework. This data feeds directly into your AI Project Architect.',
        lesson_type: 'lab',
        estimated_minutes: 40,
        requires_structured_input: true,
        structured_fields_schema: {
          fields: [
            { name: 'business_unit', label: 'Business Unit / Department', type: 'text', required: true, placeholder: 'e.g., Customer Service, Finance, Operations' },
            { name: 'manual_process', label: 'Manual Process to Automate', type: 'textarea', required: true, placeholder: 'Describe the current manual workflow in detail' },
            { name: 'pain_severity', label: 'Pain Severity (1-5)', type: 'select', required: true, options: ['1 - Minor inconvenience', '2 - Moderate friction', '3 - Significant burden', '4 - Major bottleneck', '5 - Critical blocker'] },
            { name: 'decision_type', label: 'Decision Type', type: 'select', required: true, options: ['Routine/Repetitive', 'Semi-structured', 'Complex/Judgment-based'] },
            { name: 'human_override', label: 'Human Override Requirements', type: 'textarea', required: true, placeholder: 'When must a human review or approve the AI output?' },
            { name: 'success_metric', label: 'Primary Success Metric', type: 'text', required: true, placeholder: 'e.g., 50% reduction in processing time' },
            { name: 'risk_impact', label: 'Risk Impact if AI Fails', type: 'select', required: true, options: ['Low - easily recoverable', 'Medium - requires manual correction', 'High - significant business impact', 'Critical - regulatory or safety concern'] },
          ],
        },
        content_template_json: {
          topic: 'opportunity_mapping_lab',
          personalize_by: ['industry', 'company_name', 'goal', 'ai_maturity_level'],
          provide_examples: true,
        },
      },
    ],
  },
  {
    module_number: 2,
    title: 'Governance & Risk Architecture',
    description: 'Design the governance framework that makes AI safe and trustworthy. Classify risks, build guardrails, and create human-in-the-loop controls.',
    skill_area: 'governance',
    lessons: [
      {
        lesson_number: 1,
        title: 'AI Risk Taxonomy',
        description: 'Understand the landscape of AI risks: technical failures, data risks, ethical concerns, regulatory exposure, and reputational threats.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'risk_taxonomy',
          key_points: ['technical risks', 'data risks', 'ethical concerns', 'regulatory exposure', 'reputational threats'],
          personalize_by: ['industry', 'identified_use_case'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 2,
        title: 'Data Classification & Sensitivity',
        description: 'Learn to classify data by sensitivity level and understand what data can and cannot be used with AI systems in your regulatory context.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'data_classification',
          key_points: ['sensitivity levels', 'PII/PHI handling', 'regulatory requirements', 'data minimization'],
          personalize_by: ['industry', 'company_name'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 3,
        title: 'Failure Modes & Guardrails',
        description: 'Design for failure. Understand common AI failure modes and build guardrails that prevent, detect, and recover from errors.',
        lesson_type: 'concept',
        estimated_minutes: 30,
        requires_structured_input: false,
        content_template_json: {
          topic: 'failure_modes_guardrails',
          key_points: ['hallucination patterns', 'edge case failures', 'cascading errors', 'guardrail design', 'monitoring triggers'],
          personalize_by: ['industry', 'identified_use_case'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 4,
        title: 'Human-in-the-Loop Design',
        description: 'Design effective human oversight patterns. When humans must intervene, how to make handoffs seamless, and avoiding automation complacency.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'human_in_the_loop',
          key_points: ['oversight patterns', 'intervention triggers', 'handoff design', 'automation complacency', 'escalation paths'],
          personalize_by: ['industry', 'role', 'identified_use_case'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 5,
        title: 'Assessment: Governance Readiness',
        description: 'Test your understanding of risk classification, data governance, guardrail design, and human oversight patterns.',
        lesson_type: 'assessment',
        estimated_minutes: 20,
        requires_structured_input: false,
        content_template_json: {
          topic: 'governance_assessment',
          question_count: 10,
          question_types: ['multiple_choice', 'scenario_based'],
          covers: ['risk_taxonomy', 'data_classification', 'guardrails', 'human_oversight'],
          passing_score: 70,
        },
      },
      {
        lesson_number: 6,
        title: 'Lab: Governance Risk Blueprint',
        description: 'Build a governance blueprint for your AI initiative. Define data policies, risk controls, monitoring plans, and override triggers.',
        lesson_type: 'lab',
        estimated_minutes: 45,
        requires_structured_input: true,
        structured_fields_schema: {
          fields: [
            { name: 'data_types', label: 'Data Types Used', type: 'textarea', required: true, placeholder: 'List all data types the AI system will process (e.g., customer emails, financial records, employee data)' },
            { name: 'regulatory_constraints', label: 'Regulatory Constraints', type: 'textarea', required: true, placeholder: 'List applicable regulations (GDPR, HIPAA, SOX, industry-specific)' },
            { name: 'logging_requirements', label: 'Logging & Audit Requirements', type: 'textarea', required: true, placeholder: 'What must be logged for compliance and debugging?' },
            { name: 'override_triggers', label: 'Human Override Triggers', type: 'textarea', required: true, placeholder: 'Specific conditions that require human intervention' },
            { name: 'risk_severity', label: 'Overall Risk Severity', type: 'select', required: true, options: ['Low - internal efficiency tool', 'Medium - customer-facing with review', 'High - financial or regulatory impact', 'Critical - safety or compliance critical'] },
            { name: 'monitoring_plan', label: 'Monitoring & Alerting Plan', type: 'textarea', required: true, placeholder: 'How will you monitor AI performance and detect issues?' },
          ],
        },
        content_template_json: {
          topic: 'governance_blueprint_lab',
          personalize_by: ['industry', 'company_name', 'identified_use_case'],
          reference_prior_labs: ['opportunity_mapping'],
          provide_examples: true,
        },
      },
    ],
  },
  {
    module_number: 3,
    title: 'Requirements & Use Case Precision',
    description: 'Translate business goals into precise system requirements. Define inputs, outputs, decision flows, edge cases, and success criteria.',
    skill_area: 'requirements',
    lessons: [
      {
        lesson_number: 1,
        title: 'Translating Business Goals into System Requirements',
        description: 'Bridge the gap between "what we want" and "what we need to build". Learn to decompose business objectives into testable system requirements.',
        lesson_type: 'concept',
        estimated_minutes: 30,
        requires_structured_input: false,
        content_template_json: {
          topic: 'business_to_requirements',
          key_points: ['goal decomposition', 'requirement types', 'acceptance criteria', 'scope boundaries'],
          personalize_by: ['industry', 'identified_use_case', 'goal'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 2,
        title: 'Input / Output Mapping',
        description: 'Define exactly what goes in and what comes out. Map data sources, transformations, and output formats for your AI system.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'io_mapping',
          key_points: ['input sources', 'data transformations', 'output formats', 'validation rules'],
          personalize_by: ['industry', 'identified_use_case', 'internal_systems'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 3,
        title: 'Decision Flow Modeling',
        description: 'Model the decision logic your AI system must follow. Define branching paths, conditional rules, and escalation triggers.',
        lesson_type: 'concept',
        estimated_minutes: 30,
        requires_structured_input: false,
        content_template_json: {
          topic: 'decision_flow',
          key_points: ['decision trees', 'branching logic', 'conditional rules', 'escalation paths'],
          personalize_by: ['industry', 'identified_use_case'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 4,
        title: 'Edge Case & Failure State Design',
        description: 'Anticipate what can go wrong. Design for edge cases, define failure states, and build recovery paths into your system requirements.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'edge_cases',
          key_points: ['edge case identification', 'failure state taxonomy', 'recovery paths', 'graceful degradation'],
          personalize_by: ['industry', 'identified_use_case'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 5,
        title: 'Assessment: Requirements Confidence',
        description: 'Test your ability to decompose business goals, map inputs/outputs, and design for edge cases.',
        lesson_type: 'assessment',
        estimated_minutes: 20,
        requires_structured_input: false,
        content_template_json: {
          topic: 'requirements_assessment',
          question_count: 10,
          question_types: ['multiple_choice', 'scenario_based'],
          covers: ['goal_decomposition', 'io_mapping', 'decision_flows', 'edge_cases'],
          passing_score: 70,
        },
      },
      {
        lesson_number: 6,
        title: 'Lab: Structured Requirements Document Builder',
        description: 'Build a complete requirements document for your AI initiative. Define every input, output, transformation, validation rule, and failure state.',
        lesson_type: 'lab',
        estimated_minutes: 45,
        requires_structured_input: true,
        structured_fields_schema: {
          fields: [
            { name: 'inputs', label: 'System Inputs', type: 'textarea', required: true, placeholder: 'List all data inputs (sources, formats, volumes)' },
            { name: 'outputs', label: 'System Outputs', type: 'textarea', required: true, placeholder: 'List all expected outputs (formats, recipients, SLAs)' },
            { name: 'transformations', label: 'Data Transformations', type: 'textarea', required: true, placeholder: 'Describe how inputs are transformed into outputs' },
            { name: 'validation_rules', label: 'Validation Rules', type: 'textarea', required: true, placeholder: 'Rules that must be satisfied before output is accepted' },
            { name: 'failure_states', label: 'Failure States & Recovery', type: 'textarea', required: true, placeholder: 'What happens when each component fails?' },
            { name: 'dependencies', label: 'External Dependencies', type: 'textarea', required: true, placeholder: 'Systems, APIs, data sources this depends on' },
          ],
        },
        content_template_json: {
          topic: 'requirements_document_lab',
          personalize_by: ['industry', 'company_name', 'identified_use_case', 'internal_systems'],
          reference_prior_labs: ['opportunity_mapping', 'governance_blueprint'],
          provide_examples: true,
        },
      },
    ],
  },
  {
    module_number: 4,
    title: 'The 3-Agent System & Controlled Build',
    description: 'Learn the Planner-Builder-Reviewer pattern for controlled AI development. Build with discipline: one step at a time, with verification at every stage.',
    skill_area: 'build_discipline',
    lessons: [
      {
        lesson_number: 1,
        title: 'Separation of Roles',
        description: 'Understand why separating planning, execution, and review is critical for AI systems. The 3-agent architecture pattern explained.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'role_separation',
          key_points: ['3-agent pattern', 'planner role', 'builder role', 'reviewer role', 'separation of concerns'],
          personalize_by: ['industry', 'identified_use_case'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 2,
        title: 'Planner vs Executor',
        description: 'Deep dive into the distinction between planning and execution. Why AI systems fail when these roles are combined.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'planner_vs_executor',
          key_points: ['planning discipline', 'execution boundaries', 'task decomposition', 'scope control'],
          personalize_by: ['industry', 'role'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 3,
        title: 'One-Step Task Discipline',
        description: 'The discipline of doing one thing at a time. Break complex AI tasks into atomic, verifiable steps that can be independently validated.',
        lesson_type: 'concept',
        estimated_minutes: 30,
        requires_structured_input: false,
        content_template_json: {
          topic: 'one_step_discipline',
          key_points: ['atomic tasks', 'verifiable steps', 'independent validation', 'rollback capability'],
          personalize_by: ['industry', 'identified_use_case'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 4,
        title: 'Verification & Evidence Gating',
        description: 'Every step must produce evidence. Learn to design verification gates that ensure quality before proceeding to the next step.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'verification_gating',
          key_points: ['evidence requirements', 'quality gates', 'verification patterns', 'automated checks'],
          personalize_by: ['industry', 'identified_use_case'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 5,
        title: 'Assessment: Build Governance',
        description: 'Test your understanding of the 3-agent pattern, task decomposition, and verification discipline.',
        lesson_type: 'assessment',
        estimated_minutes: 20,
        requires_structured_input: false,
        content_template_json: {
          topic: 'build_governance_assessment',
          question_count: 10,
          question_types: ['multiple_choice', 'scenario_based'],
          covers: ['role_separation', 'task_discipline', 'verification_gating'],
          passing_score: 70,
        },
      },
      {
        lesson_number: 6,
        title: 'Lab: Controlled Build Simulation',
        description: 'Design a controlled build plan for your AI initiative. Define each step, its verification evidence, and rollback plan.',
        lesson_type: 'lab',
        estimated_minutes: 45,
        requires_structured_input: true,
        structured_fields_schema: {
          fields: [
            { name: 'step_definition', label: 'Build Steps (one per line)', type: 'textarea', required: true, placeholder: 'Step 1: ...\nStep 2: ...\nStep 3: ...' },
            { name: 'verification_evidence', label: 'Verification Evidence per Step', type: 'textarea', required: true, placeholder: 'Step 1 evidence: ...\nStep 2 evidence: ...' },
            { name: 'rollback_plan', label: 'Rollback Plan per Step', type: 'textarea', required: true, placeholder: 'If Step 1 fails: ...\nIf Step 2 fails: ...' },
          ],
        },
        content_template_json: {
          topic: 'controlled_build_lab',
          personalize_by: ['industry', 'company_name', 'identified_use_case'],
          reference_prior_labs: ['opportunity_mapping', 'governance_blueprint', 'requirements_document'],
          provide_examples: true,
        },
      },
    ],
  },
  {
    module_number: 5,
    title: 'Internal Sell & 90-Day Roadmap',
    description: 'Build your executive presentation, ROI framework, and 90-day expansion roadmap. Prepare to demonstrate and scale your AI initiative.',
    skill_area: 'executive_authority',
    lessons: [
      {
        lesson_number: 1,
        title: 'Selling AI Internally',
        description: 'Craft a compelling internal narrative for AI adoption. Frame capabilities in business terms, address objections, and build coalition support.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'internal_sell',
          key_points: ['stakeholder mapping', 'objection handling', 'coalition building', 'narrative framing'],
          personalize_by: ['industry', 'company_name', 'role', 'goal'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 2,
        title: 'Governance Communication',
        description: 'Communicate AI governance to non-technical stakeholders. Translate risk frameworks into business language that builds confidence.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'governance_communication',
          key_points: ['non-technical translation', 'confidence building', 'risk communication', 'transparency frameworks'],
          personalize_by: ['industry', 'role', 'company_name'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 3,
        title: 'ROI Framing',
        description: 'Build a defensible ROI model for your AI initiative. Quantify cost savings, revenue impact, risk reduction, and time-to-value.',
        lesson_type: 'concept',
        estimated_minutes: 30,
        requires_structured_input: false,
        content_template_json: {
          topic: 'roi_framing',
          key_points: ['cost savings quantification', 'revenue impact', 'risk reduction value', 'time-to-value metrics'],
          personalize_by: ['industry', 'company_name', 'company_size', 'identified_use_case'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 4,
        title: 'Scaling Strategy',
        description: 'Plan the path from POC to organization-wide deployment. Team enablement, infrastructure scaling, and governance layering.',
        lesson_type: 'concept',
        estimated_minutes: 25,
        requires_structured_input: false,
        content_template_json: {
          topic: 'scaling_strategy',
          key_points: ['POC to production', 'team enablement', 'infrastructure scaling', 'governance layering'],
          personalize_by: ['industry', 'company_name', 'company_size'],
          industry_examples: true,
        },
      },
      {
        lesson_number: 5,
        title: 'Final Demo Preparation',
        description: 'Prepare your executive demonstration. Structure your presentation, rehearse your narrative, and anticipate questions.',
        lesson_type: 'reflection',
        estimated_minutes: 30,
        requires_structured_input: false,
        content_template_json: {
          topic: 'demo_preparation',
          reflection_prompts: [
            'What is the single most compelling outcome from your POC?',
            'What objection do you expect, and how will you address it?',
            'What assumptions in your roadmap need validation?',
            'How will you measure success in the first 30 days after the program?',
          ],
          personalize_by: ['industry', 'company_name', 'goal', 'identified_use_case'],
        },
      },
      {
        lesson_number: 6,
        title: 'Lab: 90-Day Roadmap Builder',
        description: 'Build your post-program roadmap. Define Phase 1 expansion, Phase 2 team enablement, hiring needs, risk mitigation, and governance scaling.',
        lesson_type: 'lab',
        estimated_minutes: 45,
        requires_structured_input: true,
        structured_fields_schema: {
          fields: [
            { name: 'phase_1_build', label: 'Phase 1: First 30 Days — Expand POC', type: 'textarea', required: true, placeholder: 'What will you build, deploy, or demonstrate in the first 30 days?' },
            { name: 'phase_2_expansion', label: 'Phase 2: Days 31-60 — Team Enablement', type: 'textarea', required: true, placeholder: 'How will you enable your team and expand usage?' },
            { name: 'hiring_needs', label: 'Hiring & Resource Needs', type: 'textarea', required: true, placeholder: 'What roles, skills, or external support do you need?' },
            { name: 'risk_mitigation', label: 'Risk Mitigation Strategy', type: 'textarea', required: true, placeholder: 'Top 3 risks and your mitigation plan for each' },
            { name: 'governance_layering', label: 'Governance Scaling Plan', type: 'textarea', required: true, placeholder: 'How will governance evolve as AI usage grows?' },
          ],
        },
        content_template_json: {
          topic: 'roadmap_builder_lab',
          personalize_by: ['industry', 'company_name', 'company_size', 'identified_use_case', 'goal'],
          reference_prior_labs: ['opportunity_mapping', 'governance_blueprint', 'requirements_document', 'controlled_build'],
          provide_examples: true,
        },
      },
    ],
  },
];

async function seed() {
  await connectDatabase();
  await sequelize.sync({ alter: true });

  const cohort = await Cohort.findOne({ where: { name: 'Cohort 1 — March 2026' } });
  if (!cohort) {
    console.error('Cohort 1 not found!');
    process.exit(1);
  }

  console.log(`Seeding curriculum for: ${cohort.name} (${cohort.id})\n`);

  for (const moduleDef of modules) {
    const [mod, modCreated] = await CurriculumModule.findOrCreate({
      where: { cohort_id: cohort.id, module_number: moduleDef.module_number },
      defaults: {
        cohort_id: cohort.id,
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
        title: moduleDef.title,
        description: moduleDef.description,
        skill_area: moduleDef.skill_area,
        total_lessons: moduleDef.lessons.length,
      });
    }

    console.log(`${modCreated ? 'Created' : 'Updated'}: Module ${mod.module_number} — ${mod.title}`);

    for (const lessonDef of moduleDef.lessons) {
      const [lesson, lessonCreated] = await CurriculumLesson.findOrCreate({
        where: { module_id: mod.id, lesson_number: lessonDef.lesson_number },
        defaults: {
          module_id: mod.id,
          lesson_number: lessonDef.lesson_number,
          title: lessonDef.title,
          description: lessonDef.description,
          lesson_type: lessonDef.lesson_type,
          estimated_minutes: lessonDef.estimated_minutes,
          requires_structured_input: lessonDef.requires_structured_input,
          structured_fields_schema: lessonDef.structured_fields_schema || null,
          content_template_json: lessonDef.content_template_json,
        },
      });

      if (!lessonCreated) {
        await lesson.update({
          title: lessonDef.title,
          description: lessonDef.description,
          lesson_type: lessonDef.lesson_type,
          estimated_minutes: lessonDef.estimated_minutes,
          requires_structured_input: lessonDef.requires_structured_input,
          structured_fields_schema: lessonDef.structured_fields_schema || null,
          content_template_json: lessonDef.content_template_json,
        });
      }

      console.log(`  ${lessonCreated ? '+' : '~'} Lesson ${lesson.lesson_number}: ${lesson.title} (${lesson.lesson_type})`);
    }
  }

  console.log('\nCurriculum seeding complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
