/**
 * Requirements Generation Service
 *
 * Orchestrates AI system requirements document generation using
 * the AI_ProjectArchitect external API. Handles:
 * - Project context assembly
 * - Prompt construction
 * - Long-running job management
 * - Artifact submission on completion
 * - Portfolio refresh
 *
 * Supports two modes:
 *   professional (~15 min) — faster, focused output
 *   autonomous (~30 min) — thorough, expanded analysis
 */
import Project from '../models/Project';
import RequirementsGenerationJob from '../models/RequirementsGenerationJob';
import { ArtifactDefinition, AssignmentSubmission } from '../models';
import { buildProjectRequirementsContext } from './projectRequirementsContextService';
import { createNewVersion } from './artifactVersionService';
import { attachArtifactToProject } from './projectService';
import { refreshProjectOutputs } from './portfolioEnhancementService';
import OpenAI from 'openai';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const MODEL = process.env.AI_REQUIREMENTS_MODEL || process.env.AI_MODEL || 'gpt-4o-mini';

// ─── Artifact Definition Seed ───────────────────────────────────────────────

const REQUIREMENTS_ARTIFACT_NAME = 'System Requirements Specification';

/**
 * Ensure the System Requirements Specification artifact definition exists.
 * Uses findOrCreate — idempotent and safe to call on every request.
 */
async function ensureArtifactDefinition(): Promise<ArtifactDefinition> {
  const [definition] = await ArtifactDefinition.findOrCreate({
    where: { name: REQUIREMENTS_ARTIFACT_NAME },
    defaults: {
      name: REQUIREMENTS_ARTIFACT_NAME,
      description:
        'Generate a full technical requirements document describing the AI system being designed in this project. ' +
        'This document covers architecture, integrations, data flows, governance, and implementation strategy.',
      artifact_type: 'requirements_document',
      versioning_enabled: true,
      evaluation_criteria:
        'Completeness of system architecture, data flow coverage, governance alignment, ' +
        'integration specifications, and implementation feasibility.',
    },
  });
  return definition;
}

// ─── Prompt Assembly ────────────────────────────────────────────────────────

function buildRequirementsPrompt(
  contextText: string,
  userPrompt: string | undefined,
  mode: 'professional' | 'autonomous',
): string {
  const modeInstruction = mode === 'autonomous'
    ? `Generate an extremely thorough and comprehensive document. Cover every subsystem, every integration point, every data flow in detail. Include edge cases, failure modes, and scaling considerations. Target 150+ pages of content.`
    : `Generate a thorough but focused document. Cover all key systems, integrations, and data flows. Prioritize clarity and actionability. Target 80-120 pages of content.`;

  const sections = [
    `# USER REQUEST`,
    '',
    userPrompt || 'Generate a complete AI system requirements document based on the project context below.',
    '',
    `# GENERATION MODE: ${mode.toUpperCase()}`,
    '',
    modeInstruction,
    '',
    `# PROJECT CONTEXT`,
    '',
    contextText,
    '',
    `# SYSTEM REQUIREMENTS DOCUMENT REQUEST`,
    '',
    `Generate a detailed system requirements document for the AI system described above. The document must include the following sections:`,
    '',
    `## Required Sections`,
    '',
    `1. **Executive Summary** — High-level overview of the system, its purpose, and key stakeholders`,
    `2. **Business Requirements** — Detailed business objectives, success criteria, and KPIs`,
    `3. **Functional Requirements** — System capabilities, user stories, and feature specifications`,
    `4. **Non-Functional Requirements** — Performance, scalability, reliability, security requirements`,
    `5. **System Architecture** — Component diagrams, service definitions, technology stack`,
    `6. **Data Architecture** — Data models, schemas, storage strategy, data flow diagrams`,
    `7. **API Specifications** — Endpoint definitions, request/response formats, authentication`,
    `8. **Integration Requirements** — Third-party systems, data connectors, middleware`,
    `9. **AI/ML Model Requirements** — Model specifications, training data, inference pipeline`,
    `10. **Data Governance & Privacy** — Data classification, access controls, compliance (GDPR, CCPA)`,
    `11. **Security Requirements** — Authentication, authorization, encryption, audit logging`,
    `12. **Infrastructure & Deployment** — Cloud architecture, CI/CD pipeline, monitoring`,
    `13. **Testing Strategy** — Unit, integration, E2E, performance, security testing plans`,
    `14. **Implementation Roadmap** — Phases, milestones, resource requirements, timeline`,
    `15. **Risk Register** — Technical risks, mitigation strategies, contingency plans`,
    `16. **Appendices** — Glossary, reference architecture, compliance matrices`,
    '',
    `## Formatting Requirements`,
    '',
    `- Use Markdown formatting throughout`,
    `- Include tables for structured data (API specs, data models, risk registers)`,
    `- Use numbered sections and subsections for easy reference`,
    `- Include cross-references between related sections`,
    `- Every requirement must have a unique identifier (e.g., FR-001, NFR-001)`,
    `- Include acceptance criteria for each functional requirement`,
  ];

  return sections.join('\n');
}

// ─── Generation Execution ───────────────────────────────────────────────────

async function executeGeneration(prompt: string): Promise<string> {
  const openai = getOpenAI();

  // Use streaming for long-running generation
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are AI_ProjectArchitect, an expert enterprise systems architect who produces ' +
          'comprehensive, production-grade technical requirements documents. Your documents are ' +
          'used by engineering teams to build enterprise AI systems. Write with precision, ' +
          'specificity, and technical depth. Every section must be actionable and implementation-ready.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 16000,
  });

  return response.choices[0]?.message?.content || '';
}

// ─── Job Orchestration ──────────────────────────────────────────────────────

/**
 * Start a requirements document generation job.
 * Creates the job record, then executes generation asynchronously.
 * Returns the job ID immediately for status polling.
 */
export async function startRequirementsGeneration(
  enrollmentId: string,
  mode: 'professional' | 'autonomous' = 'professional',
  userPrompt?: string,
): Promise<{ job_id: string }> {
  const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });
  if (!project) {
    throw new Error('No project found for this enrollment');
  }

  // Check for existing running job
  const existingJob = await RequirementsGenerationJob.findOne({
    where: {
      project_id: project.id,
      status: ['queued', 'running'],
    },
  });
  if (existingJob) {
    return { job_id: existingJob.id };
  }

  // Build context and prompt
  const context = await buildProjectRequirementsContext(enrollmentId);
  const prompt = buildRequirementsPrompt(context.full_context, userPrompt, mode);

  // Create job record
  const job = await RequirementsGenerationJob.create({
    project_id: project.id,
    enrollment_id: enrollmentId,
    mode,
    status: 'queued',
    prompt,
  });

  // Execute generation asynchronously (fire-and-forget)
  executeJob(job.id, enrollmentId).catch(err => {
    console.error(`[RequirementsGen] Job ${job.id} unhandled error:`, err.message);
  });

  return { job_id: job.id };
}

/**
 * Execute a generation job — runs in the background.
 */
async function executeJob(jobId: string, enrollmentId: string): Promise<void> {
  const job = await RequirementsGenerationJob.findByPk(jobId);
  if (!job) return;

  try {
    // Mark as running
    await job.update({ status: 'running' });

    // Execute AI generation
    const document = await executeGeneration(job.prompt);

    if (!document || document.length < 100) {
      throw new Error('Generated document is too short or empty');
    }

    // Ensure artifact definition exists
    const artifactDef = await ensureArtifactDefinition();

    // Create artifact submission via versioning service
    const submission = await createNewVersion(
      enrollmentId,
      artifactDef.id,
      {
        content_json: {
          generated_document: document,
          generation_mode: job.mode,
          generation_timestamp: new Date().toISOString(),
          job_id: jobId,
          document_length: document.length,
          summary: document.substring(0, 500),
        },
        title: `System Requirements Specification (${job.mode})`,
      },
      `Generated via AI_ProjectArchitect in ${job.mode} mode`,
    );

    // Attach to project
    const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });
    if (project) {
      try {
        await attachArtifactToProject(project.id, submission.id);
      } catch (err: any) {
        console.error('[RequirementsGen] Attach artifact failed:', err.message);
      }
    }

    // Mark job complete
    await job.update({
      status: 'completed',
      output_document: document,
      artifact_submission_id: submission.id,
      completed_at: new Date(),
    });

    // Refresh portfolio outputs (non-blocking)
    refreshProjectOutputs(enrollmentId).catch(err =>
      console.error('[RequirementsGen] Portfolio refresh failed:', err.message)
    );
  } catch (err: any) {
    console.error(`[RequirementsGen] Job ${jobId} failed:`, err.message);
    await job.update({
      status: 'failed',
      error_message: err.message,
      completed_at: new Date(),
    });
  }
}

/**
 * Get the status of a generation job.
 */
export async function getJobStatus(jobId: string): Promise<{
  id: string;
  status: string;
  mode: string;
  artifact_submission_id: string | null;
  error_message: string | null;
  created_at: Date;
  completed_at: Date | null;
} | null> {
  const job = await RequirementsGenerationJob.findByPk(jobId);
  if (!job) return null;

  return {
    id: job.id,
    status: job.status,
    mode: job.mode,
    artifact_submission_id: job.artifact_submission_id || null,
    error_message: job.error_message || null,
    created_at: job.created_at,
    completed_at: job.completed_at || null,
  };
}
