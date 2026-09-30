/**
 * dwellGateConfig — which curriculum types are gated by the generic "sit with it
 * for N continuous seconds" dwell gate, and for how long.
 *
 * The gate applies to PASSIVE-CONTENT types that award points but have no other
 * completion criteria (intel breakdowns, reflections, discussions, study, Q&A).
 * Types with a real gate — video (watch), blog (read), reader (sections), deep
 * dive (field guide), labs (copy), survey/assessment (submit), evidence types
 * (workspace deliverable) — are NOT dwell-gated and return null here.
 *
 * Ali's rule: never under 2 minutes, tuned per type so meatier breakdowns take
 * longer. Keep this the single source of truth; the client mirrors only the SET
 * of gated bands (the required seconds come back in the beat response).
 */

/** render_bands that are passive content with points but no native gate AND no
 *  other completion path (so adding the gate is purely additive — it gives these
 *  types the collect path they never had). Currently the `intel` pipeline (news /
 *  research / tools / architecture / market-intel / …). reflection/question/
 *  discussion/study/community are deliberately NOT here yet: they may already
 *  complete via a workspace submission, and gating that path would 422-block it —
 *  each needs its completion mechanic verified before it's added. */
export const DWELL_GATED_BANDS = new Set(['intel']);

/** Floor Ali set: nothing under 2 minutes. */
export const DWELL_DEFAULT_S = 120;

/** Per-type overrides (seconds, ≥120). Meatier breakdowns sit longer. */
const DWELL_SECONDS_BY_TYPE: Record<string, number> = {
  ai_architecture_breakdown: 180,   // Ali-named: a deep architecture read
  market_intelligence: 150,         // Ali-named
  ai_research_digest: 150,
  build_breakdown: 150,
  claude_code_technique: 150,
  mcp_server_spotlight: 150,
  // shorter reads still hold the 2-minute floor
  ai_news_flash: 120,
  ai_tool_of_the_day: 120,
  ai_quote_of_the_day: 120,
  reflection: 150,                  // reflection deserves a real pause
};

/** Required dwell seconds for a card, or null when the type is not dwell-gated. */
export function dwellSecondsFor(card: { type?: string | null; render_band?: string | null }): number | null {
  if (!card?.render_band || !DWELL_GATED_BANDS.has(card.render_band)) return null;
  return (card.type && DWELL_SECONDS_BY_TYPE[card.type]) || DWELL_DEFAULT_S;
}
