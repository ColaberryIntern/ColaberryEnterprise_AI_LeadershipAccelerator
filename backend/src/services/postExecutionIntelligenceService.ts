/**
 * Post-Execution Intelligence Service
 *
 * Captures runtime execution data for every section content generation,
 * scores output quality (sampled), and creates governance insights for
 * failures and low-quality outputs.
 *
 * CRITICAL: This service is ALWAYS called fire-and-forget from
 * contentGenerationService — it must NEVER throw or block content delivery.
 */

import SectionExecutionLog, { SectionExecutionLogAttributes } from '../models/SectionExecutionLog';
import ReportingInsight from '../models/ReportingInsight';
import { callLLMWithAudit } from './llmCallWrapper';
import { logAiEvent } from './aiEventService';

// ─── Debug Logging ──────────────────────────────────────────────────

const DEBUG = process.env.DEBUG_POST_EXECUTION === 'true';
function debugLog(msg: string, data?: any) {
  if (DEBUG) console.log(`[PostExecIntel] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
}

// ─── Sampling Configuration ─────────────────────────────────────────

const SCORE_SAMPLE_RATE = parseInt(process.env.INTELLIGENCE_SCORE_SAMPLE_RATE || '3', 10);
let executionCounter = 0;

// ─── Types ──────────────────────────────────────────────────────────

export interface ExecutionCapturePayload {
  enrollment_id: string;
  lesson_id: string;
  section_id?: string;
  mini_section_id?: string;
  prompt_template?: string;
  resolved_prompt: string;
  variables_required: string[];
  variables_provided: Record<string, string>;
  output_text: string;
  output_tokens: number;
  latency_ms: number;
  cache_hit: boolean;
  model_used: string;
  error_message?: string;
  lesson_learning_goal?: string;
}

// ─── Core Capture ───────────────────────────────────────────────────

export async function captureExecution(payload: ExecutionCapturePayload): Promise<void> {
  try {
    // 1. Compute missing variables
    const variablesMissing = payload.variables_required.filter(
      k => !(k in payload.variables_provided)
    );

    // 2. Determine execution status
    let executionStatus: 'success' | 'partial' | 'failed';
    if (payload.error_message) {
      executionStatus = 'failed';
    } else if (variablesMissing.length > 0) {
      executionStatus = 'partial';
    } else {
      executionStatus = 'success';
    }

    debugLog(`Capturing execution: lesson=${payload.lesson_id} status=${executionStatus} missing=${variablesMissing.length}`);

    // 3. Write log row immediately (scores null — filled later if sampled)
    const log = await SectionExecutionLog.create({
      id: undefined as any, // auto-generated UUID
      enrollment_id: payload.enrollment_id,
      lesson_id: payload.lesson_id,
      section_id: payload.section_id || null,
      mini_section_id: payload.mini_section_id || null,
      prompt_template: payload.prompt_template || null,
      resolved_prompt: payload.resolved_prompt.substring(0, 20000),
      variables_required: payload.variables_required,
      variables_provided: payload.variables_provided,
      variables_missing_runtime: variablesMissing,
      output_text: payload.output_text.substring(0, 10000),
      output_tokens: payload.output_tokens,
      latency_ms: payload.latency_ms,
      execution_status: executionStatus,
      error_message: payload.error_message || null,
      quality_score: null,
      coherence_score: null,
      goal_alignment_score: null,
      model_used: payload.model_used,
      cache_hit: payload.cache_hit,
    });

    // 4. Sample-based scoring (every Nth execution)
    executionCounter++;
    const shouldScore = executionCounter % SCORE_SAMPLE_RATE === 0;

    if (shouldScore && executionStatus !== 'failed' && payload.lesson_learning_goal) {
      // Fire async scoring — do not await
      scoreExecutionOutput(
        log.id,
        payload.output_text,
        payload.lesson_learning_goal,
      ).catch(err => debugLog('Scoring failed (non-critical):', err?.message));
    }

    // 5. Create governance insight for failures
    if (executionStatus === 'failed') {
      createGovernanceInsight(log.get({ plain: true }) as SectionExecutionLogAttributes, 'failure')
        .catch(err => debugLog('Governance insight creation failed:', err?.message));
    }

    // 6. Log system event
    logAiEvent(
      'post-execution-intelligence',
      'execution_captured',
      'curriculum',
      payload.lesson_id,
      {
        execution_status: executionStatus,
        latency_ms: payload.latency_ms,
        missing_vars: variablesMissing.length,
        cache_hit: payload.cache_hit,
      },
    ).catch(() => {}); // swallow

  } catch (err) {
    // NEVER propagate — this is fire-and-forget
    debugLog('captureExecution failed (non-critical):', (err as Error)?.message);
  }
}

// ─── LLM-Based Output Scoring ───────────────────────────────────────

export async function scoreExecutionOutput(
  logId: string,
  output: string,
  learningGoal: string,
): Promise<void> {
  try {
    const truncatedOutput = output.substring(0, 2000);

    const result = await callLLMWithAudit({
      lessonId: logId,
      generationType: 'admin_simulation',
      step: 'post_execution_scoring',
      systemPrompt: `You are a quality evaluator for AI-generated educational content.
Score the following output on three dimensions (0-100 each):
- coherence_score: clarity, structure, readability
- goal_alignment_score: how well the output addresses the stated learning goal
- quality_score: overall educational value and usefulness

Return JSON only: { "coherence_score": number, "goal_alignment_score": number, "quality_score": number }`,
      userPrompt: `Learning Goal: ${learningGoal}\n\nOutput:\n${truncatedOutput}`,
      model: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 400,
      responseFormat: { type: 'json_object' },
    });

    const scores = JSON.parse(result.content);
    const qualityScore = Math.min(100, Math.max(0, Math.round(scores.quality_score || 0)));
    const coherenceScore = Math.min(100, Math.max(0, Math.round(scores.coherence_score || 0)));
    const goalAlignmentScore = Math.min(100, Math.max(0, Math.round(scores.goal_alignment_score || 0)));

    await SectionExecutionLog.update(
      {
        quality_score: qualityScore,
        coherence_score: coherenceScore,
        goal_alignment_score: goalAlignmentScore,
      },
      { where: { id: logId } },
    );

    debugLog(`Scored execution ${logId}: quality=${qualityScore} coherence=${coherenceScore} goal=${goalAlignmentScore}`);

    // Create governance insight if quality is critically low
    if (qualityScore < 40) {
      const log = await SectionExecutionLog.findByPk(logId);
      if (log) {
        createGovernanceInsight(log.get({ plain: true }) as SectionExecutionLogAttributes, 'low_quality')
          .catch(() => {});
      }
    }
  } catch (err) {
    debugLog('scoreExecutionOutput failed:', (err as Error)?.message);
  }
}

// ─── Governance Insight Creation ────────────────────────────────────

export async function createGovernanceInsight(
  log: SectionExecutionLogAttributes,
  reason: 'failure' | 'low_quality',
): Promise<void> {
  try {
    const isFailure = reason === 'failure';

    await ReportingInsight.create({
      insight_type: isFailure ? 'risk' : 'anomaly',
      source_agent: 'post-execution-intelligence',
      entity_type: 'curriculum',
      entity_id: log.lesson_id,
      title: isFailure
        ? 'Execution failure in lesson content generation'
        : `Low quality output detected (score: ${log.quality_score})`,
      narrative: isFailure
        ? `Content generation failed for lesson ${log.lesson_id}. Error: ${log.error_message?.substring(0, 200)}`
        : `Output quality score ${log.quality_score}/100 is below threshold (40). Coherence: ${log.coherence_score}, Goal alignment: ${log.goal_alignment_score}.`,
      confidence: 0.9,
      impact: 0.7,
      urgency: isFailure ? 0.8 : 0.5,
      data_strength: 0.8,
      final_score: isFailure ? 0.8 : 0.65,
      evidence: {
        execution_log_id: log.id,
        execution_status: log.execution_status,
        quality_score: log.quality_score,
        coherence_score: log.coherence_score,
        goal_alignment_score: log.goal_alignment_score,
        missing_vars: log.variables_missing_runtime,
        latency_ms: log.latency_ms,
        error_message: log.error_message?.substring(0, 500),
      },
      recommendations: {
        action: isFailure ? 'Investigate prompt and variable configuration' : 'Review prompt template for clarity',
        variables_to_fix: log.variables_missing_runtime,
      },
      status: 'new',
      alert_severity: isFailure ? 'critical' : 'warning',
    });

    debugLog(`Created governance insight: ${reason} for lesson ${log.lesson_id}`);
  } catch (err) {
    debugLog('createGovernanceInsight failed:', (err as Error)?.message);
  }
}
