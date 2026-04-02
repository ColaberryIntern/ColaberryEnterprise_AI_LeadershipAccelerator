// ─── Message Validator Service ──────────────────────────────────────────────
// Deterministic code-based validator that checks AI-generated messages
// before they are sent. Catches hallucinations that slip past the
// Composite Context Graph. No LLM calls — pure code validation.

import type { CompositeContext } from './contextGraphService';

export interface ValidationResult {
  valid: boolean;
  content: string;
  subject?: string;
  issues: string[];
  autoFixed: string[];
}

const ALLOWED_DOMAINS = ['enterprise.colaberry.ai', 'advisor.colaberry.ai'];

const BANNED_PATTERNS = [
  /calendly\.com/gi,
  /your[-_]?link/gi,
  /your[-_]?scheduling/gi,
  /your[-_]?appointment/gi,
  /booking[-_]?link/gi,
  /schedule[-_]?link/gi,
  /calendar[-_]?link/gi,
  /calendar[-.](?:url|com)/gi,
  /yourlinkhere/gi,
  /link[-_]?to[-_]?schedule/gi,
  /link[-_]?here/gi,
  /colaberry\.com\/(?:contact|enroll)/gi,
];

const BANNED_SIGNOFFS = [
  /Agent Cory AI/gi,
  /Cory AI/gi,
  /\bCory\b(?!.*\boperations\b)/gi, // Cory alone (but not "Cory operations manager")
];

const OPT_OUT_PATTERNS = [
  /Reply STOP to opt[- ]?out\.?/gi,
  /Reply STOP to unsubscribe\.?/gi,
  /Text STOP to opt[- ]?out\.?/gi,
  /Reply STOP\.?\s*$/gim,
];

export function validateGeneratedMessage(
  content: string,
  context: CompositeContext,
  channel: 'email' | 'sms' | 'voice',
): ValidationResult {
  const issues: string[] = [];
  const autoFixed: string[] = [];
  let cleaned = content;

  // 1. URL Validation — every URL must be from allowed domains
  const urlPattern = /https?:\/\/[^\s"'<>)]+/gi;
  const urls = cleaned.match(urlPattern) || [];
  for (const url of urls) {
    const isAllowed = ALLOWED_DOMAINS.some(d => url.includes(d));
    if (!isAllowed) {
      // Check if it's a banned pattern
      const isBanned = BANNED_PATTERNS.some(p => p.test(url));
      if (isBanned) {
        cleaned = cleaned.replace(url, context.allowedUrls.booking);
        autoFixed.push(`Replaced hallucinated URL: ${url.substring(0, 60)}`);
      } else {
        issues.push(`Unknown URL found: ${url.substring(0, 80)}`);
      }
    }
  }

  // 2. Sender identity — no "Agent Cory AI" or wrong sender
  for (const pattern of BANNED_SIGNOFFS) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, context.campaign.senderName);
      autoFixed.push(`Replaced banned sign-off with ${context.campaign.senderName}`);
    }
  }

  // 3. Ali mention check — cold campaigns should NOT mention Ali
  if (context.campaign.type.includes('cold') && /\bAli\b/i.test(cleaned)) {
    issues.push('Cold campaign message mentions Ali (cold prospects do not know him)');
    // Don't auto-fix — might be legitimate if the prompt explicitly says to
  }

  // 4. SMS opt-out language
  if (channel === 'sms') {
    for (const pattern of OPT_OUT_PATTERNS) {
      if (pattern.test(cleaned)) {
        cleaned = cleaned.replace(pattern, '').trim();
        autoFixed.push('Stripped opt-out language from SMS');
      }
    }
  }

  // 5. Format checks
  if (channel === 'sms' && cleaned.length > 160) {
    issues.push(`SMS exceeds 160 chars (${cleaned.length})`);
    cleaned = cleaned.substring(0, 157) + '...';
    autoFixed.push('Truncated SMS to 160 chars');
  }

  // 6. Emdash strip
  if (/[\u2014\u2013]/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*\u2014\s*/g, ' - ').replace(/\s*\u2013\s*/g, ' - ');
    autoFixed.push('Replaced em/en dashes');
  }

  // 7. Booking link check — if step goal mentions booking, verify link is present
  const stepGoal = (context.campaign.stepGoal || '').toLowerCase();
  if ((stepGoal.includes('book') || stepGoal.includes('schedule') || stepGoal.includes('strategy call'))
    && !cleaned.includes(context.allowedUrls.booking)) {
    // Auto-inject booking link at the end
    if (channel === 'email') {
      cleaned += `\n\n<p><a href="${context.allowedUrls.booking}">Book Your Strategy Call</a></p>`;
    } else if (channel === 'sms') {
      // Don't inject if it would exceed 160 chars
      const link = ' ' + context.allowedUrls.booking;
      if (cleaned.length + link.length <= 160) {
        cleaned += link;
      }
    }
    autoFixed.push('Injected missing booking link');
  }

  // 8. Rebook campaign tone check
  if (context.campaign.type === 'warm_nurture' && context.engagement.bookingAttempts > 0) {
    if (!/apolog|sorry|inconvenience|mistake|fixed/i.test(cleaned)) {
      issues.push('Rebook campaign message missing apology language');
    }
  }

  // 9. Previous message duplication check
  if (context.previousMessages.length > 0) {
    const lastBody = context.previousMessages[0].bodyPreview.toLowerCase();
    const currentBody = cleaned.toLowerCase().replace(/<[^>]+>/g, '');
    // Simple word overlap check
    const lastWords = new Set(lastBody.split(/\s+/).filter(w => w.length > 4));
    const currentWords = currentBody.split(/\s+/).filter(w => w.length > 4);
    if (lastWords.size > 0 && currentWords.length > 0) {
      const overlap = currentWords.filter(w => lastWords.has(w)).length;
      const similarity = overlap / Math.max(currentWords.length, 1);
      if (similarity > 0.7) {
        issues.push(`Message is ${Math.round(similarity * 100)}% similar to last message — possible repetition`);
      }
    }
  }

  const valid = issues.length === 0;

  if (autoFixed.length > 0) {
    console.log(`[Validator] Auto-fixed ${autoFixed.length} issue(s): ${autoFixed.join(', ')}`);
  }
  if (issues.length > 0) {
    console.warn(`[Validator] ${issues.length} issue(s) found: ${issues.join(', ')}`);
  }

  return { valid, content: cleaned, issues, autoFixed };
}

// ─── Subject Line Validator ────────────────────────────────────────────
// Blocks subjects that imply a prior relationship when none exists.
// Called separately since the subject is generated alongside the body.

const FALSE_FAMILIARITY_PATTERNS = [
  /continu(e|ing)\s+(our|the)\s+(conversation|discussion|chat)/i,
  /following\s+up\s+on\s+(our|your)\s+(conversation|discussion|chat|call|meeting)/i,
  /as\s+(we|I)\s+(discussed|talked|mentioned|spoke)/i,
  /great\s+(speaking|talking|chatting)\s+with\s+you/i,
  /per\s+our\s+(conversation|discussion|call)/i,
  /after\s+our\s+(conversation|discussion|call|meeting)/i,
  /since\s+we\s+(last\s+)?(spoke|talked|met|chatted)/i,
  /picking\s+up\s+where\s+we\s+left/i,
  /circling\s+back\s+on\s+our/i,
  /as\s+promised/i,
  /as\s+I\s+mentioned/i,
];

export function validateSubjectLine(
  subject: string,
  context: CompositeContext,
): { subject: string; issues: string[]; autoFixed: string[] } {
  const issues: string[] = [];
  const autoFixed: string[] = [];
  let cleaned = subject;

  // Only flag false familiarity on first contact (0 emails sent, 0 replies)
  const isFirstContact = context.engagement.emailsSent <= 1 && context.engagement.repliesReceived === 0;

  if (isFirstContact) {
    for (const pattern of FALSE_FAMILIARITY_PATTERNS) {
      if (pattern.test(cleaned)) {
        issues.push(`Subject implies prior conversation on first contact: "${cleaned}"`);
        // Auto-fix: strip the false-familiarity prefix and use the rest
        cleaned = cleaned
          .replace(/^(Re:\s*)?/i, '')
          .replace(pattern, '')
          .replace(/^[\s:,\-–—]+/, '')
          .trim();
        // If nothing useful remains, generate a generic subject
        if (cleaned.length < 10) {
          const company = context.lead.company || 'Your Organization';
          cleaned = `AI Transformation Opportunities for ${company}`;
        }
        autoFixed.push(`Rewrote false-familiarity subject for first contact`);
        break;
      }
    }
  }

  // Emdash strip in subject
  if (/[\u2014\u2013]/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*\u2014\s*/g, ' - ').replace(/\s*\u2013\s*/g, ' - ');
    autoFixed.push('Replaced em/en dashes in subject');
  }

  if (autoFixed.length > 0) {
    console.log(`[Validator] Subject auto-fixed: ${autoFixed.join(', ')}`);
  }
  if (issues.length > 0) {
    console.warn(`[Validator] Subject issues: ${issues.join(', ')}`);
  }

  return { subject: cleaned, issues, autoFixed };
}
