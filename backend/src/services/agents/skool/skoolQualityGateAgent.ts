import { Op } from 'sequelize';
import {
  containsBannedWord,
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

      // --- NO URLs in any reply (verified by analyzing community: no member except owner includes URLs) ---
      const hasAnyUrl = /https?:\/\/|\bcolaberry\.(ai|com)\b|\benterprise\.colaberry\b/i.test(body);
      if (hasAnyUrl) {
        reasons.push('Contains URL - community norm verified: no member except owner posts URLs in replies, "DM me" only');
        score -= 50; // Heavy penalty - auto-reject
      }

      // --- Block pitch language AND case-study fingerprints in non-hiring categories ---
      // Verified: moderators flag self-promo language AND specific company numbers ($1.2M, 200 vehicles, 97% accuracy)
      // in dev-help/builds/intros even without URLs.
      const isHiringCategory = response.category === 'hiring';
      if (!isHiringCategory) {
        const pitchPatterns = [
          // Team / service framing
          /\bmy team\b/i,
          /\bwe\s+(build|specialize|offer|deliver|provide)\b/i,
          /\bteam (specializes|builds|offers)\b/i,
          // CTAs to take it private (any phrasing)
          /\bDM me\b/i,
          /\bdive deeper\b/i,
          /\bhappy to (chat|share|discuss|connect)\b/i,
          /\b(feel free to |please |you can )?reach out\b/i,
          /\bcontact me directly\b/i,
          /\bif you (want|need|'?d like|have)[^.]*?(reach out|guidance|help|info|chat|questions)/i,
          /\bI have a tool that\b/i,
          /\bI use that might help\b/i,
          // Company case-study fingerprints — these dollar figures and counts uniquely identify our work
          /\$1\.?2\s*M(illion)?\b/i,
          /\b200\+?\s+vehicles?\b/i,
          /\b200\s+invoices?\s+in\s+4\s+minutes?\b/i,
          /\b97%\s+accuracy\b/i,
          /\b42,?000\s+members\b/i,
          /\b60%\s+fewer\s+(inbound\s+)?calls\b/i,
        ];
        const matched = pitchPatterns.find(p => p.test(body));
        if (matched) {
          reasons.push(`Contains pitch language or company case-study fingerprint (${matched.toString()}) outside hiring category - moderators flag this as self-promotion`);
          score -= 50; // Heavy penalty - auto-reject
        }
      }

      // --- Even in HIRING posts, block boilerplate "spamming" patterns ---
      // Moderators flag hiring replies that read like vendor catalogs.
      // Verified across 5+ moderation strikes — the pattern is consistent.
      if (isHiringCategory) {
        const spamPatterns = [
          // Service-catalog language (any form)
          /\b(my team|we)\s+(specializes?|specialise|build|builds|deploy|deploys|offer|offers|provide|handles?|act\s+as)/i,
          /\bproduction AI systems?\b/i,
          /\bmulti[- ]agent orchestration\b/i,
          /\bAIOS installs?\b/i,
          /\bvoice agents? and custom backends?\b/i,
          /\bcustom backends?\b/i,
          // "Delivery team" framing — became its own catalog phrase
          /\bdelivery side (for|of) (agency|agencies)\b/i,
          /\bbuild and maintain (the |it )?(system|systems)? ?on retainer\b/i,
          /\bwe('?| a)?(re)? the delivery (side|team)\b/i,
          // Vendor closers
          /\bcollaborate effectively\b/i,
          /\bLet'?s (discuss|explore) how (we|my team)\b/i,
          /\bbring your (project|strategy|vision) to life\b/i,
          /\b(various|multiple) industries\b/i,
          /\bideal for your (expanding|growing) needs\b/i,
          // Generic "you handle X, we handle Y" framing
          /\byou (close|handle) the deals?,? (and )?we (build|handle|deliver)\b/i,
        ];
        const matched = spamPatterns.find(p => p.test(body));
        if (matched) {
          reasons.push(`Contains boilerplate/catalog pitch (${matched.toString()}) - flagged as spam by moderators. Use first-person ("I", not "we/my team"), post-specific language with one concrete recent build.`);
          score -= 50;
        }
        // Strict word cap — vendor pitches are long, peer offers are short
        const wordCount = body.split(/\s+/).filter(Boolean).length;
        if (wordCount > 90) {
          reasons.push(`Hiring reply too long (${wordCount} words, max 90). Brevity signals peer offer, not vendor pitch.`);
          score -= 30;
        }
        // Require first-person voice — count "I" vs "we/my team" mentions
        const firstPersonCount = (body.match(/\bI\b/g) || []).length;
        const teamCount = (body.match(/\b(we|my team|our team|us)\b/gi) || []).length;
        if (teamCount > firstPersonCount + 1) {
          reasons.push(`Reply uses too much "we/my team" (${teamCount}) vs first-person "I" (${firstPersonCount}). Hiring replies must read as personal, not corporate.`);
          score -= 30;
        }
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
