/**
 * Seed Mini-Sections for all 25 lessons.
 * Creates 5 typed mini-sections per lesson (125 total).
 * Idempotent — skips lessons that already have mini-sections.
 *
 * Run: npx ts-node src/seeds/seedMiniSections.ts
 */

import { sequelize } from '../config/database';
import MiniSection from '../models/MiniSection';
import CurriculumLesson from '../models/CurriculumLesson';
import CurriculumModule from '../models/CurriculumModule';
const { v4: uuidv4 } = require('uuid');

interface MiniSectionDef {
  type: 'executive_reality_check' | 'ai_strategy' | 'prompt_template' | 'implementation_task' | 'knowledge_check';
  title: string;
  description: string;
}

// Mini-section definitions per lesson keyed by lesson title substring
const LESSON_MINI_SECTIONS: Record<string, MiniSectionDef[]> = {
  // Module 1: AI Strategy & Trust Discipline
  'Executive AI Reality Check': [
    { type: 'executive_reality_check', title: 'AI Hype vs Reality', description: 'Separate AI marketing claims from operational reality using your industry context.' },
    { type: 'ai_strategy', title: 'AI Competitive Strategy', description: 'Map the competitive landscape and identify where AI creates genuine advantage.' },
    { type: 'prompt_template', title: 'AI Readiness Prompt', description: 'Structured prompt to assess organizational AI readiness across key dimensions.' },
    { type: 'implementation_task', title: 'AI Maturity Assessment', description: 'Complete a practical AI maturity evaluation for your organization.' },
    { type: 'knowledge_check', title: 'AI Reality Assessment', description: 'Validate understanding of AI capabilities vs limitations.' },
  ],
  'Trust Before Intelligence Framework': [
    { type: 'executive_reality_check', title: 'Trust-First AI Reality', description: 'Why governance must precede capability in enterprise AI adoption.' },
    { type: 'ai_strategy', title: 'Trust Architecture Strategy', description: 'Design trust layers that enable rather than constrain AI deployment.' },
    { type: 'prompt_template', title: 'Stakeholder Trust Prompt', description: 'Generate stakeholder-specific trust assessment and communication plan.' },
    { type: 'implementation_task', title: 'Trust Framework Task', description: 'Build a trust framework document for your AI initiative.' },
    { type: 'knowledge_check', title: 'Trust Principles Assessment', description: 'Test mastery of trust-first governance principles.' },
  ],
  'Identifying Responsible AI Opportunities': [
    { type: 'executive_reality_check', title: 'Responsible AI Reality', description: 'Recognize the gap between ethical AI aspiration and operational implementation.' },
    { type: 'ai_strategy', title: 'Opportunity Scoring Strategy', description: 'Framework for evaluating AI opportunities against responsibility criteria.' },
    { type: 'prompt_template', title: 'Opportunity Assessment Prompt', description: 'Structured prompt to evaluate and score potential AI use cases.' },
    { type: 'implementation_task', title: 'Opportunity Evaluation Task', description: 'Score and prioritize three AI opportunities using the responsibility framework.' },
    { type: 'knowledge_check', title: 'Responsible AI Assessment', description: 'Verify understanding of responsible opportunity identification.' },
  ],
  'Industry-Specific AI Applications': [
    { type: 'executive_reality_check', title: 'Industry AI Reality', description: 'Ground AI possibilities in your specific industry constraints and regulations.' },
    { type: 'ai_strategy', title: 'Industry Application Strategy', description: 'Identify industry-specific AI patterns and proven application architectures.' },
    { type: 'prompt_template', title: 'Industry Use Case Prompt', description: 'Generate industry-tailored AI use cases with regulatory awareness.' },
    { type: 'implementation_task', title: 'Industry Analysis Task', description: 'Map AI applications to your industry value chain.' },
    { type: 'knowledge_check', title: 'Industry AI Assessment', description: 'Validate industry-specific AI application knowledge.' },
  ],
  'Strategy & Trust: Synthesis & Application': [
    { type: 'executive_reality_check', title: 'Strategy Synthesis Reality', description: 'Assess how strategy and trust principles integrate in real deployment.' },
    { type: 'ai_strategy', title: 'Strategic Integration', description: 'Unify strategy, trust, and opportunity frameworks into a cohesive approach.' },
    { type: 'prompt_template', title: 'Strategy Synthesis Prompt', description: 'Synthesize Module 1 learnings into an actionable strategy brief.' },
    { type: 'implementation_task', title: 'Strategy Application Task', description: 'Produce a unified AI strategy and trust document for your organization.' },
    { type: 'knowledge_check', title: 'Strategy Assessment', description: 'Comprehensive assessment of Module 1 strategic concepts.' },
  ],

  // Module 2: Governance & Risk Architecture
  'AI Risk Taxonomy': [
    { type: 'executive_reality_check', title: 'Risk Landscape Reality', description: 'Map the full spectrum of AI risks beyond the obvious technical failures.' },
    { type: 'ai_strategy', title: 'Risk Prioritization Strategy', description: 'Prioritize risks by impact, likelihood, and organizational exposure.' },
    { type: 'prompt_template', title: 'Risk Assessment Prompt', description: 'Structured prompt to identify and categorize AI risks for your context.' },
    { type: 'implementation_task', title: 'Risk Register Task', description: 'Build an initial AI risk register with mitigation strategies.' },
    { type: 'knowledge_check', title: 'Risk Taxonomy Assessment', description: 'Test understanding of AI risk categories and prioritization.' },
  ],
  'Data Classification & Sensitivity': [
    { type: 'executive_reality_check', title: 'Data Sensitivity Reality', description: 'Understand data classification imperatives before feeding AI systems.' },
    { type: 'ai_strategy', title: 'Data Governance Strategy', description: 'Design data handling policies that enable AI while protecting sensitive assets.' },
    { type: 'prompt_template', title: 'Data Classification Prompt', description: 'Generate a data classification framework for your AI pipeline.' },
    { type: 'implementation_task', title: 'Data Inventory Task', description: 'Classify your organization\'s key data assets by sensitivity level.' },
    { type: 'knowledge_check', title: 'Data Classification Assessment', description: 'Validate data sensitivity and classification knowledge.' },
  ],
  'Failure Modes & Guardrails': [
    { type: 'executive_reality_check', title: 'AI Failure Reality', description: 'Recognize how AI systems fail and the cascading consequences.' },
    { type: 'ai_strategy', title: 'Guardrail Design Strategy', description: 'Design layered guardrails that prevent, detect, and recover from failures.' },
    { type: 'prompt_template', title: 'Failure Analysis Prompt', description: 'Structured prompt to analyze failure modes and design guardrails.' },
    { type: 'implementation_task', title: 'Guardrail Implementation Task', description: 'Design guardrails for a specific AI use case in your organization.' },
    { type: 'knowledge_check', title: 'Failure Modes Assessment', description: 'Test understanding of failure modes and guardrail design.' },
  ],
  'Human-in-the-Loop Design': [
    { type: 'executive_reality_check', title: 'Human Oversight Reality', description: 'Why full automation is a myth and human oversight is a design requirement.' },
    { type: 'ai_strategy', title: 'Oversight Pattern Strategy', description: 'Design intervention triggers, escalation paths, and review cadences.' },
    { type: 'prompt_template', title: 'Oversight Design Prompt', description: 'Generate a human-in-the-loop design for your AI workflow.' },
    { type: 'implementation_task', title: 'Oversight Implementation Task', description: 'Define oversight checkpoints and escalation rules for an AI process.' },
    { type: 'knowledge_check', title: 'Human-in-the-Loop Assessment', description: 'Validate human oversight design principles.' },
  ],
  'Governance: Blueprint & Application': [
    { type: 'executive_reality_check', title: 'Governance Reality', description: 'Assess governance readiness and identify structural gaps.' },
    { type: 'ai_strategy', title: 'Governance Framework Strategy', description: 'Build a governance framework integrating risk, data, and oversight.' },
    { type: 'prompt_template', title: 'Governance Template Prompt', description: 'Generate a comprehensive governance blueprint document.' },
    { type: 'implementation_task', title: 'Governance Document Task', description: 'Produce a governance framework document for your AI program.' },
    { type: 'knowledge_check', title: 'Governance Assessment', description: 'Comprehensive Module 2 governance assessment.' },
  ],

  // Module 3: Requirements & Use Case Precision
  'Translating Business Goals into System Requirements': [
    { type: 'executive_reality_check', title: 'Requirements Reality', description: 'The gap between business intent and system specification costs projects.' },
    { type: 'ai_strategy', title: 'Goal Decomposition Strategy', description: 'Break business goals into measurable, testable system requirements.' },
    { type: 'prompt_template', title: 'Requirements Prompt', description: 'Structured prompt to translate a business goal into system requirements.' },
    { type: 'implementation_task', title: 'Requirements Specification Task', description: 'Write system requirements for a real business goal in your organization.' },
    { type: 'knowledge_check', title: 'Requirements Assessment', description: 'Test requirements translation skills.' },
  ],
  'Input / Output Mapping': [
    { type: 'executive_reality_check', title: 'I/O Mapping Reality', description: 'Unclear inputs and outputs are the #1 cause of AI project failure.' },
    { type: 'ai_strategy', title: 'Data Flow Strategy', description: 'Design clear data pipelines from source through transformation to output.' },
    { type: 'prompt_template', title: 'I/O Mapping Prompt', description: 'Generate an input/output map for your AI system.' },
    { type: 'implementation_task', title: 'Data Pipeline Task', description: 'Document the complete I/O map for a specific AI use case.' },
    { type: 'knowledge_check', title: 'I/O Mapping Assessment', description: 'Validate input/output mapping skills.' },
  ],
  'Decision Flow Modeling': [
    { type: 'executive_reality_check', title: 'Decision Flow Reality', description: 'AI decisions need explicit logic paths, not black-box inference.' },
    { type: 'ai_strategy', title: 'Decision Architecture Strategy', description: 'Model decision trees with branching logic and conditional rules.' },
    { type: 'prompt_template', title: 'Decision Tree Prompt', description: 'Generate a decision flow model for your AI use case.' },
    { type: 'implementation_task', title: 'Decision Flow Task', description: 'Build a complete decision flow diagram with edge cases.' },
    { type: 'knowledge_check', title: 'Decision Modeling Assessment', description: 'Test decision flow modeling skills.' },
  ],
  'Edge Case & Failure State Design': [
    { type: 'executive_reality_check', title: 'Edge Case Reality', description: 'Edge cases are where AI systems fail in production — plan for them.' },
    { type: 'ai_strategy', title: 'Failure Prevention Strategy', description: 'Anticipate failures, design recovery paths, and define fallback behaviors.' },
    { type: 'prompt_template', title: 'Edge Case Prompt', description: 'Generate edge case scenarios and failure state handlers.' },
    { type: 'implementation_task', title: 'Failure State Task', description: 'Document edge cases and recovery paths for your AI system.' },
    { type: 'knowledge_check', title: 'Edge Case Assessment', description: 'Validate edge case and failure state design skills.' },
  ],
  'Requirements: Document Builder & Synthesis': [
    { type: 'executive_reality_check', title: 'Requirements Doc Reality', description: 'A complete requirements document is the foundation of controlled AI builds.' },
    { type: 'ai_strategy', title: 'Specification Strategy', description: 'Integrate requirements, I/O maps, decision flows, and edge cases.' },
    { type: 'prompt_template', title: 'Requirements Doc Prompt', description: 'Synthesize all Module 3 artifacts into a requirements specification.' },
    { type: 'implementation_task', title: 'Requirements Builder Task', description: 'Produce a complete AI requirements specification document.' },
    { type: 'knowledge_check', title: 'Requirements Assessment', description: 'Comprehensive Module 3 requirements assessment.' },
  ],

  // Module 4: The 3-Agent System & Controlled Build
  'Separation of Roles': [
    { type: 'executive_reality_check', title: 'Role Separation Reality', description: 'Why mixing planning, execution, and review in one agent fails.' },
    { type: 'ai_strategy', title: 'Multi-Agent Strategy', description: 'Design the Planner-Builder-Reviewer pattern for controlled AI execution.' },
    { type: 'prompt_template', title: 'Role Definition Prompt', description: 'Generate role definitions for a 3-agent system.' },
    { type: 'implementation_task', title: 'Agent Role Task', description: 'Define Planner, Builder, and Reviewer roles for your AI build.' },
    { type: 'knowledge_check', title: 'Role Separation Assessment', description: 'Test understanding of agent role separation.' },
  ],
  'Planner vs Executor': [
    { type: 'executive_reality_check', title: 'Planning Discipline Reality', description: 'Execution without planning is the leading cause of AI project chaos.' },
    { type: 'ai_strategy', title: 'Execution Boundary Strategy', description: 'Define clear boundaries between planning and execution phases.' },
    { type: 'prompt_template', title: 'Task Decomposition Prompt', description: 'Generate a task decomposition plan with execution boundaries.' },
    { type: 'implementation_task', title: 'Planning Exercise Task', description: 'Create a planning document with explicit execution boundaries.' },
    { type: 'knowledge_check', title: 'Planner vs Executor Assessment', description: 'Validate planning discipline skills.' },
  ],
  'One-Step Task Discipline': [
    { type: 'executive_reality_check', title: 'Atomic Task Reality', description: 'Complex tasks succeed when broken into verifiable atomic steps.' },
    { type: 'ai_strategy', title: 'Step Isolation Strategy', description: 'Design atomic tasks with clear inputs, outputs, and verification.' },
    { type: 'prompt_template', title: 'Task Breakdown Prompt', description: 'Generate an atomic task breakdown for an AI workflow.' },
    { type: 'implementation_task', title: 'Atomic Task Exercise', description: 'Break a complex AI task into atomic, verifiable steps.' },
    { type: 'knowledge_check', title: 'Task Discipline Assessment', description: 'Test one-step task discipline mastery.' },
  ],
  'Verification & Evidence Gating': [
    { type: 'executive_reality_check', title: 'Quality Gate Reality', description: 'Without verification gates, AI output quality degrades silently.' },
    { type: 'ai_strategy', title: 'Verification Strategy', description: 'Design quality gates with automated checks and evidence requirements.' },
    { type: 'prompt_template', title: 'Evidence Gate Prompt', description: 'Generate verification gates and evidence requirements for AI outputs.' },
    { type: 'implementation_task', title: 'Verification Gate Task', description: 'Define quality gates for each phase of your AI build process.' },
    { type: 'knowledge_check', title: 'Evidence Gating Assessment', description: 'Validate verification and evidence gating skills.' },
  ],
  'Controlled Build: Simulation & Application': [
    { type: 'executive_reality_check', title: 'Controlled Build Reality', description: 'Synthesis of 3-agent system, task discipline, and verification gates.' },
    { type: 'ai_strategy', title: 'Build Control Strategy', description: 'Integrate all Module 4 patterns into a controlled build methodology.' },
    { type: 'prompt_template', title: 'Build Plan Prompt', description: 'Generate a complete controlled build plan with all safeguards.' },
    { type: 'implementation_task', title: 'Controlled Build Task', description: 'Produce a controlled build plan for your AI initiative.' },
    { type: 'knowledge_check', title: 'Controlled Build Assessment', description: 'Comprehensive Module 4 controlled build assessment.' },
  ],

  // Module 5: Internal Sell & 90-Day Roadmap
  'Selling AI Internally': [
    { type: 'executive_reality_check', title: 'Internal AI Sell Reality', description: 'Technical excellence means nothing without organizational buy-in.' },
    { type: 'ai_strategy', title: 'Stakeholder Mapping Strategy', description: 'Map stakeholders, anticipate objections, and build coalition support.' },
    { type: 'prompt_template', title: 'Stakeholder Pitch Prompt', description: 'Generate stakeholder-specific AI pitch narratives.' },
    { type: 'implementation_task', title: 'Coalition Building Task', description: 'Create a stakeholder engagement plan for your AI initiative.' },
    { type: 'knowledge_check', title: 'Internal Sell Assessment', description: 'Test internal selling and stakeholder management skills.' },
  ],
  'Governance Communication': [
    { type: 'executive_reality_check', title: 'Governance Comms Reality', description: 'Technical governance must be translated for non-technical stakeholders.' },
    { type: 'ai_strategy', title: 'Non-Technical Translation Strategy', description: 'Translate governance requirements into business-friendly language.' },
    { type: 'prompt_template', title: 'Governance Brief Prompt', description: 'Generate a non-technical governance communication brief.' },
    { type: 'implementation_task', title: 'Board Presentation Task', description: 'Create a board-ready AI governance communication package.' },
    { type: 'knowledge_check', title: 'Governance Comms Assessment', description: 'Validate governance communication skills.' },
  ],
  'ROI Framing': [
    { type: 'executive_reality_check', title: 'ROI Reality Check', description: 'AI ROI is more than cost savings — quantify risk reduction and strategic value.' },
    { type: 'ai_strategy', title: 'ROI Quantification Strategy', description: 'Build multi-dimensional ROI models including risk and strategic value.' },
    { type: 'prompt_template', title: 'ROI Analysis Prompt', description: 'Generate an AI ROI analysis with cost, revenue, and risk dimensions.' },
    { type: 'implementation_task', title: 'Business Case Task', description: 'Build a complete AI business case with ROI projections.' },
    { type: 'knowledge_check', title: 'ROI Framing Assessment', description: 'Test ROI quantification and business case skills.' },
  ],
  'Scaling Strategy': [
    { type: 'executive_reality_check', title: 'Scaling Reality', description: 'POC success does not equal production readiness — plan the transition.' },
    { type: 'ai_strategy', title: 'POC-to-Production Strategy', description: 'Design the scaling path from proof-of-concept to production deployment.' },
    { type: 'prompt_template', title: 'Scaling Plan Prompt', description: 'Generate a POC-to-production scaling plan.' },
    { type: 'implementation_task', title: 'Scaling Roadmap Task', description: 'Build a detailed scaling roadmap with milestones and dependencies.' },
    { type: 'knowledge_check', title: 'Scaling Assessment', description: 'Validate scaling strategy skills.' },
  ],
  '90-Day Roadmap & Executive Demo': [
    { type: 'executive_reality_check', title: 'Roadmap Reality', description: 'Turn all program learnings into a concrete 90-day action plan.' },
    { type: 'ai_strategy', title: '90-Day Planning Strategy', description: 'Prioritize, sequence, and resource your AI roadmap for the next 90 days.' },
    { type: 'prompt_template', title: 'Roadmap Prompt', description: 'Generate a comprehensive 90-day AI implementation roadmap.' },
    { type: 'implementation_task', title: 'Executive Demo Task', description: 'Prepare your final executive demo: roadmap presentation and live walkthrough.' },
    { type: 'knowledge_check', title: 'Roadmap Assessment', description: 'Comprehensive capstone assessment across all five modules.' },
  ],
};

async function seedMiniSections() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database.');

    // Ensure models are synced
    await MiniSection.sync();

    // Get all lessons
    const lessons = await CurriculumLesson.findAll({
      include: [{ model: CurriculumModule, as: 'module' }],
      order: [['lesson_number', 'ASC']],
    });

    console.log(`Found ${lessons.length} lessons.`);

    let created = 0;
    let skipped = 0;

    for (const lesson of lessons) {
      // Check if mini-sections already exist for this lesson
      const existing = await MiniSection.count({ where: { lesson_id: lesson.id } });
      if (existing > 0) {
        console.log(`  SKIP: "${lesson.title}" already has ${existing} mini-sections`);
        skipped++;
        continue;
      }

      // Find matching mini-section definitions
      const defs = LESSON_MINI_SECTIONS[lesson.title];
      if (!defs) {
        console.log(`  WARN: No mini-section definitions for "${lesson.title}"`);
        continue;
      }

      // Create 5 mini-sections
      for (let i = 0; i < defs.length; i++) {
        const def = defs[i];
        await MiniSection.create({
          id: uuidv4(),
          lesson_id: lesson.id,
          mini_section_type: def.type,
          mini_section_order: i + 1,
          title: def.title,
          description: def.description,
          completion_weight: 1.0,
          is_active: true,
          knowledge_check_config: def.type === 'knowledge_check'
            ? { enabled: true, question_count: 3, pass_score: 70 }
            : null,
        } as any);
      }

      const modNum = (lesson as any).module?.module_number || '?';
      console.log(`  OK: M${modNum}.${lesson.lesson_number} "${lesson.title}" — 5 mini-sections created`);
      created++;
    }

    console.log(`\nDone. Created mini-sections for ${created} lessons. Skipped ${skipped}.`);
    console.log(`Total mini-sections: ${created * 5}`);

    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seedMiniSections();
