/**
 * Seed: Create ArtifactDefinition records for all 25 lessons.
 * Each artifact is aligned with "Trust Before Intelligence" book frameworks.
 * Idempotent — skips if artifact already exists for that lesson.
 *
 * Run: cd backend && npx ts-node src/seeds/seedArtifactDefinitions.ts
 */
import '../models'; // init associations
import { sequelize } from '../config/database';
import ArtifactDefinition from '../models/ArtifactDefinition';
import CurriculumLesson from '../models/CurriculumLesson';

const LESSON_ARTIFACTS: Record<string, {
  name: string;
  artifact_type: string;
  description: string;
  evaluation_criteria: string;
}> = {
  // Module 1: AI Strategy & Trust Discipline
  'Executive AI Reality Check': {
    name: 'AI Readiness Diagnostic',
    artifact_type: 'assessment',
    description: 'A diagnostic assessment applying the Five Root Causes of AI Failure framework to the learner\'s organization, with a Trust Band baseline score.',
    evaluation_criteria: 'Five Root Causes diagnosis with all five causes scored for organizational relevance. Trust Band baseline score (0-100) with justification. Specific evidence for each root cause assessment. Actionable next steps prioritized by risk severity.',
  },
  'Trust Before Intelligence Framework': {
    name: 'Trust Architecture Blueprint',
    artifact_type: 'document',
    description: 'A trust architecture document scoring the organization on all six INPACT dimensions with infrastructure gap analysis.',
    evaluation_criteria: 'All six INPACT dimensions scored (1-6 scale each). Trust-first governance mapping showing infrastructure that must precede AI deployment. Trust Band composite score calculated. Gap analysis with specific infrastructure requirements per dimension.',
  },
  'Identifying Responsible AI Opportunities': {
    name: 'Responsible Opportunity Scorecard',
    artifact_type: 'document',
    description: 'A scored evaluation of AI opportunities against INPACT Permitted and Transparent dimensions, filtering out demo-driven development traps.',
    evaluation_criteria: 'INPACT P/T scoring for each opportunity. Anti-demo-driven validation (Root Cause #3 screening). Responsibility criteria clearly defined. Ranked opportunity list with infrastructure readiness assessment.',
  },
  'Industry-Specific AI Applications': {
    name: 'Industry AI Value Chain Map',
    artifact_type: 'document',
    description: 'An industry-specific mapping of AI capabilities to value chain stages with GOALS Lexicon and Semantic Layer requirements.',
    evaluation_criteria: 'GOALS Lexicon coverage analysis (required glossary terms, entity resolution challenges). GOALS Solid data quality gaps identified. 7-Layer Semantic Layer requirements per value chain stage. Industry-specific regulatory constraints mapped.',
  },
  'Strategy & Trust: Synthesis & Application': {
    name: 'Unified AI Strategy Brief',
    artifact_type: 'document',
    description: 'A comprehensive strategy document integrating INPACT diagnostic, GOALS assessment, Trust Band position, and Phase 1 Foundation plan.',
    evaluation_criteria: 'INPACT composite baseline score with all six dimensions. GOALS gap analysis across all five pillars. Trust Band position with target improvement. Phase 1 Foundation plan with infrastructure priorities. Executive-summary quality presentation.',
  },

  // Module 2: Governance & Risk Architecture
  'AI Risk Taxonomy': {
    name: 'AI Risk Register',
    artifact_type: 'document',
    description: 'A risk register organized by the Five Root Causes taxonomy with GOALS Governance pillar alignment.',
    evaluation_criteria: 'All five Root Causes scored for organizational relevance. Risk-weighted prioritization matrix. GOALS Governance pillar gap analysis. Mitigation strategies mapped to 7-Layer infrastructure components. Living document format for ongoing maintenance.',
  },
  'Data Classification & Sensitivity': {
    name: 'Data Classification Policy',
    artifact_type: 'document',
    description: 'A data classification framework aligned with GOALS Solid pillar requirements and 7-Layer Layer 1 storage patterns.',
    evaluation_criteria: 'GOALS Solid compliance (ISO 5259: accuracy 98%, completeness 99.5%, consistency 95%). Data assets mapped to sensitivity levels. 7-Layer Layer 1 storage modality recommendations per data type. Handling rules for each classification level.',
  },
  'Failure Modes & Guardrails': {
    name: 'Guardrail Specification',
    artifact_type: 'document',
    description: 'A guardrail specification mapped to 7-Layer Layer 6 Observability infrastructure with GOALS Observability alignment.',
    evaluation_criteria: 'Layer 6 Observability mapping (trace requirements, alert thresholds). GOALS Observability alignment (trace completeness >98%). Failure cascade analysis with detection mechanisms. Recovery paths with trigger conditions and escalation rules.',
  },
  'Human-in-the-Loop Design': {
    name: 'HITL Oversight Design',
    artifact_type: 'document',
    description: 'A human-in-the-loop design using 7-Layer Layer 5 Governance patterns with INPACT Permitted dimension compliance.',
    evaluation_criteria: 'Layer 5 ABAC policy design (5-factor model). HITL escalation categories defined. INPACT Permitted compliance (<15% escalation rate target). Intervention triggers with decision trees. Policy version control plan.',
  },
  'Governance: Blueprint & Application': {
    name: 'Governance Framework Document',
    artifact_type: 'document',
    description: 'A comprehensive governance framework integrating all five GOALS pillars with Trust Band governance scoring.',
    evaluation_criteria: 'All five GOALS pillars scored (1-5 maturity scale). Trust Band governance sub-score calculated. 7-Layer infrastructure requirements per pillar (G→L5, O→L6, A→L1-2, L→L3, S→L1). GOALS cascade analysis (S→L→G). Minimum 21/25 maturity target addressed.',
  },

  // Module 3: Requirements & Use Case Precision
  'Translating Business Goals into System Requirements': {
    name: 'System Requirements Specification',
    artifact_type: 'document',
    description: 'A system requirements document with INPACT Instant and Natural performance specifications.',
    evaluation_criteria: 'INPACT I/N performance targets specified (P95 <2s, entity resolution >98%). Measurable acceptance criteria for each requirement. Phase 1 Foundation infrastructure prerequisites identified. Testable specifications — not vague aspirations.',
  },
  'Input / Output Mapping': {
    name: 'Data Pipeline I/O Map',
    artifact_type: 'document',
    description: 'A data pipeline specification using 7-Layer Layers 1-2 architecture with GOALS Availability freshness targets.',
    evaluation_criteria: 'Layer 1 storage modality selection justified. Layer 2 CDC/streaming design specified. GOALS Availability targets (<30s freshness). Validation checkpoints at each pipeline stage. Data quality thresholds (GOALS Solid) at entry/exit points.',
  },
  'Decision Flow Modeling': {
    name: 'Decision Flow Model',
    artifact_type: 'document',
    description: 'A decision flow diagram mapped to 7-Layer Layer 4 Intelligence RAG pipeline stages with INPACT audit requirements.',
    evaluation_criteria: 'Layer 4 RAG stages mapped (query → embedding → retrieval → reranking → context → generation → caching). INPACT Adaptive feedback loops designed. INPACT Transparent audit evidence at each decision point. Quality gates per stage.',
  },
  'Edge Case & Failure State Design': {
    name: 'Edge Case Catalog',
    artifact_type: 'document',
    description: 'An edge case catalog with Layer 6 recovery patterns and Root Cause #1 Data Foundation Gaps mitigation.',
    evaluation_criteria: 'Layer 6 Observability detection mechanisms per edge case. Failure cascade analysis (stale cache → misresolution → auth violation). Root Cause #1 mitigation strategies. Alert threshold configurations. Recovery path for each scenario.',
  },
  'Requirements: Document Builder & Synthesis': {
    name: 'Complete Requirements Document',
    artifact_type: 'document',
    description: 'A complete AI requirements specification scored against INPACT composite and Phase Progression Phase 1-2 deliverables.',
    evaluation_criteria: 'INPACT composite score calculated across all six dimensions. Phase 1-2 deliverable checklist (Layers 1-4 infrastructure). GOALS pillar coverage for each requirement. Trust Band readiness assessment. Integrates all Module 3 artifacts (requirements, I/O map, decision flow, edge cases).',
  },

  // Module 4: The 3-Agent System & Controlled Build
  'Separation of Roles': {
    name: '3-Agent Role Specification',
    artifact_type: 'document',
    description: 'A Planner-Builder-Reviewer role specification using 7-Layer Layer 7 Orchestration patterns.',
    evaluation_criteria: 'Layer 7 Orchestration alignment (supervisor routing, agent coordination). Role boundaries clearly defined with handoff protocols. Shared state management design (Redis). INPACT Transparent audit evidence at each handoff. HITL escalation triggers specified.',
  },
  'Planner vs Executor': {
    name: 'Planning-Execution Boundary Document',
    artifact_type: 'document',
    description: 'A document defining planning-execution boundaries using Phase Progression methodology to prevent Root Cause #4.',
    evaluation_criteria: 'Phase Progression dependency chain documented (Layer 1→2→3→4). Root Cause #4 prevention checklist. Planning deliverables mapped to execution prerequisites. Phase boundary gates with completion criteria.',
  },
  'One-Step Task Discipline': {
    name: 'Atomic Task Breakdown',
    artifact_type: 'document',
    description: 'An atomic task breakdown with INPACT Instant verification checkpoints and Layer 7 state management.',
    evaluation_criteria: 'INPACT Instant (<2s) verification at each step. Phase Progression milestone alignment. Layer 7 state management checkpoints (Redis snapshots). Each step has: clear inputs, expected outputs, verification method. Rollback capability documented.',
  },
  'Verification & Evidence Gating': {
    name: 'Quality Gate Matrix',
    artifact_type: 'document',
    description: 'A quality gate matrix using Layer 6 Observability evidence collection with Trust Band score contributions.',
    evaluation_criteria: 'Layer 6 distributed tracing evidence requirements per gate. GOALS Observability thresholds (trace completeness >98%). Trust Band evidence contribution at each gate. Gate types specified (quality/performance/cost/compliance). Pass/fail criteria with escalation rules.',
  },
  'Controlled Build: Simulation & Application': {
    name: 'Controlled Build Plan',
    artifact_type: 'document',
    description: 'A controlled build plan targeting Phase Progression Phases 1-3 with Trust Band improvement trajectory.',
    evaluation_criteria: 'Phase-by-phase layer buildout (Phase 1: L1-2, Phase 2: L3-4, Phase 3: L5-7). 3-agent role assignments per phase. Trust Band milestone targets (28→42→67→86). Verification gates at phase boundaries. INPACT improvement projections per phase.',
  },

  // Module 5: Internal Sell & 90-Day Roadmap
  'Selling AI Internally': {
    name: 'Stakeholder Engagement Plan',
    artifact_type: 'document',
    description: 'A stakeholder engagement plan using Trust Band Scoring as credibility tool and Five Root Causes for objection handling.',
    evaluation_criteria: 'Trust Band score presented as credibility evidence. Five Root Causes mapped to per-stakeholder objections. Coalition-building sequence documented. Per-stakeholder messaging with framework-backed arguments. Communication cadence plan.',
  },
  'Governance Communication': {
    name: 'Board Governance Brief',
    artifact_type: 'document',
    description: 'A board-ready governance communication package translating GOALS and INPACT into executive language.',
    evaluation_criteria: 'GOALS G/O pillars translated to plain business language. INPACT Transparent evidence presented as business value (accountability, reliability, cost visibility). No technical jargon. Board-ready format. Compliance posture statement.',
  },
  'ROI Framing': {
    name: 'AI Business Case with ROI',
    artifact_type: 'document',
    description: 'A multi-dimensional business case using Phase Progression Echo Health benchmark as the reference framework.',
    evaluation_criteria: 'Phase Progression ROI benchmark referenced (Echo Health: $942K, 209% Y1 ROI, 10-week payback). Per-phase investment estimates. INPACT score improvement as trust ROI metric. Multi-dimensional value (cost, revenue, risk reduction, strategic). Assumptions clearly stated.',
  },
  'Scaling Strategy': {
    name: 'Scaling Roadmap',
    artifact_type: 'document',
    description: 'A Phase 3-4 scaling roadmap using full 7-Layer Architecture with Trust Band 86+ production target.',
    evaluation_criteria: 'Phase 3 (Trust) Layer 5-7 infrastructure plan. Phase 4 (Operations) readiness criteria. Full 7-Layer stack scaling requirements. Trust Band 86+ target with validation plan. Team allocation by phase. GOALS ≥21/25 production maturity target.',
  },
  '90-Day Roadmap & Executive Demo': {
    name: '90-Day Executive Roadmap',
    artifact_type: 'document',
    description: 'A comprehensive 90-day roadmap following Phase Progression with INPACT milestone targets and executive presentation.',
    evaluation_criteria: 'Phase Progression weekly milestones (Wk 1-4 Foundation, Wk 5-7 Intelligence, Wk 8-10 Trust, Wk 11-12 Operations). INPACT targets per phase (28→42→67→86→89). Budget estimates per phase (Echo Health benchmark). 7-Layer buildout sequence. Executive presentation quality — portfolio-worthy capstone.',
  },
};

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    console.log('\n=== Seeding Artifact Definitions ===');
    let created = 0;
    let skipped = 0;

    for (const [lessonTitle, def] of Object.entries(LESSON_ARTIFACTS)) {
      const lesson = await CurriculumLesson.findOne({ where: { title: lessonTitle } });
      if (!lesson) {
        console.log(`  SKIP: "${lessonTitle}" — lesson not found`);
        skipped++;
        continue;
      }

      const existing = await ArtifactDefinition.findOne({
        where: { lesson_id: lesson.id, name: def.name },
      });
      if (existing) {
        console.log(`  SKIP: "${def.name}" — already exists for "${lessonTitle}"`);
        skipped++;
        continue;
      }

      await ArtifactDefinition.create({
        lesson_id: lesson.id,
        name: def.name,
        artifact_type: def.artifact_type,
        description: def.description,
        evaluation_criteria: def.evaluation_criteria,
        sort_order: 1,
      } as any);

      console.log(`  OK: "${def.name}" → "${lessonTitle}"`);
      created++;
    }

    console.log(`\nCreated ${created} artifact(s), skipped ${skipped}.`);
    console.log('Artifact seed complete.');
    process.exit(0);
  } catch (err) {
    console.error('Artifact seed failed:', err);
    process.exit(1);
  }
}

run();
