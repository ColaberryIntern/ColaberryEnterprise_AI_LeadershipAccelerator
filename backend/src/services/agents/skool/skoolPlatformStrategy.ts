/**
 * Skool Platform Strategy Layer
 *
 * Central source of truth for Skool (AI Automation Agency Hub) engagement rules.
 * Controls content strategy, tone, category targeting, signal scoring,
 * and the GPT-4o system prompt for reply generation.
 *
 * Platform context:
 *   - Community: "AI Automation Agency Hub" by Liam Ottley on Skool
 *   - Our role: Ali Muwwakkil, Managing Director at Colaberry Enterprise AI Division
 *   - Goal: Position as the delivery/build partner for agency owners
 *   - Execution: HUMAN_EXECUTION (browser-based, manual copy-paste, NEVER auto-post)
 */

// ─── Category Configuration ─────────────────────────────────────────────────

export interface CategoryConfig {
  maxPerDay: number;
  tone: string;
  ctaLevel: 'minimal' | 'subtle' | 'moderate' | 'direct';
  description: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  'dev-help': {
    maxPerDay: 3,
    tone: 'technical_expert',
    ctaLevel: 'subtle',
    description: 'Answer with genuine expertise, subtle CTA',
  },
  'leads-help': {
    maxPerDay: 2,
    tone: 'consultative',
    ctaLevel: 'moderate',
    description: 'Share advice + mention advisor tool',
  },
  'hiring': {
    maxPerDay: 1,
    tone: 'direct_offer',
    ctaLevel: 'direct',
    description: 'Respond to looking for developer/partner posts',
  },
  'builds': {
    maxPerDay: 1,
    tone: 'peer_technical',
    ctaLevel: 'subtle',
    description: 'Comment on builds, occasionally post own',
  },
  'introductions': {
    maxPerDay: 1,
    tone: 'welcoming',
    ctaLevel: 'minimal',
    description: 'Welcome new members who match ICP',
  },
  'announcements': {
    maxPerDay: 1,
    tone: 'peer_level',
    ctaLevel: 'subtle',
    description: 'Comment on Liam posts when relevant',
  },
};

export function getCategoryConfig(): Record<string, CategoryConfig> {
  return { ...CATEGORY_CONFIG };
}

export function getCategoryNames(): string[] {
  return Object.keys(CATEGORY_CONFIG);
}

// ─── Banned Words ────────────────────────────────────────────────────────────

const BANNED_WORDS: string[] = [
  'white-label',
  'white label',
  'whitelabel',
  'wholesale',
  'markup',
];

export function getBannedWords(): string[] {
  return [...BANNED_WORDS];
}

/**
 * Check if content contains any banned words.
 * Returns the first matched banned word or null if clean.
 */
export function containsBannedWord(content: string): string | null {
  const lower = content.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) return word;
  }
  return null;
}

// ─── Allowed URLs ────────────────────────────────────────────────────────────

const ALLOWED_URLS: string[] = [
  'https://enterprise.colaberry.ai/partners',
  'https://enterprise.colaberry.ai/ai-workforce-designer',
  'https://advisor.colaberry.ai/advisory',
];

export function getAllowedUrls(): string[] {
  return [...ALLOWED_URLS];
}

/**
 * Extract all URLs from content and verify each is in the allowed list.
 * Returns any disallowed URLs found.
 */
export function findDisallowedUrls(content: string): string[] {
  const urlRegex = /https?:\/\/\S+/g;
  const found = content.match(urlRegex) || [];
  return found.filter((url) => {
    const cleaned = url.replace(/[.,;:!?)]+$/, '');
    return !ALLOWED_URLS.some((allowed) => cleaned.startsWith(allowed));
  });
}

// ─── Case Studies ────────────────────────────────────────────────────────────

export interface CaseStudy {
  name: string;
  stat: string;
  detail: string;
}

const CASE_STUDIES: CaseStudy[] = [
  {
    name: 'Logistics route planning',
    stat: '$1.2M annual savings',
    detail: '200+ vehicles, deployed in 11 days',
  },
  {
    name: 'Invoice processing',
    stat: '200 invoices in 4 minutes',
    detail: '97% accuracy',
  },
  {
    name: 'Storm response',
    stat: '42,000 members served',
    detail: '60% fewer inbound calls',
  },
];

export function getCaseStudies(): CaseStudy[] {
  return CASE_STUDIES.map((cs) => ({ ...cs }));
}

// ─── Signal Scoring ─────────────────────────────────────────────────────────

export interface SkoolSignalInput {
  category: string;
  title: string;
  body: string;
  commentCount: number;
  postedAt: Date | string;
}

const CATEGORY_BASE_SCORES: Record<string, number> = {
  'hiring': 10,
  'dev-help': 8,
  'leads-help': 7,
  'builds': 5,
  'introductions': 4,
  'announcements': 3,
};

const HIGH_INTENT_KEYWORDS: string[] = [
  'looking for developer',
  'looking for a developer',
  'need help building',
  'hiring',
  'partner',
  'looking for someone to build',
  'need a dev',
  'need a developer',
  'looking for an ai developer',
  'need someone to build',
  'who can build',
  'looking for a technical partner',
  'looking for a tech partner',
];

/**
 * Score a signal for engagement priority.
 * Higher score = higher priority.
 *
 * Scoring factors:
 *   - Category relevance (hiring=10, dev-help=8, leads-help=7, etc.)
 *   - Freshness (<2h=+3, <6h=+2, <24h=+1)
 *   - Comment count (<5=+2, >20=-2)
 *   - High-intent keywords in title/body (+5 per match, max +5)
 */
export function scoreSignal(signal: SkoolSignalInput): number {
  let score = 0;

  // Category relevance
  score += CATEGORY_BASE_SCORES[signal.category] || 2;

  // Freshness
  const postedAt = typeof signal.postedAt === 'string' ? new Date(signal.postedAt) : signal.postedAt;
  const ageMs = Date.now() - postedAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours < 2) {
    score += 3;
  } else if (ageHours < 6) {
    score += 2;
  } else if (ageHours < 24) {
    score += 1;
  }

  // Comment count - early threads are better opportunities
  if (signal.commentCount < 5) {
    score += 2;
  } else if (signal.commentCount > 20) {
    score -= 2;
  }

  // High-intent keywords (cap at +5 total)
  const combined = `${signal.title} ${signal.body}`.toLowerCase();
  const hasHighIntent = HIGH_INTENT_KEYWORDS.some((kw) => combined.includes(kw));
  if (hasHighIntent) {
    score += 5;
  }

  return score;
}

// ─── Engagement Decision ─────────────────────────────────────────────────────

const ENGAGEMENT_THRESHOLD = 5;

/**
 * Daily usage tracker - in production this would be backed by the DB.
 * For the strategy layer, we accept counts as input.
 */
export function shouldEngage(
  signal: SkoolSignalInput,
  dailyCategoryCount: number,
): boolean {
  const score = scoreSignal(signal);
  if (score <= ENGAGEMENT_THRESHOLD) return false;

  const config = CATEGORY_CONFIG[signal.category];
  if (!config) return false;

  if (dailyCategoryCount >= config.maxPerDay) return false;

  return true;
}

// ─── System Prompt for GPT-4o ────────────────────────────────────────────────

const TONE_INSTRUCTIONS: Record<string, string> = {
  technical_expert: `Tone: Technical Expert
- Lead with a specific, actionable technical insight.
- Reference architecture patterns, deployment approaches, or integration strategies.
- Show you have hands-on experience building these systems.
- Avoid high-level platitudes. Be specific enough that a developer could act on your advice.`,

  consultative: `Tone: Consultative
- Ask a clarifying question before prescribing a solution.
- Frame your answer around the business outcome, not just the technology.
- Mention that you have a tool that helps structure this kind of thinking (advisor.colaberry.ai), but only after providing real value first.`,

  direct_offer: `Tone: Direct Offer
- This person is explicitly looking for a developer or partner. Respond directly.
- State clearly what your team does: production AI systems, AIOS installs, multi-agent orchestration, voice agents, custom backends.
- Include a link to the partners page if appropriate.
- Be confident but not pushy. Let them come to you.`,

  peer_technical: `Tone: Peer Technical
- Comment as a fellow builder. Show genuine interest in their architecture.
- Ask a specific technical question about their approach.
- Share a relevant insight from your own builds if applicable.`,

  welcoming: `Tone: Welcoming
- Welcome the new member warmly.
- If their intro mentions a relevant pain point or goal, acknowledge it specifically.
- Keep it brief. One or two sentences max.`,

  peer_level: `Tone: Peer Level
- Engage as a peer in the community. Comment on the substance, not just agree.
- Add a complementary perspective or ask a thoughtful follow-up question.
- Keep it brief and genuine.`,
};

export function getSystemPrompt(category: string): string {
  const config = CATEGORY_CONFIG[category];
  const toneInstruction = config ? TONE_INSTRUCTIONS[config.tone] || '' : '';
  const ctaLevel = config ? config.ctaLevel : 'minimal';

  const caseStudyBlock = CASE_STUDIES.map(
    (cs) => `  - ${cs.name}: ${cs.stat} (${cs.detail})`,
  ).join('\n');

  const allowedUrlBlock = ALLOWED_URLS.map((u) => `  - ${u}`).join('\n');
  const bannedWordBlock = BANNED_WORDS.map((w) => `  - "${w}"`).join('\n');

  let ctaInstruction = '';
  switch (ctaLevel) {
    case 'minimal':
      ctaInstruction = `CTA Level: MINIMAL
- After providing value, add a brief line like "This is what my team does full-time - we build production AI systems for agency owners."
- Do NOT include URLs. The sign-off name is enough for people to find you.`;
      break;
    case 'subtle':
      ctaInstruction = `CTA Level: SUBTLE
- Answer the question thoroughly first.
- Then add 1-2 sentences positioning yourself: "My team builds these kinds of systems full-time for agency owners. Happy to chat if you want to go deeper on this."
- You may mention "we build production AI systems" or "my team does this at scale" naturally.
- Do NOT include URLs in dev-help replies. Let people DM you.`;
      break;
    case 'moderate':
      ctaInstruction = `CTA Level: MODERATE
- Provide value first, then mention the advisor tool naturally.
- Include this URL when relevant: https://advisor.colaberry.ai/advisory
- Frame it as: "I built a free tool that does this - designs an AI workforce for any business in 5 minutes."
- Also mention: "My team builds production AI systems for agency owners. DM me if you want to talk."`;
      break;
    case 'direct':
      ctaInstruction = `CTA Level: DIRECT
- Lead with a relevant insight, then state your offer clearly.
- Include this URL: https://enterprise.colaberry.ai/partners
- Say: "My team is the delivery side for agency owners. You close the deal, we build and maintain the system on retainer. DM me or check out enterprise.colaberry.ai/partners."`;
      break;
  }

  return `You are Ali Muwwakkil, Managing Director at Colaberry Enterprise AI Division.
You are engaging in the AI Automation Agency Hub community on Skool (run by Liam Ottley).

IDENTITY:
- Your team builds production AI systems: AIOS installs, multi-agent orchestration, voice agents, custom backends.
- You are the delivery team for agency owners who sell AI but need someone to build it.
- You have deployed production AI systems across logistics, finance, utilities, and insurance.
- You are a peer in this community, not a vendor. You genuinely want to help.

${toneInstruction}

${ctaInstruction}

CASE STUDIES (use ONLY these, never fabricate):
${caseStudyBlock}

ALLOWED URLs (ONLY these may appear in your response):
${allowedUrlBlock}

BANNED WORDS (NEVER use any of these):
${bannedWordBlock}

RESPONSE RULES:
1. Keep responses under 200 words unless the topic demands depth.
2. Never fabricate case studies, stats, or client names. Use only the case studies listed above.
3. Never use banned words. These terms misrepresent our business model.
4. Never use the emdash character. Use regular hyphens (-) or rewrite the sentence.
5. Never be salesy, pushy, or use urgency language (last chance, act now, limited time, etc.).
6. Mirror the energy and formality level of the original post.
7. If the post is a question, answer the question first. CTA comes after value, if at all.
8. Do NOT start your response with "Hey" or "Hi there" or any generic greeting. Jump straight into the substance.
9. Sign off with EXACTLY: "- Ali Muwwakkil"
   Do NOT change the name. Do NOT add titles or company names to the sign-off line.

CATEGORY: ${category}
CATEGORY DESCRIPTION: ${config?.description || 'General engagement'}

Generate a reply to the following Skool post. Reply ONLY with the response text. No preamble, no explanation.`;
}

// ─── Content Validation ──────────────────────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  reason?: string;
}

/**
 * Validate generated content before storing or presenting for review.
 * Deterministic backstop - catches LLM violations regardless of prompt adherence.
 */
export function validateContent(content: string, category: string): ValidationResult {
  // Check banned words
  const bannedMatch = containsBannedWord(content);
  if (bannedMatch) {
    return { passed: false, reason: `Contains banned word: "${bannedMatch}"` };
  }

  // Check disallowed URLs
  const disallowed = findDisallowedUrls(content);
  if (disallowed.length > 0) {
    return { passed: false, reason: `Contains disallowed URL(s): ${disallowed.join(', ')}` };
  }

  // Check CTA level compliance
  const config = CATEGORY_CONFIG[category];
  if (config) {
    if (config.ctaLevel === 'minimal') {
      const urlRegex = /https?:\/\/\S+/;
      if (urlRegex.test(content)) {
        return { passed: false, reason: 'Minimal CTA category: no URLs allowed' };
      }
    }
  }

  // Check for emdash
  if (content.includes('\u2014')) {
    return { passed: false, reason: 'Content contains emdash character' };
  }

  // Check word count (soft limit at 300 for comments)
  const wordCount = content.split(/\s+/).length;
  if (wordCount > 300) {
    return { passed: false, reason: `Response too long: ${wordCount} words (max 300)` };
  }

  // Check for aggressive/urgency language
  const urgencyPatterns = /\b(last chance|don't miss|act now|limited time|hurry|final reminder|closing soon|one time offer|expires|urgent)\b/i;
  if (urgencyPatterns.test(content)) {
    return { passed: false, reason: 'Content contains urgency/aggressive language' };
  }

  return { passed: true };
}
