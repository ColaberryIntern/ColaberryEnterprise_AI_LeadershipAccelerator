/**
 * brandComplianceService — Phase 3-light deterministic preflight on
 * outbound BC comments. Pure regex / heuristic — no LLM.
 *
 * Returns { ok, blockers, warnings }. Blockers short-circuit the BC
 * writeback; warnings surface to the operator but don't block.
 *
 * Rules:
 * - em-dashes / en-dashes are auto-stripped at the wrapper level but we
 *   still flag here so the operator sees an inline warning if their
 *   reasoning text had any.
 * - banned phrases from the Skool memory (`feedback_email_style` /
 *   `openclaw-outreach` skill). v0 hardcodes the most-flagged set; the
 *   full list lives in the openclaw skill.
 * - secret-leak patterns (BC token, Mandrill key, OAuth refresh token)
 *   are HARD blockers.
 */

export interface ComplianceResult {
  ok: boolean;
  blockers: string[];
  warnings: string[];
}

const SECRET_PATTERNS: Array<{ name: string; pat: RegExp }> = [
  { name: 'Basecamp access token', pat: /\bBAhbB0kiAbB7[\w+/=]{200,}/ },
  { name: 'Mandrill API key', pat: /\bmd-[\w-]{20,}\b/ },
  { name: 'Bearer token', pat: /\bBearer\s+[\w.\-]{40,}/i },
  { name: 'Google OAuth refresh token', pat: /\b1\/\/[\w-]{60,}\b/ },
  { name: 'JWT-shaped token', pat: /\beyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/ },
  { name: 'AWS access key', pat: /\bAKIA[0-9A-Z]{16}\b/ },
];

const BANNED_PHRASES: Array<{ name: string; pat: RegExp }> = [
  { name: 'em-dash present', pat: /[—–]/ },
  { name: 'I hope this email finds you well', pat: /\bI hope this (email|message) finds you well\b/i },
  { name: 'Just checking in', pat: /\bJust checking in\b/i },
  { name: 'leverage synergies', pat: /\bleverag(e|ing) synerg/i },
  { name: 'circle back', pat: /\bcircle back\b/i },
  { name: 'going forward', pat: /\bgoing forward\b/i },
  { name: 'low-hanging fruit', pat: /\blow[-\s]hanging fruit\b/i },
];

export function checkCompliance(html: string, reasoning: string | null): ComplianceResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const combined = `${html || ''}\n${reasoning || ''}`;

  for (const sec of SECRET_PATTERNS) {
    if (sec.pat.test(combined)) {
      blockers.push(`Possible secret leak: ${sec.name}`);
    }
  }
  for (const ban of BANNED_PHRASES) {
    if (ban.pat.test(combined)) {
      warnings.push(`Style flag: ${ban.name}`);
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };
}
