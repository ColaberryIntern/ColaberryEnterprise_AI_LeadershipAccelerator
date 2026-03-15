/**
 * One-time seed: strip section prompts to minimal section-specific content.
 * Structure content (role, persona, output format) now lives in type definition
 * and is auto-appended at runtime. Section prompts only need unique overrides.
 *
 * Run: cd backend && npx ts-node src/seeds/backfillSectionPrompts.ts
 */
import '../models'; // init associations
import { sequelize } from '../config/database';
import MiniSection from '../models/MiniSection';

const PROMPT_DELIMITER = '\n\n---SECTION-SPECIFIC---\n\n';

function composePrompt(structural: string, sectionSpecific: string): string {
  const s = (structural || '').trim();
  const ss = (sectionSpecific || '').trim();
  if (!s && !ss) return '';
  if (!s) return ss;
  if (!ss) return s;
  return s + PROMPT_DELIMITER + ss;
}

function decomposePrompt(fullText: string): { structural: string; sectionSpecific: string } {
  if (!fullText) return { structural: '', sectionSpecific: '' };
  const idx = fullText.indexOf(PROMPT_DELIMITER);
  if (idx === -1) return { structural: '', sectionSpecific: fullText };
  return {
    structural: fullText.substring(0, idx),
    sectionSpecific: fullText.substring(idx + PROMPT_DELIMITER.length),
  };
}

// Minimal section prompts — only what's unique to THIS mini-section.
// Title, Description, and Structure (from type definition) carry 90%+ of context.
// Most sections just need a skill domain tag.
const SECTION_PROMPTS: Record<string, string> = {
  // Module 1, Lesson 1: Executive AI Reality Check
  'AI Hype vs Reality': 'Skill domain: strategy_trust.',
  'AI Competitive Strategy': 'Skill domain: strategy_trust.',
  'AI Readiness Prompt': 'Skill domain: strategy_trust.',
  'AI Maturity Assessment': 'Skill domain: strategy_trust.',
  'AI Reality Assessment': 'Skill domain: strategy_trust.',

  // Module 1, Lesson 2: Trust Before Intelligence Framework
  'Trust-First AI Reality': 'Skill domain: strategy_trust.',
  'Trust Architecture Strategy': 'Skill domain: strategy_trust.',
  'Stakeholder Trust Prompt': 'Skill domain: strategy_trust.',
  'Trust Framework Task': 'Skill domain: strategy_trust. Reference prior sections\' trust concepts.',
  'Trust Principles Assessment': 'Skill domain: strategy_trust.',

  // Module 1, Lesson 3: Identifying Responsible AI Opportunities
  'Responsible AI Reality': 'Skill domain: strategy_trust.',
  'Opportunity Scoring Strategy': 'Skill domain: strategy_trust.',
  'Opportunity Assessment Prompt': 'Skill domain: strategy_trust.',
  'Opportunity Evaluation Task': 'Skill domain: strategy_trust.',
  'Responsible AI Assessment': 'Skill domain: strategy_trust.',

  // Module 1, Lesson 4: Industry-Specific AI Applications
  'Industry AI Reality': 'Skill domain: strategy_trust.',
  'Industry Application Strategy': 'Skill domain: strategy_trust.',
  'Industry Use Case Prompt': 'Skill domain: strategy_trust.',
  'Industry Analysis Task': 'Skill domain: strategy_trust. Reference prior lesson frameworks.',
  'Industry AI Assessment': 'Skill domain: strategy_trust.',

  // Module 1, Lesson 5: Strategy & Trust Synthesis (capstone)
  'Strategy Synthesis Reality': 'Skill domain: strategy_trust. Capstone: integrate all Module 1 concepts.',
  'Strategic Integration': 'Skill domain: strategy_trust. Capstone: unify strategy, trust, and opportunity frameworks.',
  'Strategy Synthesis Prompt': 'Skill domain: strategy_trust. Capstone: reference all prior Module 1 outputs.',
  'Strategy Application Task': 'Skill domain: strategy_trust. Capstone deliverable integrating all Module 1 work.',
  'Strategy Assessment': 'Skill domain: strategy_trust. Capstone: test integration across all Module 1 lessons.',

  // Module 2, Lesson 1: AI Risk Taxonomy
  'Risk Landscape Reality': 'Skill domain: governance_risk.',
  'Risk Prioritization Strategy': 'Skill domain: governance_risk.',
  'Risk Assessment Prompt': 'Skill domain: governance_risk.',
  'Risk Register Task': 'Skill domain: governance_risk.',
  'Risk Taxonomy Assessment': 'Skill domain: governance_risk.',

  // Module 2, Lesson 2: Data Classification & Sensitivity
  'Data Sensitivity Reality': 'Skill domain: governance_risk.',
  'Data Governance Strategy': 'Skill domain: governance_risk.',
  'Data Classification Prompt': 'Skill domain: governance_risk.',
  'Data Inventory Task': 'Skill domain: governance_risk.',
  'Data Classification Assessment': 'Skill domain: governance_risk.',

  // Module 2, Lesson 3: Failure Modes & Guardrails
  'AI Failure Reality': 'Skill domain: governance_risk.',
  'Guardrail Design Strategy': 'Skill domain: governance_risk.',
  'Failure Analysis Prompt': 'Skill domain: governance_risk.',
  'Guardrail Implementation Task': 'Skill domain: governance_risk.',
  'Failure Modes Assessment': 'Skill domain: governance_risk.',

  // Module 2, Lesson 4: Human-in-the-Loop Design
  'Human Oversight Reality': 'Skill domain: governance_risk.',
  'Oversight Pattern Strategy': 'Skill domain: governance_risk.',
  'Oversight Design Prompt': 'Skill domain: governance_risk.',
  'Oversight Implementation Task': 'Skill domain: governance_risk.',
  'Human-in-the-Loop Assessment': 'Skill domain: governance_risk.',

  // Module 2, Lesson 5: Governance Blueprint (capstone)
  'Governance Reality': 'Skill domain: governance_risk. Capstone: integrate risk, data, failures, and oversight.',
  'Governance Framework Strategy': 'Skill domain: governance_risk. Capstone: unify all Module 2 frameworks.',
  'Governance Template Prompt': 'Skill domain: governance_risk. Capstone: reference all Module 2 outputs.',
  'Governance Document Task': 'Skill domain: governance_risk. Capstone deliverable integrating all Module 2 work.',
  'Governance Assessment': 'Skill domain: governance_risk. Capstone: test integration across all Module 2 lessons.',

  // Module 3, Lesson 1: Translating Business Goals
  'Requirements Reality': 'Skill domain: requirements_precision.',
  'Goal Decomposition Strategy': 'Skill domain: requirements_precision.',
  'Requirements Prompt': 'Skill domain: requirements_precision.',
  'Requirements Specification Task': 'Skill domain: requirements_precision.',
  'Requirements Assessment': 'Skill domain: requirements_precision.',

  // Module 3, Lesson 2: Input / Output Mapping
  'I/O Mapping Reality': 'Skill domain: requirements_precision.',
  'Data Flow Strategy': 'Skill domain: requirements_precision.',
  'I/O Mapping Prompt': 'Skill domain: requirements_precision.',
  'Data Pipeline Task': 'Skill domain: requirements_precision.',
  'I/O Mapping Assessment': 'Skill domain: requirements_precision.',

  // Module 3, Lesson 3: Decision Flow Modeling
  'Decision Flow Reality': 'Skill domain: requirements_precision.',
  'Decision Architecture Strategy': 'Skill domain: requirements_precision.',
  'Decision Tree Prompt': 'Skill domain: requirements_precision.',
  'Decision Flow Task': 'Skill domain: requirements_precision.',
  'Decision Modeling Assessment': 'Skill domain: requirements_precision.',

  // Module 3, Lesson 4: Edge Case & Failure State Design
  'Edge Case Reality': 'Skill domain: requirements_precision.',
  'Failure Prevention Strategy': 'Skill domain: requirements_precision.',
  'Edge Case Prompt': 'Skill domain: requirements_precision.',
  'Failure State Task': 'Skill domain: requirements_precision.',
  'Edge Case Assessment': 'Skill domain: requirements_precision.',

  // Module 3, Lesson 5: Requirements Document Builder (capstone)
  'Requirements Doc Reality': 'Skill domain: requirements_precision. Capstone: integrate all Module 3 artifacts.',
  'Specification Strategy': 'Skill domain: requirements_precision. Capstone: unify requirements, I/O, decisions, edge cases.',
  'Requirements Doc Prompt': 'Skill domain: requirements_precision. Capstone: reference all Module 3 outputs.',
  'Requirements Builder Task': 'Skill domain: requirements_precision. Capstone deliverable integrating all Module 3 work.',

  // Module 4, Lesson 1: Separation of Roles
  'Role Separation Reality': 'Skill domain: controlled_build.',
  'Multi-Agent Strategy': 'Skill domain: controlled_build.',
  'Role Definition Prompt': 'Skill domain: controlled_build.',
  'Agent Role Task': 'Skill domain: controlled_build.',
  'Role Separation Assessment': 'Skill domain: controlled_build.',

  // Module 4, Lesson 2: Planner vs Executor
  'Planning Discipline Reality': 'Skill domain: controlled_build.',
  'Execution Boundary Strategy': 'Skill domain: controlled_build.',
  'Task Decomposition Prompt': 'Skill domain: controlled_build.',
  'Planning Exercise Task': 'Skill domain: controlled_build.',
  'Planner vs Executor Assessment': 'Skill domain: controlled_build.',

  // Module 4, Lesson 3: One-Step Task Discipline
  'Atomic Task Reality': 'Skill domain: controlled_build.',
  'Step Isolation Strategy': 'Skill domain: controlled_build.',
  'Task Breakdown Prompt': 'Skill domain: controlled_build.',
  'Atomic Task Exercise': 'Skill domain: controlled_build.',
  'Task Discipline Assessment': 'Skill domain: controlled_build.',

  // Module 4, Lesson 4: Verification & Evidence Gating
  'Quality Gate Reality': 'Skill domain: controlled_build.',
  'Verification Strategy': 'Skill domain: controlled_build.',
  'Evidence Gate Prompt': 'Skill domain: controlled_build.',
  'Verification Gate Task': 'Skill domain: controlled_build.',
  'Evidence Gating Assessment': 'Skill domain: controlled_build.',

  // Module 4, Lesson 5: Controlled Build Synthesis (capstone)
  'Controlled Build Reality': 'Skill domain: controlled_build. Capstone: integrate roles, planning, tasks, verification.',
  'Build Control Strategy': 'Skill domain: controlled_build. Capstone: unify all Module 4 patterns.',
  'Build Plan Prompt': 'Skill domain: controlled_build. Capstone: reference all Module 4 outputs.',
  'Controlled Build Task': 'Skill domain: controlled_build. Capstone deliverable integrating all Module 4 work.',
  'Controlled Build Assessment': 'Skill domain: controlled_build. Capstone: test integration across all Module 4 lessons.',

  // Module 5, Lesson 1: Selling AI Internally
  'Internal AI Sell Reality': 'Skill domain: internal_sell.',
  'Stakeholder Mapping Strategy': 'Skill domain: internal_sell.',
  'Stakeholder Pitch Prompt': 'Skill domain: internal_sell.',
  'Coalition Building Task': 'Skill domain: internal_sell.',
  'Internal Sell Assessment': 'Skill domain: internal_sell.',

  // Module 5, Lesson 2: Governance Communication
  'Governance Comms Reality': 'Skill domain: internal_sell.',
  'Non-Technical Translation Strategy': 'Skill domain: internal_sell.',
  'Governance Brief Prompt': 'Skill domain: internal_sell.',
  'Board Presentation Task': 'Skill domain: internal_sell.',
  'Governance Comms Assessment': 'Skill domain: internal_sell.',

  // Module 5, Lesson 3: ROI Framing
  'ROI Reality Check': 'Skill domain: internal_sell.',
  'ROI Quantification Strategy': 'Skill domain: internal_sell.',
  'ROI Analysis Prompt': 'Skill domain: internal_sell.',
  'Business Case Task': 'Skill domain: internal_sell.',
  'ROI Framing Assessment': 'Skill domain: internal_sell.',

  // Module 5, Lesson 4: Scaling Strategy
  'Scaling Reality': 'Skill domain: internal_sell.',
  'POC-to-Production Strategy': 'Skill domain: internal_sell.',
  'Scaling Plan Prompt': 'Skill domain: internal_sell.',
  'Scaling Roadmap Task': 'Skill domain: internal_sell.',
  'Scaling Assessment': 'Skill domain: internal_sell.',

  // Module 5, Lesson 5: 90-Day Roadmap & Executive Demo (capstone)
  'Roadmap Reality': 'Skill domain: internal_sell. Capstone: synthesize all 5 modules into actionable planning.',
  '90-Day Planning Strategy': 'Skill domain: internal_sell. Capstone: convert all program learnings into week-by-week plan.',
  'Roadmap Prompt': 'Skill domain: internal_sell. Capstone: reference all 5 modules\' outputs.',
  'Executive Demo Task': 'Skill domain: internal_sell. Capstone deliverable of entire program. Portfolio-quality.',
  'Roadmap Assessment': 'Skill domain: internal_sell. Capstone: test integration across all 5 modules.',
};

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    const miniSections = await MiniSection.findAll();
    console.log(`Found ${miniSections.length} mini-sections.\n`);

    let updated = 0;
    let skipped = 0;
    for (const ms of miniSections) {
      const newSectionPrompt = SECTION_PROMPTS[ms.title];
      if (newSectionPrompt === undefined) {
        console.log(`  SKIP: "${ms.title}" — not in SECTION_PROMPTS map`);
        skipped++;
        continue;
      }

      // Preserve structural prefix, replace section-specific portion
      const currentFull = (ms as any).concept_prompt_system || '';
      const { structural } = decomposePrompt(currentFull);
      const composed = composePrompt(structural, newSectionPrompt);

      // Also clear other prompt fields (should already be empty from prior backfill)
      await ms.update({
        concept_prompt_system: composed,
        concept_prompt_user: '',
        build_prompt_system: '',
        build_prompt_user: '',
        mentor_prompt_system: '',
        mentor_prompt_user: '',
        kc_prompt_system: '',
        kc_prompt_user: '',
        reflection_prompt_system: '',
        reflection_prompt_user: '',
      });
      console.log(`  OK: "${ms.title}" — section prompt set to minimal`);
      updated++;
    }

    console.log(`\nUpdated ${updated} mini-section(s), skipped ${skipped}.`);
    console.log('Backfill complete.');
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
}

run();
