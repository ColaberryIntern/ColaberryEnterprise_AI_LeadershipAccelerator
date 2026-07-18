/**
 * Elaborated Week Blueprints — AI Systems Architect Accelerator (weeks 0–12).
 *
 * These are the rich, per-week Blueprint fields that the Curriculum Composer's
 * Blueprint rows (table `curriculum_blueprints`, one row per week under the
 * canonical program) should carry. The Blueprint is the source of truth every
 * curriculum generator reads from: `services/timeline/blueprintContext.ts`
 * (`buildBlueprintPromptText`) turns these fields into the "WEEK CONTEXT" block
 * prepended to every AI generation (Experience Studio preview, card content,
 * course/video drafts). Thin blueprints ⇒ generic output; rich blueprints ⇒
 * authentic, week-specific output.
 *
 * Grounding (per user intent):
 *   - Weeks with a mapped Anthropic Skilljar course (1,2,3,5,6,7,8) follow that
 *     course's real syllabus (modules + stated objectives captured 2026-07-18
 *     from anthropic.skilljar.com).
 *   - Weeks with no Skilljar course (0,4,9,10,11,12) are elaborated from their
 *     topic. Weeks 10–12 reuse the authored outlines in data/canonicalCourse.ts.
 *
 * Source of truth for the week→course map: scripts/lib/curriculumWeeks.js and
 * seeds/seedCurriculumCourseLinks.ts. This file is dependency-free (inline type,
 * pure data) so it type-checks and unit-tests in isolation. The idempotent writer
 * is seeds/seedWeekBlueprints.ts.
 */

/** The canonical program that owns the 13 week blueprints in prod (accelerator_prod). */
export const CANONICAL_PROGRAM_ID = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

export type CourseKind = 'skilljar' | 'external_cert' | 'colaberry_original';
export type Difficulty = 'intro' | 'core' | 'stretch';

export interface WeekBlueprintContent {
  week: number; // 0..12
  /** Kept for provenance/tests; the writer does NOT overwrite the existing row title. */
  title: string;
  difficulty: Difficulty;
  estimated_hours: number;
  purpose: string;
  learning_objectives: string[];
  competencies: string[];
  architect_domains: string[];
  student_outcomes: string[];
  success_criteria: string[];
  evidence_produced: string[];
  github_deliverables: string[];
  portfolio_deliverables: string[];
  bloom: string[];
  risk_areas: string[];
  certification_mapping: Record<string, unknown>;
  instructor_notes: string;
  /** The mapped course, for provenance (curriculum_blueprints has no anthropic column). */
  anthropic: { title: string | null; url: string | null; kind: CourseKind };
}

const SKILLJAR = 'https://anthropic.skilljar.com';
const CCA_F = 'https://claudecertifications.com/claude-certified-architect/exam-guide';

export const WEEK_BLUEPRINTS: WeekBlueprintContent[] = [
  /* ----------------------------------------------------------------- Week 0 */
  {
    week: 0,
    title: 'Free AI Preview',
    difficulty: 'intro',
    estimated_hours: 2.5,
    purpose:
      'Week 0 is the free lead-magnet tier of the AI Systems Architect Accelerator — a guided taste of what AI can do for real work before committing to the full 12-week program. Learners sample testimonials, a short podcast, blog explainers, micro-videos, small learnings, and quick quizzes that demystify AI and preview the AI Systems Architect path. The goal is curiosity and confidence: show why AI fluency matters now, what an AI Systems Architect actually builds, and how the paid program turns a business technologist into one. No setup or coding required.',
    learning_objectives: [
      'Describe, in plain language, what generative AI and Claude can do for everyday knowledge work',
      'Recognize the difference between using AI as a chat tool and architecting AI systems',
      'Write a basic, well-structured prompt and predict how phrasing changes the result',
      'Identify three real tasks in your own work that AI could accelerate this week',
      'Explain the arc of the AI Systems Architect Accelerator and what you would build in it',
    ],
    competencies: ['ai_foundations', 'prompting_basics', 'ai_use_cases', 'ai_literacy', 'tool_awareness'],
    architect_domains: ['ai_systems_architecture', 'build_discipline'],
    student_outcomes: [
      'You can hold an informed conversation about what AI is good and not good at',
      'You can write a simple prompt and improve it with one iteration',
      'You can name the concrete outcome of enrolling in the full program',
    ],
    success_criteria: [
      'Completed at least one preview lesson (video, podcast, or blog) and one quick quiz',
      'Wrote and refined one prompt against a real task from your own work',
      'Can articulate one personal reason to enroll in the full program',
    ],
    evidence_produced: ['One refined prompt', 'One completed preview quiz'],
    github_deliverables: [],
    portfolio_deliverables: [],
    bloom: ['remember', 'understand', 'apply'],
    risk_areas: [
      'Overwhelm from AI hype',
      'Mistaking chat familiarity for architecture skill',
      'Skipping the "why enroll" reflection',
    ],
    certification_mapping: {},
    instructor_notes:
      'Free Explorer / lead-magnet tier — no Anthropic course. Keep it curiosity-first and low-friction (testimonials, podcast, blogs, micro-videos, small learnings, quick quizzes). Each item should end with a soft "here is what the full program builds on this."',
    anthropic: { title: null, url: null, kind: 'colaberry_original' },
  },

  /* ----------------------------------------------------------------- Week 1 */
  {
    week: 1,
    title: 'Claude Code Foundations + Workspace',
    difficulty: 'core',
    estimated_hours: 7,
    purpose:
      'Week 1 opens Intensive 1 (Build Your AI Foundation). Anchored on Anthropic\'s "Claude Code 101," you stand up a real Claude Code environment and learn to drive it like an engineer, not a chatbot. You internalize the agentic loop (context window, tools, permissions), adopt the explore → plan → code → commit workflow, and set up a persistent CLAUDE.md so Claude carries your project\'s standards. By Build Day you have a working Architect Workspace you will extend every week for the rest of the program.',
    learning_objectives: [
      'Differentiate AI coding agents from chat-based tools and explain the agentic loop (context, tools, permissions)',
      'Install and run Claude Code across at least one surface (terminal, VS Code/JetBrains, or desktop)',
      'Craft effective prompts using approval mode, auto-accept, and Plan Mode',
      'Apply the explore → plan → code → commit methodology on a real change',
      'Manage the context window deliberately with /compact, /clear, and /context',
      'Establish a CLAUDE.md that gives Claude persistent project context',
      'Preview how subagents, Skills, MCP, and hooks extend Claude Code (deep-dived in later weeks)',
    ],
    competencies: [
      'claude_code', 'agentic_loop', 'context_management', 'explore_plan_code_commit',
      'claude_md', 'permission_modes', 'plan_mode', 'workspace_setup',
    ],
    architect_domains: ['build_discipline', 'ai_systems_architecture'],
    student_outcomes: [
      'You can set up Claude Code and complete a change end to end without hand-writing the code',
      'You can steer a session with Plan Mode and the context commands',
      'You have a CLAUDE.md that encodes your project conventions',
    ],
    success_criteria: [
      'Claude Code installed and running on your machine',
      'One real change shipped via explore → plan → code → commit',
      'A committed CLAUDE.md in your Architect Workspace repo',
    ],
    evidence_produced: ['Working Claude Code workspace', 'First CLAUDE.md', 'A committed change from a Claude Code session'],
    github_deliverables: ['Architect Workspace repo initialized', 'CLAUDE.md committed', 'First PR/commit authored via Claude Code'],
    portfolio_deliverables: ['Screen recording of the explore → plan → code → commit loop'],
    bloom: ['understand', 'apply', 'analyze'],
    risk_areas: [
      'Treating Claude Code like chat and skipping Plan Mode',
      'Context bloat from never compacting',
      'A vague CLAUDE.md that does not actually steer behavior',
    ],
    certification_mapping: { 'CCA-F': ['Claude Code fundamentals', 'agentic workflow'] },
    instructor_notes:
      'Anchored on Skilljar "Claude Code 101". Modules: What is Claude Code / first prompt / daily workflows (explore→plan→code→commit, context management, code review) / customizing (CLAUDE.md, subagents, skills, MCP, hooks) / quiz. Wire the Skilljar section; Lab produces the Architect Workspace + CLAUDE.md.',
    anthropic: { title: 'Claude Code 101', url: `${SKILLJAR}/claude-code-101`, kind: 'skilljar' },
  },

  /* ----------------------------------------------------------------- Week 2 */
  {
    week: 2,
    title: 'Agent Skills (build 3 skills)',
    difficulty: 'core',
    estimated_hours: 7,
    purpose:
      'Week 2, still in Intensive 1. Anchored on "Introduction to Agent Skills," you learn to teach Claude once and reuse it everywhere. You author three project-specific Skills — with clear frontmatter and descriptions, multi-file structure, and tool-access scoping — then share them and learn to troubleshoot when a Skill does not trigger. Skills are the first reusable asset in your growing architecture: consistent, context-efficient, and aligned to your standards.',
    learning_objectives: [
      'Explain what Agent Skills are and how they differ from CLAUDE.md, subagents, and MCP',
      'Author a Skill from scratch: frontmatter, an effective description, and the instruction body',
      'Structure a multi-file Skill and restrict its tool access appropriately',
      'Package and share Skills across a team or organization',
      'Diagnose why a Skill is not invoked and fix trigger/description problems',
      'Decide when a Skill (vs another feature) is the right tool for a repeated task',
    ],
    competencies: [
      'agent_skills', 'skill_authoring', 'frontmatter', 'skill_descriptions',
      'multi_file_skills', 'tool_scoping', 'skill_sharing', 'skill_troubleshooting',
    ],
    architect_domains: ['build_discipline', 'ai_systems_architecture'],
    student_outcomes: [
      'You can build and invoke a working Skill on demand',
      'You have three reusable Skills scoped to your project',
      'You can debug a Skill that fails to trigger',
    ],
    success_criteria: [
      'Three project-specific Skills authored and invoking correctly',
      'At least one multi-file Skill with tool-access scoping',
      'Skills committed to your workspace and shareable',
    ],
    evidence_produced: ['3 working Agent Skills', 'A shareable Skills folder'],
    github_deliverables: ['.claude/skills/ with 3 skills committed', 'A README on how to invoke them'],
    portfolio_deliverables: ['Short demo invoking each of the three skills'],
    bloom: ['apply', 'analyze', 'create'],
    risk_areas: [
      'Vague descriptions so Claude never triggers the skill',
      'Over-broad tool access',
      'Duplicating what CLAUDE.md already does',
    ],
    certification_mapping: { 'CCA-F': ['Agent Skills', 'reusable assets'] },
    instructor_notes:
      'Anchored on Skilljar "Introduction to Agent Skills". Modules: what are skills / creating your first skill / configuration and multi-file skills / skills vs other Claude Code features / sharing skills / troubleshooting skills. Lab = 3 project-specific skills.',
    anthropic: { title: 'Introduction to Agent Skills', url: `${SKILLJAR}/introduction-to-agent-skills`, kind: 'skilljar' },
  },

  /* ----------------------------------------------------------------- Week 3 */
  {
    week: 3,
    title: 'Claude API + Workflow Assistant',
    difficulty: 'core',
    estimated_hours: 8,
    purpose:
      'Week 3 closes Intensive 1. Anchored on "Building with the Claude API," you move from the CLI to code: authenticate to the API, run multi-turn conversations with system prompts and streaming, get structured output, and add tool use so Claude can act. You fold in prompt evaluation and core prompting techniques, then ship a Business Workflow Assistant — a small program that automates one real workflow end to end. This is your Intensive 1 deliverable: a working AI environment + Skills library + Workflow Assistant.',
    learning_objectives: [
      'Authenticate to the Claude API and make single- and multi-turn requests with proper message formatting',
      'Control behavior with system prompts, temperature, streaming, and structured (JSON) output',
      'Build an evaluation workflow: test datasets with model-based and code-based grading',
      'Apply core prompt-engineering techniques (clear & direct, specific, XML structure, examples)',
      'Implement tool use: define tool schemas, handle tool-result blocks, and run multi-tool turns',
      'Ship a Workflow Assistant that automates one real business workflow',
    ],
    competencies: [
      'claude_api', 'api_authentication', 'multi_turn', 'system_prompts', 'streaming',
      'structured_output', 'prompt_evaluation', 'tool_use', 'prompt_engineering',
    ],
    architect_domains: ['build_discipline', 'requirements'],
    student_outcomes: [
      'You can call the Claude API from code with tools and structured output',
      'You can evaluate a prompt objectively instead of eyeballing it',
      'You have a running Workflow Assistant automating a real task',
    ],
    success_criteria: [
      'A program that calls the API with tool use and returns structured output',
      'A basic eval harness (dataset + grader) for one prompt',
      'A working Business Workflow Assistant demoed on Build Day',
    ],
    evidence_produced: ['Workflow Assistant app', 'An eval harness'],
    github_deliverables: ['Repo with API client, tool definitions, eval script, and the Workflow Assistant'],
    portfolio_deliverables: ['Demo video of the assistant automating a workflow'],
    bloom: ['apply', 'analyze', 'create'],
    risk_areas: [
      'Hardcoding secrets/keys in source',
      'No eval, so quality is guesswork',
      'Unbounded tool calls without error handling',
    ],
    certification_mapping: { 'CCA-F': ['Claude API', 'tool use', 'evaluation'] },
    instructor_notes:
      'Anchored on Skilljar "Building with the Claude API" (deep course: API access, prompt eval, prompt engineering, tool use, RAG, features, MCP intro, agents/workflows). For Week 3 focus on API access + tool use + eval + prompt technique; RAG/MCP are previews (MCP is Weeks 5-6). Lab = Business Workflow Assistant (Intensive 1 capstone).',
    anthropic: { title: 'Building with the Claude API', url: `${SKILLJAR}/claude-with-the-anthropic-api`, kind: 'skilljar' },
  },

  /* ----------------------------------------------------------------- Week 4 */
  {
    week: 4,
    title: 'Prompt Engineering + Prompt Library',
    difficulty: 'core',
    estimated_hours: 7,
    purpose:
      'Week 4 opens Intensive 2 (Create Your AI Team). There is no dedicated Anthropic course this week — this is Colaberry-original architecture content. You move from ad-hoc prompting to systematic prompt engineering and build an Enterprise Prompt Library: versioned, tested, reusable prompts your whole team can rely on. You apply a repeatable technique ladder (clear & direct → specific → structured → examples → decomposition), evaluate prompts objectively, and organize them into a governed library. This is the foundation for the multi-agent team you build in Weeks 5-7.',
    learning_objectives: [
      'Apply a systematic prompt-engineering ladder: clear & direct, specific, XML/structure, examples, decomposition',
      'Diagnose a weak prompt and improve it measurably against an eval',
      'Design prompt templates with variables for reuse across tasks',
      'Structure an Enterprise Prompt Library: naming, versioning, and metadata',
      'Establish quality gates so a prompt is "library-ready" only when tested',
      'Map prompts to the business workflows they serve',
    ],
    competencies: [
      'prompt_engineering', 'prompt_templates', 'prompt_evaluation', 'few_shot',
      'chain_of_thought', 'prompt_versioning', 'prompt_library', 'reusability',
    ],
    architect_domains: ['requirements', 'build_discipline'],
    student_outcomes: [
      'You can turn a vague ask into a tested, reusable prompt template',
      'You have a structured, versioned Prompt Library',
      'You can judge prompt quality with an eval, not opinion',
    ],
    success_criteria: [
      'An Enterprise Prompt Library with at least 8 versioned, documented prompts',
      'Each library prompt has a tested example and metadata',
      'A written standard for what makes a prompt "library-ready"',
    ],
    evidence_produced: ['Enterprise Prompt Library', 'Prompt quality standard'],
    github_deliverables: ['prompts/ library with versioned templates', 'A CONTRIBUTING/standard doc'],
    portfolio_deliverables: ['Before/after of one prompt with eval scores'],
    bloom: ['apply', 'analyze', 'evaluate', 'create'],
    risk_areas: [
      'Prompts that work once but are not reproducible',
      'No versioning, so the library rots',
      'Skipping eval and shipping on vibes',
    ],
    certification_mapping: { 'CCA-F': ['prompt engineering', 'reusable assets'] },
    instructor_notes:
      'Colaberry-original — NO Anthropic Skilljar course. Draw prompting foundations from Claude 101 / the "Building with the Claude API" prompt-engineering module as background. This week is the Enterprise Prompt Library differentiator. Lab = the library itself.',
    anthropic: { title: null, url: null, kind: 'colaberry_original' },
  },

  /* ----------------------------------------------------------------- Week 5 */
  {
    week: 5,
    title: 'MCP Foundations + First MCP Server',
    difficulty: 'core',
    estimated_hours: 8,
    purpose:
      'Week 5, Intensive 2. Anchored on "Introduction to Model Context Protocol," you learn how MCP shifts tool definition and execution off your app onto specialized servers, and you build your first MCP server. You implement the three core primitives — tools, resources, and prompts — using the SDK, test with the server inspector, and connect a client. By Build Day you have a working MCP server exposing a real capability: the backbone of connecting AI to real systems in Weeks 6-8.',
    learning_objectives: [
      'Explain MCP architecture and how it moves tool definition/execution to specialized servers',
      'Build an MCP server and define tools with the SDK (decorators)',
      'Implement the three primitives — tools, resources, and prompts — and know when to use each',
      'Handle resources with proper MIME types and content patterns',
      'Test and debug a server with the MCP inspector',
      'Connect an MCP client to your server',
    ],
    competencies: [
      'mcp', 'mcp_server', 'mcp_tools', 'mcp_resources', 'mcp_prompts',
      'mcp_inspector', 'mcp_client', 'sdk_decorators',
    ],
    architect_domains: ['requirements', 'ai_systems_architecture'],
    student_outcomes: [
      'You can build and run an MCP server exposing a tool',
      'You can implement resources and prompts, not just tools',
      'You can debug a server with the inspector',
    ],
    success_criteria: [
      'A working MCP server with at least one tool and one resource',
      'Server verified in the MCP inspector',
      'A client successfully calling the server',
    ],
    evidence_produced: ['First MCP server', 'Inspector session'],
    github_deliverables: ['mcp-server repo with tools/resources/prompts + run instructions'],
    portfolio_deliverables: ['Inspector demo of the server'],
    bloom: ['understand', 'apply', 'create'],
    risk_areas: [
      'Confusing the three primitives (tools vs resources vs prompts)',
      'No input validation on tools',
      'Unstated server state assumptions',
    ],
    certification_mapping: { 'CCA-F': ['MCP', 'tools', 'integration'] },
    instructor_notes:
      'Anchored on Skilljar "Introduction to Model Context Protocol". Modules: intro + MCP clients / hands-on servers (project setup, defining tools, inspector) / connecting clients (implementing client, resources, prompts) / assessment. Prereq: Python + JSON/HTTP. Lab = first MCP server.',
    anthropic: { title: 'Introduction to Model Context Protocol', url: `${SKILLJAR}/introduction-to-model-context-protocol`, kind: 'skilljar' },
  },

  /* ----------------------------------------------------------------- Week 6 */
  {
    week: 6,
    title: 'Advanced MCP + System Integration',
    difficulty: 'stretch',
    estimated_hours: 8,
    purpose:
      'Week 6 closes Intensive 2. Anchored on "Model Context Protocol: Advanced Topics," you take your server from toy to production-shaped: sampling (server-initiated model calls), progress/log notifications for long operations, roots for file-access control, and the transport layer (STDIO vs StreamableHTTP) including stateless vs stateful scaling. You integrate the server with a real business system. Intensive 2 deliverable: an Enterprise Prompt Library plus a multi-agent-ready, integrated MCP server.',
    learning_objectives: [
      'Implement sampling so a server can request model calls through the client',
      'Add progress and log notifications for long-running operations',
      'Control file access with roots and permission patterns',
      'Explain MCP\'s JSON message types and bidirectional communication',
      'Choose between STDIO and StreamableHTTP transports for a deployment',
      'Configure stateless vs stateful servers for production scaling',
      'Integrate the server with a real business system or data source',
    ],
    competencies: [
      'mcp_advanced', 'mcp_sampling', 'mcp_notifications', 'mcp_roots', 'mcp_transports',
      'streamable_http', 'stdio_transport', 'stateful_scaling', 'system_integration',
    ],
    architect_domains: ['requirements', 'governance', 'ai_systems_architecture'],
    student_outcomes: [
      'You can add sampling, notifications, and roots to an MCP server',
      'You can pick and justify a transport for your deployment',
      'Your server integrates with a real system',
    ],
    success_criteria: [
      'Server upgraded with sampling + notifications + roots',
      'A documented transport choice with rationale',
      'Server integrated against a real business system/data',
    ],
    evidence_produced: ['Production-shaped MCP server', 'A real system integration'],
    github_deliverables: ['Upgraded server repo with transport config + integration adapter'],
    portfolio_deliverables: ['Demo of the integrated server handling a real task'],
    bloom: ['apply', 'analyze', 'evaluate'],
    risk_areas: [
      'Wrong transport for the deployment',
      'Unbounded file roots (security)',
      'Stateful assumptions that break at scale',
    ],
    certification_mapping: { 'CCA-F': ['MCP advanced', 'transports', 'integration', 'scaling'] },
    instructor_notes:
      'Anchored on Skilljar "Model Context Protocol: Advanced Topics". Modules: sampling / notifications / roots (file access) / JSON message types / STDIO transport / StreamableHTTP (+ in depth, state) / assessment. Lab = integrate the MCP server with a real system.',
    anthropic: { title: 'Model Context Protocol: Advanced Topics', url: `${SKILLJAR}/model-context-protocol-advanced-topics`, kind: 'skilljar' },
  },

  /* ----------------------------------------------------------------- Week 7 */
  {
    week: 7,
    title: 'Subagents + Multi-Agent Team',
    difficulty: 'stretch',
    estimated_hours: 7,
    purpose:
      'Week 7 opens Intensive 3 (Connect AI To The Real World). Anchored on "Introduction to Subagents," you learn how Claude Code spins up isolated context windows, how inputs flow in and summaries come back, and how to design specialized subagents that are reliable. You build a coordinated multi-agent team — each agent with structured output, obstacle reporting, and scoped tool access — and learn when parallel agents help vs. hurt. This turns your single assistant into a team.',
    learning_objectives: [
      'Explain how subagents work: separate context windows, input flow, and returned summaries',
      'Create custom subagents with the /agents command for specialized tasks',
      'Design reliable subagents: structured output formats, obstacle reporting, limited tool access',
      'Decide when to delegate to subagents and recognize the common anti-patterns',
      'Coordinate multiple subagents into a team that splits exploration from editing',
      'Run subagents in parallel for independent work',
    ],
    competencies: [
      'subagents', 'multi_agent_systems', 'agent_design', 'structured_output',
      'tool_scoping', 'agent_coordination', 'parallel_agents', 'delegation_patterns',
    ],
    architect_domains: ['build_discipline', 'ai_systems_architecture'],
    student_outcomes: [
      'You can create a specialized subagent and delegate to it',
      'You can coordinate several subagents on one task',
      'You know when NOT to use subagents',
    ],
    success_criteria: [
      'A multi-agent team of at least 3 specialized subagents',
      'Each subagent has structured output and scoped tools',
      'A worked example splitting exploration from editing',
    ],
    evidence_produced: ['Multi-agent team config', 'A coordinated multi-agent run'],
    github_deliverables: ['.claude/agents/ with 3+ subagents + a coordination example'],
    portfolio_deliverables: ['Demo of the team handling a multi-step task'],
    bloom: ['apply', 'analyze', 'create'],
    risk_areas: [
      'Over-delegation (subagents for trivial work)',
      'Unscoped tools',
      'No structured output, so results cannot be trusted',
    ],
    certification_mapping: { 'CCA-F': ['subagents', 'multi-agent', 'orchestration'] },
    instructor_notes:
      'Anchored on Skilljar "Introduction to Subagents". Modules: what are subagents / creating a subagent / designing effective subagents / using subagents effectively. Lab = coordinated multi-agent team.',
    anthropic: { title: 'Introduction to Subagents', url: `${SKILLJAR}/introduction-to-subagents`, kind: 'skilljar' },
  },

  /* ----------------------------------------------------------------- Week 8 */
  {
    week: 8,
    title: 'Claude Code Workflows + Automation',
    difficulty: 'stretch',
    estimated_hours: 7,
    purpose:
      'Week 8, Intensive 3. Anchored on "Claude Code in Action," you turn Claude Code into an automation platform: custom commands, hooks for formatting and control, the Claude Code SDK, permission modes, headless/routines, and GitHub Actions for automated code review. You wire these into a real development workflow so routine engineering runs itself — verified and safe to run unsupervised. Intensive 3 deliverable: a working MCP server + business-system integration, now driven by automation.',
    learning_objectives: [
      'Build custom commands and reusable automations in Claude Code',
      'Implement hooks for formatting, command control, and guardrails',
      'Use the Claude Code SDK and headless/routines for unattended runs',
      'Choose permission modes appropriately for supervised vs unsupervised work',
      'Set up GitHub Actions plus automated code review with Claude',
      'Apply verification skills so unsupervised runs can be trusted',
    ],
    competencies: [
      'claude_code_workflows', 'custom_commands', 'hooks', 'claude_code_sdk', 'headless_mode',
      'permission_modes', 'github_actions', 'automated_code_review', 'verification_skills',
    ],
    architect_domains: ['build_discipline', 'requirements'],
    student_outcomes: [
      'You can automate a real dev workflow with commands and hooks',
      'You can run Claude Code headless with the right permission mode',
      'You have automated code review on a repo',
    ],
    success_criteria: [
      'At least 2 custom commands + 1 hook wired into a real workflow',
      'A headless/routine run completing a task unattended',
      'GitHub Actions code review running on PRs',
    ],
    evidence_produced: ['Automation config', 'A headless run', 'CI code review'],
    github_deliverables: ['.claude/ commands + hooks', 'A GitHub Actions workflow for automated review'],
    portfolio_deliverables: ['Demo of the automated workflow + a CI review comment'],
    bloom: ['apply', 'analyze', 'create'],
    risk_areas: [
      'Unsafe hooks/permissions in headless mode',
      'Automation with no verification step',
      'Secrets exposed in CI',
    ],
    certification_mapping: { 'CCA-F': ['Claude Code automation', 'hooks', 'CI/CD', 'verification'] },
    instructor_notes:
      'Anchored on Skilljar "Claude Code in Action". Modules: what is Claude Code / getting hands on (setup, context, custom commands, MCP, github) / hooks & SDK / additional (steering long sessions, verification skills, permission modes, routines & headless, github actions & code review, plugins). Lab = automate a real dev workflow.',
    anthropic: { title: 'Claude Code in Action', url: `${SKILLJAR}/claude-code-in-action`, kind: 'skilljar' },
  },

  /* ----------------------------------------------------------------- Week 9 */
  {
    week: 9,
    title: 'Reliability Engineering + Quality Layer',
    difficulty: 'stretch',
    estimated_hours: 8,
    purpose:
      'Week 9 closes Intensive 3. There is no dedicated Anthropic course — this is Colaberry-original architecture content and the start of the "AI Systems Architect" differentiator. You wrap the system you have built in a reliability + quality layer: timeouts, retries with backoff, circuit breakers, fallbacks, dead-letter handling, and idempotency so operations are safe to re-run. You add evaluation and quality gates so AI output is measured, not assumed. This is failure-first design: you design the failure path before the happy path.',
    learning_objectives: [
      'Design the failure path first: enumerate failure modes for each external boundary',
      'Implement timeouts, capped retries with backoff, and circuit breakers',
      'Add fallbacks and dead-letter handling for exhausted retries',
      'Make side-effecting operations idempotent and safe to re-run',
      'Build quality gates: evals and thresholds that block bad AI output',
      'Instrument structured logging and error classification for observability',
    ],
    competencies: [
      'reliability_engineering', 'failure_first_design', 'retries_backoff', 'circuit_breaker',
      'idempotency', 'fallbacks', 'dead_letter', 'quality_gates', 'observability', 'error_classification',
    ],
    architect_domains: ['governance', 'build_discipline'],
    student_outcomes: [
      'You can make an AI operation retry-safe and idempotent',
      'You can add a circuit breaker and fallback to an external call',
      'You can gate quality with an eval threshold',
    ],
    success_criteria: [
      'A reliability layer on your system: timeouts + retries + circuit breaker + fallback',
      'Idempotency proven by running the same operation twice with one end state',
      'A quality gate blocking a bad output in a demo',
    ],
    evidence_produced: ['Reliability/quality layer', 'Idempotency proof'],
    github_deliverables: ['Reliability module (timeouts/retries/breaker/DLQ) + eval gate + tests'],
    portfolio_deliverables: ['Demo of a forced failure being handled and retried'],
    bloom: ['analyze', 'evaluate', 'create'],
    risk_areas: [
      'Silent catch-and-swallow of errors',
      'Unbounded retries',
      'Non-idempotent writes that duplicate on retry',
    ],
    certification_mapping: { 'CCA-F': ['reliability', 'failure handling', 'quality/eval', 'observability'] },
    instructor_notes:
      'Colaberry-original — no Anthropic course. "AI Capabilities and Limitations" is loose background only. This is the reliability/quality architecture layer. Lab = wrap the Intensive-1-3 system in a reliability + quality layer.',
    anthropic: { title: null, url: null, kind: 'colaberry_original' },
  },

  /* ---------------------------------------------------------------- Week 10 */
  {
    week: 10,
    title: 'Governance + Governance Engine',
    difficulty: 'stretch',
    estimated_hours: 8,
    purpose:
      'Week 10 opens Intensive 4 (Design AI That Scales). No Anthropic course — Colaberry-original. You wrap the system from Intensives 1-3 in a Governance Engine: attribute-based access control (ABAC), human-in-the-loop (HITL) escalation, and an immutable audit trail. Governance is the trust layer that makes an agentic system safe to run in production — it gates actions before side effects fire, escalates high-risk actions, and reconstructs any decision from a single correlation ID.',
    learning_objectives: [
      'Design a 5-factor ABAC policy (user, resource, action, context, risk) for an agentic system',
      'Define the categories of action that must escalate to a human, and the escalation path',
      'Instrument an audit trail that reconstructs any decision from a single correlation ID',
      'Score the system on INPACT Permitted & Transparent and the GOALS Governance pillar',
      'Implement fail-closed defaults so an ungoverned action is a denied action',
    ],
    competencies: [
      'governance', 'abac', 'hitl_escalation', 'audit_trail', 'correlation_ids',
      'fail_closed', 'inpact', 'goals_framework', 'policy_evaluation',
    ],
    architect_domains: ['governance', 'executive_authority'],
    student_outcomes: [
      'You can gate an agent\'s actions with an ABAC policy before side effects fire',
      'You can route high-risk actions to a human and resume after approval',
      'You can reconstruct any decision from its audit trail',
    ],
    success_criteria: [
      'A governance module demonstrably blocking a disallowed action',
      'A HITL gate escalating a high-risk action and resuming on approval',
      'Audit reconstruction of a decision from a single correlation ID',
    ],
    evidence_produced: ['Governance Engine (policy + evaluator + HITL gate + audit log)'],
    github_deliverables: ['governance module: ABAC policy file + evaluator middleware + HITL queue + audit log'],
    portfolio_deliverables: ['Demo: one blocked action, one escalated action, one audit reconstruction'],
    bloom: ['analyze', 'evaluate', 'create'],
    risk_areas: [
      'Governance-after instead of governance-first',
      'Policy evaluation too slow (blocking the hot path)',
      'Audit logs leaking secrets',
    ],
    certification_mapping: { 'CCA-F': ['governance', 'access control', 'audit', 'INPACT/GOALS'] },
    instructor_notes:
      'Colaberry-original. Full authored outline in data/canonicalCourse.ts (week 10 colaberry_module): 5-factor ABAC, eight high-risk HITL categories (<15% escalation target), correlation-ID audit, INPACT Permitted/Transparent, GOALS Governance, 7-Layer Architecture Layer 5. Lab = Governance Engine over the Intensive-1-3 system.',
    anthropic: { title: null, url: null, kind: 'colaberry_original' },
  },

  /* ---------------------------------------------------------------- Week 11 */
  {
    week: 11,
    title: 'Systems Architecture + Architecture Package',
    difficulty: 'stretch',
    estimated_hours: 8,
    purpose:
      'Week 11, Intensive 4. No Anthropic course — Colaberry-original, mapping to CCA-Foundations content. You assemble the Solution Architecture Package: map your system onto the 7-Layer reference architecture, document trust boundaries and data flow, capture architecture decision records (ADRs), and produce the INPACT / Trust Band scorecard. An architecture package is diagrams + decisions + evidence, not slides — and it is the exhibit for the Architect Expo and the CCA-F portfolio.',
    learning_objectives: [
      'Map a real agentic system onto the 7-Layer reference architecture',
      'Document trust boundaries, data flow, and failure/recovery paths per layer',
      'Write ADRs that justify the highest-stakes design choices',
      'Produce an INPACT composite and Trust Band scorecard for the finished system',
      'Identify the top gaps between current and target architecture',
    ],
    competencies: [
      'systems_architecture', 'seven_layer_architecture', 'trust_boundaries', 'data_flow',
      'adrs', 'inpact', 'trust_band', 'architecture_documentation',
    ],
    architect_domains: ['executive_authority', 'requirements', 'governance'],
    student_outcomes: [
      'You can map any agentic system onto the 7-layer reference',
      'You can defend design choices with ADRs',
      'You can score a system\'s trust posture with INPACT/Trust Band',
    ],
    success_criteria: [
      'A 7-layer mapping table for your system',
      'At least 5 ADRs for the highest-stakes decisions',
      'An INPACT composite + Trust Band scorecard with the top 3 gaps',
    ],
    evidence_produced: ['Solution Architecture Package (diagrams + 7-layer table + ADRs + scorecard)'],
    github_deliverables: ['/architecture: system + data-flow diagrams, 7-layer table, ADRs, scorecard'],
    portfolio_deliverables: ['The packaged architecture doc (PDF/site) for the Expo'],
    bloom: ['analyze', 'evaluate', 'create'],
    risk_areas: [
      'Slides instead of evidence',
      'Missing trust boundaries',
      'ADRs that describe without justifying',
    ],
    certification_mapping: { 'CCA-F': ['architecture', '7-layer', 'ADRs', 'trust/INPACT'] },
    instructor_notes:
      'Colaberry-original, maps to CCA-Foundations. Full authored outline in canonicalCourse.ts (week 11). 7-Layer: Storage → Data Fabric → Semantic → Intelligence → Governance → Observability → Orchestration. Reliability (wk9) + governance (wk10) are layers here, not add-ons. Lab = Solution Architecture Package.',
    anthropic: { title: null, url: null, kind: 'colaberry_original' },
  },

  /* ---------------------------------------------------------------- Week 12 */
  {
    week: 12,
    title: 'Capstone + Architect Expo',
    difficulty: 'stretch',
    estimated_hours: 10,
    purpose:
      'Week 12 is the capstone and the external gate. You integrate the whole 12-week arc — foundation, team, integration, reliability, governance, architecture — into one capstone system running end to end, governed and observable. You present at the Architect Expo (a demo + defense: show the build, defend the decisions, cite the evidence) and sit the Claude Certified Architect — Foundations (CCA-F) exam. Graduation artifact = certification + architecture package + recorded Expo talk.',
    learning_objectives: [
      'Integrate the foundation, team, integration, reliability, governance, and architecture work into one capstone',
      'Freeze and run the capstone end to end with governance and observability enabled',
      'Present the system and its architecture package to a panel at the Architect Expo',
      'Close remaining CCA-F prep gaps against the official exam guide and pass the Foundations exam',
      'Position the system with executive authority: problem → architecture → demo → evidence → roadmap',
    ],
    competencies: [
      'capstone_integration', 'architect_expo', 'cca_foundations', 'executive_communication',
      'system_demo', 'architecture_defense', 'trust_evidence',
    ],
    architect_domains: ['executive_authority', 'ai_systems_architecture'],
    student_outcomes: [
      'You can run your capstone end to end with governance and observability on',
      'You can defend your architecture to a panel',
      'You are prepared to pass the CCA-F exam',
    ],
    success_criteria: [
      'A frozen capstone: end-to-end run with governance + observability',
      'A recorded Expo presentation (problem → architecture → demo → evidence → roadmap)',
      'A CCA-F exam attempt and a submitted architecture package',
    ],
    evidence_produced: ['Capstone system', 'Recorded Expo talk', 'CCA-F exam attempt'],
    github_deliverables: ['Capstone repo (integrated system) + the final architecture package'],
    portfolio_deliverables: ['Recorded Expo presentation', 'CCA-F certification'],
    bloom: ['evaluate', 'create'],
    risk_areas: [
      'Capstone not actually integrated end to end',
      'A demo without a defense',
      'Leaving CCA-F prep to the last day',
    ],
    certification_mapping: { 'CCA-F': ['exam blueprint domains', 'end-to-end integration', 'architecture defense', 'executive positioning'] },
    instructor_notes:
      'External gate — CCA-F exam. Full authored outline in canonicalCourse.ts (week 12). Thu Build Day = the Expo. Lab = finalize capstone + present + sit the exam.',
    anthropic: { title: 'Claude Certified Architect — Foundations (CCA-F exam)', url: CCA_F, kind: 'external_cert' },
  },
];

/** Lookup by week number (0..12). */
export function weekBlueprint(week: number): WeekBlueprintContent | undefined {
  return WEEK_BLUEPRINTS.find((w) => w.week === week);
}
