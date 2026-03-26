/**
 * OpenClaw Platform Strategy Layer
 *
 * Central source of truth for platform behavioral rules.
 * Every agent imports from here — no platform-specific logic lives elsewhere.
 *
 * Two orthogonal axes:
 *
 * Axis 1 — Content Strategy (controls LLM prompts, tone, link rules):
 *   PASSIVE_SIGNAL     — React only, no posts, no links, no promo
 *   HYBRID_ENGAGEMENT  — Engage first, light posting after warmup
 *   AUTHORITY_BROADCAST — Content-first, CTAs OK, conversion-aware
 *
 * Axis 2 — Execution Type (controls posting behavior):
 *   API_POSTING        — Auto-approve, auto-post via API, rate limited
 *   HUMAN_EXECUTION    — Generate response, queue for manual copy-paste, NEVER auto-post
 */

// ─── Strategy Types (Axis 1 — Content Strategy) ─────────────────────────────

export type PlatformStrategyType = 'PASSIVE_SIGNAL' | 'HYBRID_ENGAGEMENT' | 'AUTHORITY_BROADCAST';

export const PLATFORM_STRATEGY: Record<string, PlatformStrategyType> = {
  // PASSIVE — reactive only, no self-promotion, blend in
  reddit: 'PASSIVE_SIGNAL',
  quora: 'PASSIVE_SIGNAL',
  hackernews: 'PASSIVE_SIGNAL',
  facebook_groups: 'PASSIVE_SIGNAL',
  linkedin_comments: 'PASSIVE_SIGNAL',

  // HYBRID — engage first, light posting after warmup
  twitter: 'HYBRID_ENGAGEMENT',
  bluesky: 'HYBRID_ENGAGEMENT',
  devto: 'HYBRID_ENGAGEMENT',
  hashnode: 'HYBRID_ENGAGEMENT',
  discourse: 'HYBRID_ENGAGEMENT',
  producthunt: 'HYBRID_ENGAGEMENT',

  // AUTHORITY — you control the narrative, content-first
  linkedin: 'AUTHORITY_BROADCAST',
  medium: 'AUTHORITY_BROADCAST',
  youtube: 'AUTHORITY_BROADCAST',
};

// ─── Execution Types (Axis 2 — Posting Behavior) ────────────────────────────

export type PlatformExecutionType = 'API_POSTING' | 'HUMAN_EXECUTION';

export const PLATFORM_EXECUTION: Record<string, PlatformExecutionType> = {
  // API_POSTING — auto-approve, auto-post, rate limited
  devto: 'API_POSTING',
  hashnode: 'API_POSTING',
  discourse: 'API_POSTING',
  twitter: 'API_POSTING',
  bluesky: 'API_POSTING',
  producthunt: 'API_POSTING',
  youtube: 'API_POSTING',

  // HUMAN_EXECUTION — generate response, queue for manual posting, NEVER auto-post
  reddit: 'HUMAN_EXECUTION',
  quora: 'HUMAN_EXECUTION',
  hackernews: 'HUMAN_EXECUTION',
  facebook_groups: 'HUMAN_EXECUTION',
  linkedin_comments: 'HUMAN_EXECUTION',
};

export function getExecutionType(platform: string): PlatformExecutionType {
  return PLATFORM_EXECUTION[platform] || 'HUMAN_EXECUTION'; // default to safest
}

export function isHumanExecution(platform: string): boolean {
  return getExecutionType(platform) === 'HUMAN_EXECUTION';
}

export function getStrategy(platform: string): PlatformStrategyType {
  return PLATFORM_STRATEGY[platform] || 'PASSIVE_SIGNAL'; // default to most restrictive
}

// ─── Link Control ────────────────────────────────────────────────────────────

export function isLinkAllowed(platform: string): boolean {
  return getStrategy(platform) !== 'PASSIVE_SIGNAL';
}

// ─── LLM Prompt Instructions Per Strategy ────────────────────────────────────

export const STRATEGY_PROMPT_INSTRUCTIONS: Record<PlatformStrategyType, string> = {
  PASSIVE_SIGNAL: `CRITICAL PLATFORM RULES — PASSIVE ENGAGEMENT:
- You are responding to an EXISTING conversation. Generate a reply/comment ONLY.
- Do NOT include any URLs or links — not even helpful resource links.
- Do NOT use promotional language, CTAs, or calls to action.
- Do NOT mention any company, product, program, or brand by name.
- Do NOT say "our program", "our accelerator", "our team", "we offer", or similar.
- Be genuinely helpful and insightful. Share experience and frameworks, nothing else.
- Sound like a knowledgeable practitioner, not a marketer.
- If in doubt, err on the side of being MORE subtle, not less.`,

  HYBRID_ENGAGEMENT: `PLATFORM RULES — ENGAGEMENT-FIRST:
- Prioritize engagement: reply to the conversation with genuine value FIRST.
- Lead with insight, NOT self-promotion.
- A single, natural resource link at the very end is acceptable if it flows organically.
- Light self-reference is OK ("in my experience with enterprise teams...") but keep it subtle.
- Do NOT lead with or center your response around a link or CTA.`,

  AUTHORITY_BROADCAST: `PLATFORM RULES — AUTHORITY CONTENT:
- Create authoritative, original content. You are the thought leader.
- Include a tracked link — conversion-aware messaging is appropriate here.
- Structured CTAs are acceptable (e.g., "Learn more about...", "Join our next cohort").
- Be professional, data-driven, and opinionated. Take clear positions.
- Link to resources that genuinely help the reader.`,
};

// ─── Invitation-Based Conversion Engine (8-Stage Flow) ───────────────────────
//
// They post → You comment → They engage → You guide → They pull → You convert → You close
// NEVER skip stages. NEVER pitch before Stage 5.
//
// Stages 1-5: Automated engagement (existing)
// Stage 6: Conversion ready — interest confirmed, call/link offered
// Stage 7: Call scheduled — booked or DM initiated
// Stage 8: Closed — won or lost (terminal, manual admin update)

export interface EngagementEvent {
  content?: string;
  is_our_reply?: boolean;
  created_at?: string;
}

/**
 * Detect which conversation stage we're at based on engagement history.
 * History should be chronological — their replies to our comments.
 */
export function detectConversationStage(history: EngagementEvent[]): number {
  if (!history || history.length === 0) return 1;

  // Check for Stage 5 interest signals first (can happen at any exchange count)
  const interestSignals = [
    'show me', 'that would be', "that'd be", 'interested',
    'how do i', 'can you show', 'love to', 'tell me more',
    'sign me up', 'where can i', 'send me', 'link me',
    'happy to chat', 'let\'s connect', 'jump on a call',
    'sounds great', 'i\'d like to', 'yes please',
  ];
  const theirReplies = history.filter(e => !e.is_our_reply);
  const latestReply = theirReplies[theirReplies.length - 1];
  if (latestReply && interestSignals.some(s => (latestReply.content || '').toLowerCase().includes(s))) {
    return 5;
  }

  // Stage 2: They replied once
  if (theirReplies.length === 1) return 2;

  // Stage 3: Multiple exchanges, they're asking questions or showing active interest
  if (theirReplies.length >= 2) {
    const hasQuestions = theirReplies.some(e => (e.content || '').includes('?'));
    if (hasQuestions) return 3;
  }

  // Stage 4: Extended conversation (3+ of their replies)
  if (theirReplies.length >= 3) return 4;

  // Default: advance based on reply count but cap at 4
  return Math.min(theirReplies.length + 1, 4);
}

export const CONVERSION_STAGE_PROMPTS: Record<number, string> = {
  1: `CONVERSATION STAGE 1 — INITIAL ENGAGEMENT:
Generate a reply that provides INSIGHT ONLY.
- No pitch, no link, no self-reference, no company mention.
- Trigger curiosity with a counter-intuitive or surprising observation.
- Keep it under 3 sentences.
- Sound like a knowledgeable peer, not a sales rep.
Example: "Most teams don't struggle with the tools — they struggle because nothing actually gets wired into real workflows."`,

  2: `CONVERSATION STAGE 2 — QUALIFICATION:
The user has responded to our comment. Ask a qualifying question:
- Determine if they are actively solving this problem or just exploring.
- Keep it conversational, NOT salesy.
- Mirror their language and tone.
- One question, not a list of questions.
Example: "Out of curiosity — is this something you're actively trying to fix right now or just exploring?"`,

  3: `CONVERSATION STAGE 3 — DEEPENING:
The user is actively engaged. Provide structured thinking:
- Share a framework or mental model (3 bullets max).
- Ask about THEIR specific use case — keep THEM talking.
- Do NOT solve everything yet — leave room for continued conversation.
- Still NO links, NO CTAs.
Example: "What's usually missing is: (1) how signals are defined, (2) what decisions get made, (3) what actions actually run. What kind of use case are you working on?"`,

  4: `CONVERSATION STAGE 4 — TRANSITION:
Introduce that you help teams solve this, but do NOT push:
- "This is actually something I've been helping teams structure internally..."
- "If it's helpful, I can show you how I think about it based on your use case."
- Wait for THEM to say "yes" — do NOT drop a link or call CTA yet.
- If they don't bite, gracefully continue providing value. Never force it.`,

  5: `CONVERSATION STAGE 5 — CONVERSION (THEY EXPRESSED INTEREST):
The user has explicitly asked for more. NOW you may offer ONE of these:
- Option A (soft call): "Easiest way is probably to walk through it quickly — happy to jump on a quick call if that works."
- Option B (resource link): "I actually broke this down here if you want to take a look first: [link]"
- Pick ONE option, not both.
- Keep it casual, not transactional.
- This is an invitation, not a close.`,

  6: `CONVERSATION STAGE 6 — FOLLOW-UP (OFFERED, AWAITING RESPONSE):
You already offered a call or resource link. If they haven't responded:
- Send ONE gentle follow-up after 48h.
- Reference a recent development or new angle on their problem.
- Do NOT repeat the call offer — they saw it.
- If they decline or ghost after this, gracefully close.
Example: "Saw an interesting case study on exactly the challenge you described — thought of you. No pressure either way."`,
};

// ─── Post-Generation Validation Gate ─────────────────────────────────────────
// Deterministic backstop — catches LLM violations regardless of prompt adherence.

export interface ValidationResult {
  passed: boolean;
  reason?: string;
}

const URL_REGEX = /https?:\/\/\S+/;
const CTA_PATTERNS = /\b(sign up|register|enroll|join now|learn more|click here|check out our|visit our|get started|book a call|schedule a call|book a demo)\b/i;
const PROMO_PATTERNS = /\b(our program|the accelerator|our cohort|our course|we offer|we provide|our training|our team offers|colaberry)\b/i;

/**
 * Validate generated content against platform strategy rules.
 * Called AFTER LLM generation, BEFORE saving to DB.
 */
export function validateContentForStrategy(content: string, platform: string): ValidationResult {
  const strategy = getStrategy(platform);

  if (strategy === 'PASSIVE_SIGNAL') {
    if (URL_REGEX.test(content)) {
      return { passed: false, reason: 'PASSIVE_SIGNAL: content must not contain URLs' };
    }
    if (CTA_PATTERNS.test(content)) {
      return { passed: false, reason: 'PASSIVE_SIGNAL: content must not contain CTAs' };
    }
    if (PROMO_PATTERNS.test(content)) {
      return { passed: false, reason: 'PASSIVE_SIGNAL: content must not contain promotional language' };
    }
  }

  if (strategy === 'HYBRID_ENGAGEMENT') {
    let promoScore = 0;
    if (CTA_PATTERNS.test(content)) promoScore++;
    if ((content.match(new RegExp(PROMO_PATTERNS.source, 'gi')) || []).length > 1) promoScore++;
    if ((content.match(new RegExp(URL_REGEX.source, 'g')) || []).length > 1) promoScore++;
    if (promoScore >= 2) {
      return { passed: false, reason: 'HYBRID_ENGAGEMENT: content is too promotional (multiple CTAs/links/promo)' };
    }
  }

  // AUTHORITY_BROADCAST: no content rejection — most permissive
  return { passed: true };
}

/**
 * Validate follow-up content against conversion stage rules.
 * Stages 1-4: No links, no CTAs. Stage 5: One link OR one call offer.
 */
export function validateContentForStage(content: string, stage: number): ValidationResult {
  if (stage <= 4) {
    if (URL_REGEX.test(content)) {
      return { passed: false, reason: `Stage ${stage}: no links allowed before Stage 5` };
    }
    if (CTA_PATTERNS.test(content)) {
      return { passed: false, reason: `Stage ${stage}: no CTAs allowed before Stage 5` };
    }
  }

  if (stage === 5 || stage === 6) {
    // Allow one link OR one call reference, but not excessive
    const urlCount = (content.match(new RegExp(URL_REGEX.source, 'g')) || []).length;
    if (urlCount > 1) {
      return { passed: false, reason: `Stage ${stage}: only one link allowed` };
    }
  }

  // Stages 7-8: terminal — no automated content should be generated
  if (stage >= 7) {
    return { passed: false, reason: `Stage ${stage}: no automated content — human handles post-booking` };
  }

  return { passed: true };
}

// ─── Conversion Signal Detection ─────────────────────────────────────────────

const INTEREST_SIGNALS: Array<{ pattern: string; confidence: number }> = [
  // High confidence — explicit ask
  { pattern: 'sign me up', confidence: 1.0 },
  { pattern: 'where can i', confidence: 0.95 },
  { pattern: 'send me', confidence: 0.95 },
  { pattern: 'link me', confidence: 0.95 },
  { pattern: 'jump on a call', confidence: 0.95 },
  { pattern: 'happy to chat', confidence: 0.9 },
  { pattern: "let's connect", confidence: 0.9 },
  { pattern: 'yes please', confidence: 0.9 },
  // Medium-high — clear interest
  { pattern: 'show me', confidence: 0.85 },
  { pattern: 'can you show', confidence: 0.85 },
  { pattern: 'how do i', confidence: 0.8 },
  { pattern: 'love to', confidence: 0.8 },
  { pattern: 'tell me more', confidence: 0.8 },
  { pattern: "i'd like to", confidence: 0.8 },
  { pattern: 'interested', confidence: 0.75 },
  { pattern: 'sounds great', confidence: 0.75 },
  // Medium — implied interest
  { pattern: 'that would be', confidence: 0.7 },
  { pattern: "that'd be", confidence: 0.7 },
  { pattern: 'can we talk', confidence: 0.85 },
  { pattern: 'do you offer', confidence: 0.8 },
  { pattern: 'how does this work', confidence: 0.75 },
  { pattern: 'what does it cost', confidence: 0.9 },
  { pattern: 'pricing', confidence: 0.85 },
];

/**
 * Detect conversion signals in text content.
 * Returns matched signals with confidence scores.
 */
export function detectConversionSignals(content: string): Array<{ signal: string; confidence: number }> {
  if (!content) return [];
  const lower = content.toLowerCase();
  const matches: Array<{ signal: string; confidence: number }> = [];

  for (const { pattern, confidence } of INTEREST_SIGNALS) {
    if (lower.includes(pattern)) {
      matches.push({ signal: pattern, confidence });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

// ─── Follow-Up Validation ────────────────────────────────────────────────────

const AGGRESSIVE_PATTERNS = /\b(last chance|don't miss|act now|limited time|hurry|final reminder|closing soon|one time offer|expires|urgent)\b/i;

/**
 * Validate follow-up content for safety.
 * Prevents aggressive follow-ups and enforces stage-based rules.
 */
export function validateFollowUpContent(content: string, stage: number, followUpCount: number): ValidationResult {
  // Never follow up on a cold first-touch
  if (stage <= 1) {
    return { passed: false, reason: 'Stage 1: follow-ups are prohibited on cold first-touch' };
  }

  // Max 2 follow-ups per conversation per stage
  if (followUpCount >= 2) {
    return { passed: false, reason: `Max 2 follow-ups per stage reached (count: ${followUpCount})` };
  }

  // Block aggressive language
  if (AGGRESSIVE_PATTERNS.test(content)) {
    return { passed: false, reason: 'Follow-up contains aggressive/urgency language — blocked' };
  }

  // Follow-ups must also pass stage validation
  return validateContentForStage(content, stage);
}

// ─── Auto-Approve Logic ─────────────────────────────────────────────────────

const STRATEGY_AUTO_APPROVE: Record<PlatformStrategyType, boolean> = {
  PASSIVE_SIGNAL: false,       // human review — these platforms ban mistakes
  HYBRID_ENGAGEMENT: true,     // auto-approve after validation passes
  AUTHORITY_BROADCAST: false,   // human review — authority content must be high-quality
};

/**
 * Determine if a response should be auto-approved.
 * HARD RULE: HUMAN_EXECUTION platforms NEVER auto-approve (override-proof).
 * Config overrides apply only to API_POSTING platforms.
 */
export function shouldAutoApprove(platform: string, configOverrides: string[]): boolean {
  // Safety gate: HUMAN_EXECUTION platforms NEVER auto-approve, regardless of config
  if (isHumanExecution(platform)) return false;
  if (configOverrides.includes(platform)) return true;
  return STRATEGY_AUTO_APPROVE[getStrategy(platform)];
}

// ─── Rate Limits Per Strategy ────────────────────────────────────────────────

export const STRATEGY_RATE_LIMITS: Record<PlatformStrategyType, { max_per_hour: number; max_per_day: number }> = {
  PASSIVE_SIGNAL: { max_per_hour: 2, max_per_day: 8 },
  HYBRID_ENGAGEMENT: { max_per_hour: 4, max_per_day: 20 },
  AUTHORITY_BROADCAST: { max_per_hour: 3, max_per_day: 10 },
};

// ─── Task Type Allowed Per Strategy ──────────────────────────────────────────

export function isPostCreationAllowed(platform: string): boolean {
  return getStrategy(platform) !== 'PASSIVE_SIGNAL';
}
