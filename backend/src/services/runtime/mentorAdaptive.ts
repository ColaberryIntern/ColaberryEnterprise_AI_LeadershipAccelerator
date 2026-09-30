/**
 * mentorAdaptive — PURE (no I/O). Turns the learner-360 signals the mentor
 * already has (AI maturity, measured mastery) plus a live struggle signal into a
 * coaching-register instruction, so the mentor meets each student where they are:
 * scaffold for beginners, challenge the advanced, and get extra supportive +
 * proactive when someone is stuck. Unit-testable in isolation.
 */

export interface AdaptiveSignals {
  aiMaturity: number | null;      // 1-5 (from persona), null if unknown
  proficiencyPct: number | null;  // 0-100 measured proficiency, null if unknown
  struggling: boolean;            // stuck signal (many prior turns on this card, or a graded lock)
}

/**
 * PURE — the register instruction to append to the system prompt. Empty string
 * for a mid-level, non-struggling student (default coaching is right for them).
 */
export function adaptiveInstruction(s: AdaptiveSignals): string {
  const maturity = typeof s.aiMaturity === 'number' ? s.aiMaturity : null;
  const prof = typeof s.proficiencyPct === 'number' ? s.proficiencyPct : null;
  const parts: string[] = [];

  const early = (maturity != null && maturity <= 2) || (prof != null && prof < 40);
  const advanced = (maturity != null && maturity >= 4) && (prof == null || prof >= 65);

  if (advanced) {
    parts.push('This learner is advanced: skip the basics, go a level deeper, and challenge them with a sharper question or a harder edge case.');
  } else if (early) {
    parts.push('This learner is early in their AI journey: keep it simple, define any jargon, scaffold with one concrete example, and take the smallest next step.');
  }

  if (s.struggling) {
    parts.push('They have been working this activity for a while and may be stuck: be extra encouraging, break the next step down to its smallest piece, and proactively offer to walk through it together.');
  }

  return parts.join(' ');
}
