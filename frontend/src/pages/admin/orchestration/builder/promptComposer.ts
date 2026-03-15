/**
 * Prompt Composer — separates structural (type-level) from section-specific prompt content.
 *
 * Structural prompts define output format, pedagogical approach, and type-wide instructions.
 * Section-specific prompts define topic guidance unique to a particular mini-section.
 *
 * The two are stored together in MiniSection prompt fields (so buildCompositePrompt reads
 * the full text as-is), separated by a delimiter for UI decomposition.
 */

const DELIMITER = '\n\n---SECTION-SPECIFIC---\n\n';

/** Compose structural + section-specific into a single prompt string. */
export function composePrompt(structural: string, sectionSpecific: string): string {
  const s = structural.trim();
  const ss = sectionSpecific.trim();
  if (!s && !ss) return '';
  if (!s) return ss;
  if (!ss) return s;
  return s + DELIMITER + ss;
}

/**
 * Decompose a stored prompt into its structural and section-specific parts.
 * Legacy prompts (no delimiter) are treated as fully section-specific.
 */
export function decomposePrompt(fullText: string): { structural: string; sectionSpecific: string } {
  if (!fullText) return { structural: '', sectionSpecific: '' };
  const idx = fullText.indexOf(DELIMITER);
  if (idx === -1) return { structural: '', sectionSpecific: fullText };
  return {
    structural: fullText.substring(0, idx),
    sectionSpecific: fullText.substring(idx + DELIMITER.length),
  };
}

export { DELIMITER };
