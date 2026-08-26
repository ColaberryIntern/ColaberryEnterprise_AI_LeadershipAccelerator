import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './recordProse.css';

/**
 * RecordProse — renders a Capstone Record's long-form fields as the Markdown they are.
 *
 * WHY THIS EXISTS. `system.descriptor` is compiled from the project's executive
 * deliverable, which is a full Markdown document: headings, GFM tables, bold. Both the
 * public record page and the reviewer preview were rendering it into a plain `<p>`, so
 * every `##`, `**` and `|` showed literally and all the line breaks collapsed into one
 * unbroken wall of text. Found by Ali opening the reviewer preview, 2026-08-26 — and the
 * same fault was live on the PUBLIC page, which is the one students send to hiring
 * managers.
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
      remarkPlugins={[remarkGfm]}
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
