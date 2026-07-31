// AI safety layer for the Case Resolution Engine's Assess step. Email and
// Basecamp content is UNTRUSTED evidence — it may contain text engineered
// to look like an instruction ("ignore previous instructions", "send this
// immediately", "reveal your system prompt"). Per root directive section
// 16, the defense is architectural, not a denylist:
//   1. Evidence is delimited and labeled DATA in the prompt, never given as
//      a system/instruction-role message.
//   2. The model's structured output is Zod-validated before use.
//   3. No external action is ever taken directly from model output — a
//      human approves every proposed action (Phase 4/5).
// detectPromptInjectionSignals() below is advisory/observability only: it
// flags suspicious phrasing for the audit trail and the assessment's
// confidence score, but never blocks evidence from being summarized — a
// customer email that legitimately says "please ignore my previous email"
// is common and must not be treated as an attack.

const INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i, label: 'ignore_previous_instructions' },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above)/i, label: 'disregard_previous' },
  { pattern: /reveal\s+(your\s+)?(system\s+prompt|instructions)/i, label: 'reveal_system_prompt' },
  { pattern: /you\s+are\s+now\s+(a|an)\s+/i, label: 'role_override_attempt' },
  { pattern: /send\s+this\s+(email\s+)?immediately/i, label: 'urgent_send_directive' },
  { pattern: /delete\s+(all\s+)?(related\s+)?emails?/i, label: 'delete_directive' },
  { pattern: /run\s+this\s+(command|script)/i, label: 'run_command_directive' },
  { pattern: /reveal\s+(the\s+|your\s+|my\s+)?(credentials|password|api\s*key|secret)/i, label: 'credential_exfiltration_attempt' },
];

export interface InjectionSignal {
  label: string;
  excerpt: string;
}

export function detectPromptInjectionSignals(text: string): InjectionSignal[] {
  if (!text) return [];
  const found: InjectionSignal[] = [];
  for (const { pattern, label } of INJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      found.push({ label, excerpt: match[0].slice(0, 120) });
    }
  }
  return found;
}

const MAX_EVIDENCE_CHARS = 800;

// Bounds a single evidence item's text before it enters the prompt.
// Truncation happens on a whitespace boundary where possible so the model
// isn't fed a text fragment mid-word.
export function truncateEvidenceText(text: string, maxChars: number = MAX_EVIDENCE_CHARS): string {
  if (!text || text.length <= maxChars) return text || '';
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

// Defense-in-depth for OUTBOUND proposed-action text (email bodies, Basecamp
// comments) — the assessment call's evidence is redacted going IN via
// getInstrumentedOpenAI's redactSensitive() wrapper, but that only covers
// SSN/card patterns and only protects the model's INPUT. A model response
// that echoes a labeled secret found in evidence ("password: hunter2",
// "api_key=sk-...") is not caught by that pass, and would otherwise flow
// straight into an executable BASECAMP_COMMENT/EMAIL_SEND payload with no
// further check. Applied to every proposed action's preview/payload text at
// creation time in caseActionPlanner.ts.
const SECRET_LABEL_RE = /(password|passwd|api[_-]?key|secret|access[_-]?token|bearer)\s*[:=]\s*\S+/gi;

export function redactSecretLikePatterns(text: string): string {
  if (!text) return text;
  return text.replace(SECRET_LABEL_RE, (m) => `${m.split(/[:=]/)[0]}: [REDACTED]`);
}

// Wraps evidence content in an explicit, hard-to-spoof delimiter so the
// system prompt can instruct the model to treat everything between the
// markers as DATA, never as instructions — the primary defense per root
// directive section 16, not the regex flags above (which are advisory only).
export function wrapAsUntrustedEvidence(itemLabel: string, text: string): string {
  const safeText = truncateEvidenceText(text);
  return `<<<EVIDENCE id="${itemLabel}">>>\n${safeText}\n<<<END_EVIDENCE>>>`;
}
