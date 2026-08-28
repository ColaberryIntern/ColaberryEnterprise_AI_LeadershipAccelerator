import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './recordProse.css';

/**
 * Preserve the single newlines the generator wrote.
 *
 * CommonMark collapses a lone newline into a space, which is right for prose a human
 * typed and wrong for these fields. The executive deliverable is GENERATED, and the
 * generator emits line-oriented content:
 *
 *     **Organization:** Colaberry Enterprise AI Accelerator
 *     **Industry:** Education Technology / AI Training
 *     **Date:** May 22, 2026
 *
 * Rendered by the book, those four labelled facts run together into one unreadable
 * line. The real production record has 35 such breaks. This walks the mdast and turns
 * a soft break inside a PARAGRAPH into a hard one.
 *
 * Paragraph-only is deliberate. Table cells hold inline nodes directly rather than a
 * paragraph, and a fenced block is a `code` node carrying a string value, so neither is
 * reachable from here — table layout and code whitespace are left exactly as parsed.
 *
 * This is a local plugin rather than `remark-breaks` so the fix costs no new dependency.
 */
function remarkPreserveGeneratedLineBreaks() {
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

/**
 * RecordProse — renders a Capstone Record's long-form fields as the Markdown they are.
 *
 * WHY THIS EXISTS. `system.descriptor` is compiled from the project's executive
 * deliverable, which is a full Markdown document: headings, GFM tables, bold. Both the
 * public record page and the reviewer preview were rendering it into a plain `<p>`, so
 * every `##`, `**` and `|` showed literally and all the line breaks collapsed into one
 * unbroken wall. Found by Ali opening the reviewer preview, 2026-08-26 — and the same
 * fault was live on the PUBLIC page, which is the one students send to hiring managers.
 *
 * `react-markdown` does not render raw HTML unless `rehype-raw` is added, and it is
 * deliberately not added here: this content is compiled from student-authored material
 * and reaches an unauthenticated page, so the safe default is the correct one.
 *
 * Tables are wrapped in their own scroll container. A wide GFM table must never be able
 * to push the page into horizontal scroll on a phone.
 */
const RecordProse: React.FC<{ children: string; className?: string }> = ({ children, className }) => (
  <div className={`rprose${className ? ` ${className}` : ''}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkPreserveGeneratedLineBreaks]}
      components={{
        table: ({ node, ...props }) => (
          <div className="rprose-tablewrap"><table {...props} /></div>
        ),
        a: ({ node, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  </div>
);

export default RecordProse;
