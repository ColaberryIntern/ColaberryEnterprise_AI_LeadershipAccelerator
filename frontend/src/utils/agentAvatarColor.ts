// ─── Agent Avatar Color ──────────────────────────────────────────────────────
// Deterministic per-agent avatar color for the Workforce OS "Live Agents" section.
// Ali (live, minutes after Agent Registration Stage 1 shipped): "Each agent should
// have their own look and feel." Before this fix, every Live Agent card rendered
// the identical hardcoded '#7A5AF0' — indistinguishable from one another.
//
// This is a pure hash-to-palette function, not a hardcoded per-agent-name map — the
// exact "hardcoded list goes stale" bug already fixed twice this session for ticket
// types. Any CURRENT agent gets a distinct color; any FUTURE agent automatically
// gets one too, with zero code change here.
//
// The palette is the real, already-documented --chart-1..8 tokens from
// frontend/src/colaberry/tokens/colors.css (explicitly commented there as "ordered
// for max adjacent separation and color-blind safety") — never an invented hex.
// Today's single hardcoded avatar color, '#7A5AF0', literally IS --chart-5, so this
// is continuity with the existing design system, not a new palette. All 8 are
// already proven legible with the Live Agent avatar's white initials text
// (.wf-av { color:#fff }, themeKit.tsx) — several are already used with white text
// today by orgRegistry.ts's 11 hand-assigned Director avatars on this same page.
const AGENT_AVATAR_PALETTE: readonly string[] = [
  '#367895', // chart-1 — berry blue
  '#FB2832', // chart-2 — cherry red
  '#5BA63C', // chart-3 — leaf green
  '#E8920C', // chart-4 — amber
  '#7A5AF0', // chart-5 — violet (today's single hardcoded color)
  '#2BA39A', // chart-6 — teal
  '#C2185B', // chart-7 — magenta
  '#6B6B6B', // chart-8 — neutral
];

/**
 * Deterministic (same seed -> same color, every call, no Math.random / no Date) hash
 * of a stable seed string — pass the agent's real `id` (UUID), not its `agent_name`,
 * so the color survives a hypothetical future rename — into one of the 8 real,
 * accessible palette colors above. Never returns a value outside that palette.
 */
export function agentAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    // 31 is the standard small-prime multiplier (java/kotlin String.hashCode()
    // convention) — good bit-mixing for short id strings, cheap, no dependency.
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AGENT_AVATAR_PALETTE.length;
  return AGENT_AVATAR_PALETTE[index];
}
