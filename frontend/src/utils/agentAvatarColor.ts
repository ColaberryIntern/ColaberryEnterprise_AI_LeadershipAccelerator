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

function hashToIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    // 31 is the standard small-prime multiplier (java/kotlin String.hashCode()
    // convention) — good bit-mixing for short id strings, cheap, no dependency.
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AGENT_AVATAR_PALETTE.length;
}

/**
 * Deterministic (same seed -> same color, every call, no Math.random / no Date) hash
 * of a stable seed string — pass the agent's real `id` (UUID), not its `agent_name`,
 * so the color survives a hypothetical future rename — into one of the 8 real,
 * accessible palette colors above. Never returns a value outside that palette.
 *
 * Standalone, this function alone does NOT guarantee two different real ids never
 * land on the same palette slot (an 8-bucket hash can and — confirmed live, two of
 * the 6 real Stage-1 agents originally collided on '#C2185B' — does collide). For
 * rendering a roster where every SIMULTANEOUSLY-DISPLAYED card must look different
 * (Ali's actual ask), use assignDistinctAvatarColors() below instead. This function
 * stays exported and used on its own by anything that only ever renders ONE agent at
 * a time (e.g. a detail page) and has no roster to de-collide against.
 */
export function agentAvatarColor(seed: string): string {
  return AGENT_AVATAR_PALETTE[hashToIndex(seed)];
}

/**
 * Assigns each id in the given roster a color from the same 8-color palette,
 * guaranteed collision-free as long as the roster size does not exceed 8 (today: 6
 * real Live Agents) — beyond that, a fixed 8-color palette cannot give every agent a
 * unique hue by pigeonhole, so slots are reused gracefully once exhausted rather than
 * inventing a 9th color or crashing.
 *
 * Deterministic for a FIXED roster regardless of input order: ids are sorted
 * internally before assignment, so the same set of currently-live agents always
 * produces the same id->color mapping on every call/page load — this is still "the
 * same agent always gets the same color," just evaluated against the real roster it's
 * actually sharing a page with, not in isolation. Each id's PREFERRED color is still
 * its own agentAvatarColor(id) hash — collisions only walk forward to the next free
 * palette slot, they never reassign an id an unrelated color for no reason.
 *
 * Org Chart v4 color-collision fix (2026-08-20, session CC-20260818-x4nk
 * continued) — `reservedColors` lets a caller exclude palette slots ALREADY
 * spoken for by something outside this roster (e.g. `OrgChartSection.tsx`'s
 * server-assigned `hierarchy_color` values) BEFORE the hash/de-collision walk
 * runs, not after. This is the actual root-cause fix for the live bug Ali
 * reported (JJ and Ali both rendering green): the old call site ran this
 * function over EVERY human first (no knowledge of which colors a later pass
 * would reserve), then overwrote only the humans with a server color in a
 * SEPARATE loop — so a no-agent human's hash fallback could coincidentally
 * land on a color a human-with-agents was about to be assigned. Passing the
 * full reserved set here closes that gap at the source. Unknown/invalid hex
 * strings in `reservedColors` are silently ignored (never throw — this
 * function's existing "never crash the roster render" contract extends to a
 * malformed reserved value the same way it already does to an unmatched id).
 * Backward compatible: omitting the argument (today's every other call site,
 * until wired) reproduces today's exact behavior byte-for-byte — reserving
 * nothing changes nothing.
 */
export function assignDistinctAvatarColors(
  ids: string[],
  reservedColors: readonly string[] = [],
): Record<string, string> {
  const sortedIds = [...ids].sort();
  const takenSlots = new Set<number>();
  for (const color of reservedColors) {
    const reservedSlot = AGENT_AVATAR_PALETTE.indexOf(color);
    if (reservedSlot !== -1) takenSlots.add(reservedSlot);
  }
  const colorById: Record<string, string> = {};

  for (const id of sortedIds) {
    let slot = hashToIndex(id);
    if (takenSlots.size < AGENT_AVATAR_PALETTE.length) {
      let attempts = 0;
      while (takenSlots.has(slot) && attempts < AGENT_AVATAR_PALETTE.length) {
        slot = (slot + 1) % AGENT_AVATAR_PALETTE.length;
        attempts++;
      }
    }
    takenSlots.add(slot);
    colorById[id] = AGENT_AVATAR_PALETTE[slot];
  }

  return colorById;
}
