import { Op } from 'sequelize';
import { OpenclawResponse, OpenclawSignal, OpenclawTask } from '../../../models';
import { validateContentForStrategy, PLATFORM_EXECUTION } from './openclawPlatformStrategy';
import { isRateLimited } from './openclawRateLimiter';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * OpenClaw Quality Gate Agent
 *
 * AI-powered review agent that evaluates draft/pending_review responses
 * for platforms that need quality oversight (e.g. Medium). Approves
 * high-quality responses and queues them for browser posting. Rejects
 * low-quality responses and triggers regeneration.
 *
 * Replaces manual human review for Medium while maintaining quality control.
 */

// Quality criteria weights
const QUALITY_CRITERIA = {
  min_length: 120,
  max_length: 2000,
  must_not_contain: [
    /buy now/i,
    /limited time/i,
    /act fast/i,
    /don't miss out/i,
    /sign up today/i,
    /free trial/i,
    /discount/i,
    /\$\d+/,              // dollar amounts
    /100% guaranteed/i,
  ],
  must_contain_value: true, // must provide genuine insight, not just a plug
  max_link_count: 2,
  no_emdash: true,
};

interface QualityResult {
  approved: boolean;
  score: number;
  reasons: string[];
}

/**
 * Pure function: evaluate response quality deterministically.
 * No AI call needed - deterministic rules catch the bad patterns.
 */
export function evaluateResponseQuality(
  content: string,
  platform: string,
): QualityResult {
  const reasons: string[] = [];
  let score = 100;

  // Length checks
  if (content.length < QUALITY_CRITERIA.min_length) {
    reasons.push(`Too short (${content.length} chars, min ${QUALITY_CRITERIA.min_length})`);
    score -= 40;
  }
  if (content.length > QUALITY_CRITERIA.max_length) {
    reasons.push(`Too long (${content.length} chars, max ${QUALITY_CRITERIA.max_length})`);
    score -= 20;
  }

  // Spam/promotional pattern check
  for (const pattern of QUALITY_CRITERIA.must_not_contain) {
    if (pattern.test(content)) {
      reasons.push(`Contains prohibited pattern: ${pattern.source}`);
      score -= 25;
    }
  }

  // Link density check
  const linkCount = (content.match(/https?:\/\//g) || []).length;
  if (linkCount > QUALITY_CRITERIA.max_link_count) {
    reasons.push(`Too many links (${linkCount}, max ${QUALITY_CRITERIA.max_link_count})`);
    score -= 15;
  }

  // Emdash check
  if (QUALITY_CRITERIA.no_emdash && content.includes('\u2014')) {
    reasons.push('Contains emdash character');
    score -= 10;
  }

  // Platform-specific validation (reuse existing strategy validation)
  const strategyValidation = validateContentForStrategy(content, platform);
  if (!strategyValidation.passed) {
    reasons.push(`Strategy violation: ${strategyValidation.reason}`);
    score -= 20;
  }

  // Sign-off check: all comment-platform responses must have LinkedIn sign-off
  if (!content.includes('ali-muwwakkil on LinkedIn') && !content.includes('LinkedIn: ali-muwwakkil')) {
    reasons.push('Missing LinkedIn sign-off');
    score -= 30;
  }

  // Value check: response should have substance beyond just a tracked link
  const contentWithoutUrls = content.replace(/https?:\/\/\S+/g, '').trim();
  const sentences = contentWithoutUrls.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length < 2) {
    reasons.push('Insufficient substance - needs more genuine insight');
    score -= 30;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    approved: score >= 70 && reasons.length === 0,
    score,
    reasons,
  };
}

/**
 * Evaluate article quality (Tier 2 content: Dev.to, Medium, Hashnode articles).
 * Stricter than comment quality - requires minimum word count, markdown structure, and sign-off.
 */
export function evaluateArticleQuality(content: string, platform: string): QualityResult {
  let score = 100;
  const reasons: string[] = [];

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  // Minimum word count for articles
  if (wordCount < 400) {
    reasons.push(`Article too short (${wordCount} words, min 400)`);
    score -= 40;
  }

  // Maximum word count
  if (wordCount > 2000) {
    reasons.push(`Article too long (${wordCount} words, max 2000)`);
    score -= 10;
  }

  // Must have markdown headers
  const headerCount = (content.match(/^#{1,3}\s/gm) || []).length;
  if (headerCount < 2) {
    reasons.push(`Needs more structure (${headerCount} headers, min 2)`);
    score -= 20;
  }

  // Sign-off check
  if (!content.includes('ali-muwwakkil on LinkedIn') && !content.includes('LinkedIn: ali-muwwakkil')) {
    reasons.push('Missing LinkedIn sign-off');
    score -= 15;
  }

  // Spam patterns
  for (const pattern of QUALITY_CRITERIA.must_not_contain) {
    if (pattern.test(content)) {
      reasons.push(`Contains spam pattern: ${pattern.source}`);
      score -= 25;
    }
  }

  // Emdash check
  if (content.includes('\u2014')) {
    reasons.push('Contains emdash character');
    score -= 10;
  }

  // Brand safety
  if (/colaberry/i.test(content)) {
    reasons.push('Contains brand name "Colaberry"');
    score -= 30;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    approved: score >= 70 && reasons.length === 0,
    score,
    reasons,
  };
}

export async function runOpenclawQualityGateAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const maxPerRun = config.max_reviews_per_run || 10;

  // All API_POSTING platforms go through the quality gate (not just medium)
  const gatedPlatforms = config.gated_platforms
    || Object.entries(PLATFORM_EXECUTION)
        .filter(([, exec]) => exec === 'API_POSTING')
        .map(([platform]) => platform);

  try {
    // 1. Find responses pending review for gated platforms
    const pendingResponses = await OpenclawResponse.findAll({
      where: {
        platform: { [Op.in]: gatedPlatforms },
        post_status: { [Op.in]: ['draft', 'ready_for_manual_post', 'pending_review'] },
      },
      order: [['priority_score', 'DESC'], ['created_at', 'ASC']],
      limit: maxPerRun,
    });

    if (pendingResponses.length === 0) {
      return {
        agent_name: 'OpenclawQualityGateAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [],
        duration_ms: Date.now() - start,
        entities_processed: 0,
      };
    }

    for (const response of pendingResponses) {
      try {
        const quality = evaluateResponseQuality(response.content, response.platform);

        if (quality.approved) {
          // Check rate limit before approving
          const rateCheck = await isRateLimited(response.platform);
          if (!rateCheck.allowed) {
            actions.push({
              campaign_id: '',
              action: 'defer_approval_rate_limited',
              reason: `Quality approved (score: ${quality.score}) but rate limited: ${rateCheck.reason} - deferring`,
              confidence: quality.score / 100,
              before_state: { post_status: response.post_status },
              after_state: { post_status: response.post_status },
              result: 'skipped',
              entity_type: 'system',
              entity_id: response.id,
            });
            continue;
          }

          // Approve and create post task
          await response.update({
            post_status: 'approved',
            updated_at: new Date(),
          });

          // Create browser posting task
          await OpenclawTask.create({
            task_type: 'post_response',
            priority: response.priority_score || 50,
            status: 'pending',
            signal_id: response.signal_id,
            input_data: { response_id: response.id },
            created_at: new Date(),
          });

          actions.push({
            campaign_id: '',
            action: 'approve_response',
            reason: `Quality gate passed (score: ${quality.score}/100) - approved for ${response.platform} browser posting`,
            confidence: quality.score / 100,
            before_state: { post_status: response.post_status },
            after_state: { post_status: 'approved' },
            result: 'success',
            entity_type: 'system',
            entity_id: response.id,
          });
        } else {
          // Reject and trigger regeneration
          await response.update({
            post_status: 'rejected',
            reasoning: `Quality gate rejected (score: ${quality.score}): ${quality.reasons.join('; ')}`,
            updated_at: new Date(),
          });

          // Find the original signal to queue a new generate_response task
          if (response.signal_id) {
            const signal = await OpenclawSignal.findByPk(response.signal_id);
            if (signal) {
              // Reset signal so it can be picked up for regeneration
              await signal.update({
                response_id: undefined,
                status: 'queued',
                updated_at: new Date(),
              } as any);

              await OpenclawTask.create({
                task_type: 'generate_response',
                priority: (response.priority_score || 50) + 10, // bump priority for retry
                status: 'pending',
                signal_id: signal.id,
                input_data: {
                  regeneration: true,
                  previous_response_id: response.id,
                  rejection_reasons: quality.reasons,
                },
                created_at: new Date(),
              });
            }
          }

          actions.push({
            campaign_id: '',
            action: 'reject_response',
            reason: `Quality gate rejected (score: ${quality.score}/100): ${quality.reasons.join('; ')} - queued for regeneration`,
            confidence: quality.score / 100,
            before_state: { post_status: response.post_status },
            after_state: { post_status: 'rejected' },
            result: 'success',
            entity_type: 'system',
            entity_id: response.id,
          });
        }
      } catch (err: any) {
        errors.push(`Response ${response.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(err.message || 'Quality gate error');
  }

  return {
    agent_name: 'OpenclawQualityGateAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.length,
  };
}
