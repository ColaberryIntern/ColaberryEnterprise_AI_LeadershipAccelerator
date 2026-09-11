/**
 * ritualPostBody — parse a Community Ritual post body back into the structured
 * answer the student actually typed.
 *
 * A ritual post is stored as ONE text body (backend composeBody in
 * services/runtime/communityRituals.ts), because it has to live in the normal
 * Community feed alongside free-text posts:
 *
 *     🧩 Skill Drop · Week 2
 *
 *     My 3 skills: invoice-parser, tone-checker, standup-writer
 *
 *     The one that surprised me: tone-checker caught phrasing I'd never notice
 *
 * Rendered raw that is a wall of text with the ritual name repeated above it.
 * Split back into (heading, sections) and the thread reads like the guided
 * answer it is: the heading moves into the panel's eyebrow, and each
 * "Label: value" becomes a labelled block.
 *
 * PURE and defensive by design — it must degrade to "one plain paragraph" for
 * every free-text community post, which is the majority of them. It never
 * invents a label, and it never drops text: everything in equals everything out.
 */

export interface RitualSection {
  /** The guided field's label, or null for a plain paragraph. */
  label: string | null;
  value: string;
}

export interface ParsedRitualBody {
  /** The "🧩 Skill Drop · Week 2" heading line, if the body opens with one. */
  heading: string | null;
  /** Ritual name pulled out of the heading ("Skill Drop"), for the eyebrow. */
  ritualName: string | null;
  /** Week number pulled out of the heading, for the eyebrow. */
  week: number | null;
  /** Leading emoji of the heading, for the eyebrow. */
  icon: string | null;
  sections: RitualSection[];
}

const EMPTY: ParsedRitualBody = { heading: null, ritualName: null, week: null, icon: null, sections: [] };

// "🧩 Skill Drop · Week 2" — the composeBody heading. The separator is a real
// middle dot (U+00B7); the week number is required, which is what keeps a
// free-text post that merely happens to contain a dot from matching.
const HEADING_RE = /^(\S+)\s+(.+?)\s+·\s+Week\s+(\d+)$/;

// "My 3 skills: invoice-parser, …" — a guided field. The label is bounded so a
// sentence containing a colon ("The trick: keep it small") is not mistaken for
// one; composeBody labels are short by construction (RitualField.label).
const LABEL_RE = /^([^:\n]{1,48}):\s*([\s\S]+)$/;

/**
 * Parse a stored post body. Returns EMPTY-with-one-section for anything that is
 * not a ritual post, so callers can render the result unconditionally.
 */
export function parseRitualBody(body: string | null | undefined): ParsedRitualBody {
  const text = (body || '').trim();
  if (!text) return EMPTY;

  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) return EMPTY;

  let heading: string | null = null;
  let ritualName: string | null = null;
  let week: number | null = null;
  let icon: string | null = null;

  const headMatch = HEADING_RE.exec(blocks[0]);
  if (headMatch) {
    heading = blocks[0];
    icon = headMatch[1];
    ritualName = headMatch[2];
    week = Number(headMatch[3]);
    blocks.shift();
  }

  const sections: RitualSection[] = blocks.map((block) => {
    // Only treat "Label: value" as a guided field inside a ritual post. In a
    // free-text post a leading colon is ordinary prose, not a field label.
    const m = heading ? LABEL_RE.exec(block) : null;
    if (m) return { label: m[1].trim(), value: m[2].trim() };
    return { label: null, value: block };
  });

  return { heading, ritualName, week, icon, sections };
}

/**
 * A one-line summary for a collapsed row: the first section's value, trimmed to
 * `max` characters on a word boundary. Falls back to the whole body.
 */
export function ritualSummary(body: string | null | undefined, max = 120): string {
  const parsed = parseRitualBody(body);
  const first = parsed.sections.find((s) => s.value)?.value || (body || '').trim();
  const flat = first.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
