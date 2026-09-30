/**
 * Claude Certified Architect – Foundations (CCAR-F) — OFFICIAL blueprint.
 *
 * PROVENANCE: transcribed from Anthropic's own exam guide PDF, "Claude Certified
 * Architect – Foundations Exam Guide, Version 1.0, Effective July 2026", retrieved
 * 2026-09-03 from the Anthropic Partner Academy certifications page. That guide
 * states it "is the authoritative reference for candidates" and is "subject to
 * change without notice" — hence `blueprint_version` below, and hence every
 * readiness snapshot storing the version it was computed under.
 *
 * This file is the reason `cert_domains.weight_pct` was built nullable. Until
 * today every weight we held came from third-party community guides; this repo had
 * already been wrong twice by trusting secondary sources on this programme, so
 * nothing was cemented until the official document was read. It has now been read,
 * and `weight_source` is 'official' as a result.
 *
 * A NOTE ON DOMAIN NUMBERING, because it is a live trap: the official order is
 * NOT the descending-weight order the community guides imply. Domain 2 is Tool
 * Design & MCP (18%) and Domain 3 is Claude Code Configuration (20%) — so D2
 * carries LESS weight than D3. Anything tagged by domain number against a
 * community source is likely mis-numbered; check the label, not the digit.
 *
 * Do not edit weights here to "fix" a readiness curve. If Anthropic revises the
 * exam, add a new blueprint_version rather than mutating this one, so historical
 * attempts and snapshots keep resolving to what the candidate actually sat.
 */

export interface CertBlueprintObjective {
  objective_id: string;
  label: string;
}

export interface CertBlueprintDomain {
  domain_id: string;
  label: string;
  weight_pct: number;
  display_order: number;
  objectives: CertBlueprintObjective[];
}

export interface CertBlueprintScenario {
  scenario_id: string;
  label: string;
  summary: string;
  primary_domains: string[];
}

export interface CertBlueprint {
  track_id: string;
  display_name: string;
  issuer: string;
  blueprint_version: string;
  blueprint_source: 'official';
  source_note: string;
  exam_code: string;
  exam_item_count: number;
  exam_duration_minutes: number;
  scaled_score_min: number;
  scaled_score_max: number;
  passing_scaled_score: number;
  validity_months: number;
  exam_fee_usd: number;
  recommended_experience: string;
  domains: CertBlueprintDomain[];
  scenarios: CertBlueprintScenario[];
}

export const CCAR_FOUNDATIONS_BLUEPRINT: CertBlueprint = {
  track_id: 'ccar-f',
  display_name: 'Claude Certified Architect – Foundations',
  issuer: 'Anthropic',
  blueprint_version: '1.0-2026-07',
  blueprint_source: 'official',
  source_note:
    'Anthropic exam guide v1.0, effective July 2026, retrieved from the Anthropic Partner Academy 2026-09-03.',
  exam_code: 'CCAR-F',
  exam_item_count: 60,
  exam_duration_minutes: 120,
  scaled_score_min: 100,
  scaled_score_max: 1000,
  passing_scaled_score: 720,
  validity_months: 12,
  exam_fee_usd: 125,
  recommended_experience:
    '6+ months of practical experience building with Claude APIs, the Agent SDK, Claude Code, and MCP.',

  // Weights are Anthropic's, from the section 4 blueprint table. They total 100.
  domains: [
    {
      domain_id: 'D1',
      label: 'Agentic Architecture & Orchestration',
      weight_pct: 27,
      display_order: 1,
      objectives: [
        { objective_id: 'D1.1', label: 'Design and implement agentic loops for autonomous task execution' },
        { objective_id: 'D1.2', label: 'Orchestrate multi-agent systems with coordinator-subagent patterns' },
        { objective_id: 'D1.3', label: 'Configure subagent invocation, context passing, and spawning' },
        { objective_id: 'D1.4', label: 'Implement multi-step workflows with enforcement and handoff patterns' },
        { objective_id: 'D1.5', label: 'Apply Agent SDK hooks for tool call interception and data normalization' },
        { objective_id: 'D1.6', label: 'Design task decomposition strategies for complex workflows' },
        { objective_id: 'D1.7', label: 'Manage session state, resumption, and forking' },
      ],
    },
    {
      domain_id: 'D2',
      label: 'Tool Design & MCP Integration',
      weight_pct: 18,
      display_order: 2,
      objectives: [
        { objective_id: 'D2.1', label: 'Design effective tool interfaces with clear descriptions and boundaries' },
        { objective_id: 'D2.2', label: 'Implement structured error responses for MCP tools' },
        { objective_id: 'D2.3', label: 'Distribute tools appropriately across agents and configure tool choice' },
        { objective_id: 'D2.4', label: 'Integrate MCP servers into Claude Code and agent workflows' },
        { objective_id: 'D2.5', label: 'Select and apply built-in tools (Read, Write, Edit, Bash, Grep, Glob) effectively' },
      ],
    },
    {
      domain_id: 'D3',
      label: 'Claude Code Configuration & Workflows',
      weight_pct: 20,
      display_order: 3,
      objectives: [
        { objective_id: 'D3.1', label: 'Configure CLAUDE.md files with appropriate hierarchy, scoping, and modular organization' },
        { objective_id: 'D3.2', label: 'Create and configure custom slash commands and skills' },
        { objective_id: 'D3.3', label: 'Apply path-specific rules for conditional convention loading' },
        { objective_id: 'D3.4', label: 'Determine when to use plan mode vs direct execution' },
        { objective_id: 'D3.5', label: 'Apply iterative refinement techniques for progressive improvement' },
        { objective_id: 'D3.6', label: 'Integrate Claude Code into CI/CD pipelines' },
      ],
    },
    {
      domain_id: 'D4',
      label: 'Prompt Engineering & Structured Output',
      weight_pct: 20,
      display_order: 4,
      objectives: [
        { objective_id: 'D4.1', label: 'Design prompts with explicit criteria to improve precision and reduce false positives' },
        { objective_id: 'D4.2', label: 'Apply few-shot prompting to improve output consistency and quality' },
        { objective_id: 'D4.3', label: 'Enforce structured output using tool use and JSON schemas' },
        { objective_id: 'D4.4', label: 'Implement validation, retry, and feedback loops for extraction quality' },
        { objective_id: 'D4.5', label: 'Design efficient batch processing strategies' },
        { objective_id: 'D4.6', label: 'Design multi-instance and multi-pass review architectures' },
      ],
    },
    {
      domain_id: 'D5',
      label: 'Context Management & Reliability',
      weight_pct: 15,
      display_order: 5,
      objectives: [
        { objective_id: 'D5.1', label: 'Manage conversation context to preserve critical information across long interactions' },
        { objective_id: 'D5.2', label: 'Design effective escalation and ambiguity resolution patterns' },
        { objective_id: 'D5.3', label: 'Implement error propagation strategies across multi-agent systems' },
        { objective_id: 'D5.4', label: 'Manage context effectively in large codebase exploration' },
        { objective_id: 'D5.5', label: 'Design human review workflows and confidence calibration' },
        { objective_id: 'D5.6', label: 'Preserve information provenance and handle uncertainty in multi-source synthesis' },
      ],
    },
  ],

  /**
   * The exam presents 4 scenarios drawn at random from this bank of 6. They are
   * published, which is what makes "build the scenarios" a legitimate preparation
   * strategy rather than a shortcut — a student who has built four of these six
   * has already made most of the calls the exam asks about.
   */
  scenarios: [
    {
      scenario_id: 'S1',
      label: 'Customer Support Resolution Agent',
      summary:
        'An Agent SDK support agent handling returns, billing disputes and account issues through MCP tools (get_customer, lookup_order, process_refund, escalate_to_human), targeting 80%+ first-contact resolution while knowing when to escalate.',
      primary_domains: ['D1', 'D2', 'D5'],
    },
    {
      scenario_id: 'S2',
      label: 'Code Generation with Claude Code',
      summary:
        'Claude Code in a team development workflow for generation, refactoring, debugging and documentation, using custom slash commands, CLAUDE.md configuration, and plan mode versus direct execution.',
      primary_domains: ['D3', 'D5'],
    },
    {
      scenario_id: 'S3',
      label: 'Multi-Agent Research System',
      summary:
        'A coordinator delegating to specialised subagents — web search, document analysis, synthesis, report generation — producing comprehensive cited reports.',
      primary_domains: ['D1', 'D2', 'D5'],
    },
    {
      scenario_id: 'S4',
      label: 'Developer Productivity with Claude',
      summary:
        'Agent SDK tooling that helps engineers explore unfamiliar codebases, understand legacy systems, generate boilerplate and automate repetitive tasks, using built-in tools and MCP servers.',
      primary_domains: ['D2', 'D3', 'D1'],
    },
    {
      scenario_id: 'S5',
      label: 'Claude Code for Continuous Integration',
      summary:
        'Claude Code integrated into CI/CD for automated code review, test generation and pull request feedback.',
      primary_domains: ['D3', 'D5'],
    },
    {
      scenario_id: 'S6',
      label: 'Structured Data Extraction',
      summary:
        'Extracting structured data from unstructured documents with schema enforcement, validation, retry and quality feedback loops.',
      primary_domains: ['D4', 'D5'],
    },
  ],
};

/** Every blueprint this build knows about, keyed by track. */
export const CERT_BLUEPRINTS: Record<string, CertBlueprint> = {
  [CCAR_FOUNDATIONS_BLUEPRINT.track_id]: CCAR_FOUNDATIONS_BLUEPRINT,
};

/** Sum of domain weights — asserted by the contract test to equal 100. */
export function totalWeight(blueprint: CertBlueprint): number {
  return blueprint.domains.reduce((sum, d) => sum + d.weight_pct, 0);
}
