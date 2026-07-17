// bucketMermaid — build a compact Mermaid flowchart summarizing the cards loaded
// in one Orchestration Timeline bucket (Pre-Class, Learn, …). Used by the
// Timeline editor's COLLAPSED section view: instead of the full card list, a
// collapsed bucket shows this "what's loaded here" map — cards left-to-right,
// wrapped into rows of at most ROW_SIZE — which the author clicks to expand back
// into the editable cards.
//
// Pure + deterministic: equal input produces an equal string, so <MermaidDiagram>
// (which keys its render effect on the chart string VALUE) never re-runs for
// unchanged data even though the caller rebuilds the string each render.

/** The minimal card shape this builder needs — decoupled from the editor's Card type. */
export interface MermaidCardLike {
  title: string | null;
  type: string;
  visibility: string;
}

// Cap the nodes drawn before folding the rest into a single "+N more" node. The
// diagram is scaled to fit the ~720px editor column, so too many nodes turn
// illegible; 8 keeps each node readable while still showing the shape of the lane.
// Exported so the editor's node-click handler can map the "+N more" node back to
// the first hidden card.
export const MAX_NODES = 8;

// Wrap the lane into rows of at most this many nodes so a busy lane reads as a
// grid instead of one cramped, scaled-down line. Each row is emitted as its own
// (disconnected) left-to-right chain; chains sharing the same ranks make mermaid's
// layout stack them into aligned rows.
const ROW_SIZE = 3;

/**
 * Sanitize a card title into a safe Mermaid node label. Mermaid's parser is
 * finicky even inside quoted labels, so we strip the characters it treats as
 * structural / entity markers, fold quotes to apostrophes, normalize whitespace,
 * and truncate. Fidelity loss is acceptable — this is a glanceable overview label.
 */
export function mermaidLabel(raw: string): string {
  const cleaned = (raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/["`]/g, "'")            // quotes/backticks → apostrophe (safe inside a quoted label)
    .replace(/[#;{}[\]|<>]/g, ' ')    // entity/structural chars mermaid can choke on → space
    .replace(/\s+/g, ' ')
    .trim();
  const capped = cleaned.length > 40 ? `${cleaned.slice(0, 39)}…` : cleaned;
  return capped || 'Untitled';
}

/**
 * Extract our node id (`n<i>` or `more`) from a rendered mermaid node group's DOM
 * id, so a click on the collapsed map can map back to a card. Mermaid ids look
 * like `<renderId>-flowchart-<nodeId>-<counter>` where the renderId prefix and the
 * trailing counter vary, so we match our node id at the TAIL rather than anchoring
 * at the start (an earlier start-anchored regex silently matched nothing once the
 * renderId prefix was present). Returns null for edges / non-node elements.
 */
export function nodeIdFromMermaidGroupId(domId: string | null | undefined): string | null {
  return (domId || '').match(/(n\d+|more)(?:-\d+)?$/)?.[1] ?? null;
}

/**
 * Build the Mermaid source for one bucket's collapsed overview.
 * @param cards      the bucket's cards, already in display order
 * @param bandIconOf slug → emoji icon (reuses the editor's band icon map)
 */
export function buildBucketMermaid(
  cards: MermaidCardLike[],
  bandIconOf: (type: string) => string,
): string {
  const shown = cards.slice(0, MAX_NODES);
  const lines: string[] = ['flowchart LR'];

  shown.forEach((c, i) => {
    const label = mermaidLabel(`${bandIconOf(c.type)} ${c.title || c.type.replace(/_/g, ' ')}`);
    const cls = c.visibility === 'published' ? 'live' : 'draft';
    lines.push(`  n${i}["${label}"]:::${cls}`);
  });

  // The ordered node ids (+ an overflow node when capped).
  const ids: string[] = shown.map((_, i) => `n${i}`);
  if (cards.length > MAX_NODES) {
    lines.push(`  more["+${cards.length - MAX_NODES} more"]:::more`);
    ids.push('more');
  }
  // Wire each row of up to ROW_SIZE nodes as its OWN left-to-right chain, with NO
  // edge between rows. Disconnected same-rank chains make mermaid stack them into
  // a grid, so the lane wraps to a new row after ROW_SIZE cards instead of
  // squeezing everything onto one line.
  for (let r = 0; r < ids.length; r += ROW_SIZE) {
    const row = ids.slice(r, r + ROW_SIZE);
    for (let i = 0; i < row.length - 1; i += 1) {
      lines.push(`  ${row[i]} --> ${row[i + 1]}`);
    }
  }

  // Green = published/live, grey = draft, hollow = the overflow node.
  lines.push('  classDef live fill:#E7F5E9,stroke:#3C7A26,color:#14351A;');
  lines.push('  classDef draft fill:#F1F1F1,stroke:#BEBEBE,color:#5A5A5A;');
  lines.push('  classDef more fill:#FFFFFF,stroke:#DADADA,color:#8A8A8A;');
  return lines.join('\n');
}
