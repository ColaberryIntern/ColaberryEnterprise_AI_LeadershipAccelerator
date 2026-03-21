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
  'Executive AI Reality Check': 'Diagnose your organization\'s AI readiness by applying the Five Root Causes of AI Failure framework (Data Gaps, Architecture Misalignment, Demo-Driven Development, Reinvention, Misunderstanding) and establishing a Trust Band baseline score.',
  'Trust Before Intelligence Framework': 'Design a trust architecture using the INPACT framework (Instant, Natural, Permitted, Adaptive, Contextual, Transparent) to define the six infrastructure dimensions that must precede AI deployment.',
  'Identifying Responsible AI Opportunities': 'Evaluate and score AI opportunities against INPACT Permitted and Transparent dimensions to separate responsible initiatives from demo-driven development traps.',
  'Industry-Specific AI Applications': 'Map AI capabilities to your industry\'s value chain using the GOALS Lexicon pillar (semantic understanding, entity resolution) and 7-Layer Architecture Semantic Layer patterns.',
  'Strategy & Trust: Synthesis & Application': 'Synthesize INPACT diagnostic, GOALS operational pillars, and Phase Progression frameworks into a unified AI strategy with a baseline Trust Band score and Phase 1 Foundation plan.',

  // Module 2: Governance & Risk Architecture
  'AI Risk Taxonomy': 'Classify the full spectrum of AI risks using the Five Root Causes taxonomy (Data Gaps 30%, Architecture Misalignment 25%, Demo-Driven 20%, Reinvention 15%, Misunderstanding 10%) and prioritize by organizational exposure.',
  'Data Classification & Sensitivity': 'Design data classification policies aligned with GOALS Solid pillar requirements (accuracy 98%, completeness 99.5%, consistency 95%) and 7-Layer Architecture Layer 1 Multi-Modal Storage patterns.',
  'Failure Modes & Guardrails': 'Design layered guardrails mapped to 7-Layer Architecture Layer 6 Observability (distributed tracing, APM, alerting) and GOALS Observability pillar for failure detection and recovery.',
  'Human-in-the-Loop Design': 'Design HITL oversight patterns using 7-Layer Architecture Layer 5 Governance (5-factor ABAC authorization, policy evaluation <10ms) with INPACT Permitted dimension compliance targeting <15% escalation rate.',
  'Governance: Blueprint & Application': 'Build a governance framework integrating all five GOALS pillars (Governance, Observability, Availability, Lexicon, Solid) with Trust Band target scoring to validate operational readiness.',

  // Module 3: Requirements & Use Case Precision
  'Translating Business Goals into System Requirements': 'Translate business goals into measurable system requirements using INPACT Instant (<2s response, <30s freshness) and Natural (entity resolution >98%) performance specifications.',
  'Input / Output Mapping': 'Design data pipelines using 7-Layer Architecture Layers 1-2 (Multi-Modal Storage with 11 modal types + Real-Time Data Fabric with CDC and event streaming) for sub-30s data freshness.',
  'Decision Flow Modeling': 'Model decision flows using 7-Layer Architecture Layer 4 Intelligence (7-stage RAG: query understanding, embedding, retrieval, reranking, context assembly, generation, caching) with INPACT audit requirements.',
  'Edge Case & Failure State Design': 'Design edge case recovery patterns using 7-Layer Architecture Layer 6 Observability (trace completeness >98%, automated alerting) and Five Root Causes #1 Data Foundation Gaps mitigation strategies.',
  'Requirements: Document Builder & Synthesis': 'Produce a complete AI requirements specification scored against INPACT composite dimensions and mapped to Phase Progression Phase 1-2 deliverables (Foundation + Intelligence infrastructure).',

  // Module 4: The 3-Agent System & Controlled Build
  'Separation of Roles': 'Design the Planner-Builder-Reviewer pattern mapped to 7-Layer Architecture Layer 7 Orchestration (multi-agent coordination, shared state management, HITL escalation routing).',
  'Planner vs Executor': 'Define planning-execution boundaries using Phase Progression methodology to prevent Five Root Causes #4 Reinvention vs Framework failure — systematic approach over custom solutions.',
  'One-Step Task Discipline': 'Break complex AI tasks into atomic, verifiable steps with INPACT Instant (<2s) verification checkpoints and 7-Layer Layer 7 state management for progress tracking.',
  'Verification & Evidence Gating': 'Design quality gates using 7-Layer Layer 6 Observability (distributed tracing, 15-25 spans/query) and GOALS Observability pillar with Trust Band evidence requirements at each gate.',
  'Controlled Build: Simulation & Application': 'Integrate 3-agent system into a controlled build methodology targeting Phase Progression Phases 1-3 completion with Trust Band improvement from baseline to Moderate Trust (67+).',

  // Module 5: Internal Sell & 90-Day Roadmap
  'Selling AI Internally': 'Map stakeholders and build coalition support using Trust Band Scoring (0-100) as a credibility instrument and Five Root Causes as a structured objection-handling framework.',
  'Governance Communication': 'Translate GOALS Governance and Observability pillars into board-ready language with INPACT Transparent dimension compliance evidence (audit trails, trace completeness, cost attribution).',
  'ROI Framing': 'Build a multi-dimensional ROI model using Phase Progression Echo Health benchmark ($942K investment, 209% Year 1 ROI, 10-week payback) as the reference framework.',
  'Scaling Strategy': 'Design the Phase 3-4 scaling path (Trust to Operations) using the full 7-Layer Architecture stack with a production Trust Band target of High Trust (86+).',
  '90-Day Roadmap & Executive Demo': 'Synthesize all program frameworks into a 90-day roadmap following the Phase Progression model (Foundation Wk 1-4, Intelligence Wk 5-7, Trust Wk 8-10, Operations Wk 11-12) with INPACT milestone targets per phase.',
};

// ─── Mini-Section Rich Descriptions ──────────────────────────────
// Keyed by mini-section title. Descriptions carry the pedagogical
// guidance that was previously in structural prompts.

const MINI_SECTION_DESCRIPTIONS: Record<string, string> = {
  // Module 1, Lesson 1: Executive AI Reality Check — Framework: Five Root Causes + Trust Band
  'AI Hype vs Reality': 'Separate AI marketing claims from operational reality. Ground the analysis in the learner\'s specific industry, company size, and role. Focus on what this means for THEIR organization — concrete business language, not academic definitions. Include a memorable visual metaphor that makes the concept tangible. Apply the Five Root Causes of AI Failure framework to diagnose which root cause (Data Gaps 30%, Architecture Misalignment 25%, Demo-Driven Development 20%, Reinvention 15%, Misunderstanding 10%) most threatens the learner\'s organization.',
  'AI Competitive Strategy': 'Map the competitive landscape for AI adoption. Frame as strategic delegation: executives own decisions, AI provides analysis. Include 3-4 specific delegation scenarios and 3-4 human-only responsibilities. Generate a copy-paste-ready prompt personalized with learner context. Reference the Trust Band Scoring system (0-100) to quantify where the organization sits on the readiness spectrum.',
  'AI Readiness Prompt': 'Create a reusable prompt template to assess organizational AI readiness. Use {{placeholder}} syntax with {{company_name}}, {{industry}}, {{role}} as core placeholders. Output should include a Five Root Causes diagnostic checklist and an initial Trust Band score estimate. Include iteration tips for refining results.',
  'AI Maturity Assessment': 'Design a 30-60 minute hands-on exercise where the executive produces a practical AI maturity evaluation for their organization. Ground in the Five Root Causes framework — the deliverable should identify which of the five causes pose the greatest risk. Score against Trust Band criteria. Portfolio-worthy output.',
  'AI Reality Assessment': 'Scenario-based questions testing APPLICATION of Five Root Causes and Trust Band concepts, not recall. Use plausible distractors based on common executive misconceptions — especially Demo-Driven Development (Root Cause #3) and Conceptual Misunderstanding (Root Cause #5).',

  // Module 1, Lesson 2: Trust Before Intelligence Framework — Framework: INPACT (full) + Trust Band
  'Trust-First AI Reality': 'Why governance must precede capability in enterprise AI. Ground in the learner\'s industry — show how trust failures manifest in their specific context. Introduce the INPACT framework: the six dimensions (Instant, Natural, Permitted, Adaptive, Contextual, Transparent) that organizational infrastructure must provide before AI can be trusted.',
  'Trust Architecture Strategy': 'Design trust layers that enable rather than constrain AI deployment using the INPACT framework. Map each dimension to the learner\'s context: Instant (<2s response), Natural (business language), Permitted (ABAC authorization), Adaptive (continuous learning), Contextual (cross-domain), Transparent (audit trails). Include actionable prompt for self-assessment.',
  'Stakeholder Trust Prompt': 'Template to generate stakeholder-specific trust assessment using INPACT dimensions. Include placeholders for stakeholder role, concern type, and trust level. Output should map each INPACT dimension to stakeholder-relevant evidence and communication actions.',
  'Trust Framework Task': 'Build a trust architecture document scoring the learner\'s organization on all six INPACT dimensions (1-6 scale each, composite 0-100). 30-60 minute exercise producing a deliverable that maps trust gaps to specific infrastructure requirements. Reference Trust Band thresholds (86+ = production-ready).',
  'Trust Principles Assessment': 'Test mastery of INPACT framework and trust-first governance principles through scenario-based questions. Distractors should reflect common shortcuts — deploying capability before establishing Permitted (authorization) or Transparent (audit) infrastructure.',

  // Module 1, Lesson 3: Identifying Responsible AI Opportunities — Framework: INPACT P/T + Root Cause #3
  'Responsible AI Reality': 'Recognize the gap between ethical AI aspiration and operational implementation. Show how INPACT Permitted and Transparent dimensions define what responsible means in practice — not philosophy, but infrastructure. Use concrete examples of Demo-Driven Development (Root Cause #3) masquerading as responsible AI.',
  'Opportunity Scoring Strategy': 'Framework for evaluating AI opportunities against INPACT Permitted (authorization, compliance) and Transparent (audit, explainability) criteria. Include scoring dimensions grounded in the book\'s framework. Generate a decision matrix the learner can apply immediately to separate genuine opportunities from demo-driven traps.',
  'Opportunity Assessment Prompt': 'Template to evaluate and score potential AI use cases against INPACT P/T dimensions. Structured output with clear scoring rubric including: ABAC readiness, audit trail completeness, explainability requirements. Placeholders for industry regulatory context.',
  'Opportunity Evaluation Task': 'Score and prioritize three AI opportunities using INPACT Permitted and Transparent scoring criteria. 30-60 minute exercise producing a ranked opportunity list with responsibility justification. Flag any opportunity showing Demo-Driven Development (Root Cause #3) patterns.',
  'Responsible AI Assessment': 'Verify understanding of INPACT-based responsibility criteria through scenario-based questions. Test ability to distinguish infrastructure-backed responsible AI from Demo-Driven Development and AI-washing.',

  // Module 1, Lesson 4: Industry-Specific AI Applications — Framework: GOALS Lexicon/Solid + 7-Layer Semantic
  'Industry AI Reality': 'Ground AI possibilities in the learner\'s specific industry constraints, regulations, and competitive dynamics. Show how the GOALS Lexicon pillar (semantic understanding of 1000+ business terms, entity resolution >98%) determines whether AI can operate in industry-specific language. Include industry-specific failure examples from entity resolution gaps.',
  'Industry Application Strategy': 'Identify industry-specific AI patterns using the 7-Layer Architecture Semantic Layer (Layer 3) as the enabling infrastructure. Map AI capabilities to value chain stages — showing how glossary terms, ontologies, and knowledge graphs vary by industry. Include GOALS Solid pillar (data quality) requirements specific to the learner\'s regulatory context.',
  'Industry Use Case Prompt': 'Template to generate industry-tailored AI use cases with GOALS Lexicon and Solid alignment. Placeholders for industry sector, regulatory regime, and data quality maturity. Output should map use cases to required semantic layer infrastructure (glossary terms, entity resolution, ontology requirements).',
  'Industry Analysis Task': 'Map AI applications to the learner\'s industry value chain with GOALS Lexicon coverage analysis. 30-60 minute exercise producing an industry-specific AI opportunity map showing: required glossary terms, entity resolution challenges, and GOALS Solid data quality gaps. Portfolio-worthy output.',
  'Industry AI Assessment': 'Validate industry-specific AI application knowledge through GOALS Lexicon and Solid lens. Questions should test understanding of why entity resolution failures and data quality gaps block AI in specific industries.',

  // Module 1, Lesson 5: Strategy & Trust Synthesis — Framework: Phase Progression + Trust Band + INPACT composite
  'Strategy Synthesis Reality': 'Assess how INPACT diagnostic, GOALS operational pillars, and Phase Progression frameworks integrate in real deployment. Show the gap between isolated framework knowledge and unified execution. The Echo Health case study (28→89 INPACT in 90 days) demonstrates what synthesis looks like in practice.',
  'Strategic Integration': 'Unify INPACT, GOALS, Trust Band, and Phase Progression into a cohesive AI strategy. This is the capstone of Module 1 — map the learner\'s Trust Band baseline score to a Phase 1 Foundation plan. Generate a unified strategic brief with INPACT targets.',
  'Strategy Synthesis Prompt': 'Template to synthesize Module 1 learnings into an actionable strategy brief using Phase Progression Phase 1 (Foundation, Weeks 1-4) as the framework. Reference all prior section outputs. Output should include: INPACT baseline score, Trust Band position, Phase 1 infrastructure priorities, and GOALS readiness gaps.',
  'Strategy Application Task': 'Produce a unified AI strategy document for the learner\'s organization. Capstone deliverable integrating: Five Root Causes diagnosis, INPACT scorecard, Trust Band position, Phase 1 Foundation plan, and GOALS gap analysis. 30-60 minutes, portfolio-worthy.',
  'Strategy Assessment': 'Comprehensive Module 1 assessment testing integration of INPACT, GOALS, Trust Band, Five Root Causes, and Phase Progression frameworks — not isolated concept recall. Questions should present complex organizational scenarios requiring multi-framework analysis.',

  // Module 2, Lesson 1: AI Risk Taxonomy — Framework: Five Root Causes (all 5) + GOALS Governance
  'Risk Landscape Reality': 'Map the full spectrum of AI risks using the Five Root Causes taxonomy: Data Foundation Gaps (30%), Architecture Misalignment (25%), Demo-Driven Development (20%), Reinvention vs Framework (15%), Conceptual Misunderstanding (10%). Ground in learner\'s industry-specific risk landscape. Visual metaphor of risk iceberg — the root causes that executives cannot see.',
  'Risk Prioritization Strategy': 'Prioritize risks by mapping each to the Five Root Causes and GOALS Governance pillar requirements. Framework for risk delegation: which risks ABAC authorization handles vs which require HITL escalation. Actionable risk matrix weighted by root cause percentages.',
  'Risk Assessment Prompt': 'Template to identify and categorize AI risks using the Five Root Causes framework. Structured output with: root cause classification, GOALS Governance gap analysis, severity ratings, and mitigation actions mapped to 7-Layer Architecture components.',
  'Risk Register Task': 'Build an AI risk register organized by Five Root Causes. 30-60 minute exercise producing a living document mapping each risk to: root cause category, GOALS pillar impact, and required 7-Layer infrastructure mitigation. Portfolio-worthy output.',
  'Risk Taxonomy Assessment': 'Test understanding of Five Root Causes taxonomy and GOALS Governance alignment. Questions should reveal blind spots — especially Root Cause #3 (Demo-Driven Development) which executives systematically underestimate.',

  // Module 2, Lesson 2: Data Classification & Sensitivity — Framework: GOALS Solid (ISO 5259) + 7-Layer Layer 1
  'Data Sensitivity Reality': 'Understand data classification imperatives through the GOALS Solid pillar lens (ISO/IEC 5259): accuracy 98%, completeness 99.5%, consistency 95%, currentness <30s, traceability 100%. Show how classification failures cascade through 7-Layer Architecture Layer 1 Multi-Modal Storage.',
  'Data Governance Strategy': 'Design data handling policies using GOALS Solid pillar metrics as acceptance criteria. Framework for data delegation across 7-Layer Layer 1 storage types: RDBMS, NoSQL, Graph, Object, Lakehouse — which data goes where and what classification controls each type requires.',
  'Data Classification Prompt': 'Template to generate a data classification framework aligned with GOALS Solid requirements. Output should map data types to: sensitivity levels, ISO 5259 quality thresholds (accuracy, completeness, consistency), and 7-Layer Layer 1 storage type recommendations.',
  'Data Inventory Task': 'Classify the learner\'s organization\'s key data assets using GOALS Solid metrics. 30-60 minute exercise producing a data inventory mapping assets to: sensitivity level, quality scores, required storage modality (Layer 1), and handling policies. Portfolio-worthy output.',
  'Data Classification Assessment': 'Validate data classification knowledge through GOALS Solid and 7-Layer Layer 1 lens. Test ability to correctly classify ambiguous data types, assign ISO 5259 quality thresholds, and select appropriate storage modalities.',

  // Module 2, Lesson 3: Failure Modes & Guardrails — Framework: 7-Layer Layer 6 Observability + GOALS Observability
  'AI Failure Reality': 'Recognize how AI systems fail using 7-Layer Architecture Layer 6 Observability as the detection framework: distributed tracing (15-25 spans/query), APM monitoring, cost attribution, drift detection. Show cascading failure patterns specific to the learner\'s industry — response >2s abandonment, entity misresolution, stale cache errors.',
  'Guardrail Design Strategy': 'Design layered guardrails mapped to GOALS Observability pillar: automated monitoring (Datadog/Prometheus), distributed tracing (OpenTelemetry), cost attribution, and alert configuration (latency >5s, spend >120%, accuracy <-5%, errors >2%). Framework for guardrail delegation: what Layer 6 automates vs what triggers HITL.',
  'Failure Analysis Prompt': 'Template to analyze failure modes using 7-Layer Layer 6 Observability patterns. Output should map each failure scenario to: detection mechanism (trace/alert/dashboard), prevention control, recovery path, and GOALS Observability metric thresholds.',
  'Guardrail Implementation Task': 'Design guardrails for a specific AI use case using 7-Layer Layer 6 Observability infrastructure. 30-60 minute exercise producing a guardrail specification with: trace span requirements, alert thresholds, cost attribution rules, and drift detection triggers.',
  'Failure Modes Assessment': 'Test understanding of 7-Layer Layer 6 failure detection and GOALS Observability guardrail design. Present realistic cascading failure scenarios (e.g., stale cache → entity misresolution → authorization violation) and test recovery path design.',

  // Module 2, Lesson 4: Human-in-the-Loop Design — Framework: 7-Layer Layer 5 Governance (ABAC/HITL) + INPACT Permitted
  'Human Oversight Reality': 'Why full automation is a myth — using INPACT Permitted dimension to define the authorization boundary. Show the 5-factor ABAC model: Subject (role, credentials), Resource (classification), Action (read/write/prescribe), Context (time, location, device), Environment. Most AI must operate within HITL-bounded zones.',
  'Oversight Pattern Strategy': 'Design HITL workflows using 7-Layer Layer 5 Governance patterns: ABAC policy evaluation (<10ms), eight high-risk escalation categories, policy versioning, and <15% HITL escalation rate target. Framework for determining where on the automation spectrum each AI function should sit based on INPACT Permitted scoring.',
  'Oversight Design Prompt': 'Template to generate a HITL design using 7-Layer Layer 5 Governance infrastructure. Output should specify: ABAC policy rules (5-factor), escalation categories, intervention triggers, policy version control, and INPACT Permitted compliance score.',
  'Oversight Implementation Task': 'Define HITL checkpoints and escalation rules using 7-Layer Layer 5 patterns. 30-60 minute exercise producing an oversight design with: ABAC policies, escalation categories (reference Echo Health\'s 8 categories), intervention triggers, and <15% escalation rate target.',
  'Human-in-the-Loop Assessment': 'Validate HITL design using INPACT Permitted and 7-Layer Layer 5 concepts. Test ability to design ABAC policies, set appropriate escalation thresholds, and avoid both over-automation (P=1, no oversight) and over-control (P=6 but >50% escalation rate).',

  // Module 2, Lesson 5: Governance Blueprint — Framework: GOALS (full) + 7-Layer Layers 5-6 + Trust Band
  'Governance Reality': 'Assess governance readiness using the full GOALS framework: Governance (G), Observability (O), Availability (A), Lexicon (L), Solid (S). Show how each pillar connects to Module 2 lessons: risk→G, data→S, failures→O, oversight→G. Score current state against GOALS minimum maturity (21/25).',
  'Governance Framework Strategy': 'Build a governance framework integrating all five GOALS pillars. Map each pillar to 7-Layer infrastructure: G→Layer 5, O→Layer 6, A→Layers 1-2, L→Layer 3, S→Layer 1. Capstone of Module 2 — score against Trust Band governance threshold.',
  'Governance Template Prompt': 'Template to generate a comprehensive governance blueprint using GOALS 5-pillar structure. Reference all Module 2 outputs as inputs. Output should include: per-pillar maturity score (1-5), Trust Band governance sub-score, and 7-Layer infrastructure requirements per pillar.',
  'Governance Document Task': 'Produce a GOALS-structured governance framework document. Capstone deliverable integrating all Module 2 work: risk register (G), data classification (S), guardrail spec (O), HITL design (G). Score against Trust Band criteria. 30-60 minutes, portfolio-worthy.',
  'Governance Assessment': 'Comprehensive Module 2 assessment testing GOALS framework integration. Questions should test ability to: score GOALS pillars, map to 7-Layer infrastructure, identify GOALS cascade failures (S→L→G), and calculate Trust Band governance readiness.',

  // Module 3, Lesson 1: Translating Business Goals — Framework: INPACT I/N + Phase Progression Phase 1
  'Requirements Reality': 'The gap between business intent and system specification costs projects. Show how vague requirements violate INPACT Instant (<2s response) and Natural (business language understanding) dimensions. Concrete examples: Echo Health\'s failed pilots traced to requirements that ignored infrastructure performance thresholds.',
  'Goal Decomposition Strategy': 'Break business goals into measurable, testable system requirements using INPACT performance specifications: Instant (P95 response <2s, CDC <30s latency), Natural (entity resolution >98%, query interpretation >95%). Framework for translating executive language into INPACT-scored engineering specifications.',
  'Requirements Prompt': 'Template to translate a business goal into INPACT-aligned system requirements. Output should include: INPACT I/N performance targets, GOALS Availability/Lexicon acceptance criteria, and Phase 1 Foundation infrastructure prerequisites. Placeholders for business goal and context.',
  'Requirements Specification Task': 'Write system requirements for a real business goal using INPACT performance specifications. 30-60 minute exercise producing a specification with: response time targets (INPACT I), entity resolution accuracy (INPACT N), and Phase 1 Foundation alignment. Portfolio-worthy output.',
  'Requirements Assessment': 'Test requirements translation skills using INPACT I/N dimensions. Present business goals and evaluate ability to decompose them into INPACT-scored specifications with measurable thresholds.',

  // Module 3, Lesson 2: Input / Output Mapping — Framework: 7-Layer Layers 1-2 + GOALS Availability
  'I/O Mapping Reality': 'Unclear inputs and outputs are Root Cause #1 (Data Foundation Gaps, 30%). Show how 7-Layer Architecture Layers 1-2 define the data infrastructure: Layer 1 (11 modal storage types) handles diverse inputs, Layer 2 (Real-Time Data Fabric with CDC) ensures <30s freshness. Ambiguous I/O specifications cascade into system failures.',
  'Data Flow Strategy': 'Design clear data pipelines using 7-Layer Layers 1-2: Multi-Modal Storage (RDBMS, NoSQL, Graph, Object, Lakehouse, Model Registry, Time-Series, Search Index, Cache) for inputs, Real-Time Data Fabric (CDC via Debezium, Kafka event streaming, Flink processing) for transformation. GOALS Availability pillar targets for each stage.',
  'I/O Mapping Prompt': 'Template to generate an input/output map using 7-Layer Layers 1-2 architecture. Output should specify: source data modal type (Layer 1), CDC/streaming transformation (Layer 2), GOALS Availability freshness targets (<30s), and GOALS Solid quality thresholds at each pipeline stage.',
  'Data Pipeline Task': 'Document the complete I/O map for a specific AI use case using 7-Layer Layers 1-2. 30-60 minute exercise producing a data pipeline specification mapping: source → storage modality (Layer 1) → CDC stream (Layer 2) → validation checkpoint → output with GOALS Availability targets.',
  'I/O Mapping Assessment': 'Validate I/O mapping skills using 7-Layer Layers 1-2 concepts. Test ability to: select correct storage modalities, design CDC event streams, identify freshness violations (GOALS Availability), and prevent Root Cause #1 Data Foundation Gaps.',

  // Module 3, Lesson 3: Decision Flow Modeling — Framework: 7-Layer Layer 4 Intelligence (RAG) + INPACT A/T
  'Decision Flow Reality': 'AI decisions need explicit logic paths, not black-box inference. Show how 7-Layer Layer 4 Intelligence uses a 7-stage RAG pipeline to make decisions transparent: query understanding → embedding → hybrid retrieval → reranking → context assembly → generation → caching. Undocumented decision logic violates INPACT Transparent dimension.',
  'Decision Architecture Strategy': 'Model decision trees mapped to 7-Layer Layer 4 RAG stages. At each stage, define: inputs, processing logic, quality criteria, and audit outputs. Use INPACT Adaptive (continuous learning) to design feedback loops. Framework for making AI decision paths explicit, testable, and compliant with INPACT Transparent audit requirements.',
  'Decision Tree Prompt': 'Template to generate a decision flow model using 7-Layer Layer 4 Intelligence pipeline stages. Output should map each RAG stage (query → embedding → retrieval → reranking → context → generation → caching) to: decision criteria, quality gate, and INPACT A/T audit evidence requirements.',
  'Decision Flow Task': 'Build a complete decision flow diagram mapped to 7-Layer Layer 4 RAG pipeline. 30-60 minute exercise producing a visual decision tree with: documented logic at each stage, INPACT Adaptive feedback loops, and INPACT Transparent audit trail requirements.',
  'Decision Modeling Assessment': 'Test decision flow modeling using 7-Layer Layer 4 and INPACT A/T concepts. Present complex scenarios requiring multi-stage RAG pipeline design with audit trail completeness requirements.',

  // Module 3, Lesson 4: Edge Case & Failure State Design — Framework: 7-Layer Layer 6 Observability + Root Cause #1
  'Edge Case Reality': 'Edge cases are where AI systems fail in production — plan for them using 7-Layer Layer 6 Observability patterns. The book documents critical failure cascades: response >2s → user abandonment, entity misresolution → authorization violation, stale cache → data integrity breach. Root Cause #1 (Data Foundation Gaps) creates the most dangerous edge cases.',
  'Failure Prevention Strategy': 'Anticipate failures using 7-Layer Layer 6 alert categories: latency >5s, spend >120% baseline, accuracy <-5%, errors >2%. Design recovery paths with distributed tracing (15-25 spans/query for diagnosis). Framework for systematic edge case discovery targeting Root Cause #1 Data Foundation Gaps — the 30% failure driver.',
  'Edge Case Prompt': 'Template to generate edge case scenarios using 7-Layer Layer 6 Observability failure patterns. Output should map each edge case to: detection mechanism (trace/alert), Root Cause classification, recovery mechanism, and GOALS Observability/Solid validation criteria.',
  'Failure State Task': 'Document edge cases and recovery paths using 7-Layer Layer 6 patterns. 30-60 minute exercise producing an edge case catalog with: failure cascades, Root Cause #1 mitigation strategies, trace requirements, and alert threshold configurations.',
  'Edge Case Assessment': 'Validate edge case design using 7-Layer Layer 6 and Root Cause #1 concepts. Test ability to: anticipate cascade failures (stale cache → misresolution → authorization violation), design trace-based detection, and mitigate Data Foundation Gaps.',

  // Module 3, Lesson 5: Requirements Document Builder — Framework: Phase Progression Phases 1-2 + INPACT composite
  'Requirements Doc Reality': 'A complete requirements document is the foundation of controlled AI builds. Show how all Module 3 artifacts map to Phase Progression Phase 1 (Foundation: Layers 1-2) and Phase 2 (Intelligence: Layers 3-4) deliverables. The Echo Health case achieved 28→67 INPACT through these two phases.',
  'Specification Strategy': 'Integrate requirements (INPACT I/N specs), I/O maps (Layers 1-2), decision flows (Layer 4 RAG), and edge cases (Layer 6) into a unified specification. Capstone of Module 3 — score the complete specification against INPACT composite to determine Trust Band position.',
  'Requirements Doc Prompt': 'Template to synthesize all Module 3 artifacts into a requirements specification scored against Phase Progression Phase 1-2 deliverables. Output should include: INPACT composite score, Layer 1-4 infrastructure requirements, GOALS pillar coverage, and Trust Band readiness assessment.',
  'Requirements Builder Task': 'Produce a complete AI requirements specification scored against INPACT composite and Phase Progression Phase 1-2 checklist. Capstone deliverable integrating all Module 3 work. Score against Trust Band — target: move from current band to next level. 30-60 minutes, portfolio-worthy.',
  // Note: 'Requirements Assessment' appears in both M3L1 and M3L5 — use lesson context to differentiate
  // M3L5 version:

  // Module 4, Lesson 1: Separation of Roles — Framework: 7-Layer Layer 7 Orchestration + INPACT Transparent
  'Role Separation Reality': 'Why mixing planning, execution, and review in one agent fails. 7-Layer Architecture Layer 7 Orchestration defines the multi-agent coordination pattern: supervisor routing, shared Redis state (15-min TTL), and parallel execution (Echo Health: 4.2s total for 3-agent discharge query). Role confusion violates INPACT Transparent dimension — audit trails become incoherent.',
  'Multi-Agent Strategy': 'Design the Planner-Builder-Reviewer pattern using 7-Layer Layer 7 Orchestration infrastructure: LangGraph supervisor pattern, agent routing, context management, HITL escalation. Each role has defined state boundaries and handoff protocols with INPACT Transparent audit trail requirements.',
  'Role Definition Prompt': 'Template to generate role definitions for a 3-agent system using 7-Layer Layer 7 patterns. Output should specify: each role\'s responsibilities, shared state model (Redis), handoff criteria, escalation triggers, and INPACT Transparent audit evidence at each handoff.',
  'Agent Role Task': 'Define Planner, Builder, and Reviewer roles using 7-Layer Layer 7 Orchestration patterns. 30-60 minute exercise producing: role specification with state management, handoff protocols, HITL escalation triggers, and INPACT Transparent compliance requirements. Portfolio-worthy output.',
  'Role Separation Assessment': 'Test understanding of 7-Layer Layer 7 multi-agent coordination. Questions should present scenarios where role confusion causes: state corruption, audit trail gaps (INPACT T violation), and cascading errors from missing HITL escalation.',

  // Module 4, Lesson 2: Planner vs Executor — Framework: 7-Layer Layer 7 + Root Cause #4 Reinvention
  'Planning Discipline Reality': 'Execution without planning is Root Cause #4: Reinvention vs Framework (15% of failures). Show how premature execution — building custom solutions instead of following systematic Phase Progression — wastes resources. 7-Layer Layer 7 Orchestration requires explicit planning-execution separation.',
  'Execution Boundary Strategy': 'Define clear boundaries between planning and execution using Phase Progression methodology. Phase 1 (Foundation) must complete before Phase 2 (Intelligence) begins — dependencies are sequential, not parallelizable. Framework for determining when planning deliverables satisfy execution prerequisites to prevent Root Cause #4.',
  'Task Decomposition Prompt': 'Template to generate a task decomposition plan using Phase Progression phase boundaries. Output should map: planning deliverables to execution prerequisites, phase dependencies (Layer 1 before Layer 2, Layer 3 before Layer 4), and Root Cause #4 prevention checklist.',
  'Planning Exercise Task': 'Create a planning document with Phase Progression phase boundaries. 30-60 minute exercise producing a plan that explicitly separates: Phase 1 Foundation planning from Phase 2 Intelligence execution, with Root Cause #4 checkpoints at each boundary.',
  'Planner vs Executor Assessment': 'Validate planning discipline using Phase Progression and Root Cause #4 concepts. Test ability to identify premature execution (skipping phases), insufficient planning (missing layer dependencies), and Reinvention patterns.',

  // Module 4, Lesson 3: One-Step Task Discipline — Framework: Phase Progression methodology + 7-Layer Layer 7 state
  'Atomic Task Reality': 'Complex tasks succeed when broken into verifiable atomic steps with INPACT Instant (<2s) verification at each checkpoint. Show how compound tasks hide failures — 7-Layer Layer 7 state management (Redis, 15-min TTL) enables per-step progress tracking and rollback.',
  'Step Isolation Strategy': 'Design atomic tasks with clear inputs, outputs, and INPACT Instant verification criteria at each step. Use Phase Progression weekly milestone granularity as the model. Framework for determining the right granularity — small enough for <2s verification, large enough to advance the Phase Progression timeline.',
  'Task Breakdown Prompt': 'Template to generate an atomic task breakdown using Phase Progression weekly milestones. Output should list each step with: inputs, expected outputs, INPACT Instant verification method (<2s check), 7-Layer Layer 7 state checkpoint, and Phase Progression alignment.',
  'Atomic Task Exercise': 'Break a complex AI task into atomic, verifiable steps with 7-Layer Layer 7 state management. 30-60 minute exercise producing a step-by-step execution plan with: INPACT Instant verification checkpoints, Redis state snapshots, and Phase Progression milestone markers.',
  'Task Discipline Assessment': 'Test one-step task discipline using INPACT Instant verification and Phase Progression methodology. Present compound tasks and evaluate ability to decompose into atomic steps with proper state management and verification.',

  // Module 4, Lesson 4: Verification & Evidence Gating — Framework: 7-Layer Layer 6 Observability + GOALS Observability + Trust Band
  'Quality Gate Reality': 'Without verification gates, AI output quality degrades silently — violating GOALS Observability pillar. 7-Layer Layer 6 distributed tracing (15-25 spans/query) enables evidence collection at each gate. Trust Band score cannot improve without verified evidence at each phase transition.',
  'Verification Strategy': 'Design quality gates using 7-Layer Layer 6 Observability infrastructure: distributed tracing spans as evidence, APM dashboards as gate status, cost attribution as budget gates. GOALS Observability metrics define what evidence is needed: trace completeness >98%, alert response <5min. Trust Band requires evidence at each gate.',
  'Evidence Gate Prompt': 'Template to generate verification gates using 7-Layer Layer 6 and GOALS Observability criteria. Output should specify: gate type (quality/performance/cost/compliance), evidence requirements (trace spans, APM metrics), Trust Band contribution, and pass/fail thresholds.',
  'Verification Gate Task': 'Define quality gates for each phase of the learner\'s AI build using 7-Layer Layer 6 evidence collection. 30-60 minute exercise producing a gate matrix with: trace requirements, GOALS Observability thresholds, Trust Band evidence contributions, and HITL review triggers.',
  'Evidence Gating Assessment': 'Validate verification design using 7-Layer Layer 6 and Trust Band evidence requirements. Test ability to design gates that: collect appropriate trace evidence, meet GOALS Observability thresholds, and advance Trust Band score without creating bottlenecks.',

  // Module 4, Lesson 5: Controlled Build Synthesis — Framework: Phase Progression Phases 1-3 + Trust Band 28→86
  'Controlled Build Reality': 'Synthesis of 3-agent system, task discipline, and verification gates into Phase Progression Phases 1-3 (Foundation → Intelligence → Trust). Echo Health achieved Trust Band improvement from 28 (Very Low) to 86 (High Trust) using this integrated methodology. All Module 4 patterns reinforce the phase-gated approach.',
  'Build Control Strategy': 'Integrate all Module 4 patterns into Phase Progression Phases 1-3: Phase 1 (Layers 1-2, Foundation), Phase 2 (Layers 3-4, Intelligence), Phase 3 (Layers 5-7, Trust). Each phase uses: 3-agent roles (Layer 7), atomic tasks (Phase milestones), and verification gates (Layer 6). Target: Trust Band improvement to Moderate Trust (67+).',
  'Build Plan Prompt': 'Template to generate a controlled build plan following Phase Progression Phases 1-3. Reference all Module 4 outputs. Output should include: phase-by-phase layer buildout, 3-agent role assignments per phase, verification gates at phase boundaries, and Trust Band milestone targets (28→42→67→86).',
  'Controlled Build Task': 'Produce a controlled build plan targeting Phase Progression Phases 1-3 with Trust Band improvement trajectory. Capstone deliverable integrating: 3-agent roles, phase boundaries, atomic task breakdowns, verification gates, and INPACT milestone targets. 30-60 minutes, portfolio-worthy.',
  'Controlled Build Assessment': 'Comprehensive Module 4 assessment testing Phase Progression and Trust Band integration. Questions should test: phase dependency ordering, 3-agent coordination across phases, verification gate design, and Trust Band improvement calculation.',

  // Module 5, Lesson 1: Selling AI Internally — Framework: Trust Band Scoring + Five Root Causes (objection handling)
  'Internal AI Sell Reality': 'Technical excellence means nothing without organizational buy-in. Show how Trust Band Scoring (0-100) transforms the internal sell from opinion-based advocacy into evidence-based credibility. The Five Root Causes framework turns common objections into diagnostic conversations — executives engage with structured analysis, not hype.',
  'Stakeholder Mapping Strategy': 'Map stakeholders and anticipate objections using Five Root Causes as a structured objection-handling toolkit: Data Gaps objections → Layer 1-2 solutions, Architecture objections → ABAC/HITL, Demo-Driven objections → Phase Progression discipline. Trust Band score provides the credibility anchor for each conversation.',
  'Stakeholder Pitch Prompt': 'Template to generate stakeholder-specific AI pitch narratives using Trust Band evidence. Placeholders for: stakeholder role, primary Root Cause concern, current Trust Band score, and target improvement. Output should be presentation-ready with framework-backed credibility.',
  'Coalition Building Task': 'Create a stakeholder engagement plan using Trust Band Scoring and Five Root Causes. 30-60 minute exercise producing: stakeholder map, per-stakeholder Root Cause objection handlers, Trust Band evidence package, and coalition-building sequence. Portfolio-worthy output.',
  'Internal Sell Assessment': 'Test internal selling using Trust Band and Five Root Causes frameworks. Questions should present organizational resistance scenarios and evaluate ability to: deploy Trust Band as credibility evidence, use Root Causes to reframe objections, and build evidence-based coalitions.',

  // Module 5, Lesson 2: Governance Communication — Framework: GOALS G/O + INPACT Transparent
  'Governance Comms Reality': 'Technical governance (GOALS pillars, 7-Layer Architecture, ABAC policies) must be translated for non-technical stakeholders. Show how INPACT Transparent dimension provides the bridge: audit trails become accountability evidence, trace completeness becomes reliability proof, cost attribution becomes budget stewardship.',
  'Non-Technical Translation Strategy': 'Translate GOALS Governance and Observability pillars into board-ready language. Framework: G (Governance) → "We control who sees what and when" + O (Observability) → "We can prove it\'s working and catch problems before users do." Map INPACT Transparent evidence to business outcomes.',
  'Governance Brief Prompt': 'Template to generate a board-ready governance brief translating GOALS G/O pillars. Output should include: plain-language GOALS pillar summaries, INPACT Transparent evidence (audit completeness, trace coverage, cost visibility), and business-impact translations. Board-ready, no jargon.',
  'Board Presentation Task': 'Create a board-ready governance communication package translating GOALS and INPACT into executive language. 30-60 minute exercise producing: plain-language GOALS summary, INPACT Transparent evidence deck, cost attribution dashboard mockup, and compliance posture statement.',
  'Governance Comms Assessment': 'Validate governance communication using GOALS and INPACT translation skills. Test ability to: explain GOALS pillars without technical jargon, present INPACT Transparent evidence as business value, and handle board questions about AI governance with framework-backed confidence.',

  // Module 5, Lesson 3: ROI Framing — Framework: Phase Progression Echo Health ROI + INPACT composite
  'ROI Reality Check': 'AI ROI is more than cost savings — the Phase Progression Echo Health case study proves it: $942K investment, 209% Year 1 ROI, 10-week payback from deployment. Multi-dimensional ROI includes: INPACT score improvement (28→89 = quantifiable trust), cache hit rates (84% LLM cost reduction), and response time improvement (9-13s→1.8s = user adoption).',
  'ROI Quantification Strategy': 'Build multi-dimensional ROI models using Phase Progression Echo Health benchmark: Phase 1 Foundation ($468K, cache acceleration 24x), Phase 2 Intelligence ($392K, query accuracy 47→96%), Phase 3 Trust ($82K, 78% under budget). Framework: INPACT score improvement per dollar spent = trust ROI.',
  'ROI Analysis Prompt': 'Template to generate an AI ROI analysis using Phase Progression cost benchmarks. Output should include: per-phase investment estimates (Echo Health as reference), INPACT score improvement projections, GOALS metric improvements, Trust Band progression milestones, and multi-year ROI with payback calculation.',
  'Business Case Task': 'Build a complete AI business case using Phase Progression ROI framework. 30-60 minute exercise producing: per-phase budget (benchmarked against Echo Health), INPACT improvement trajectory, Trust Band milestone targets, and multi-dimensional ROI with payback period. Portfolio-worthy output.',
  'ROI Framing Assessment': 'Test ROI quantification using Phase Progression and INPACT scoring. Questions should challenge single-dimensional thinking: test ability to calculate trust ROI (INPACT improvement per dollar), phase-specific ROI, and multi-dimensional value beyond cost savings.',

  // Module 5, Lesson 4: Scaling Strategy — Framework: Phase Progression Phases 3-4 + full 7-Layer + Trust Band 86+
  'Scaling Reality': 'POC success (Phase 2, INPACT ~67, Moderate Trust) does not equal production readiness (Phase 4, INPACT 86+, High Trust). Show the Phase Progression scaling path: Phase 3 (Trust, Layers 5-7) adds governance, observability, and orchestration. Phase 4 (Operations) validates with UAT and production readiness criteria.',
  'POC-to-Production Strategy': 'Design the Phase 3-4 scaling path using full 7-Layer Architecture stack. Phase 3 adds: Layer 5 (ABAC, 247+ policies), Layer 6 (distributed tracing, APM), Layer 7 (multi-agent orchestration). Phase 4 validates: 15-criteria readiness checklist, GOALS ≥21/25, Trust Band ≥86. Framework for identifying scaling blockers at each layer.',
  'Scaling Plan Prompt': 'Template to generate a Phase 3-4 scaling plan using 7-Layer Architecture. Output should identify: Layer 5-7 infrastructure requirements, GOALS pillar targets for production (G≥5, O≥4, A≥4, L≥4, S≥4), Trust Band 86+ target, Phase 4 readiness checklist, and team allocation per phase.',
  'Scaling Roadmap Task': 'Build a Phase 3-4 scaling roadmap with 7-Layer milestones. 30-60 minute exercise producing: week-by-week Phase 3 (Trust) plan, Layer 5-7 infrastructure checklist, Phase 4 (Operations) readiness criteria, and Trust Band improvement trajectory to 86+. Portfolio-worthy output.',
  'Scaling Assessment': 'Validate scaling strategy using Phase Progression and Trust Band concepts. Test understanding of: why Moderate Trust (67-85) fails at production scale, what Phase 3 (Trust layers) adds, and how to validate production readiness against Trust Band 86+ threshold.',

  // Module 5, Lesson 5: 90-Day Roadmap & Executive Demo — Framework: Phase Progression (complete) + all frameworks
  'Roadmap Reality': 'Turn all program learnings into a concrete 90-day action plan following Phase Progression: Foundation (Wk 1-4), Intelligence (Wk 5-7), Trust (Wk 8-10), Operations (Wk 11-12). This is the capstone — INPACT, GOALS, 7-Layer Architecture, Five Root Causes, and Trust Band all synthesized into executable weekly milestones.',
  '90-Day Planning Strategy': 'Prioritize, sequence, and resource using the complete Phase Progression model. Week-by-week framework: Wk 1-2 Layer 1 (Storage), Wk 3-4 Layer 2 (Data Fabric), Wk 5 Layer 3 (Semantic), Wk 6-7 Layer 4 (Intelligence), Wk 8 Layer 5 (Governance), Wk 9 Layer 6 (Observability), Wk 10 Layer 7 (Orchestration), Wk 11-12 UAT + Production.',
  'Roadmap Prompt': 'Template to generate a comprehensive 90-day roadmap using Phase Progression with all framework integration. Output should include: week-by-week milestones, INPACT targets per phase (28→42→67→86→89), GOALS maturity progression, 7-Layer buildout sequence, team allocation, and budget by phase (Echo Health benchmark).',
  'Executive Demo Task': 'Prepare the final executive demo: 90-day Phase Progression roadmap with live Trust Band scoring walkthrough. Capstone deliverable synthesizing all five modules: strategy (M1), governance (M2), requirements (M3), controlled build (M4), and this roadmap (M5). Portfolio-quality executive presentation.',
  'Roadmap Assessment': 'Comprehensive capstone assessment across all five modules and all six frameworks. Questions should test: Phase Progression sequencing, INPACT milestone calculation, GOALS maturity scoring, 7-Layer dependency ordering, Trust Band trajectory planning, and Five Root Causes prevention at each phase.',
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
