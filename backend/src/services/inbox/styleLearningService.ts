/**
 * Style Learning Service — Compares AI drafts with user-edited replies,
 * extracts style deltas via Claude, and gradually updates style profiles.
 */
import OpenAI from 'openai';
import { Op } from 'sequelize';
import InboxReplyDraft from '../../models/InboxReplyDraft';
import InboxLearningEvent from '../../models/InboxLearningEvent';
import InboxStyleProfile from '../../models/InboxStyleProfile';
import InboxClassification from '../../models/InboxClassification';
import InboxAuditLog from '../../models/InboxAuditLog';
import { logAuditEvent } from './inboxAuditService';

const LOG_PREFIX = '[InboxCOS][StyleLearn]';

// ─── Learning Extraction Types ─────────────────────────────────────────────

interface StyleDiff {
  formality_delta: number;
  length_delta_pct: number;
  greeting_used: string;
  signoff_used: string;
  tone_adjustments: string[];
  vocabulary_preferences: string[];
  structural_notes: string;
}

// ─── Main Learning Loop ────────────────────────────────────────────────────

/**
 * Finds edited drafts that have not yet been analyzed, compares the AI draft
 * against the user's actual reply, extracts style deltas, and updates the
 * corresponding style profiles incrementally.
 */
export async function runLearningExtraction(): Promise<{ processed: number }> {
  // 1. Find drafts that were sent or edited, and have no matching learning event
  const existingEventDraftIds = await InboxLearningEvent.findAll({
    attributes: ['draft_id'],
  });
  const processedDraftIds = new Set(existingEventDraftIds.map((e) => e.draft_id));

  const candidateDrafts = await InboxReplyDraft.findAll({
    where: {
      status: { [Op.in]: ['sent', 'edited'] },
    },
  });

  // Filter out already-processed drafts
  const unprocessedDrafts = candidateDrafts.filter(
    (d) => !processedDraftIds.has(d.id)
  );

  // 2. For each draft, determine if learning is possible
  // If status='sent' (approved without edit), skip — the AI draft was accepted as-is
  // If edited_body exists, use that as the actual reply
  const learningCandidates = unprocessedDrafts.filter((d) => !!d.edited_body);

  if (learningCandidates.length === 0) {
    console.log(`${LOG_PREFIX} No edited drafts to learn from`);
    return { processed: 0 };
  }

  console.log(
    `${LOG_PREFIX} Found ${learningCandidates.length} edited drafts to analyze`
  );

  let processed = 0;

  for (const draft of learningCandidates) {
    try {
      await processSingleDraft(draft);
      processed++;
    } catch (error: any) {
      console.error(
        `${LOG_PREFIX} Failed to process draft ${draft.id}: ${error.message}`
      );
      // Continue with next draft — don't let one failure block the batch
    }
  }

  console.log(`${LOG_PREFIX} Learning extraction complete: ${processed} drafts processed`);
  return { processed };
}

// ─── Single Draft Processing ───────────────────────────────────────────────

async function processSingleDraft(draft: InboxReplyDraft): Promise<void> {
  const aiDraft = draft.draft_body;
  const actualReply = draft.edited_body!;

  // 3a. Call Claude for style comparison
  const diff = await extractStyleDiff(aiDraft, actualReply);

  // 3b. Look up the email category for profile targeting
  const classification = await InboxClassification.findOne({
    where: { email_id: draft.email_id },
    order: [['classified_at', 'DESC']],
  });

  const category = extractCategory(classification);

  // 3c. Create the learning event
  await InboxLearningEvent.create({
    email_id: draft.email_id,
    draft_id: draft.id,
    ai_draft_text: aiDraft,
    actual_reply_text: actualReply,
    diff_summary: diff,
    style_adjustments: {
      formality_delta: diff.formality_delta,
      greeting_used: diff.greeting_used,
      signoff_used: diff.signoff_used,
      tone_adjustments: diff.tone_adjustments,
    },
    processed_at: new Date(),
  });

  // 3d. Update the style profile for this category
  await updateStyleProfile(category, diff);

  // Log the learning event
  await logAuditEvent({
    email_id: draft.email_id,
    action: 'style_learning',
    actor: 'system',
    metadata: {
      draft_id: draft.id,
      category,
      formality_delta: diff.formality_delta,
      greeting_used: diff.greeting_used,
      signoff_used: diff.signoff_used,
    },
  });

  console.log(
    `${LOG_PREFIX} Learned from draft ${draft.id} | category=${category} | formality_delta=${diff.formality_delta}`
  );
}

// ─── Claude Style Comparison ───────────────────────────────────────────────

async function extractStyleDiff(aiDraft: string, actualReply: string): Promise<StyleDiff> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Compare these two replies to the same email.

AI Draft:
${aiDraft}

Ali's Actual Reply:
${actualReply}

Analyze in JSON:
{
  "formality_delta": <-5 to +5>,
  "length_delta_pct": <percentage>,
  "greeting_used": "<what Ali used>",
  "signoff_used": "<what Ali used>",
  "tone_adjustments": ["<observations>"],
  "vocabulary_preferences": ["<words Ali chose over AI>"],
  "structural_notes": "<how Ali organized differently>"
}`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    return parseJsonResponse(content);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Style comparison LLM call failed: ${error.message}`);

    // Return neutral defaults so the learning event is still recorded
    return {
      formality_delta: 0,
      length_delta_pct: 0,
      greeting_used: '',
      signoff_used: '',
      tone_adjustments: [],
      vocabulary_preferences: [],
      structural_notes: 'Analysis failed',
    };
  }
}

// ─── Profile Update ────────────────────────────────────────────────────────

/**
 * Incrementally updates the style profile for a category based on the diff.
 * Uses small multipliers to ensure gradual convergence.
 */
async function updateStyleProfile(category: string, diff: StyleDiff): Promise<void> {
  let profile = await InboxStyleProfile.findOne({ where: { category } });

  if (!profile) {
    // Create a new profile for this category with defaults
    profile = await InboxStyleProfile.create({
      category,
      formality_level: 5.0,
      greeting_patterns: [],
      signoff_patterns: [],
      avg_sentence_length: 15.0,
      vocabulary_preferences: [],
      tone_descriptors: [],
      sample_count: 0,
    });
    console.log(`${LOG_PREFIX} Created new style profile for category: ${category}`);
  }

  // Adjust formality_level by delta * 0.1 (gradual convergence)
  const newFormality = clamp(
    profile.formality_level + diff.formality_delta * 0.1,
    1.0,
    10.0
  );
  profile.formality_level = Math.round(newFormality * 10) / 10;

  // If greeting_used is not already in greeting_patterns, add it
  if (diff.greeting_used && diff.greeting_used.trim()) {
    const greetings: string[] = Array.isArray(profile.greeting_patterns)
      ? [...profile.greeting_patterns]
      : [];
    const normalizedGreeting = diff.greeting_used.trim();
    if (!greetings.some((g) => g.toLowerCase() === normalizedGreeting.toLowerCase())) {
      greetings.push(normalizedGreeting);
      profile.greeting_patterns = greetings;
    }
  }

  // If signoff_used is not already in signoff_patterns, add it
  if (diff.signoff_used && diff.signoff_used.trim()) {
    const signoffs: string[] = Array.isArray(profile.signoff_patterns)
      ? [...profile.signoff_patterns]
      : [];
    const normalizedSignoff = diff.signoff_used.trim();
    if (!signoffs.some((s) => s.toLowerCase() === normalizedSignoff.toLowerCase())) {
      signoffs.push(normalizedSignoff);
      profile.signoff_patterns = signoffs;
    }
  }

  // Append new tone_adjustments to tone_descriptors (deduplicate)
  if (Array.isArray(diff.tone_adjustments) && diff.tone_adjustments.length > 0) {
    const tones: string[] = Array.isArray(profile.tone_descriptors)
      ? [...profile.tone_descriptors]
      : [];
    for (const adjustment of diff.tone_adjustments) {
      const normalized = adjustment.trim().toLowerCase();
      if (normalized && !tones.some((t) => t.toLowerCase() === normalized)) {
        tones.push(adjustment.trim());
      }
    }
    profile.tone_descriptors = tones;
  }

  // Increment sample_count and set last_updated
  profile.sample_count = (profile.sample_count || 0) + 1;
  profile.last_updated = new Date();

  await profile.save();

  console.log(
    `${LOG_PREFIX} Updated profile for ${category}: formality=${profile.formality_level}, samples=${profile.sample_count}`
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extracts category from a classification, same logic as replyDraftService.
 */
function extractCategory(classification: InboxClassification | null): string {
  if (!classification) return 'unknown';

  const reasoning = (classification.reasoning || '').toLowerCase();
  const knownCategories = ['business', 'personal', 'notification', 'marketing', 'transactional'];

  for (const cat of knownCategories) {
    if (reasoning.includes(cat)) {
      return cat;
    }
  }

  return 'unknown';
}

/**
 * Parses a JSON response from the LLM, stripping markdown fences if present.
 */
function parseJsonResponse(text: string): StyleDiff {
  let cleaned = text.trim();

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      formality_delta: clamp(Number(parsed.formality_delta) || 0, -5, 5),
      length_delta_pct: Number(parsed.length_delta_pct) || 0,
      greeting_used: String(parsed.greeting_used || ''),
      signoff_used: String(parsed.signoff_used || ''),
      tone_adjustments: Array.isArray(parsed.tone_adjustments)
        ? parsed.tone_adjustments.map(String)
        : [],
      vocabulary_preferences: Array.isArray(parsed.vocabulary_preferences)
        ? parsed.vocabulary_preferences.map(String)
        : [],
      structural_notes: String(parsed.structural_notes || ''),
    };
  } catch {
    console.error(`${LOG_PREFIX} Failed to parse style diff JSON: ${cleaned.substring(0, 200)}`);
    return {
      formality_delta: 0,
      length_delta_pct: 0,
      greeting_used: '',
      signoff_used: '',
      tone_adjustments: [],
      vocabulary_preferences: [],
      structural_notes: 'JSON parse failed',
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
