import { Op } from 'sequelize';
import {
  containsBannedWord,
  findDisallowedUrls,
  getAllowedUrls,
  getBannedWords,
} from './skoolPlatformStrategy';

// Models loaded via require with try/catch since they may not be compiled yet
let SkoolResponse: any;

try {
  SkoolResponse = require('../../../models').SkoolResponse;
} catch (err: any) {
  console.warn('[Skool][QualityGate] Failed to load models:', err.message);
}

/**
 * Skool Quality Gate Agent
 *
 * Pure deterministic validation of draft Skool responses.
 * No LLM calls. Checks length, banned words, URL compliance,
 * content quality, and duplicate detection.
 */
export async function runSkoolQualityGate(): Promise<{
  reviewed: number;
  approved: number;
  rejected: number;
}> {
  let reviewed = 0;
  let approved = 0;
  let rejected = 0;

  if (!SkoolResponse) {
    console.error('[Skool][QualityGate] Models not available, skipping run');
    return { reviewed, approved, rejected };
  }

  // Pull draft responses
  const drafts = await SkoolResponse.findAll({
    where: {
      post_status: 'draft',
    },
    order: [['created_at', 'ASC']],
  });

  if (drafts.length === 0) {
    console.log('[Skool][QualityGate] No draft responses to review');
    return { reviewed, approved, rejected };
  }

  console.log(`[Skool][QualityGate] Reviewing ${drafts.length} draft response(s)`);

  // Load recently posted responses for duplicate detection (last 48h)
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recentResponses = await SkoolResponse.findAll({
    where: {
      post_status: 'posted',
      posted_at: { [Op.gte]: fortyEightHoursAgo },
    },
    attributes: ['body'],
  });
  const recentBodies: string[] = recentResponses.map((r: any) => r.body || '');

  for (const response of drafts) {
    try {
      const body = response.body || '';
      const responseType = response.response_type || 'reply';
      const reasons: string[] = [];
      let score = 100;

      // --- Length checks ---
      if (responseType === 'reply') {
        if (body.length < 80) {
          reasons.push(`Reply too short (${body.length} chars, min 80)`);
          score -= 30;
        }
        if (body.length > 500) {
          reasons.push(`Reply too long (${body.length} chars, max 500)`);
          score -= 15;
        }
      } else {
        // new_post
        if (body.length < 300) {
          reasons.push(`New post too short (${body.length} chars, min 300)`);
          score -= 30;
        }
        if (body.length > 2000) {
          reasons.push(`New post too long (${body.length} chars, max 2000)`);
          score -= 15;
        }
      }

      // --- Banned words check ---
      const bannedMatch = containsBannedWord(body);
      if (bannedMatch) {
        reasons.push(`Contains banned word: "${bannedMatch}"`);
        score -= 30;
      }

      // --- URL compliance check ---
      const disallowedUrls = findDisallowedUrls(body);
      if (disallowedUrls.length > 0) {
        reasons.push(`Contains disallowed URL(s): ${disallowedUrls.join(', ')}`);
        score -= 25;
      }

      // --- Genuine content check (not just a pitch) ---
      // Look for question-answering language, insights, or substance
      const lowerBody = body.toLowerCase();
      const valueIndicators = [
        'because', 'the reason', 'in my experience', 'what we found',
        'one approach', 'the key is', 'i would suggest', 'have you considered',
        'typically', 'for example', 'in practice', 'the challenge',
        'the important thing', 'what works', 'from what i have seen',
        'agree', 'disagree', 'great point', 'interesting', 'specifically',
        '?', // asking a question shows engagement
      ];
      const hasValue = valueIndicators.some((v) => lowerBody.includes(v));

      const pitchIndicators = [
        'book a call', 'schedule a demo', 'sign up', 'buy now',
        'limited time', 'act fast', 'don\'t miss', 'last chance',
        'free trial', 'discount', 'special offer',
      ];
      const isPitchy = pitchIndicators.some((p) => lowerBody.includes(p));

      if (isPitchy) {
        reasons.push('Content appears too promotional/salesy');
        score -= 25;
      }

      if (!hasValue && !isPitchy) {
        // Not obviously promotional, but no clear value either
        const sentences = body.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
        if (sentences.length < 2) {
          reasons.push('Insufficient substance - needs more genuine content');
          score -= 20;
        }
      }

      // --- Emdash check ---
      if (body.includes('\u2014')) {
        reasons.push('Contains emdash character');
        score -= 10;
      }

      // --- Urgency language check ---
      const urgencyPatterns = /\b(last chance|don't miss|act now|limited time|hurry|final reminder|closing soon|one time offer|expires|urgent)\b/i;
      if (urgencyPatterns.test(body)) {
        reasons.push('Contains urgency/aggressive language');
        score -= 20;
      }

      // --- Duplicate detection (simple substring match of first 100 chars) ---
      const bodyPrefix = body.slice(0, 100).toLowerCase();
      const isDuplicate = recentBodies.some((recent: string) => {
        const recentPrefix = recent.slice(0, 100).toLowerCase();
        return recentPrefix === bodyPrefix;
      });
      if (isDuplicate) {
        reasons.push('Duplicate of a response posted in the last 48 hours');
        score -= 30;
      }

      // --- Sign-off check ---
      if (!body.includes('Ali Muwwakkil')) {
        reasons.push('Missing "Ali Muwwakkil" sign-off');
        score -= 10;
      }

      // Clamp score
      score = Math.max(0, Math.min(100, score));
      reviewed++;

      // Decision
      if (score >= 70) {
        await response.update({
          post_status: 'approved',
          quality_score: score,
        });
        approved++;
        console.log(`[Skool][QualityGate] Response ${response.id} APPROVED (score: ${score})`);
      } else {
        await response.update({
          post_status: 'failed',
          quality_score: score,
          metadata: {
            ...(response.metadata || {}),
            rejection_reasons: reasons,
            reviewed_at: new Date().toISOString(),
          },
        });
        rejected++;
        console.log(`[Skool][QualityGate] Response ${response.id} REJECTED (score: ${score}): ${reasons.join('; ')}`);
      }
    } catch (err: any) {
      console.error(`[Skool][QualityGate] Error reviewing response ${response.id}:`, err.message);
    }
  }

  console.log(`[Skool][QualityGate] Run complete: ${reviewed} reviewed, ${approved} approved, ${rejected} rejected`);
  return { reviewed, approved, rejected };
}
