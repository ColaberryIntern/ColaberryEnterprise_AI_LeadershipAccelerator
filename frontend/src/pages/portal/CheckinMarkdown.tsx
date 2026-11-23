import React from 'react';

/**
 * A small, safe Markdown renderer for "Run it here" answers on the class page (2026-11-23).
 *
 * Ali: "I want the formatting nice and crisp." Answers arrive as Markdown (tables, bold, lists),
 * often wrapped in a ```markdown fence. This turns that into React elements: tables, headings,
 * bullet and numbered lists, paragraphs, **bold** and `code`. It never produces HTML from the
 * text (no dangerouslySetInnerHTML), so an answer cannot inject markup into the page.
 */

const FENCE = /^\s*```\s*([a-z]*)\s*$/i;

/** Inline: **bold** and `code`. Everything else is plain text. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${keyBase}b${n++}`}>{tok.slice(2, -2)}</strong>);
    else out.push(<code key={`${keyBase}c${n++}`}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

const isSeparator = (row: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row);

/** Render Markdown text as React elements. */
export function renderMarkdown(source: string): React.ReactNode {
  // Unwrap code fences: a markdown or untagged fence is rendered as Markdown (that is how tables
  // arrive); any other language stays a monospace block.
  const lines = source.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  const flat: string[] = [];
  while (i < lines.length) {
    const f = FENCE.exec(lines[i]);
    if (!f) { flat.push(lines[i]); i++; continue; }
    const lang = f[1].toLowerCase();
    const body: string[] = [];
    i++;
    while (i < lines.length && !FENCE.test(lines[i])) { body.push(lines[i]); i++; }
    i++; // closing fence
    if (!lang || lang === 'markdown' || lang === 'md') flat.push(...body);
    else flat.push('\u0000PRE' + body.join('\n'));
  }

  i = 0;
  while (i < flat.length) {
    const line = flat[i];
    if (line.startsWith('\u0000PRE')) { blocks.push(<pre key={k++} className="cbmd-pre">{line.slice(4)}</pre>); i++; continue; }
    if (!line.trim()) { i++; continue; }

    if (/^\s*\|/.test(line)) {
      const rows: string[] = [];
      while (i < flat.length && /^\s*\|/.test(flat[i])) { rows.push(flat[i]); i++; }
      const body = rows.filter((r) => !isSeparator(r));
      const hasHead = rows.length > 1 && isSeparator(rows[1]);
      const head = hasHead ? cells(body[0]) : null;
      const data = (hasHead ? body.slice(1) : body).map(cells);
      blocks.push(
        <div key={k++} className="cbmd-tablewrap">
          <table className="cbmd-table">
            {head && <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `h${j}`)}</th>)}</tr></thead>}
            <tbody>{data.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `d${ri}-${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const h = /^\s*#{1,4}\s+(.*)$/.exec(line);
    if (h) { blocks.push(<p key={k++} className="cbmd-h">{inline(h[1], `t${k}`)}</p>); i++; continue; }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < flat.length && /^\s*[-*•]\s+/.test(flat[i])) { items.push(flat[i].replace(/^\s*[-*•]\s+/, '')); i++; }
      blocks.push(<ul key={k++} className="cbmd-list">{items.map((t, j) => <li key={j}>{inline(t, `u${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < flat.length && /^\s*\d+[.)]\s+/.test(flat[i])) { items.push(flat[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      blocks.push(<ol key={k++} className="cbmd-list">{items.map((t, j) => <li key={j}>{inline(t, `o${j}`)}</li>)}</ol>);
      continue;
    }

    const para: string[] = [];
    while (i < flat.length && flat[i].trim() && !/^\s*(\||#{1,4}\s|[-*•]\s|\d+[.)]\s)/.test(flat[i]) && !flat[i].startsWith('\u0000PRE')) { para.push(flat[i].trim()); i++; }
    if (!para.length) { blocks.push(<p key={k++} className="cbmd-p">{inline(line.trim(), `x${k}`)}</p>); i++; continue; }
    blocks.push(<p key={k++} className="cbmd-p">{inline(para.join(' '), `p${k}`)}</p>);
  }
  return <>{blocks}</>;
}

export const CBMD_CSS = `
.cbmd-p{ margin:0 0 8px; font-size:15px; line-height:1.5; color:var(--text-body); }
.cbmd-h{ margin:10px 0 6px; font-size:15.5px; font-weight:800; color:var(--text-strong); }
.cbmd-list{ margin:0 0 8px; padding-left:20px; font-size:15px; line-height:1.5; color:var(--text-body); }
.cbmd-list li{ margin:2px 0; }
.cbmd-tablewrap{ overflow-x:auto; margin:4px 0 10px; border:1px solid var(--border-subtle); border-radius:8px; }
.cbmd-table{ border-collapse:collapse; width:100%; font-size:13.5px; font-variant-numeric:tabular-nums; }
.cbmd-table th{ text-align:left; font-weight:800; background:var(--surface-subtle); color:var(--text-strong); padding:7px 9px; border-bottom:1px solid var(--border-subtle); white-space:nowrap; }
.cbmd-table td{ padding:6px 9px; border-bottom:1px solid var(--border-subtle); color:var(--text-body); white-space:nowrap; }
.cbmd-table tr:last-child td{ border-bottom:none; }
.cbmd-pre{ margin:0 0 8px; padding:10px; border-radius:8px; background:#0f1720; color:#e7eef6; font-size:13px; white-space:pre-wrap; overflow-x:auto; }
.cbmd-p code, .cbmd-list code{ font-family:ui-monospace,Consolas,monospace; font-size:13px; background:var(--surface-subtle); padding:1px 4px; border-radius:4px; }
`;
