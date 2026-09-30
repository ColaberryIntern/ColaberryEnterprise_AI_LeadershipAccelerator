/**
 * Claude Studio — the shared content contract for the weekly Claude.ai studio.
 *
 * A Claude Studio is the counterpart to the Claude Code spine (Setup Lab, Prompt
 * Lab, Build Artifact(s) Lab). Claude Code teaches students to BUILD software;
 * Claude Studio teaches them to THINK — frame problems, research and weigh
 * evidence, organize context, decide, communicate, and produce an interactive
 * business Artifact — using Claude.ai conversations, Projects, and Artifacts.
 *
 * Every week runs the same four-stage loop:
 *   1. Explore in Claude   — frame the problem and question assumptions
 *   2. Organize in a Project — persistent instructions, sources, reusable context
 *   3. Create an Artifact  — an interactive or presentable output
 *   4. Prove and Publish   — explain the decisions, reflect, attach the evidence
 *
 * This file is dependency-free (pure types + pure data downstream) so it
 * type-checks and unit-tests in isolation, exactly like `data/weekBlueprints.ts`.
 * The renderer (`ClaudeStudioRender.tsx`) reads the SAME structure back out of
 * the generated `body_html` via data attributes, so a hand-authored studio and
 * an LLM-generated one render identically.
 */

/** The four stages, in order. The keys are stable and are emitted into the DOM. */
export type StageKey = 'explore' | 'organize' | 'create' | 'prove';

export const STAGE_ORDER: StageKey[] = ['explore', 'organize', 'create', 'prove'];

/** Human labels for the four stages — used by the seed and the renderer alike. */
export const STAGE_LABELS: Record<StageKey, string> = {
  explore: 'Explore in Claude',
  organize: 'Organize in a Project',
  create: 'Create an Artifact',
  prove: 'Prove and Publish',
};

export interface StudioStage {
  key: StageKey;
  /** Week-specific stage headline, e.g. "Interrogate the brief you were handed". */
  title: string;
  minutes: number;
  /** One or two sentences: what the student is doing and why. */
  instruction: string;
  /** 2-4 concrete, checkable steps. */
  steps: string[];
}

/**
 * A copyable prompt. `starter` is the strong opening prompt; `improve` sharpens
 * the first answer; `followup` pushes the work toward the deliverable. Every
 * studio ships at least one starter and two of the others (Part 4 requirement).
 */
export interface StudioPrompt {
  kind: 'starter' | 'improve' | 'followup';
  /** Short label shown above the prompt box. */
  label: string;
  /** Why this prompt exists — shown to the student before they copy it. */
  why: string;
  /** The prompt text the student copies into Claude. */
  text: string;
}

export interface StudioProject {
  /** Suggested Project name, e.g. "Week 3 — Requirements Studio". */
  name: string;
  /** What goes in the Project's custom instructions. */
  instructions: string;
  /** Approved sources/resources to add to the Project knowledge. */
  sources: string[];
}

export interface StudioArtifact {
  /** e.g. "Interactive requirements explorer (single-page HTML Artifact)". */
  type: string;
  /** What the Artifact must contain to count. */
  requirements: string[];
}

export interface StudioRubricRow {
  dimension: 'Reasoning' | 'Evidence' | 'Communication' | 'Judgment' | 'Responsible AI';
  /** What strong work looks like. */
  strong: string;
  /** What developing work looks like. */
  developing: string;
}

export interface StudioReflection {
  /** Objective yes/no self-checks the student confirms before submitting. */
  checks: string[];
  /** The substantive free-response prompt (graded on reasoning, not length). */
  free_response: string;
}

export interface StudioPoints {
  learning: number;
  builder: number;
  community: number;
}

export interface ClaudeStudioWeek {
  week: number; // 0..12
  /** Stable content id, e.g. 'problem-framing'. Never renumbered. */
  key: string;
  /** The studio's own name, e.g. "Problem Framing Studio". */
  title: string;
  /** The career asset the week produces, e.g. "An interactive Business Problem Brief". */
  career_asset: string;
  /**
   * The EXISTING repo week theme this studio was adapted to (from
   * data/weekBlueprints.ts). Kept for provenance and asserted by the tests so a
   * blueprint rename surfaces as a failure instead of silent drift.
   */
  week_theme: string;
  /**
   * Non-null when this studio's placement or scenario deviates from the source
   * curriculum brief, with the reason. Surfaced in the completion report and in
   * the instructor view — an undocumented adaptation is a defect.
   */
  adaptation: string | null;
  /** Student-facing introduction (2-3 sentences). */
  intro: string;
  /** 3-5 measurable learning objectives. */
  objectives: string[];
  /** A realistic business scenario tied to the week's existing theme. */
  scenario: string;
  /** The role the student plays in the scenario. */
  role: string;
  estimated_minutes: number;
  /** Exactly four stages, in STAGE_ORDER. */
  stages: StudioStage[];
  project: StudioProject;
  /** >=1 starter + >=2 improve/followup. */
  prompts: StudioPrompt[];
  artifact: StudioArtifact;
  /** Exactly three trust checkpoints — the judgment the student must not delegate. */
  trust_checkpoints: string[];
  /** What the student must produce and submit. */
  deliverables: string[];
  /** Shortcuts that look like completion but are not. */
  prohibited_shortcuts: string[];
  reflection: StudioReflection;
  /** Rubric across the five required dimensions. */
  rubric: StudioRubricRow[];
  /** Competency ids — drawn from the week's blueprint competencies plus studio skills. */
  competencies: string[];
  points: StudioPoints;
  portfolio_eligible: boolean;
  /**
   * Certification preparation is INACTIVE before week 7 (Part 3F). Weeks 0-6 may
   * build underlying skill but must never present cert prep as active.
   */
  certification_active: boolean;
  instructor_notes: string;
  /** Expected misconceptions the instructor should watch for. */
  misconceptions: string[];
}

/** The canonical program that owns the 13 weeks (same as data/weekBlueprints.ts). */
export const CANONICAL_PROGRAM_ID = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

/**
 * Outbound Claude.ai launch targets. Configurable rather than hardcoded (Part 3C):
 * the seed stamps them onto each card as data attributes, so an admin editing a
 * card's body_html can retarget them without a deploy. Claude.ai is NEVER
 * embedded — authentication and framing rules forbid it, so these open in a new
 * tab against the student's own authorized account.
 */
export const CLAUDE_LAUNCH = {
  conversation: process.env.CLAUDE_STUDIO_CHAT_URL || 'https://claude.ai/new',
  projects: process.env.CLAUDE_STUDIO_PROJECTS_URL || 'https://claude.ai/projects',
};

/** The five rubric dimensions every studio must cover (Part 4 item 11). */
export const RUBRIC_DIMENSIONS: StudioRubricRow['dimension'][] = [
  'Reasoning', 'Evidence', 'Communication', 'Judgment', 'Responsible AI',
];
