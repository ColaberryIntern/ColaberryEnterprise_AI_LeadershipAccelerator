/**
 * Preserve the single newlines a GENERATED text emits (an LLM reply, a
 * compiled document) — CommonMark collapses a lone newline into a space,
 * which is right for prose a human typed and wrong for line-oriented
 * generated content like a numbered list written as separate lines.
 *
 * Extracted from RecordProse.tsx (2026-08-26, Ali: the public Capstone
 * Record page rendering `**bold**`/headings/line breaks literally instead
 * of as markdown) so a second real caller (AgentTalkTab's chat bubbles,
 * 2026-09-29 — the same "wall of unbroken text with literal ** markers"
 * complaint) doesn't duplicate this mdast-walking logic.
 *
 * Paragraph-only is deliberate. Table cells hold inline nodes directly
 * rather than a paragraph, and a fenced block is a `code` node carrying a
 * string value, so neither is reachable from here — table layout and code
 * whitespace are left exactly as parsed.
 *
 * A local plugin rather than `remark-breaks` so the fix costs no new
 * dependency.
 */
export function remarkPreserveGeneratedLineBreaks() {
  return (tree: any) => {
    const walk = (node: any): void => {
      if (!node || !Array.isArray(node.children)) return;

      if (node.type === 'paragraph') {
        const next: any[] = [];
        for (const child of node.children) {
          if (child?.type === 'text' && typeof child.value === 'string' && child.value.includes('\n')) {
            child.value.split('\n').forEach((part: string, i: number) => {
              if (i > 0) next.push({ type: 'break' });
              if (part) next.push({ type: 'text', value: part });
            });
          } else {
            next.push(child);
          }
        }
        node.children = next;
      }

      node.children.forEach(walk);
    };
    walk(tree);
  };
}
