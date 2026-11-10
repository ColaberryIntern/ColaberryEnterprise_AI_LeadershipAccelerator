/**
 * officeToHtml - render an intern's Word (.docx) or PowerPoint (.pptx) artifact as a readable,
 * self-contained HTML page for the admin artifact viewer.
 *
 * Ali, 10 Nov 2026: "We also need a MS word viewer". The viewer already shows PDFs (browser viewer)
 * and CSVs (table + Excel); Word and PowerPoint were download-only.
 *
 * How: `officeparser` (already a backend dependency) turns the file into an AST of headings,
 * paragraphs, formatted text runs, lists, tables, slides and images. This module turns that AST into
 * HTML. It is the only place that decides what reaches the page, so it is strict:
 *   - every text value is HTML-escaped; nothing from the document is emitted as markup
 *   - a color is used only if it is a #hex value, a size only if it is "<number>pt"
 *   - images are embedded only as png / jpeg / gif / webp data URIs (no SVG, nothing remote)
 * and the page renders it in a sandboxed iframe with NO script permission.
 *
 * Not handled (degrades, never throws): charts and drawings become a labeled placeholder; cell
 * shading is not in the AST, so near-white text with no background gets the report's navy behind
 * it (otherwise a white table header vanishes on a white page, measured on a real intern .docx).
 *
 * Failure modes: an unreadable or corrupt file throws `OfficeParseError` to the route (422).
 */
import fs from 'fs';
import { parseOffice } from 'officeparser';

export class OfficeParseError extends Error { constructor(message: string) { super(message); this.name = 'OfficeParseError'; } }

const MAX_OFFICE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SAFE_IMAGE = /^image\/(png|jpe?g|gif|webp)$/;
const NAVY = '#1a365d';

/** The subset of officeparser's AST this renderer reads (kept local so its contract is explicit). */
export interface OfficeNode {
  type: string;
  text?: string;
  children?: OfficeNode[];
  formatting?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; color?: string; backgroundColor?: string; size?: string; alignment?: string; subscript?: boolean; superscript?: boolean };
  metadata?: { level?: number; listType?: 'ordered' | 'unordered'; listId?: string; indentation?: number; attachmentName?: string; altText?: string; slideNumber?: number; colSpan?: number; rowSpan?: number; alignment?: string };
}
export interface OfficeAttachment { name: string; mimeType: string; data: string }
export interface OfficeAst { type: string; content: OfficeNode[]; attachments?: OfficeAttachment[] }

const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (c: unknown): string | null => (typeof c === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) ? (c.startsWith('#') ? c : `#${c}`) : null);
const pt = (s: unknown): string | null => (typeof s === 'string' && /^\d{1,3}(\.\d+)?pt$/.test(s) ? s : null);
const align = (a: unknown): string | null => (a === 'left' || a === 'center' || a === 'right' || a === 'justify' ? a : null);

/** Relative luminance 0..1 of a #hex color. */
export function luminance(color: string): number {
  let h = color.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function run(n: OfficeNode): string {
  const f = n.formatting ?? {};
  const css: string[] = [];
  const color = hex(f.color);
  const bg = hex(f.backgroundColor);
  if (color) css.push(`color:${color}`);
  if (bg) css.push(`background:${bg}`);
  else if (color && luminance(color) > 0.85) css.push(`background:${NAVY}`, 'padding:0 2px');
  const size = pt(f.size);
  if (size) css.push(`font-size:${size}`);
  if (f.bold) css.push('font-weight:700');
  if (f.italic) css.push('font-style:italic');
  const deco = [f.underline ? 'underline' : '', f.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ');
  if (deco) css.push(`text-decoration:${deco}`);
  let text = esc(n.text ?? '').replace(/\n/g, '<br>');
  if (f.subscript) text = `<sub>${text}</sub>`;
  if (f.superscript) text = `<sup>${text}</sup>`;
  return css.length ? `<span style="${css.join(';')}">${text}</span>` : text;
}

/** Inline content of a block: its text runs, or its plain text when it has no runs. */
function inline(n: OfficeNode, ctx: Ctx): string {
  if (!n.children?.length) return esc(n.text ?? '').replace(/\n/g, '<br>');
  return n.children.map((c) => (c.type === 'text' ? run(c) : c.type === 'image' ? image(c, ctx) : block(c, ctx))).join('');
}

interface Ctx { images: Map<string, OfficeAttachment> }

function image(n: OfficeNode, ctx: Ctx): string {
  const a = n.metadata?.attachmentName ? ctx.images.get(n.metadata.attachmentName) : undefined;
  if (!a || !SAFE_IMAGE.test(a.mimeType) || !/^[A-Za-z0-9+/=\s]+$/.test(a.data) || a.data.length * 0.75 > MAX_IMAGE_BYTES) {
    return `<div class="ph">[image${n.metadata?.altText ? `: ${esc(n.metadata.altText)}` : ''}]</div>`;
  }
  return `<img alt="${esc(n.metadata?.altText ?? '')}" src="data:${a.mimeType};base64,${a.data.replace(/\s/g, '')}">`;
}

function table(n: OfficeNode, ctx: Ctx): string {
  const rows = (n.children ?? []).filter((r) => r.type === 'row').map((r) => `<tr>${(r.children ?? []).filter((c) => c.type === 'cell').map((c) => {
    const span = [c.metadata?.colSpan && c.metadata.colSpan > 1 ? ` colspan="${Number(c.metadata.colSpan)}"` : '', c.metadata?.rowSpan && c.metadata.rowSpan > 1 ? ` rowspan="${Number(c.metadata.rowSpan)}"` : ''].join('');
    return `<td${span}>${(c.children ?? []).map((x) => block(x, ctx)).join('') || esc(c.text ?? '')}</td>`;
  }).join('')}</tr>`).join('');
  return `<table>${rows}</table>`;
}

function block(n: OfficeNode, ctx: Ctx): string {
  const a = align(n.formatting?.alignment ?? n.metadata?.alignment);
  const style = a ? ` style="text-align:${a}"` : '';
  switch (n.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(n.metadata?.level) || 2));
      return `<h${level}${style}>${inline(n, ctx)}</h${level}>`;
    }
    case 'paragraph': return `<p${style}>${inline(n, ctx) || '&nbsp;'}</p>`;
    case 'text': return run(n);
    case 'table': return table(n, ctx);
    case 'image': return image(n, ctx);
    case 'slide': return `<section class="slide"><div class="slide-n">Slide ${Number(n.metadata?.slideNumber) || ''}</div>${(n.children ?? []).map((c) => block(c, ctx)).join('')}</section>`;
    case 'note': return `<aside class="note">${inline(n, ctx)}</aside>`;
    case 'chart': case 'drawing': return `<div class="ph">[${esc(n.type)}]</div>`;
    default: return n.children?.length ? n.children.map((c) => block(c, ctx)).join('') : (n.text ? `<p>${esc(n.text)}</p>` : '');
  }
}

/** Consecutive list items with the same list id become one <ul>/<ol>; indentation nests them. */
function blocks(nodes: OfficeNode[], ctx: Ctx): string {
  const out: string[] = [];
  for (let i = 0; i < nodes.length;) {
    const n = nodes[i];
    if (n.type !== 'list') { out.push(block(n, ctx)); i += 1; continue; }
    const id = n.metadata?.listId;
    const items: OfficeNode[] = [];
    while (i < nodes.length && nodes[i].type === 'list' && nodes[i].metadata?.listId === id) { items.push(nodes[i]); i += 1; }
    const tag = n.metadata?.listType === 'ordered' ? 'ol' : 'ul';
    out.push(`<${tag}>${items.map((it) => `<li style="margin-left:${Math.min(8, Number(it.metadata?.indentation) || 0) * 18}px">${inline(it, ctx)}</li>`).join('')}</${tag}>`);
  }
  return out.join('\n');
}

const PAGE_CSS = `body{margin:0;background:#f1f5f9;font-family:Calibri,Segoe UI,Roboto,Arial,sans-serif;color:#1e293b}
.page{max-width:860px;margin:16px auto;background:#fff;padding:40px 56px;box-shadow:0 1px 4px rgba(15,23,42,.15);border-radius:4px;line-height:1.5;font-size:11pt}
h1,h2,h3,h4{color:${NAVY};margin:18px 0 6px}p{margin:0 0 8px}ul,ol{margin:0 0 8px 0;padding-left:22px}
table{border-collapse:collapse;width:100%;margin:8px 0 14px}td{border:1px solid #cbd5e1;padding:5px 8px;vertical-align:top}
tr:first-child td{background:${NAVY};color:#fff;font-weight:700}img{max-width:100%;height:auto;margin:6px 0}
.slide{border:1px solid #cbd5e1;border-radius:6px;padding:18px 24px;margin:0 0 18px}.slide-n{font-size:9pt;color:#64748b;text-transform:uppercase;letter-spacing:1px}
.note{font-size:9pt;color:#475569;border-left:3px solid #cbd5e1;padding-left:8px;margin:6px 0}.ph{color:#64748b;font-style:italic;font-size:9pt}`;

/** The AST as a complete, self-contained HTML page. PURE. */
export function officeAstToHtml(ast: OfficeAst, title: string): string {
  const ctx: Ctx = { images: new Map((ast.attachments ?? []).map((a) => [a.name, a])) };
  const body = blocks(ast.content ?? [], ctx);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body><div class="page">${body || '<p class="ph">This document has no readable content.</p>'}</div></body></html>`;
}

/** Parse a .docx / .pptx on disk and render it. Throws OfficeParseError on a corrupt or oversized file. */
export async function renderOfficeFile(absPath: string, title: string): Promise<string> {
  const size = fs.statSync(absPath).size;
  if (size > MAX_OFFICE_BYTES) throw new OfficeParseError('File is too large to preview; download it instead.');
  let ast: OfficeAst;
  try {
    // Their AST type is wider than the subset this renderer reads; OfficeAst is that subset.
    ast = (await parseOffice(absPath, { extractAttachments: true, ignoreNotes: false, ocr: false })) as unknown as OfficeAst;
  } catch (err) {
    throw new OfficeParseError(`Could not read this document: ${(err as Error)?.message ?? 'unknown error'}`);
  }
  return officeAstToHtml(ast, title);
}
