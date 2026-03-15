/**
 * One-time seed: backfill rich descriptions for mini-sections and
 * learning_goal for lessons. Moves pedagogical guidance from prompts
 * into Description fields so structural prompts can be minimal.
 *
 * Run: cd backend && npx ts-node src/seeds/backfillDescriptions.ts
 */
import '../models'; // init associations
import { sequelize } from '../config/database';
import CurriculumLesson from '../models/CurriculumLesson';
import MiniSection from '../models/MiniSection';

// ─── Lesson Learning Goals ───────────────────────────────────────

const LESSON_LEARNING_GOALS: Record<string, string> = {
  // Module 1: AI Strategy & Trust Discipline
  'Executive AI Reality Check': 'Distinguish AI hype from operational reality and assess organizational readiness for AI adoption.',
  'Trust Before Intelligence Framework': 'Design trust architecture that must precede AI deployment in enterprise environments.',
  'Identifying Responsible AI Opportunities': 'Evaluate and score AI opportunities against responsibility and feasibility criteria.',
  'Industry-Specific AI Applications': 'Map AI capabilities to industry-specific constraints, regulations, and value chains.',
  'Strategy & Trust: Synthesis & Application': 'Synthesize strategy, trust, and opportunity frameworks into a unified AI approach.',

  // Module 2: Governance & Risk Architecture
  'AI Risk Taxonomy': 'Map the full spectrum of AI risks and prioritize by impact and organizational exposure.',
  'Data Classification & Sensitivity': 'Design data classification and handling policies for AI systems.',
  'Failure Modes & Guardrails': 'Recognize AI failure patterns and design layered prevention and recovery guardrails.',
  'Human-in-the-Loop Design': 'Design human oversight patterns with intervention triggers and escalation paths.',
  'Governance: Blueprint & Application': 'Build a comprehensive governance framework integrating risk, data, and oversight.',

  // Module 3: Requirements & Use Case Precision
  'Translating Business Goals into System Requirements': 'Translate business goals into measurable, testable system requirements.',
  'Input / Output Mapping': 'Design clear data pipelines from source through transformation to output.',
  'Decision Flow Modeling': 'Model explicit decision logic with branching paths and conditional rules.',
  'Edge Case & Failure State Design': 'Anticipate edge cases and design recovery paths and fallback behaviors.',
  'Requirements: Document Builder & Synthesis': 'Produce a complete AI requirements specification integrating all Module 3 artifacts.',

  // Module 4: The 3-Agent System & Controlled Build
  'Separation of Roles': 'Design the Planner-Builder-Reviewer pattern for controlled AI execution.',
  'Planner vs Executor': 'Define clear boundaries between planning and execution phases in AI projects.',
  'One-Step Task Discipline': 'Break complex AI tasks into atomic, verifiable steps with clear inputs and outputs.',
  'Verification & Evidence Gating': 'Design quality gates with automated checks and evidence requirements.',
  'Controlled Build: Simulation & Application': 'Integrate 3-agent system, task discipline, and verification into a controlled build methodology.',

  // Module 5: Internal Sell & 90-Day Roadmap
  'Selling AI Internally': 'Map stakeholders, anticipate objections, and build coalition support for AI initiatives.',
  'Governance Communication': 'Translate technical governance requirements into business-friendly language for non-technical stakeholders.',
  'ROI Framing': 'Build a defensible multi-dimensional ROI model for AI initiatives.',
  'Scaling Strategy': 'Design the scaling path from proof-of-concept to production deployment.',
  '90-Day Roadmap & Executive Demo': 'Synthesize program learnings into a concrete 90-day AI action plan with executive presentation.',
};

// ─── Mini-Section Rich Descriptions ──────────────────────────────
// Keyed by mini-section title. Descriptions carry the pedagogical
// guidance that was previously in structural prompts.

const MINI_SECTION_DESCRIPTIONS: Record<string, string> = {
  // Module 1, Lesson 1: Executive AI Reality Check
  'AI Hype vs Reality': 'Separate AI marketing claims from operational reality. Ground the analysis in the learner\'s specific industry, company size, and role. Focus on what this means for THEIR organization — concrete business language, not academic definitions. Include a memorable visual metaphor that makes the concept tangible.',
  'AI Competitive Strategy': 'Map the competitive landscape for AI adoption. Frame as strategic delegation: executives own decisions, AI provides analysis. Include 3-4 specific delegation scenarios and 3-4 human-only responsibilities. Generate a copy-paste-ready prompt personalized with learner context.',
  'AI Readiness Prompt': 'Create a reusable prompt template to assess organizational AI readiness. Use {{placeholder}} syntax with {{company_name}}, {{industry}}, {{role}} as core placeholders. Output should be structured and extractable — not prose. Include iteration tips for refining results.',
  'AI Maturity Assessment': 'Design a 30-60 minute hands-on exercise where the executive produces a practical AI maturity evaluation for their organization. Ground in a realistic business scenario. The deliverable should be portfolio-worthy — something they can use at work Monday morning.',
  'AI Reality Assessment': 'Scenario-based questions testing APPLICATION of AI reality concepts, not recall. Use plausible distractors based on common executive misconceptions about AI capabilities. Explanations should teach why the correct answer is right and why wrong answers are tempting.',

  // Module 1, Lesson 2: Trust Before Intelligence Framework
  'Trust-First AI Reality': 'Why governance must precede capability in enterprise AI. Ground in the learner\'s industry — show how trust failures manifest in their specific context. Use a visual metaphor showing trust as foundation, not afterthought.',
  'Trust Architecture Strategy': 'Design trust layers that enable rather than constrain AI deployment. Frame as strategic delegation with clear human-AI responsibility boundaries. Include actionable prompt for the learner to assess their own trust architecture.',
  'Stakeholder Trust Prompt': 'Template to generate stakeholder-specific trust assessment and communication plan. Include placeholders for stakeholder role, concern type, and trust level. Output should map directly to communication actions.',
  'Trust Framework Task': 'Build a trust framework document for the learner\'s AI initiative. 30-60 minute exercise producing a deliverable that maps trust requirements to governance controls. Reference prior sections\' frameworks as inputs.',
  'Trust Principles Assessment': 'Test mastery of trust-first governance principles through scenario-based questions. Distractors should reflect common shortcuts executives take — deploying capability before governance.',

  // Module 1, Lesson 3: Identifying Responsible AI Opportunities
  'Responsible AI Reality': 'Recognize the gap between ethical AI aspiration and operational implementation. Show how responsibility criteria affect real deployment decisions in the learner\'s industry. Use concrete examples of responsibility failures.',
  'Opportunity Scoring Strategy': 'Framework for evaluating AI opportunities against responsibility criteria. Include scoring dimensions: feasibility, risk, impact, ethical alignment. Generate a decision matrix the learner can apply immediately.',
  'Opportunity Assessment Prompt': 'Template to evaluate and score potential AI use cases against responsibility and feasibility criteria. Structured output with clear scoring rubric. Placeholders for industry context and organizational constraints.',
  'Opportunity Evaluation Task': 'Score and prioritize three AI opportunities using the responsibility framework. 30-60 minute exercise producing a ranked opportunity list with justification. Portfolio-worthy output.',
  'Responsible AI Assessment': 'Verify understanding of responsible opportunity identification through scenario-based questions. Test ability to distinguish genuinely responsible AI from AI-washing.',

  // Module 1, Lesson 4: Industry-Specific AI Applications
  'Industry AI Reality': 'Ground AI possibilities in the learner\'s specific industry constraints, regulations, and competitive dynamics. Show what works vs what\'s hype in their vertical. Include industry-specific failure examples.',
  'Industry Application Strategy': 'Identify industry-specific AI patterns and proven application architectures. Map AI capabilities to value chain stages specific to the learner\'s industry. Include strategic delegation framework.',
  'Industry Use Case Prompt': 'Template to generate industry-tailored AI use cases with regulatory awareness. Placeholders for industry sector, regulatory regime, and organizational maturity. Output should be actionable, not theoretical.',
  'Industry Analysis Task': 'Map AI applications to the learner\'s industry value chain. 30-60 minute exercise producing an industry-specific AI opportunity map with regulatory notes. Reference prior lesson frameworks.',
  'Industry AI Assessment': 'Validate industry-specific AI application knowledge. Questions should test understanding of why certain AI approaches work in some industries but not others.',

  // Module 1, Lesson 5: Strategy & Trust Synthesis
  'Strategy Synthesis Reality': 'Assess how strategy and trust principles integrate in real deployment. Show the gap between isolated frameworks and unified execution. Visual metaphor of synthesis.',
  'Strategic Integration': 'Unify strategy, trust, and opportunity frameworks into a cohesive approach. This is the capstone of Module 1 — all prior frameworks come together. Generate a unified strategic brief.',
  'Strategy Synthesis Prompt': 'Template to synthesize Module 1 learnings into an actionable strategy brief. Reference all prior section outputs as inputs. Output should be executive-summary quality.',
  'Strategy Application Task': 'Produce a unified AI strategy and trust document for the learner\'s organization. Capstone deliverable integrating all Module 1 work. 30-60 minutes, portfolio-worthy.',
  'Strategy Assessment': 'Comprehensive assessment of Module 1 strategic concepts. Questions should test integration across all four prior lessons — not isolated concept recall.',

  // Module 2, Lesson 1: AI Risk Taxonomy
  'Risk Landscape Reality': 'Map the full spectrum of AI risks beyond obvious technical failures — organizational, reputational, regulatory, ethical. Ground in learner\'s industry-specific risk landscape. Visual metaphor of risk iceberg.',
  'Risk Prioritization Strategy': 'Prioritize risks by impact, likelihood, and organizational exposure. Framework for risk delegation: which risks AI can monitor vs which require human judgment. Actionable risk matrix.',
  'Risk Assessment Prompt': 'Template to identify and categorize AI risks for the learner\'s specific organizational context. Structured output with risk categories, severity ratings, and mitigation actions.',
  'Risk Register Task': 'Build an initial AI risk register with mitigation strategies. 30-60 minute exercise producing a living document the learner can maintain. Reference industry-specific risks.',
  'Risk Taxonomy Assessment': 'Test understanding of AI risk categories and prioritization. Questions should reveal blind spots — risks executives typically underestimate.',

  // Module 2, Lesson 2: Data Classification & Sensitivity
  'Data Sensitivity Reality': 'Understand data classification imperatives before feeding AI systems. Show how classification failures lead to breaches and compliance violations in the learner\'s industry.',
  'Data Governance Strategy': 'Design data handling policies that enable AI while protecting sensitive assets. Framework for data delegation: what data AI can access autonomously vs what requires human approval.',
  'Data Classification Prompt': 'Template to generate a data classification framework for the learner\'s AI pipeline. Output should map data types to sensitivity levels with handling rules.',
  'Data Inventory Task': 'Classify the learner\'s organization\'s key data assets by sensitivity level. 30-60 minute exercise producing a data inventory with classification and handling policies.',
  'Data Classification Assessment': 'Validate data sensitivity and classification knowledge. Test ability to correctly classify ambiguous data types and design appropriate handling rules.',

  // Module 2, Lesson 3: Failure Modes & Guardrails
  'AI Failure Reality': 'Recognize how AI systems fail and the cascading consequences. Show failure patterns specific to the learner\'s industry — not just generic examples. Include real-world failure case studies.',
  'Guardrail Design Strategy': 'Design layered guardrails that prevent, detect, and recover from failures. Framework for guardrail delegation: automated guards vs human intervention points. Actionable guardrail taxonomy.',
  'Failure Analysis Prompt': 'Template to analyze failure modes and design guardrails for a specific AI use case. Output should map failure scenarios to prevention, detection, and recovery mechanisms.',
  'Guardrail Implementation Task': 'Design guardrails for a specific AI use case in the learner\'s organization. 30-60 minute exercise producing a guardrail specification document with trigger conditions.',
  'Failure Modes Assessment': 'Test understanding of failure modes and guardrail design. Questions should present realistic failure scenarios and test the learner\'s guardrail design instincts.',

  // Module 2, Lesson 4: Human-in-the-Loop Design
  'Human Oversight Reality': 'Why full automation is a myth and human oversight is a design requirement. Show the spectrum from full automation to full human control — most AI should be in between.',
  'Oversight Pattern Strategy': 'Design intervention triggers, escalation paths, and review cadences. Framework for determining where on the automation spectrum each AI function should sit.',
  'Oversight Design Prompt': 'Template to generate a human-in-the-loop design for the learner\'s AI workflow. Output should specify intervention points, escalation triggers, and review schedules.',
  'Oversight Implementation Task': 'Define oversight checkpoints and escalation rules for an AI process. 30-60 minute exercise producing an oversight design document with decision trees.',
  'Human-in-the-Loop Assessment': 'Validate human oversight design principles. Test ability to identify appropriate intervention points and avoid both over-automation and over-control.',

  // Module 2, Lesson 5: Governance Blueprint
  'Governance Reality': 'Assess governance readiness and identify structural gaps. Show how governance connects to every prior Module 2 concept — risk, data, failures, oversight.',
  'Governance Framework Strategy': 'Build a governance framework integrating risk, data, failure modes, and oversight into a unified system. Capstone of Module 2 — all frameworks unified.',
  'Governance Template Prompt': 'Template to generate a comprehensive governance blueprint document. Reference all Module 2 outputs as inputs. Executive-summary quality output.',
  'Governance Document Task': 'Produce a governance framework document for the learner\'s AI program. Capstone deliverable integrating all Module 2 work. 30-60 minutes, portfolio-worthy.',
  'Governance Assessment': 'Comprehensive Module 2 governance assessment. Questions should test integration across risk, data, failure modes, and oversight — not isolated concepts.',

  // Module 3, Lesson 1: Translating Business Goals
  'Requirements Reality': 'The gap between business intent and system specification costs projects. Show how vague requirements lead to failed AI deployments. Concrete examples of specification failures.',
  'Goal Decomposition Strategy': 'Break business goals into measurable, testable system requirements. Framework for translating executive language into engineering specifications without losing intent.',
  'Requirements Prompt': 'Template to translate a business goal into system requirements. Output should be structured with measurable acceptance criteria. Placeholders for business goal and context.',
  'Requirements Specification Task': 'Write system requirements for a real business goal in the learner\'s organization. 30-60 minute exercise producing a specification document with testable criteria.',
  'Requirements Assessment': 'Test requirements translation skills. Present business goals and evaluate the learner\'s ability to decompose them into precise specifications.',

  // Module 3, Lesson 2: Input / Output Mapping
  'I/O Mapping Reality': 'Unclear inputs and outputs are the #1 cause of AI project failure. Show how ambiguous I/O specifications cascade into system failures. Concrete pipeline examples.',
  'Data Flow Strategy': 'Design clear data pipelines from source through transformation to output. Framework for specifying exact data types, formats, and validation rules at each stage.',
  'I/O Mapping Prompt': 'Template to generate an input/output map for the learner\'s AI system. Output should specify data sources, transformations, validation rules, and output formats.',
  'Data Pipeline Task': 'Document the complete I/O map for a specific AI use case. 30-60 minute exercise producing a data pipeline specification with validation checkpoints.',
  'I/O Mapping Assessment': 'Validate input/output mapping skills. Test ability to identify missing inputs, ambiguous transformations, and unvalidated outputs.',

  // Module 3, Lesson 3: Decision Flow Modeling
  'Decision Flow Reality': 'AI decisions need explicit logic paths, not black-box inference. Show how undocumented decision logic creates audit and compliance risks.',
  'Decision Architecture Strategy': 'Model decision trees with branching logic and conditional rules. Framework for making AI decision paths explicit, testable, and auditable.',
  'Decision Tree Prompt': 'Template to generate a decision flow model for the learner\'s AI use case. Output should be a structured decision tree with conditions, branches, and outcomes.',
  'Decision Flow Task': 'Build a complete decision flow diagram with edge cases. 30-60 minute exercise producing a visual decision tree with documented logic at each branch.',
  'Decision Modeling Assessment': 'Test decision flow modeling skills. Present complex scenarios and evaluate the learner\'s ability to model explicit, auditable decision paths.',

  // Module 3, Lesson 4: Edge Case & Failure State Design
  'Edge Case Reality': 'Edge cases are where AI systems fail in production — plan for them. Show how the most damaging failures come from scenarios nobody considered.',
  'Failure Prevention Strategy': 'Anticipate failures, design recovery paths, and define fallback behaviors. Framework for systematic edge case discovery and graceful degradation design.',
  'Edge Case Prompt': 'Template to generate edge case scenarios and failure state handlers for the learner\'s AI system. Output should map edge cases to recovery mechanisms.',
  'Failure State Task': 'Document edge cases and recovery paths for the learner\'s AI system. 30-60 minute exercise producing an edge case catalog with fallback behaviors.',
  'Edge Case Assessment': 'Validate edge case and failure state design skills. Test ability to anticipate non-obvious failure scenarios and design appropriate recovery paths.',

  // Module 3, Lesson 5: Requirements Document Builder
  'Requirements Doc Reality': 'A complete requirements document is the foundation of controlled AI builds. Show how all Module 3 artifacts connect into a single specification.',
  'Specification Strategy': 'Integrate requirements, I/O maps, decision flows, and edge cases into a unified specification. Capstone of Module 3 — all artifacts synthesized.',
  'Requirements Doc Prompt': 'Template to synthesize all Module 3 artifacts into a requirements specification. Reference prior section outputs. Executive-summary quality output.',
  'Requirements Builder Task': 'Produce a complete AI requirements specification document. Capstone deliverable integrating all Module 3 work. 30-60 minutes, portfolio-worthy.',
  // Note: 'Requirements Assessment' appears in both M3L1 and M3L5 — use lesson context to differentiate
  // M3L5 version:

  // Module 4, Lesson 1: Separation of Roles
  'Role Separation Reality': 'Why mixing planning, execution, and review in one agent fails. Show how role confusion leads to unchecked AI outputs and compounding errors.',
  'Multi-Agent Strategy': 'Design the Planner-Builder-Reviewer pattern for controlled AI execution. Framework for defining clear role boundaries with handoff protocols.',
  'Role Definition Prompt': 'Template to generate role definitions for a 3-agent system. Output should specify each role\'s responsibilities, inputs, outputs, and handoff criteria.',
  'Agent Role Task': 'Define Planner, Builder, and Reviewer roles for the learner\'s AI build. 30-60 minute exercise producing a role specification document with handoff protocols.',
  'Role Separation Assessment': 'Test understanding of agent role separation. Questions should present scenarios where role confusion causes failures.',

  // Module 4, Lesson 2: Planner vs Executor
  'Planning Discipline Reality': 'Execution without planning is the leading cause of AI project chaos. Show how premature execution wastes resources and produces unreliable outputs.',
  'Execution Boundary Strategy': 'Define clear boundaries between planning and execution phases. Framework for determining when planning is sufficient to begin execution.',
  'Task Decomposition Prompt': 'Template to generate a task decomposition plan with execution boundaries. Output should map planning deliverables to execution prerequisites.',
  'Planning Exercise Task': 'Create a planning document with explicit execution boundaries. 30-60 minute exercise producing a plan that clearly separates what from how.',
  'Planner vs Executor Assessment': 'Validate planning discipline skills. Test ability to identify premature execution and insufficient planning in AI project scenarios.',

  // Module 4, Lesson 3: One-Step Task Discipline
  'Atomic Task Reality': 'Complex tasks succeed when broken into verifiable atomic steps. Show how compound tasks hide failures and prevent quality verification.',
  'Step Isolation Strategy': 'Design atomic tasks with clear inputs, outputs, and verification criteria. Framework for determining the right granularity — small enough to verify, large enough to be meaningful.',
  'Task Breakdown Prompt': 'Template to generate an atomic task breakdown for an AI workflow. Output should list each step with inputs, expected outputs, and verification method.',
  'Atomic Task Exercise': 'Break a complex AI task into atomic, verifiable steps. 30-60 minute exercise producing a step-by-step execution plan with verification checkpoints.',
  'Task Discipline Assessment': 'Test one-step task discipline mastery. Questions should present compound tasks and evaluate the learner\'s decomposition instincts.',

  // Module 4, Lesson 4: Verification & Evidence Gating
  'Quality Gate Reality': 'Without verification gates, AI output quality degrades silently. Show how missing gates allow errors to compound through downstream processes.',
  'Verification Strategy': 'Design quality gates with automated checks and evidence requirements. Framework for determining what evidence is needed at each gate and who reviews it.',
  'Evidence Gate Prompt': 'Template to generate verification gates and evidence requirements for AI outputs. Output should specify gate criteria, evidence types, and pass/fail conditions.',
  'Verification Gate Task': 'Define quality gates for each phase of the learner\'s AI build process. 30-60 minute exercise producing a gate specification with evidence requirements.',
  'Evidence Gating Assessment': 'Validate verification and evidence gating skills. Test ability to design appropriate gates that catch real problems without creating bottlenecks.',

  // Module 4, Lesson 5: Controlled Build Synthesis
  'Controlled Build Reality': 'Synthesis of 3-agent system, task discipline, and verification gates into a complete controlled build methodology. Show how all Module 4 patterns reinforce each other.',
  'Build Control Strategy': 'Integrate all Module 4 patterns into a controlled build methodology. Capstone framework unifying roles, planning, atomic tasks, and verification.',
  'Build Plan Prompt': 'Template to generate a complete controlled build plan with all safeguards. Reference all Module 4 outputs. Executive-quality specification.',
  'Controlled Build Task': 'Produce a controlled build plan for the learner\'s AI initiative. Capstone deliverable integrating all Module 4 work. 30-60 minutes, portfolio-worthy.',
  'Controlled Build Assessment': 'Comprehensive Module 4 controlled build assessment. Questions should test integration across roles, planning, tasks, and verification.',

  // Module 5, Lesson 1: Selling AI Internally
  'Internal AI Sell Reality': 'Technical excellence means nothing without organizational buy-in. Show how the best AI projects fail because of poor internal communication and politics.',
  'Stakeholder Mapping Strategy': 'Map stakeholders, anticipate objections, and build coalition support. Framework for strategic communication tailored to each stakeholder\'s concerns and influence.',
  'Stakeholder Pitch Prompt': 'Template to generate stakeholder-specific AI pitch narratives. Placeholders for stakeholder role, primary concern, and decision authority. Output should be presentation-ready.',
  'Coalition Building Task': 'Create a stakeholder engagement plan for the learner\'s AI initiative. 30-60 minute exercise producing a communication plan with per-stakeholder messaging.',
  'Internal Sell Assessment': 'Test internal selling and stakeholder management skills. Questions should present organizational dynamics and evaluate political navigation instincts.',

  // Module 5, Lesson 2: Governance Communication
  'Governance Comms Reality': 'Technical governance must be translated for non-technical stakeholders. Show how governance jargon creates resistance and misunderstanding at the board level.',
  'Non-Technical Translation Strategy': 'Translate governance requirements into business-friendly language. Framework for communicating risk, compliance, and oversight without technical jargon.',
  'Governance Brief Prompt': 'Template to generate a non-technical governance communication brief. Output should be board-ready: clear, concise, and action-oriented.',
  'Board Presentation Task': 'Create a board-ready AI governance communication package. 30-60 minute exercise producing a presentation-quality governance summary.',
  'Governance Comms Assessment': 'Validate governance communication skills. Test ability to translate technical governance into language that non-technical executives understand and act on.',

  // Module 5, Lesson 3: ROI Framing
  'ROI Reality Check': 'AI ROI is more than cost savings — quantify risk reduction, time savings, and strategic positioning value. Show how single-dimensional ROI models undervalue AI investments.',
  'ROI Quantification Strategy': 'Build multi-dimensional ROI models including cost, revenue, risk reduction, and strategic value. Framework for making intangible AI benefits tangible and defensible.',
  'ROI Analysis Prompt': 'Template to generate an AI ROI analysis with cost, revenue, risk, and strategic dimensions. Output should be spreadsheet-ready with assumptions clearly stated.',
  'Business Case Task': 'Build a complete AI business case with ROI projections. 30-60 minute exercise producing a defensible business case document with multi-dimensional ROI.',
  'ROI Framing Assessment': 'Test ROI quantification and business case skills. Questions should challenge single-dimensional thinking and test multi-factor ROI analysis.',

  // Module 5, Lesson 4: Scaling Strategy
  'Scaling Reality': 'POC success does not equal production readiness — plan the transition. Show the common failure pattern: successful pilot, failed scale-up.',
  'POC-to-Production Strategy': 'Design the scaling path from proof-of-concept to production deployment. Framework for identifying scaling blockers: data, infrastructure, organizational, and process.',
  'Scaling Plan Prompt': 'Template to generate a POC-to-production scaling plan. Output should identify scaling dimensions, blockers, and milestone-based progression.',
  'Scaling Roadmap Task': 'Build a detailed scaling roadmap with milestones and dependencies. 30-60 minute exercise producing a scaling plan the learner can execute.',
  'Scaling Assessment': 'Validate scaling strategy skills. Test understanding of why POCs fail at scale and how to design for production from the start.',

  // Module 5, Lesson 5: 90-Day Roadmap & Executive Demo
  'Roadmap Reality': 'Turn all program learnings into a concrete 90-day action plan. This is the capstone of the entire program — everything synthesized into executable next steps.',
  '90-Day Planning Strategy': 'Prioritize, sequence, and resource the learner\'s AI roadmap for the next 90 days. Framework for converting program learnings into week-by-week execution plan.',
  'Roadmap Prompt': 'Template to generate a comprehensive 90-day AI implementation roadmap. Reference all five modules\' outputs. Output should be presentation-quality with milestones.',
  'Executive Demo Task': 'Prepare the final executive demo: roadmap presentation and live walkthrough. Capstone deliverable of the entire program. Portfolio-quality presentation.',
  'Roadmap Assessment': 'Comprehensive capstone assessment across all five modules. Questions should test the learner\'s ability to integrate concepts from every module into actionable planning.',
};

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    // ── Part A: Backfill lesson learning_goal ──
    console.log('\n=== Backfilling Lesson Learning Goals ===');
    let lessonUpdated = 0;
    for (const [title, learningGoal] of Object.entries(LESSON_LEARNING_GOALS)) {
      const [count] = await CurriculumLesson.update(
        { learning_goal: learningGoal } as any,
        { where: { title } }
      );
      if (count > 0) {
        console.log(`  OK: "${title}" — learning_goal set`);
        lessonUpdated += count;
      } else {
        console.log(`  SKIP: "${title}" — not found`);
      }
    }
    console.log(`Updated ${lessonUpdated} lesson(s).`);

    // ── Part B: Backfill mini-section descriptions ──
    console.log('\n=== Backfilling Mini-Section Descriptions ===');
    let msUpdated = 0;
    for (const [title, description] of Object.entries(MINI_SECTION_DESCRIPTIONS)) {
      const [count] = await MiniSection.update(
        { description } as any,
        { where: { title } }
      );
      if (count > 0) {
        console.log(`  OK: "${title}" — description updated`);
        msUpdated += count;
      } else {
        console.log(`  SKIP: "${title}" — not found`);
      }
    }
    console.log(`Updated ${msUpdated} mini-section(s).`);

    console.log('\nBackfill complete.');
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
}

run();
