// bucketMermaid — build a compact Mermaid flowchart summarizing the cards loaded
// in one Orchestration Timeline bucket (Pre-Class, Learn, …). Used by the
// Timeline editor's COLLAPSED section view: instead of the full card list, a
// collapsed bucket shows this left-to-right "what's loaded here" map, which the
// author clicks to expand back into the editable cards.
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
const MAX_NODES = 8;

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

  // The chain of node ids to wire together left-to-right (+ an overflow node).
  const chain: string[] = shown.map((_, i) => `n${i}`);
  if (cards.length > MAX_NODES) {
    lines.push(`  more["+${cards.length - MAX_NODES} more"]:::more`);
    chain.push('more');
  }
  for (let i = 0; i < chain.length - 1; i += 1) {
    lines.push(`  ${chain[i]} --> ${chain[i + 1]}`);
  }

  // Green = published/live, grey = draft, hollow = the overflow node.
  lines.push('  classDef live fill:#E7F5E9,stroke:#3C7A26,color:#14351A;');
  lines.push('  classDef draft fill:#F1F1F1,stroke:#BEBEBE,color:#5A5A5A;');
  lines.push('  classDef more fill:#FFFFFF,stroke:#DADADA,color:#8A8A8A;');
  return lines.join('\n');
}
